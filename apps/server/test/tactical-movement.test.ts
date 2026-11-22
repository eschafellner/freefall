import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BODENBRUCH, MOVEMENT_INPUT, NET, PLAYER, advancePosture, createBalanceRegistry, divePeakStep,
  diveElevation, diveEnvelope, fitsPosture, generateWorld, groundHeight, groundedBodyHit, isOperatorGrounded, missionGround,
  newPosture, postureCollider, postureRayHit, resolveLoadout, slidePeakStep,
  tacticalAimPitch, tacticalAimYaw,
} from '@freefall/shared';
import type { Obstacle, PlayerInput, PostureCommand, WorldDefinition } from '@freefall/shared';
import { validateInput } from '../src/networking/input.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import { damagePlayer, fireWeapon } from '../src/systems/combat.ts';
import { enemyCombatTick, runEnemyStrike } from './support/enemy-combat.ts';

const movement = BALANCE.movement;
const ticks = (seconds: number) => Math.ceil(seconds * NET.tickHz);
const ray = () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 });
const input = (seq: number, life: number, overrides: Partial<PlayerInput> = {}): PlayerInput =>
  ({ seq, life, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false, ...overrides });

function field(obstacles: Obstacle[] = [], registry = BALANCE) {
  const world: WorldDefinition = { ...BODENBRUCH.world, half: 30, obstacles };
  const arena = new Battlefield(2, world, registry);
  const p = arena.addPlayer('p');
  Object.assign(p, { x: 0, z: 0, protectedUntil: 0 });
  let seq = 0;
  const step = (overrides?: Partial<PlayerInput>) => {
    assert.equal(arena.receiveInput('p', input(++seq, p.life, overrides)), true);
    arena.step();
  };
  const advance = (n: number) => { for (let i = 0; i < n; i++) arena.step(); };
  const dive = (forward = 0, strafe = 0, yaw = 0) => step({ posture: 'dive', forward, strafe, yaw });
  const posture = () => p.posture.current;
  return { arena, p, world, step, advance, dive, posture };
}

test('diving preparation uses the standing friendly-fire profile until takeoff', () => {
  const { arena, p, dive } = field();
  const ally = arena.addPlayer('ally');
  Object.assign(ally, { x: -.86, z: 5, activeInput: true });
  ally.input = input(1, ally.life, { fire: true, pitch: Math.atan2(-.29, 5) });
  dive(1);
  ally.activeInput = true;
  const shot = fireWeapon(arena.horde, ally, ray(), arena.tick, undefined, undefined, { players: arena.players });
  assert.equal(shot?.ally, p.id);
  assert.ok(p.hp < p.loadout.maxHealth);
});

test('friendly-fire hits the interpolated get-up volume from either ground posture', () => {
  for (const posture of ['PRONE', 'SUPINE'] as const) {
    const { arena, p, step, advance } = field();
    p.posture.current = posture;
    step({ posture: 'stand' });
    advance(11);
    assert.equal(p.posture.current, 'GETTING_UP');
    const ally = arena.addPlayer('ally');
    Object.assign(ally, { x: -.86, z: 5, activeInput: true });
    ally.input = input(1, ally.life, { fire: true, pitch: Math.atan2(-1.3, 5) });
    const shot = fireWeapon(arena.horde, ally, ray(), arena.tick, undefined, undefined, { players: arena.players });
    assert.equal(shot?.ally, p.id, posture);
    assert.equal(p.hp, p.loadout.maxHealth - Math.round(ally.loadout.weapons.primary.damage * ally.loadout.damagePolicy.operatorToOperator));
  }
});

test('dive landing consumes one input without draining subsequent crawl input in its lock tick', () => {
  const { arena, p, dive, advance } = field();
  dive(1);
  advance(ticks(movement.diveSeconds) - 1);
  for (let seq = 2; seq <= 8; seq++) assert.ok(arena.receiveInput(p.id, input(seq, p.life, { strafe: 1 })));
  advance(1);
  assert.equal(p.posture.current, 'PRONE');
  assert.equal(p.ack, 2);
  assert.equal(p.x, 0);
  advance(1);
  assert.ok(p.ack > 2 && p.x > 0);
});

for (const [planet, seed, kind] of [['green-plains', 76, 'rock'], ['desert', 31, 'arch-pier'],
  ['ice', 48, 'ice'], ['forest', 63, 'tree']] as const) {
  test(`${planet} stops dives at generated ${kind} and resolves ground motion and rising on the heightfield`, () => {
    const generated = generateWorld(planet, seed);
    assert.ok(generated);
    const world = missionGround(generated.world);
    const wall = world.obstacles.find((o) => o.kind === kind);
    assert.ok(wall);
    const arena = new Battlefield(2, world);
    const p = arena.addPlayer('p');
    const yaw = Math.PI / 2, x = wall.x - wall.halfX - 3, z = wall.z;
    Object.assign(p, { x, y: groundHeight(world, x, z), z, yaw, posture: newPosture(yaw), protectedUntil: 0 });
    let seq = 0;
    const turn = (overrides: Partial<PlayerInput> = {}) => {
      assert.ok(arena.receiveInput(p.id, input(++seq, p.life, { yaw, ...overrides })));
      arena.step();
      assert.ok(Math.abs(p.y - groundHeight(world, p.x, p.z) -
        (p.posture.dive ? diveElevation(p.posture.dive, arena.tick) : 0)) < 1e-9);
      assert.ok(fitsPosture(p, postureCollider(p.posture, arena.tick), p.posture.yaw, world));
    };
    turn({ posture: 'dive', forward: 1 });
    assert.equal(p.posture.current, 'DIVING');
    while (p.posture.dive) turn();
    assert.equal(p.posture.current, 'PRONE');
    assert.ok(p.posture.landedDive?.impact);
    assert.ok(p.x <= wall.x - wall.halfX - diveEnvelope('PRONE', movement).halfLength + 1e-6);
    const landedX = p.x;
    for (let i = 0; i < 8; i++) turn({ forward: -1 });
    assert.ok(p.x < landedX);
    assert.equal(p.posture.current, 'PRONE');
    turn({ posture: 'stand' });
    assert.equal(p.posture.current, 'GETTING_UP');
    for (let i = 0; i < ticks(movement.proneGetUpSeconds); i++) turn();
    assert.equal(p.posture.current, 'STANDING');
  });
}

test('committed Schabe strikes use authoritative dive and rise volumes at the active tick', () => {
  for (const phase of ['prep', 'flight', 'prone-rise', 'supine-rise'] as const) {
    const { arena, p, step, advance } = field();
    const stats = arena.enableMovementProfiling();
    const rising = phase === 'prone-rise' || phase === 'supine-rise';
    if (rising) p.posture.current = phase === 'prone-rise' ? 'PRONE' : 'SUPINE';
    const z = phase === 'flight' ? -.65 : 0;
    const enemy = arena.horde.spawn(.75, z, 0);
    arena.horde.target[enemy] = p.slot;
    arena.horde.yaw[enemy] = Math.atan2(-.75, z);
    enemyCombatTick(arena, 0);
    assert.equal(arena.enemyCombat.totals.starts, 1, phase);
    const hitTick = arena.enemyCombat.timing.windupTicks;
    const actionAt = phase === 'prep' ? hitTick - 2 : phase === 'flight' ? hitTick - 8 : 1;
    advance(actionAt - 1);
    step(rising ? { posture: 'stand' } : { posture: 'dive', forward: 1 });
    advance(hitTick - actionAt);
    const expected = rising ? 'GETTING_UP' : 'DIVING';
    assert.equal(p.posture.current, expected, phase);
    assert.equal(arena.combatEvents.filter((event) => event.type === 'enemy-hit').length, 1, phase);
    assert.equal(stats.damage[expected], BALANCE.enemiesByWireType[0]!.gameplay.meleeDamage, phase);
    assert.equal(p.hp, p.loadout.maxHealth - stats.damage[expected], phase);
  }
});

test('crouch shortens the collider, scales walk speed, and ignores sprint', () => {
  const { p, step, posture } = field();
  step({ posture: 'crouch', forward: 1, sprint: true });
  assert.equal(posture(), 'CROUCHING');
  assert.equal(p.z, -PLAYER.walkSpeed * movement.crouchSpeedMultiplier / NET.tickHz);
  assert.equal(p.y, 0);
  assert.ok(postureCollider(p.posture, 1).height < movement.colliders.STANDING.height);
  step({ posture: 'crouch' });
  assert.equal(posture(), 'STANDING');
});

const sprint = { forward: 1, sprint: true } as const;
const slide = { ...sprint, posture: 'crouch' } as const;
const slideTicks = ticks(movement.slide.seconds);

test('sliding requires a recent sprint at speed, held sprint, and standing', () => {
  for (const runUp of [undefined, { forward: 1 }, { ...sprint, forward: .2 }]) {
    const { step, posture } = field();
    if (runUp) step(runUp);
    step(slide);
    assert.equal(posture(), 'CROUCHING');
  }
  const { step, posture } = field();
  step(sprint);
  step({ ...slide, sprint: false });
  assert.equal(posture(), 'CROUCHING');
  step(slide);
  assert.equal(posture(), 'STANDING', 'ducking while crouched still toggles to standing');
  step(sprint);
  step(slide);
  assert.equal(posture(), 'SLIDING');

  const blocked = field([{ x: 0, z: -.6, halfX: 2, halfZ: .1, height: 2, kind: 'barrier' }]);
  blocked.step(sprint);
  blocked.step(slide);
  assert.equal(blocked.posture(), 'CROUCHING', 'input alone cannot supply speed against a wall');
});

test('sliding follows balance distance and deceleration on the server clock', () => {
  const { arena, p, step, advance, posture } = field();
  const run = { forward: .8, strafe: .6, yaw: .42, sprint: true };
  step(run);
  const start = { x: p.x, z: p.z };
  step({ ...slide, yaw: -.2 });
  const startTick = arena.tick;
  assert.equal(posture(), 'SLIDING');
  assert.equal(p.posture.requested, 'CROUCHING');
  assert.equal(p.posture.until, startTick + slideTicks);
  assert.equal(p.x, start.x);
  assert.equal(p.z, start.z);
  let previous = Infinity;
  for (let i = 1; i <= slideTicks; i++) {
    const { x, z } = p;
    if (i === slideTicks) {
      assert.ok(arena.receiveInput(p.id, input(3, p.life, { ...sprint, yaw: -2 })));
    }
    advance(1);
    const distance = Math.hypot(p.x - x, p.z - z);
    if (i === 1) assert.ok(Math.abs(distance - slidePeakStep(movement.slide, slideTicks)) < 1e-12);
    assert.ok(distance > 0 && distance < previous);
    assert.equal(p.y, 0);
    assert.equal(posture(), i === slideTicks ? 'CROUCHING' : 'SLIDING');
    previous = distance;
  }
  assert.ok(Math.abs(p.x - start.x - (Math.sin(run.yaw) * .8 + Math.cos(run.yaw) * .6) * movement.slide.distance) < 1e-12);
  assert.ok(Math.abs(p.z - start.z - (Math.sin(run.yaw) * .6 - Math.cos(run.yaw) * .8) * movement.slide.distance) < 1e-12);
  assert.equal(p.posture.slide, undefined);
});

test('slide cooldown remains in standing snapshots and expires at the configured tick', () => {
  const { arena, p, step, posture } = field();
  step(sprint);
  step(slide);
  const ready = arena.tick + ticks(movement.slide.cooldownSeconds);
  while (arena.tick < p.posture.until) step();
  step({ posture: 'stand' });
  step(sprint);
  assert.equal(playerSnapshot(arena, p.id).players[0].posture?.slideCooldownUntil, ready);
  step(slide);
  assert.equal(posture(), 'CROUCHING');
  step({ posture: 'stand' });
  while (arena.tick < ready - 2) step();
  step(sprint);
  step(slide);
  assert.equal(arena.tick, ready);
  assert.equal(posture(), 'SLIDING');
});

test('a thin obstacle stops a slide early, with no movement input needed to finish', () => {
  const wall: Obstacle = { x: 0, z: -1.6, halfX: 5, halfZ: .01, height: .5, kind: 'barrier' };
  const { arena, p, step, advance, posture } = field([wall]);
  step(sprint);
  step(slide);
  const until = p.posture.until;
  while (arena.tick < until && posture() === 'SLIDING') advance(1);
  assert.ok(arena.tick < until);
  assert.equal(posture(), 'CROUCHING');
  const edge = wall.z + wall.halfZ + movement.colliders.SLIDING.halfLength;
  assert.ok(Math.abs(p.z - edge) < 1e-6, String(p.z));
  const stopped = p.z;
  advance(slideTicks);
  assert.equal(p.z, stopped);
});

test('sliding may finish under a low ceiling and needs clearance to stand', () => {
  const canopy: Obstacle = { x: 0, z: -4.3, halfX: 2, halfZ: 1, bottom: 1.35, height: 2, kind: 'barrier' };
  const { p, step, posture } = field([canopy]);
  step(sprint);
  step(slide);
  for (let i = 0; i < slideTicks; i++) step();
  assert.ok(Math.abs(p.z + PLAYER.sprintSpeed / NET.tickHz + movement.slide.distance) < 1e-12);
  step({ posture: 'stand' });
  assert.equal(posture(), 'CROUCHING');
  assert.ok(p.posture.standBlockedAt);
  canopy.bottom = 2;
  step({ posture: 'stand' });
  assert.equal(posture(), 'STANDING');
});

test('sliding retains crouched weapon permissions and can fire from its lower muzzle', () => {
  const { arena, step, posture } = field();
  assert.deepEqual(movement.actions.SLIDING, { ...movement.actions.CROUCHING, dive: false, standUp: false });
  step(sprint);
  step({ ...slide, fire: true });
  assert.equal(posture(), 'SLIDING');
  assert.equal(arena.shots[0]?.fromY, movement.colliders.SLIDING.muzzleHeight);
});

test('four operators have independent slide directions and clocks, and stale lives cannot start slides', () => {
  const { arena, p, advance } = field();
  const players = [p, ...['1', '2', '3'].map((id) => arena.addPlayer(id))];
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const [i, op] of players.entries()) {
    op.x = -12 + i * 8;
    op.z = 0;
    const run = { ...sprint, yaw: headings[i] };
    const send = (seq: number, life: number, overrides: Partial<PlayerInput>) => {
      assert.ok(arena.receiveInput(op.id, input(seq, life, overrides)));
      advance(1);
    };
    send(1, op.life, run);
    if (i === 0) {
      const z = op.z;
      send(2, op.life - 1, { ...run, posture: 'crouch' });
      assert.equal(op.ack, 2);
      assert.equal(op.posture.current, 'STANDING');
      assert.equal(op.z, z);
      send(3, op.life, run);
    }
    send(i === 0 ? 4 : 2, op.life, { ...run, posture: 'crouch' });
    assert.equal(op.posture.current, 'SLIDING');
  }
  const snapshot = playerSnapshot(arena, p.id);
  assert.equal(new Set(snapshot.players.map((op) => op.posture?.started)).size, 4);
  for (const [i, op] of snapshot.players.entries()) {
    const path = op.posture?.slide;
    assert.ok(path);
    assert.ok(Math.abs(path.x - Math.sin(headings[i])) < 1e-12);
    assert.ok(Math.abs(path.z + Math.cos(headings[i])) < 1e-12);
    assert.notEqual(path, players[i].posture.slide);
  }
  advance(slideTicks);
  assert.ok(players.every((op) => op.posture.current === 'CROUCHING'));
  assert.ok(snapshot.players.every((op) => op.posture?.current === 'SLIDING'));
});

test('slide tuning is validated and resolves through armor independently of weapon modifiers', () => {
  const modifier = { source: 'armor:light', layer: 'equipment', stat: 'operator.slide.distance', operation: 'add', value: 1 } as const;
  const weapon = { ...modifier, source: 'attachment:drum', stat: 'weapon.kestrel-ar-01.magazineSize' };
  const base = resolveLoadout(BALANCE);
  assert.equal(resolveLoadout(BALANCE, undefined, [weapon]).slide.distance, base.slide.distance);
  assert.equal(resolveLoadout(BALANCE, undefined, [weapon], [modifier]).slide.distance, base.slide.distance + 1);
  assert.throws(() => resolveLoadout(BALANCE, undefined, [{ ...modifier, source: weapon.source }]), /Modifikatoren ohne Ziel/);
  assert.throws(() => resolveLoadout(BALANCE, undefined, [], [{ ...modifier, layer: 'difficulty' }]), /erlaubt keine difficulty/);
  const raw = structuredClone(BALANCE_SOURCES);
  raw.movement.slide.decay = 1.1;
  assert.throws(() => createBalanceRegistry(raw), /slide\.decay/);
});

test('dives preserve the full analog vector and select landing relative to initial aim', () => {
  const yaw = .72;
  const cases = [
    [1, 0, 'PRONE'], [-1, 0, 'SUPINE'], [0, 1, 'PRONE'], [0, -1, 'PRONE'],
    [1, 1, 'PRONE'], [1, -1, 'PRONE'], [-1, 1, 'SUPINE'], [-1, -1, 'SUPINE'],
    [.23, -.67, 'PRONE'], [-.012, .79, 'SUPINE'], [-.0000005, 1, 'PRONE'], [0, 0, 'PRONE'],
  ] as const;
  for (const [forward, strafe, landing] of cases) {
    const { p, advance, dive, posture, step } = field();
    step({ yaw });
    dive(forward, strafe, yaw);
    assert.equal(posture(), 'DIVING');
    assert.equal(p.posture.requested, landing);
    const dir = p.posture.dive!;
    assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-12);
    const scale = Math.hypot(forward, strafe) || 1;
    const f = forward || strafe ? forward : 1;
    assert.ok(Math.abs(dir.x - (f * Math.sin(yaw) + strafe * Math.cos(yaw)) / scale) < 1e-12);
    assert.equal(p.y, 0);
    advance(Math.floor(ticks(movement.diveSeconds) / 2));
    assert.ok(p.y > .5, 'the middle of the flight has real elevation');
    step({ yaw: -2, posture: 'stand' });
    assert.equal(p.posture.yaw, yaw);
    advance(ticks(movement.diveSeconds));
    assert.equal(posture(), landing);
    assert.equal(p.y, 0);
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - movement.diveDistance) < 1e-9);
    advance(150);
    assert.equal(posture(), landing);
    step({ posture: 'stand', yaw });
    assert.equal(posture(), 'GETTING_UP');
    const duration = ticks(landing === 'PRONE' ? movement.proneGetUpSeconds : movement.supineGetUpSeconds);
    advance(duration - 1);
    assert.equal(posture(), 'GETTING_UP');
    advance(1);
    assert.equal(posture(), 'STANDING');
  }
});

test('button-edge camera axes survive overflow and use the last simulated body heading for landing', () => {
  const { p, arena, step, advance } = field();
  step({ yaw: Math.PI / 2 });
  assert.ok(arena.receiveInput(p.id, input(2, p.life, {
    yaw: .3, posture: 'dive', diveIntent: { yaw: -Math.PI / 2, forward: .6, strafe: .2 },
  })));
  for (let seq = 3; seq < 3 + MOVEMENT_INPUT.queue * 2; seq++) {
    assert.ok(arena.receiveInput(p.id, input(seq, p.life, { yaw: 0, forward: -1 })));
  }
  arena.step();
  const dive = p.posture.dive!;
  assert.equal(dive.id, 2);
  assert.equal(dive.yaw, Math.PI / 2);
  assert.ok(dive.x < -.94 && dive.z < -.31);
  assert.equal(dive.landing, 'SUPINE');
  assert.equal(p.yaw, 0);
  advance(ticks(movement.diveSeconds));
  assert.equal(p.posture.current, 'SUPINE');
  assert.equal(p.posture.landedDive?.id, 2);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - movement.diveDistance) < 1e-10);
});

test('a neutral dive keeps the current body heading when the camera turns', () => {
  const { p, step } = field();
  step({ yaw: Math.PI / 2, posture: 'crouch' });
  step({ yaw: -.3, posture: 'dive', strafe: .5, diveIntent: { forward: 0, strafe: 0, yaw: 0 } });
  assert.equal(p.posture.dive?.x, 1);
  assert.ok(Math.abs(p.posture.dive!.z) < 1e-12);
  assert.equal(p.posture.dive?.from, 'CROUCHING');
  assert.equal(p.posture.dive?.landing, 'PRONE');
  assert.equal(p.yaw, -.3);
});

test('rejects bad commands, stale lives, invalid analog values and premature repeat dives', () => {
  assert.equal(validateInput({ ...input(1, 1), posture: 'PRONE' }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), forward: Infinity }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), strafe: 1.01 }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), life: undefined, posture: 'dive' }, 0), undefined);
  assert.equal(validateInput(input(1, 1, { posture: 'dive', diveIntent: { forward: 0, strafe: 0, yaw: NaN } }), 0), undefined);
  assert.equal(validateInput(input(1, 1, { diveIntent: { forward: 0, strafe: 0, yaw: 0 } }), 0), undefined);
  const raw = structuredClone(BALANCE_SOURCES) as unknown as { movement: { noDirection: string; diveCooldownSeconds: number } };
  raw.movement.noDirection = 'reject';
  raw.movement.diveCooldownSeconds = 5;
  const { p, arena, advance, dive, step, posture } = field([], createBalanceRegistry(raw));
  step({ posture: 'dive', life: p.life - 1, forward: 1 });
  assert.equal(posture(), 'STANDING');
  dive();
  assert.equal(posture(), 'STANDING');
  dive(1);
  const lastDive = p.posture.lastDive;
  assert.equal(arena.receiveInput(p.id, input(p.input.seq, p.life, { posture: 'dive' })), false);
  advance(ticks(movement.diveSeconds));
  dive(1);
  assert.equal(posture(), 'PRONE');
  step({ posture: 'stand' });
  advance(ticks(movement.proneGetUpSeconds));
  dive(1);
  assert.equal(posture(), 'STANDING');
  assert.equal(p.posture.lastDive, lastDive);
  advance(lastDive! + ticks(5) - arena.tick - 1);
  dive(1);
  assert.equal(p.posture.dive?.started, lastDive! + ticks(5));
});

test('an active dive, slide, get-up and a dead operator cannot start a new dive', () => {
  const { arena, p, step, dive, advance, posture } = field();
  step(sprint);
  step(slide);
  dive();
  assert.equal(posture(), 'SLIDING');
  advance(slideTicks);
  dive();
  const id = p.posture.dive?.id;
  assert.ok(id);
  dive(-1);
  assert.equal(p.posture.dive?.id, id);
  advance(ticks(movement.diveSeconds));
  dive(-1);
  assert.equal(posture(), 'PRONE');
  step({ posture: 'stand' });
  dive(-1);
  assert.equal(posture(), 'GETTING_UP');
  damagePlayer(p, p.hp, arena.tick);
  dive();
  assert.equal(p.hp, 0);
  assert.equal(p.posture.dive, undefined);
});

test('swept dive stops at thin geometry and lands on the approach side', () => {
  const { p, dive, advance, posture } = field([
    { x: 0, z: -2, halfX: 6, halfZ: .015, height: .4, kind: 'barrier' },
  ]);
  dive(1);
  advance(ticks(movement.diveSeconds));
  assert.equal(posture(), 'PRONE');
  assert.ok(p.z <= -.85 && p.z >= -2 + .015 + movement.colliders.PRONE.halfLength - 1e-6, String(p.z));
  assert.equal(p.y, 0);
});

test('dive validates the swept envelope at takeoff and stops at a low ceiling or tether without clipping', () => {
  const corner = field([{ x: .41, z: -.95, halfX: .002, halfZ: .002, height: .4, kind: 'barrier' }]);
  corner.dive();
  assert.equal(corner.posture(), 'STANDING');
  assert.equal(corner.p.posture.lastDive, undefined);

  const canopy: Obstacle = { x: 0, z: -2, halfX: 2, halfZ: .5, bottom: .95, height: 2, kind: 'barrier' };
  for (const limit of ['ceiling', 'tether']) {
    const { p, arena, world, dive } = field(limit === 'ceiling' ? [canopy] : []);
    dive();
    const path = p.posture.dive!;
    const tether = limit === 'tether' ? { x: 0, z: 0, radius: 1.5 } : undefined;
    let previousZ = p.z;
    for (let tick = arena.tick + 1; tick <= path.until; tick++) {
      advancePosture(p, p.posture, tick, movement, world, tether);
      assert.ok(previousZ - p.z <= divePeakStep(path) + 1e-9);
      assert.ok(p.y >= 0);
      assert.ok(fitsPosture(p, postureCollider(p.posture, tick), path.yaw, world));
      previousZ = p.z;
    }
    assert.ok(path.impact);
    assert.equal(p.posture.current, 'PRONE');
    assert.equal(p.y, 0);
    assert.ok(p.z <= 0 && p.z >= -(tether?.radius ?? 1.5));
  }
});

test('a dive loses spawn protection and receives normal grenade damage while airborne', () => {
  const { p, arena, dive, advance } = field();
  p.protectedUntil = 100;
  dive();
  assert.equal(p.protectedUntil, arena.tick);
  advance(10);
  assert.ok(p.y > 0);
  const ally = arena.addPlayer('ally');
  Object.assign(ally, { x: p.x, z: p.z });
  arena.grenades.launch(ally, arena.tick + 1 - ally.loadout.grenade.fuseTicks);
  const hp = p.hp;
  arena.step();
  assert.ok(p.hp < hp);
  assert.ok(arena.combatEvents.some((e) => e.type === 'friendly-fire' && e.target === p.id && e.source === 'explosion'));
});

test('low clearance blocks standing and cancels get-up when an obstacle appears', () => {
  const canopy: Obstacle = { x: 0, z: -3.9, halfX: 2, halfZ: 1.6, bottom: 1.39, height: 2, kind: 'barrier' };
  const { p, step, dive, advance, posture } = field([canopy]);
  dive(1);
  advance(ticks(movement.diveSeconds));
  assert.equal(posture(), 'PRONE');
  assert.ok(p.z < -4.9);
  step({ posture: 'stand' });
  assert.equal(posture(), 'PRONE');
  assert.ok(p.posture.standBlockedAt);
  canopy.bottom = 2;
  step({ posture: 'stand' });
  assert.equal(posture(), 'GETTING_UP');
  canopy.bottom = 1.33;
  advance(ticks(movement.proneGetUpSeconds));
  assert.equal(posture(), 'PRONE');
  Object.assign(p, { z: 0, posture: newPosture() });
  step({ posture: 'crouch' });
  for (let i = 0; i < 28; i++) step({ forward: 1 });
  step({ posture: 'crouch' });
  assert.equal(posture(), 'CROUCHING');
});

for (const stance of ['PRONE', 'SUPINE'] as const) {
  const prone = stance === 'PRONE';
  test(`${stance} persists and crawls along the body axes at bounded speed and turn rate`, () => {
    const wall: Obstacle = { x: 30, z: 0, halfX: .01, halfZ: 20, height: .9, kind: 'barrier' };
    const { arena, p, world, step, dive, advance, posture } = field([wall]);
    dive(prone ? 1 : -1);
    advance(ticks(movement.diveSeconds) + 2 * NET.tickHz);
    assert.equal(posture(), stance);
    assert.ok(isOperatorGrounded(p));
    assert.equal(p.posture.landedDive, undefined);
    step({ posture: 'crouch' });
    step({ posture: 'dive' });
    assert.equal(posture(), stance);

    const topSpeed = PLAYER.walkSpeed * (prone ? movement.proneSpeedMultiplier : movement.supineSpeedMultiplier);
    const turn = (prone ? movement.proneTurnRadiansPerSecond : movement.supineTurnRadiansPerSecond) / NET.tickHz;
    const start = { x: p.x, z: p.z };
    step({ forward: 1, yaw: Math.PI / 2, sprint: true });
    assert.ok(Math.abs(p.posture.yaw - turn) < 1e-12);
    const motion = p.posture.groundMotion!;
    assert.ok(Math.abs(Math.hypot(motion.x, motion.z) - movement.groundAcceleration / NET.tickHz) < 1e-12);
    assert.ok(Math.abs((p.x - start.x) / (start.z - p.z) - Math.tan(turn)) < 1e-12);
    for (let n = 0; n < NET.tickHz; n++) step({ forward: 1, yaw: 0, sprint: true });
    assert.ok(Math.abs(p.posture.groundMotion!.z + topSpeed) < 1e-12);
    step({ forward: -1, yaw: 0 });
    assert.ok(p.posture.groundMotion!.z < 0);
    for (let n = 0; n < NET.tickHz; n++) step({ forward: -1, yaw: 0 });
    assert.ok(Math.abs(p.posture.groundMotion!.z - topSpeed) < 1e-12);
    step();
    assert.equal(p.posture.groundMotion, undefined);
    wall.x = p.x + 1;
    for (let n = 0; n < 2 * NET.tickHz; n++) step({ strafe: 1 });
    assert.ok(Math.abs(p.x - (wall.x - wall.halfX - movement.colliders[stance].radius)) < 1e-6);
    assert.ok(fitsPosture(p, movement.colliders[stance], p.posture.yaw, world));
    step({ yaw: Math.PI / 2 });
    assert.equal(p.posture.yaw, 0);
    assert.equal(posture(), stance);
    assert.equal(playerSnapshot(arena, p.id).players[0].posture?.current, stance);
  });

  test(`${stance} get-up checks the real standing footprint on the final tick and admits only one command`, () => {
    const corner: Obstacle = { x: 20, z: 20, halfX: .015, halfZ: .015, bottom: 1.76, height: 2, kind: 'barrier' };
    const { arena, p, world, step, dive, advance, posture } = field([corner]);
    dive(prone ? 1 : -1);
    advance(ticks(movement.diveSeconds));
    p.posture.yaw = Math.PI / 4;
    step({ posture: 'stand' });
    assert.equal(posture(), 'GETTING_UP');
    const { started, until, getUpId } = p.posture;
    assert.equal(getUpId, p.ack);
    assert.equal(until - started, ticks(prone ? movement.proneGetUpSeconds : movement.supineGetUpSeconds));
    const start = { x: p.x, y: p.y, z: p.z };
    const ammo = p.ammo;
    step({ posture: 'stand', forward: 1, sprint: true, fire: true, equipment: 'grenade' });
    step({ posture: 'dive', forward: 1 });
    assert.equal(p.posture.getUpId, getUpId);
    assert.equal(p.posture.until, until);
    assert.equal(p.ammo, ammo);
    assert.equal(p.equipment.action, undefined);
    assert.deepEqual({ x: p.x, y: p.y, z: p.z }, start);
    const middle = postureCollider(p.posture, (started + until) / 2);
    assert.ok(middle.height > movement.colliders[stance].height && middle.height < movement.colliders.STANDING.height);
    advance(until - arena.tick - 1);
    corner.x = p.x + .39;
    corner.z = p.z + .39;
    assert.equal(fitsPosture(start, movement.colliders.STANDING, Math.PI / 4, world), true);
    advance(1);
    assert.equal(posture(), stance);
    assert.equal(p.posture.getUpId, undefined);
    assert.equal(p.posture.standBlockedAt, until);
    step({ posture: 'stand' });
    assert.equal(posture(), stance);
    corner.x = 20;
    advance(1);
    assert.equal(posture(), stance);
    step({ posture: 'stand' });
    for (let i = 0; i < 4 && posture() !== 'GETTING_UP'; i++) step();
    assert.equal(posture(), 'GETTING_UP');
    advance(p.posture.until - arena.tick);
    assert.equal(posture(), 'STANDING');
    assert.equal(postureCollider(p.posture, arena.tick), movement.colliders.STANDING);
  });

  test(`${stance} aim stays within the body arc and downward shots end at the floor`, () => {
    const { arena, p, dive, advance } = field();
    dive(prone ? 1 : -1);
    advance(ticks(movement.diveSeconds));
    assert.ok(Math.abs(tacticalAimYaw(p.posture, Math.PI - .1) - movement.groundAimHalfArc) < 1e-12);
    assert.equal(tacticalAimPitch(p.posture, .69), prone ? movement.proneMaxPitch : movement.supineMaxPitch);
    p.input = input(20, p.life, { pitch: -.69, aim: true, fire: true });
    p.activeInput = true;
    const shot = fireWeapon(arena.horde, p, ray(), arena.tick);
    assert.ok(shot);
    assert.ok(Math.abs(shot.toY) < 1e-12);
    assert.ok(shot.toZ < shot.fromZ);
    assert.equal(shot.impact?.kind, 'world');
    assert.deepEqual(shot.impact.normal, [0, 1, 0]);
  });
}

test('Schabe attacks must reach a valid body zone and stop at cover in either ground posture', () => {
  const cover: Obstacle = { x: 20, z: 0, halfX: .025, halfZ: .7, height: 1, kind: 'barrier' };
  const { arena, p, world } = field([cover]);
  const h = arena.horde;
  const enemy = h.spawn(0, 0, 0);
  const stats = BALANCE.enemiesByWireType[0]!.gameplay;
  h.target[enemy] = p.slot;
  for (const posture of ['PRONE', 'SUPINE'] as const) {
    const sign = posture === 'PRONE' ? 1 : -1;
    p.posture = { ...newPosture(), current: posture };
    const hp = p.hp;
    const attack = () => enemyCombatTick(arena, 0, world);
    arena.enemyCombat.clear();
    h.attackAt[enemy] = 0;
    h.x[enemy] = 0;
    h.z[enemy] = sign * (stats.meleeRange + .9);
    h.yaw[enemy] = sign > 0 ? 0 : Math.PI;
    attack();
    assert.equal(p.hp, hp); // Reach extends to the feet, but the strike is above them.
    h.x[enemy] = 1;
    h.z[enemy] = 0;
    h.yaw[enemy] = -Math.PI / 2;
    cover.x = .7;
    attack();
    assert.equal(p.hp, hp);
    assert.equal(h.attackAt[enemy], 0);
    cover.x = 20;
    runEnemyStrike(arena, 0, world);
    assert.equal(p.hp, hp - stats.meleeDamage);
  }
});

test('hitscan distinguishes crouch, flight, and oriented low profiles', () => {
  const { p, dive, advance, step } = field();
  const horizontal = { x: 0, y: 1.4, z: 10, dx: 0, dy: 0, dz: -1 };
  const hit = (radius = 20) =>
    postureRayHit(horizontal, p, postureCollider(p.posture, p.posture.started), p.posture.yaw, 0, radius);
  assert.ok(Number.isFinite(hit()));
  step({ posture: 'crouch' });
  assert.equal(hit(), Infinity);
  dive(-1);
  advance(12);
  horizontal.y = p.y + .5;
  assert.ok(Number.isFinite(hit()));
  advance(ticks(movement.diveSeconds));
  assert.equal(p.posture.current, 'SUPINE');
  horizontal.y = .3;
  horizontal.x = .65;
  assert.equal(hit(20), Infinity);
  p.posture.yaw = Math.PI / 2;
  assert.ok(Number.isFinite(hit(20)));
  horizontal.y = 1.4;
  assert.equal(hit(20), Infinity);
});

test('head and lower body profiles are reversed between belly and back', () => {
  const position = { x: 0, y: 0, z: 0 };
  const rear = { x: 3, y: .43, z: .75, dx: -1, dy: 0, dz: 0 };
  assert.equal(groundedBodyHit(rear, position, movement.colliders.PRONE, 0, false, 0, 10), Infinity);
  assert.ok(Number.isFinite(groundedBodyHit(rear, position, movement.colliders.SUPINE, 0, true, 0, 10)));
});

test('low muzzle converges onto a valid target and close cover blocks it', () => {
  for (const direction of [1, -1]) {
    const cover: Obstacle = { x: .18, z: 30, halfX: .14, halfZ: .07, height: .7, kind: 'barrier' };
    const { arena, p, world, dive, advance } = field([cover]);
    dive(direction);
    advance(ticks(movement.diveSeconds));
    const target = arena.horde.spawn(.86, p.z - 8, 0);
    p.input = input(p.input.seq + 1, p.life, { aim: true, fire: true, pitch: -.06 });
    p.activeInput = true;
    const hit = fireWeapon(arena.horde, p, ray(), arena.tick, world);
    assert.equal(hit?.enemy, arena.horde.id[target]);
    cover.z = p.z - .44;
    const stopped = fireWeapon(arena.horde, p, ray(), p.fireAt, world);
    assert.ok(stopped);
    assert.equal(stopped.enemy, 0);
    assert.equal(stopped.toZ, stopped.fromZ);
    assert.equal(stopped.impact, undefined);
  }
});

test('ground combat preserves both weapons, tactical reload and stims without spending blocked actions', () => {
  for (const direction of [1, -1]) {
    const { arena, p, step, dive, advance, posture } = field();
    dive(direction);
    advance(ticks(movement.diveSeconds));
    assert.equal(posture(), direction > 0 ? 'PRONE' : 'SUPINE');
    for (const slot of ['primary', 'secondary'] as const) {
      if (p.equipment.slot !== slot) {
        step({ equipment: slot });
        advance(p.loadout.switchTicks);
      }
      step({ fire: true, aim: true, pitch: -.1 });
      assert.equal(arena.shots[0]?.slot, slot);
      assert.equal(arena.shots[0]?.fromY, movement.colliders[direction > 0 ? 'PRONE' : 'SUPINE'].muzzleHeight);
      const reserve = p.equipment.magazines[slot];
      step({ reload: true });
      assert.equal(p.reload.phase, 'RELOAD_START');
      advance(p.loadout.weapons[slot].reloadTicks);
      assert.equal(p.equipment.magazines[slot], reserve - 1);
      assert.equal(p.ammo, p.loadout.weapons[slot].magazineSize);
    }
    const { grenades, meleeReadyAt, stims } = p.equipment;
    step({ equipment: 'grenade' });
    assert.equal(p.equipment.action, undefined);
    step({ equipment: 'melee' });
    assert.equal(p.equipment.action, undefined);
    assert.equal(p.equipment.grenades, grenades);
    assert.equal(p.equipment.meleeReadyAt, meleeReadyAt);
    p.hp -= 45;
    step({ equipment: 'stim', sprint: true });
    step({ equipment: 'stim' });
    step({ equipment: 'melee' });
    advance(p.loadout.medical.applicationTicks);
    assert.equal(p.equipment.stims, stims - 1);
    assert.ok(p.hp > p.loadout.maxHealth - 45);
    assert.equal(posture(), direction > 0 ? 'PRONE' : 'SUPINE');
  }
});

test('shots from a standing ally pass above a grounded player and can hit the same player in flight', () => {
  const { p, arena, dive, advance } = field();
  const ally = arena.addPlayer('ally');
  Object.assign(ally, { x: -0.86, z: 12, activeInput: true });
  ally.input = input(1, ally.life, { fire: true, pitch: -.12 });
  dive(-1);
  advance(13);
  ally.activeInput = true;
  assert.equal(fireWeapon(arena.horde, ally, ray(), arena.tick, undefined, undefined, { players: arena.players })?.ally, p.id);
  assert.ok(p.hp < p.loadout.maxHealth);
  advance(ticks(movement.diveSeconds));
  ally.activeInput = true;
  assert.equal(fireWeapon(arena.horde, ally, ray(), arena.tick, undefined, undefined, { players: arena.players })?.ally, undefined);
});

test('melee validates attack height, and damage and death apply during dive and get-up', () => {
  for (const during of ['dive', 'get-up']) {
    const { p, advance, dive, step, posture, arena } = field();
    dive(1);
    if (during === 'get-up') {
      advance(ticks(movement.diveSeconds));
      step({ posture: 'stand' });
      assert.equal(posture(), 'GETTING_UP');
    } else advance(10);
    const hp = p.hp;
    assert.equal(damagePlayer(p, 14, arena.tick), 14);
    assert.equal(p.hp, hp - 14);
    assert.equal(damagePlayer(p, 1000, arena.tick), hp - 14);
    assert.equal(posture(), 'STANDING');
    assert.equal(p.y, 0);
    assert.equal(p.posture.dive, undefined);
  }
  const { p, advance, dive, arena } = field();
  dive();
  advance(ticks(movement.diveSeconds));
  const h = arena.horde;
  const enemy = h.spawn(p.x, p.z - 1, 0);
  h.target[enemy] = p.slot;
  h.yaw[enemy] = Math.PI;
  const stats = BALANCE.enemiesByWireType[0]!.gameplay;
  const hp = p.hp;
  const start = arena.tick + arena.tick % arena.enemyCombat.timing.decisionTicks;
  enemyCombatTick(arena, start, undefined, [{ ...stats, hitHeight: 1.5 }]);
  assert.equal(p.hp, hp);
  runEnemyStrike(arena, start);
  assert.equal(p.hp, hp - stats.meleeDamage);
});

test('four operators own independent dive clocks and snapshots while a grenade is active', () => {
  const { arena, p, advance } = field();
  const players = [p, ...['1', '2', '3'].map((id) => arena.addPlayer(id))];
  arena.grenades.launch(p, arena.tick - p.loadout.grenade.fuseTicks + 12);
  players.forEach((op, i) => {
    op.x = -12 + i * 8;
    op.z = 0;
    assert.ok(arena.receiveInput(op.id, input(1, op.life, {
      forward: i % 2 ? -1 : 1, strafe: .3 * i, posture: 'dive' as PostureCommand,
    })));
  });
  arena.step();
  const first = playerSnapshot(arena, p.id);
  assert.deepEqual(first.players.map((op) => op.posture?.started), Array(4).fill(arena.tick));
  assert.equal(new Set(first.players.map((op) => op.posture?.dive?.x)).size, 4);
  advance(ticks(movement.diveSeconds));
  assert.deepEqual(playerSnapshot(arena, p.id).players.map((op) => op.posture?.current),
    ['PRONE', 'SUPINE', 'PRONE', 'SUPINE']);
  assert.equal(first.players[0].posture?.current, 'DIVING', 'an emitted snapshot owns its data');
  assert.equal(arena.stats.data.blasts, 1);
});

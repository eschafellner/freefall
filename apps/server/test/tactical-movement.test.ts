import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BODENBRUCH, NET, PLAYER, createBalanceRegistry, groundedBodyHit, newPosture,
  postureCollider, postureRayHit,
} from '@freefall/shared';
import type { Obstacle, PlayerInput, PostureCommand, WorldDefinition } from '@freefall/shared';
import { validateInput } from '../src/networking/input.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import { damagePlayer, fireWeapon, meleeSystem } from '../src/systems/combat.ts';

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

test('dives preserve the full analog vector and select landing relative to initial aim', () => {
  const yaw = .72;
  const cases = [
    [1, 0, 'PRONE'], [-1, 0, 'SUPINE'], [0, 1, 'PRONE'], [0, -1, 'PRONE'],
    [1, 1, 'PRONE'], [1, -1, 'PRONE'], [-1, 1, 'SUPINE'], [-1, -1, 'SUPINE'],
    [.23, -.67, 'PRONE'], [-.012, .79, 'SUPINE'], [0, 0, 'PRONE'],
  ] as const;
  for (const [forward, strafe, landing] of cases) {
    const { p, advance, dive, posture, step } = field();
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

test('rejects bad commands, stale lives, invalid analog values and premature repeat dives', () => {
  assert.equal(validateInput({ ...input(1, 1), posture: 'PRONE' }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), forward: Infinity }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), strafe: 1.01 }, 0), undefined);
  assert.equal(validateInput({ ...input(1, 1), life: undefined, posture: 'dive' }, 0), undefined);
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
    advance(p.loadout.medical.applicationTicks);
    assert.equal(p.equipment.stims, stims - 1);
    assert.ok(p.hp > p.loadout.maxHealth - 45);
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
  const stats = BALANCE.enemiesByWireType[0]!.gameplay;
  const hp = p.hp;
  meleeSystem(h, arena.players, arena.tick, undefined, true, undefined, [{ ...stats, hitHeight: 1.5 }]);
  assert.equal(p.hp, hp);
  meleeSystem(h, arena.players, arena.tick);
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

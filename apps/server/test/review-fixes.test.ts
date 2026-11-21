/**
 * Regression tests for the fixes of the full code review (2026-11).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BODENBRUCH, BOARDING_TICKS, CARRIER_SHIP, CARRIER_WORLD, LANDING_STAGE_TICKS, MOVEMENT_INPUT, NET, PLAYER,
  createBalanceRegistry, resolveMissionBalance,
} from '@freefall/shared';
import type { PlayerInput, WorldDefinition } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { Convicts } from '../src/mission/Convicts.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { Arena } from '../src/simulation/Arena.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import { damagePlayer, fireWeapon, staggerEnemy } from '../src/systems/combat.ts';
import { runEnemyStrike } from './support/enemy-combat.ts';
import { movementSystem } from '../src/systems/horde.ts';
import { StaggerComponent } from '../src/ecs/StaggerComponent.ts';

const STEP = PLAYER.walkSpeed / NET.tickHz;
const walk = (seq: number, life: number, extra: Partial<PlayerInput> = {}): PlayerInput =>
  ({ seq, life, forward: 1, strafe: 0, yaw: 0, pitch: -.1, sprint: false, fire: false, ...extra });
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };
const ray = () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 });

test('a backlog after a network stall drains actively instead of adding permanent latency', () => {
  const arena = new Arena(11, 0);
  const p = arena.addPlayer('p');
  let seq = 0;
  for (let i = 0; i < 40; i++) { arena.receiveInput('p', walk(++seq, p.life)); arena.step(); }
  // 300 ms stall: nine inputs arrive at once, then the client keeps sending one per tick.
  for (let i = 0; i < 9; i++) arena.step();
  for (let i = 0; i < 9; i++) arena.receiveInput('p', walk(++seq, p.life));
  for (let i = 0; i < 10; i++) { arena.receiveInput('p', walk(++seq, p.life)); arena.step(); }
  assert.ok(p.moves.length <= p.moveCushion + MOVEMENT_INPUT.backlog, `queue ${p.moves.length}`);
  assert.ok(seq - p.ack <= p.moveCushion + MOVEMENT_INPUT.backlog);
});

test('a client clock that runs slightly fast does not build an ever-growing backlog', () => {
  const arena = new Arena(12, 0);
  const p = arena.addPlayer('p');
  let seq = 0;
  // One extra input every 60 ticks (1.7 % fast).
  for (let i = 0; i < 1200; i++) {
    arena.receiveInput('p', walk(++seq, p.life));
    if (i % 60 === 0) arena.receiveInput('p', walk(++seq, p.life));
    arena.step();
  }
  assert.ok(seq - p.ack <= p.moveCushion + MOVEMENT_INPUT.backlog + 1, `behind by ${seq - p.ack}`);
});

test('the average movement rate stays bounded by the tick rate (no speed hack)', () => {
  const arena = new Arena(13, 0);
  const p = arena.addPlayer('p');
  const start = p.z;
  let seq = 0;
  for (let i = 0; i < 300; i++) {
    for (let k = 0; k < 2; k++) arena.receiveInput('p', walk(++seq, p.life));
    arena.step();
  }
  const steps = (start - p.z) / STEP;
  assert.ok(steps <= 300 * (1 + MOVEMENT_INPUT.drift) + MOVEMENT_INPUT.credit + 1, `${steps} steps in 300 ticks`);
});

test('a posture command survives queue overflow and drained extra inputs never carry one', () => {
  const arena = new Arena(14, 0);
  const p = arena.addPlayer('p');
  arena.receiveInput('p', walk(1, p.life, { forward: 0, posture: 'crouch' }));
  for (let seq = 2; seq <= MOVEMENT_INPUT.queue + 1; seq++) arena.receiveInput('p', walk(seq, p.life, { forward: 0 }));
  assert.equal(p.moves.length, MOVEMENT_INPUT.queue);
  assert.equal(p.moves[0].posture, 'crouch');
  for (let i = 0; i < 20; i++) arena.step();
  assert.equal(p.posture.current, 'CROUCHING');

  // Backlog with a stand command in second place: it is applied on its own tick, never as an extra input.
  const other = new Arena(15, 0);
  const q = other.addPlayer('q');
  q.moveCredit = MOVEMENT_INPUT.credit;
  other.receiveInput('q', walk(1, q.life, { forward: 0, posture: 'crouch' }));
  other.step();
  for (let i = 0; i < 20; i++) other.step();
  other.receiveInput('q', walk(2, q.life, { forward: 0 }));
  other.receiveInput('q', walk(3, q.life, { forward: 0, posture: 'stand' }));
  for (let seq = 4; seq <= 8; seq++) other.receiveInput('q', walk(seq, q.life, { forward: 0 }));
  other.step();
  assert.equal(q.ack, 2, 'extra inputs stop before a posture command');
  other.step();
  assert.equal(q.posture.started, other.tick, 'stand starts on its own tick');
});

test('inputs of a previous life are acknowledged without moving, aiming, firing or reloading', () => {
  const arena = new Arena(16, 0);
  const p = arena.addPlayer('p');
  const life = p.life;
  p.protectedUntil = 0;
  damagePlayer(p, p.hp, arena.tick);
  assert.equal(p.hp, 0);
  for (let seq = 1; seq <= 5; seq++) arena.receiveInput('p', walk(seq, life));
  while (arena.tick < p.respawnTick - 1) arena.step();
  assert.ok(arena.receiveInput('p', walk(6, life, { fire: true })));
  arena.step();
  assert.ok(p.hp > 0);
  assert.equal(arena.shots.length, 0, 'held fire received just before respawn does not fire in the new life');
  const spawn = { x: p.x, z: p.z };
  assert.equal(p.moves.length, 0, 'respawn drops the queue of the old life');
  const late = walk(7, life, { fire: true, reload: true, yaw: 2, aim: true, equipment: 'secondary' });
  assert.ok(arena.receiveInput('p', late));
  assert.equal(arena.receiveInput('p', late), false, 'a stale-life sequence is still consumed only once');
  arena.step();
  assert.deepEqual({ x: p.x, z: p.z }, spawn, 'late input of the old life is acknowledged without movement');
  assert.equal(p.ack, 7);
  assert.equal(p.yaw, 0);
  assert.equal(p.equipment.slot, 'primary');
  assert.equal(p.ammo, p.loadout.weapons.primary.magazineSize);
  assert.equal(p.activeInput, false);
  assert.equal(arena.shots.length, 0);
  p.ammo--; // A valid reload has room to start, even after the stale reload packet.
  arena.receiveInput('p', walk(8, p.life));
  arena.step();
  assert.ok(p.z < spawn.z, 'input of the new life moves');
  assert.equal(p.reload.phase, 'READY');
  arena.receiveInput('p', walk(9, p.life, { reload: true }));
  arena.step();
  assert.equal(p.reload.phase, 'RELOAD_START');
});

test('enemy melee goes through the damage resolver and operators keep whole hit points', () => {
  const field = new Battlefield(3, open);
  const p = field.addPlayer('p');
  Object.assign(p, { x: 0, z: 0, protectedUntil: 0 });
  const h = field.horde;
  const enemy = h.spawn(0, -.8, 0);
  h.target[enemy] = p.slot;
  h.yaw[enemy] = Math.PI;
  const stats = BALANCE.enemiesByWireType[0]!.gameplay;
  const hp = p.hp;
  runEnemyStrike(field, field.tick, open, [{ ...stats, meleeDamage: 9.2 }]);
  assert.equal(p.hp, hp - 9);
  assert.ok(Number.isInteger(p.hp));
});

test('death during a reload publishes the interruption and counts it', () => {
  const field = new Battlefield(4, open);
  const p = field.addPlayer('p');
  p.protectedUntil = 0;
  p.ammo = 3;
  p.reloadRequested = true;
  p.activeInput = true;
  p.inputTick = field.tick + 1;
  field.step();
  assert.equal(p.reload.phase, 'RELOAD_START');
  const events: unknown[] = [];
  damagePlayer(p, p.hp, field.tick, true, { events: events as never, stats: field.stats });
  assert.equal(p.reload.phase, 'RELOAD_INTERRUPTED');
  assert.equal(field.stats.data.reloadsInterrupted, 1);
  assert.ok(events.some((event) => (event as { phase?: string }).phase === 'RELOAD_INTERRUPTED'));
});

test('a crouched operator hits a Schabe pressing against the barrel', () => {
  const field = new Battlefield(5, open);
  const p = field.addPlayer('p');
  Object.assign(p, { x: 0, z: 0, protectedUntil: 0 });
  let seq = 0;
  field.receiveInput('p', walk(++seq, p.life, { forward: 0, posture: 'crouch' }));
  for (let i = 0; i < 20; i++) { field.receiveInput('p', walk(++seq, p.life, { forward: 0 })); field.step(); }
  assert.equal(p.posture.current, 'CROUCHING');
  // Positions where the camera aim point lies level with or behind the low barrel (the old code dropped the shot).
  for (const [x, z, pitch] of [[.6, -.6, -.5], [.75, -.4, -.7], [.45, -.6, -.7], [.6, -.2, -.7]] as const) {
    const enemy = field.horde.spawn(x, z, 0);
    field.horde.hp[enemy] = 1000;
    p.input = walk(++seq, p.life, { forward: 0, fire: true, pitch });
    p.activeInput = true;
    p.fireAt = 0;
    const shot = fireWeapon(field.horde, p, ray(), field.tick, open);
    assert.equal(shot?.enemy, field.horde.id[enemy], `enemy at ${x} / ${z}`);
    field.horde.despawn(enemy);
  }
});

test('knockback travels the configured distance and the enemy moves again on the end tick', () => {
  const h = new HordeManager();
  const staggers = new StaggerComponent();
  const i = h.spawn(0, 0, 0);
  const melee = BALANCE.melee(BALANCE.loadout(BALANCE.operator.loadoutId).meleeId);
  const T = Math.round(melee.staggerSeconds * NET.tickHz);
  assert.ok(staggerEnemy(h, staggers, i, 0, T, 10, melee.knockbackDistance, 0, -1));
  for (let tick = 1; tick < T; tick++) movementSystem(h, open, tick, staggers);
  // Positions are Float32 in the ECS.
  assert.ok(Math.abs(-h.z[i] - melee.knockbackDistance) < 1e-5, `travel ${-h.z[i]}`);
  h.vz[i] = -3;
  const before = h.z[i];
  movementSystem(h, open, T, staggers);
  assert.equal(staggers.active(h, i), 0);
  assert.ok(h.z[i] < before, 'no extra standstill tick after the stagger');
});

test('arena kills by grenades delay the refill like kills by shots', () => {
  const arena = new Arena(17, 100);
  arena.step();
  assert.equal(arena.horde.count, 100);
  const p = arena.addPlayer('p');
  const victims = Array.from({ length: 5 }, (_, k) => arena.horde.active[k]);
  for (const slot of victims) {
    arena.horde.x[slot] = p.x + .3;
    arena.horde.z[slot] = p.z - 6;
  }
  arena.grenades.launch(p, arena.tick - p.loadout.grenade.fuseTicks + 1);
  p.protectedUntil = Infinity;
  arena.step();
  assert.ok(arena.stats.data.grenadeKills > 0, 'the blast killed');
  arena.step();
  assert.ok(arena.horde.count < 100, 'no instant refill after grenade kills');
});

test('convicts fire at the configured rate on average', () => {
  for (const difficulty of BALANCE.difficulties) {
    const config = resolveMissionBalance(BALANCE, difficulty.id).convicts;
    const convicts = new Convicts({ x: 0, z: 0 }, 'run', config);
    convicts.deploy();
    const member = convicts.members[0];
    for (const other of convicts.members.slice(1)) other.hp = 0;
    Object.assign(member, { state: 'DEFENDING', x: 0, z: 0, ammo: 1e9 });
    const h = new HordeManager();
    const enemy = h.spawn(0, -5, 0);
    const seconds = 20;
    let shots = 0;
    for (let tick = 1; tick <= seconds * NET.tickHz; tick++) {
      h.hp[enemy] = 1e9;
      const fired: never[] = [];
      convicts.update(tick, h, open, fired);
      shots += fired.length;
    }
    assert.ok(Math.abs(shots / seconds - config.kit.roundsPerSecond) < .1, `${difficulty.id}: ${shots / seconds}/s`);
  }
});

function boarding() {
  const mission = new MissionInstance(51296, BODENBRUCH);
  const host = mission.addPlayer('host');
  Object.assign(host, { x: 0, z: 3 });
  assert.ok(mission.select('host', { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'hard' }));
  assert.ok(mission.start('host'));
  return { mission, host };
}

test('the host can call off boarding and restart without selecting again', () => {
  const { mission, host } = boarding();
  Object.assign(host, { ...CARRIER_SHIP, x: -1 });
  assert.ok(mission.action('host', 'ready'));
  assert.ok(mission.cancelBoarding('host'));
  assert.equal(mission.state, 'MISSION_SELECTION');
  const snapshot = mission.snapshot();
  assert.equal(snapshot.selection?.difficultyId, 'hard');
  assert.equal(snapshot.instanceId, undefined);
  assert.equal(snapshot.operators[0].ready, false);
  assert.equal(mission.acceptsNewOperators, true);
  assert.equal(mission.cancelBoarding('host'), false, 'only during boarding');
  Object.assign(host, { x: 0, z: 3 });
  assert.ok(mission.start('host'));
  Object.assign(host, { ...CARRIER_SHIP, x: -1 });
  assert.ok(mission.action('host', 'ready'));
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  assert.equal(mission.state, 'ACTIVE_MISSION');
  assert.equal(mission.difficulty.id, 'hard');
});

test('resupply reports why it cannot start while reloading or firing', () => {
  const { mission, host } = boarding();
  Object.assign(host, { ...CARRIER_SHIP, x: -1 });
  mission.action('host', 'ready');
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  const ship = mission.snapshot().albatross!;
  Object.assign(host, { x: ship.x - 4.1, z: ship.z, protectedUntil: Infinity });
  host.equipment.magazines.primary = 1;
  host.reload = { ...host.reload, phase: 'RELOAD_START', until: mission.tick + 30 };
  assert.equal(mission.interact('host'), false);
  assert.deepEqual(mission.drainFeedback(), [{ id: 'host', code: 'resupply-reloading' }]);
  host.reload = { ...host.reload, phase: 'READY' };
  host.input = { ...host.input, fire: true };
  for (let i = 0; i < 7; i++) mission.step();
  host.input = { ...host.input, fire: true };
  assert.equal(mission.interact('host'), false);
  assert.deepEqual(mission.drainFeedback(), [{ id: 'host', code: 'resupply-busy' }]);
});

test('enemy damage multiplier zero is rejected by the schema with a located message', () => {
  const data = structuredClone(BALANCE_SOURCES) as typeof BALANCE_SOURCES;
  (data.difficulty.difficulties[0] as { enemyDamageMultiplier: number }).enemyDamageMultiplier = 0;
  assert.throws(() => createBalanceRegistry(data), /enemyDamageMultiplier/);
});

test('operator weapons fire at their configured rate on average, the pistol included', () => {
  for (const slot of ['primary', 'secondary'] as const) {
    const field = new Battlefield(6, open);
    const p = field.addPlayer('p');
    p.equipment.slot = slot;
    const weapon = p.loadout.weapons[slot];
    const seconds = 10;
    let shots = 0;
    for (let seq = 1; seq <= seconds * NET.tickHz; seq++) {
      p.ammo = weapon.magazineSize;
      field.receiveInput('p', walk(seq, p.life, { forward: 0, fire: true }));
      field.step();
      shots += field.shots.length;
    }
    assert.ok(Math.abs(shots / seconds - weapon.roundsPerSecond) <= .1, `${slot}: ${shots / seconds}/s`);
  }
});

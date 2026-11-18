import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARENA_HALF, BODENBRUCH, ENEMY_TYPES, FRAG, HordeFrame, MAX_ENEMIES, NET, PLAYER, RUNNER_TYPE, TEST_RIFLE, aimRay, decodeHorde,
} from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { Grenades, blastDamage } from '../src/systems/grenades.ts';
import { UniformGrid } from '../src/ecs/UniformGrid.ts';
import { validateInput } from '../src/networking/input.ts';
import { encodeHorde } from '../src/networking/snapshots.ts';
import { Arena } from '../src/simulation/Arena.ts';
import { FixedLoop } from '../src/simulation/FixedLoop.ts';
import { damageEnemy, damagePlayer, fireWeapon, meleeSystem } from '../src/systems/combat.ts';
import { movementSystem, steeringSystem, targetingSystem } from '../src/systems/horde.ts';

const input: PlayerInput = { seq: 1, forward: 0, strafe: 0, sprint: false, yaw: 0, pitch: -0.11, fire: true };

test('horde changes live, reaches capacity and allocates fresh identities for reused slots', () => {
  const arena = new Arena(11, 0);
  assert.equal(arena.setHordeSize(17), false);
  assert.equal(arena.setHordeSize(1000), true);
  arena.step();
  assert.equal(arena.horde.count, MAX_ENEMIES);
  assert.equal(arena.horde.spawn(0, 0, RUNNER_TYPE), -1);
  const old = arena.horde.active[4];
  const previous = arena.horde.id[old];
  const swapped = arena.horde.active[MAX_ENEMIES - 1];
  arena.horde.despawn(old);
  arena.horde.despawn(old);
  assert.equal(arena.horde.count, MAX_ENEMIES - 1);
  assert.equal(arena.horde.active[4], swapped);
  assert.equal(arena.horde.spawn(5, 7, RUNNER_TYPE), old);
  assert.notEqual(arena.horde.id[old], previous);
  assert.equal(arena.setHordeSize(0), true);
  arena.step();
  assert.equal(arena.horde.count, 0);
  assert.equal(arena.setHordeSize(250), true);
  arena.step();
  assert.equal(arena.horde.count, 250);
});

test('targeting selects the nearest living player and reacts to death and departure', () => {
  const arena = new Arena(4, 0);
  const near = arena.addPlayer('near');
  const far = arena.addPlayer('far');
  near.x = 2;
  far.x = -9;
  const enemy = arena.horde.spawn(0, 5, RUNNER_TYPE);
  targetingSystem(arena.horde, arena.players, 1);
  assert.equal(arena.horde.target[enemy], near.slot);
  near.hp = 0;
  targetingSystem(arena.horde, arena.players, 2);
  assert.equal(arena.horde.target[enemy], far.slot);
  arena.removePlayer(far.id);
  targetingSystem(arena.horde, arena.players, 3);
  assert.equal(arena.horde.target[enemy], -1);
});

test('grid separation spreads overlapping neighbors and velocity stays bounded', () => {
  const horde = new HordeManager();
  const grid = new UniformGrid();
  const first = horde.spawn(0, 0, RUNNER_TYPE);
  const second = horde.spawn(0, 0, RUNNER_TYPE);
  steeringSystem(horde, grid, [], 1);
  steeringSystem(horde, grid, [], 2);
  assert.ok(horde.vx[first] < 0);
  assert.ok(horde.vx[second] > 0);
  movementSystem(horde);
  assert.ok(horde.x[first] < horde.x[second]);
  assert.ok(Math.abs(horde.vx[first]) <= ENEMY_TYPES[RUNNER_TYPE].speed + 1e-6);
});

test('server validates inputs, normalizes movement, clamps bounds and expires held input', () => {
  for (const bad of [null, [], { ...input, pitch: 1 }, { ...input, forward: 2 }, { ...input, yaw: NaN }, { ...input, sprint: 1 }]) {
    assert.equal(validateInput(bad, 0), undefined);
  }
  assert.equal(validateInput(input, 1), undefined);
  assert.deepEqual(validateInput({ ...input, damage: 9000, x: 80, hp: 10000 }, 0), input);

  const arena = new Arena(3, 0);
  const player = arena.addPlayer('pilot');
  const start = { x: player.x, z: player.z };
  assert.equal(arena.receiveInput('pilot', { ...input, strafe: 1, forward: 1, sprint: true, fire: false }), true);
  assert.equal(arena.receiveInput('pilot', input), false);
  arena.step();
  assert.ok(Math.abs(Math.hypot(player.x - start.x, player.z - start.z) - PLAYER.sprintSpeed / NET.tickHz) < 1e-9);
  for (let i = 0; i < NET.inputTimeoutTicks; i++) arena.step();
  const stopped = player.x;
  arena.step();
  assert.equal(player.x, stopped);
  player.x = ARENA_HALF - 0.5;
  assert.equal(arena.receiveInput('pilot', { ...input, seq: 2, strafe: 1, fire: false }), true);
  arena.step();
  assert.equal(player.x, ARENA_HALF - 0.5);
  assert.equal(player.ack, 2);
});

test('hitscan damages the nearest visible target, enforces rate and emits an elimination', () => {
  const arena = new Arena(12, 0);
  const h = arena.horde;
  const player = arena.addPlayer('pilot');
  player.input = input;
  player.activeInput = true;
  const ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  aimRay(ray, player, input.yaw, input.pitch);
  const depth = (ENEMY_TYPES[RUNNER_TYPE].hitHeight - ray.y) / ray.dy;
  const nearer = h.spawn(ray.x, ray.z + depth * ray.dz, RUNNER_TYPE);
  const farther = h.spawn(ray.x, ray.z + (depth + 3) * ray.dz, RUNNER_TYPE);
  const first = fireWeapon(h, player, ray, 1);
  assert.equal(first?.enemy, h.id[nearer]);
  assert.equal(first?.eliminated, false);
  assert.equal(h.hp[nearer], ENEMY_TYPES[RUNNER_TYPE].health - TEST_RIFLE.damage);
  assert.equal(fireWeapon(h, player, ray, 2), undefined);
  const second = fireWeapon(h, player, ray, 1 + Math.ceil(NET.tickHz / TEST_RIFLE.roundsPerSecond));
  assert.equal(second?.eliminated, true);
  assert.equal(player.kills, 1);
  assert.equal(h.count, 1);
  assert.equal(h.hp[farther], ENEMY_TYPES[RUNNER_TYPE].health);
  assert.equal(damageEnemy(h, farther, ENEMY_TYPES[RUNNER_TYPE].health), true);
  assert.equal(h.count, 0);
});

test('melee respects cooldown, player death is authoritative, and respawn starts a new life', () => {
  const arena = new Arena(1, 0);
  const player = arena.addPlayer('pilot');
  const enemy = arena.horde.spawn(player.x, player.z, RUNNER_TYPE);
  arena.horde.target[enemy] = player.slot;
  meleeSystem(arena.horde, arena.players, 1);
  assert.equal(player.hp, PLAYER.health);
  const now = player.protectedUntil;
  meleeSystem(arena.horde, arena.players, now);
  meleeSystem(arena.horde, arena.players, now + 1);
  assert.equal(player.hp, PLAYER.health - ENEMY_TYPES[RUNNER_TYPE].meleeDamage);
  damagePlayer(player, PLAYER.health, now + 1);
  assert.equal(player.hp, 0);
  const diedWith = player.life;
  arena.tick = player.respawnTick - 2;
  arena.step();
  assert.equal(player.hp, 0);
  arena.step();
  assert.equal(player.hp, PLAYER.health);
  assert.equal(player.life, diedWith + 1);
});

test('binary snapshot handles quantization, offsets, malformed length and despawn', () => {
  const horde = new HordeManager();
  const slot = horde.spawn(-12.633, 22.777, RUNNER_TYPE);
  const frame = new HordeFrame();
  const encoded = encodeHorde(horde, 20);
  const padded = new Uint8Array(encoded.length + 10);
  padded.set(encoded, 3);
  assert.equal(decodeHorde(padded.subarray(3, 3 + encoded.length), frame), true);
  assert.equal(frame.tick, 20);
  assert.equal(frame.byId.get(horde.id[slot]), 0);
  assert.ok(Math.abs(frame.x[0] - horde.x[slot]) <= 1 / 512);
  assert.ok(Math.abs(frame.z[0] - horde.z[slot]) <= 1 / 512);
  assert.equal(decodeHorde(encoded.subarray(0, -1), frame), false);
  horde.despawn(slot);
  assert.equal(decodeHorde(encodeHorde(horde, 21), frame), true);
  assert.equal(frame.count, 0);
  assert.equal(frame.byId.size, 0);
});

test('fixed loop limits catch-up and discards old backlog', () => {
  const loop = new FixedLoop();
  let steps = 0;
  const tick = () => { steps++; };
  loop.advance(20, tick);
  assert.equal(steps, 0);
  loop.advance(20, tick);
  assert.equal(steps, 1);
  loop.advance(1000, tick);
  assert.equal(steps, 1 + NET.catchUpSteps);
  assert.equal(loop.dropped, NET.tickHz - NET.catchUpSteps);
  loop.advance(0, tick);
  assert.equal(steps, 1 + NET.catchUpSteps);
});

test('simultaneous blasts in a full grid credit each kill once and respect distance and cover', () => {
  const arena = new Arena(1, 0);
  const p = arena.addPlayer('operator');
  const grenades = new Grenades();
  const grid = new UniformGrid();
  const world = { ...BODENBRUCH.world, obstacles: [{ ...BODENBRUCH.world.obstacles[0], id: 'test-wall', x: 0, z: 1, halfX: 2, halfZ: .2, height: 4 }] };
  p.x = p.z = 0;
  p.yaw = Math.PI;
  for (let i = 0; i < 4; i++) grenades.launch(p, 0);
  const blasts: number[] = [];
  const record = (g: { id: number }) => { blasts.push(g.id); };
  const fuse = Math.ceil(FRAG.fuseSeconds * NET.tickHz);
  for (let t = 1; t < fuse; t++) grenades.update(t, arena.horde, grid, world, arena.players, record);
  const landed = grenades.snapshot()![0];
  assert.ok(landed.z < 1 && landed.z > 0 && landed.y <= .11);
  assert.equal(blastDamage(landed, 0, .5, 2, world), 0);
  assert.equal(blastDamage(landed, 40, .5, 0, world), 0);
  assert.ok(blastDamage(landed, 3, .5, 0, world) < blastDamage(landed, 0, .5, 0, world));
  for (let i = 0; i < MAX_ENEMIES; i++) arena.horde.spawn(0, i % 2 ? 2 : 0, RUNNER_TYPE);
  grenades.update(fuse, arena.horde, grid, world, arena.players, record);
  assert.equal(arena.horde.count, MAX_ENEMIES / 2);
  assert.equal(p.kills, MAX_ENEMIES / 2);
  assert.equal(new Set(blasts).size, 4);
  grenades.update(fuse + 1, arena.horde, grid, world, arena.players, record);
  assert.equal(blasts.length, 4);
});

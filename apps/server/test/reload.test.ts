import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NET, PLAYER_MOTION, TEST_RIFLE } from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';
import { validateInput } from '../src/networking/input.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Arena } from '../src/simulation/Arena.ts';
import { damagePlayer } from '../src/systems/combat.ts';

const base: PlayerInput = { seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: -.25, sprint: false, fire: false };
const reloadTicks = Math.ceil(NET.tickHz * TEST_RIFLE.reloadSeconds);

test('reload uses server ticks, publishes the timeline and latches a tap between ticks', () => {
  const arena = new Arena(1, 0);
  const p = arena.addPlayer('local');
  assert.equal(validateInput({ ...base, aim: 1 }, 0), undefined);
  assert.equal(validateInput({ ...base, reload: 'true' }, 0), undefined);

  arena.receiveInput(p.id, { ...base, fire: true });
  arena.step();
  assert.equal(p.ammo, TEST_RIFLE.magazineSize - 1);
  arena.receiveInput(p.id, { ...base, seq: 2, reload: true });
  arena.receiveInput(p.id, { ...base, seq: 3, sprint: true, aim: true, fire: true });
  arena.step();

  const until = arena.tick + reloadTicks;
  let s = playerSnapshot(arena, p.id).players[0];
  assert.equal(s.pitch, base.pitch);
  assert.equal(s.motion, PLAYER_MOTION.sprint | PLAYER_MOTION.aim);
  assert.equal(s.reloadUntil, until);
  assert.equal(s.ammo, TEST_RIFLE.magazineSize - 1);
  assert.equal(arena.shots.length, 0);
  while (arena.tick < until - 1) arena.step();
  s = playerSnapshot(arena, p.id).players[0];
  assert.equal(s.motion, 0);
  assert.equal(s.ammo, TEST_RIFLE.magazineSize - 1);
  arena.step();
  assert.equal(p.ammo, TEST_RIFLE.magazineSize);
  assert.equal(p.reloadUntil, 0);
});

test('empty magazines auto-reload on held fire and death discards a pending reload', () => {
  const arena = new Arena(1, 0);
  const p = arena.addPlayer('local');
  let seq = 0;
  p.ammo = 1;
  arena.receiveInput(p.id, { ...base, seq: ++seq, fire: true });
  arena.step();
  assert.equal(p.ammo, 0);
  assert.equal(arena.shots.length, 1);
  arena.step();
  assert.equal(arena.shots.length, 0);
  const until = arena.tick + reloadTicks;
  assert.equal(p.reloadUntil, until);
  while (arena.tick < until) {
    arena.receiveInput(p.id, { ...base, seq: ++seq, fire: true, reload: true });
    arena.step();
  }
  assert.equal(arena.shots.length, 1);
  assert.equal(p.ammo, TEST_RIFLE.magazineSize - 1);
  assert.equal(p.reloadUntil, 0);
  arena.receiveInput(p.id, { ...base, seq: ++seq });
  arena.receiveInput(p.id, { ...base, seq: ++seq, reload: true });
  arena.step();
  assert.ok(p.reloadUntil > arena.tick);
  damagePlayer(p, p.hp, p.protectedUntil);
  assert.equal(p.reloadUntil, 0);
  const life = p.life;
  while (p.life === life) arena.step();
  assert.equal(p.ammo, TEST_RIFLE.magazineSize);
  assert.equal(p.reloadUntil, 0);
});

test('slot transactions preserve ammo, cancel reload and reject stale life and sequence', () => {
  const arena = new Arena(1, 0);
  const p = arena.addPlayer('pilot');
  p.ammo = 7;
  const switchInput = { ...base, life: p.life, equipment: 'secondary', fire: true, reload: true };
  assert.equal(arena.receiveInput(p.id, switchInput), true);
  assert.equal(arena.receiveInput(p.id, switchInput), false);
  arena.step();
  assert.equal(p.reloadUntil, 0);
  assert.equal(p.ammo, 7);
  while (arena.tick < p.equipment.until - 1) { arena.step(); assert.equal(arena.shots.length, 0); }
  arena.step();
  assert.equal(p.equipment.slot, 'secondary');
  const tap = (seq: number, extra: object) => arena.receiveInput(p.id, { ...base, seq, life: p.life, ...extra });
  tap(2, { fire: true });
  arena.step();
  assert.equal(p.ammo, 11);
  tap(3, { reload: true });
  arena.step();
  assert.ok(p.reloadUntil);
  tap(4, { equipment: 'primary' });
  arena.step();
  assert.equal(p.reloadUntil, 0);
  while (p.equipment.action) arena.step();
  assert.equal(p.ammo, 7);
  assert.equal(p.equipment.inactiveAmmo, 11);
  tap(5, { life: p.life - 1, equipment: 'secondary' });
  arena.step();
  assert.equal(p.equipment.action, undefined);
  tap(6, { equipment: 'secondary' });
  arena.step();
  while (p.equipment.action) arena.step();
  tap(7, { reload: true });
  arena.step();
  while (p.reloadUntil) arena.step();
  assert.equal(p.ammo, 12);
  assert.equal(p.equipment.pistolReserve, 47);
});

test('empty consumables stay empty and cancelling a stim before the end tick preserves the charge', () => {
  const arena = new Arena(4, 0);
  const p = arena.addPlayer('field');
  let seq = 0;
  const input = (extra: object) => {
    arena.receiveInput(p.id, { ...base, seq: ++seq, life: p.life, ...extra });
    arena.step();
  };
  input({ equipment: 'stim' });
  assert.equal(p.equipment.action, undefined);
  p.hp = 20;
  input({ equipment: 'stim' });
  while (arena.tick < p.equipment.until - 1) arena.step();
  input({ sprint: true });
  assert.equal(p.equipment.stims, 5);
  assert.equal(p.hp, 20);
  assert.equal(p.equipment.stimResult, 'cancelled');
  for (const [action, count] of [['stim', 5], ['grenade', 2]] as const) {
    for (let n = 0; n < count; n++) {
      p.hp = 20;
      input({ equipment: action });
      while (p.equipment.action) arena.step();
    }
    p.hp = 20;
    input({ equipment: action });
    assert.equal(p.equipment.action, undefined);
    assert.equal(p.equipment[action === 'stim' ? 'stims' : 'grenades'], 0);
    assert.equal(p.hp, 20);
  }
});

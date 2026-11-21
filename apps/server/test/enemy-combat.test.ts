import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, BODENBRUCH, ENEMY_TYPES, HordeFrame, NET, SCHABE_TYPE, decodeHorde } from '@freefall/shared';
import type { CombatEvent, Obstacle } from '@freefall/shared';
import { encodeHorde } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import { damageEnemy, damagePlayer, staggerEnemy } from '../src/systems/combat.ts';
import { enemyCombatTick } from './support/enemy-combat.ts';

const stats = ENEMY_TYPES[SCHABE_TYPE];
const { windupTicks, activeTicks, recoveryTicks } = BALANCE.swarm.meleeAttack;
const attackTicks = windupTicks + activeTicks + recoveryTicks;
const cooldown = Math.ceil(stats.meleeCooldown * NET.tickHz);

function encounter() {
  const obstacles: Obstacle[] = [];
  const field = new Battlefield(74, { ...BODENBRUCH.world, obstacles });
  const operator = Object.assign(field.addPlayer('operator'), { x: 0, z: 0, protectedUntil: 0 });
  const horde = field.horde;
  const slot = horde.spawn(0, 1, SCHABE_TYPE);
  const combat = field.enemyCombat;
  const hits: Extract<CombatEvent, { type: 'enemy-hit' }>[] = [];
  const step = () => {
    field.step();
    hits.push(...field.combatEvents.filter((event) => event.type === 'enemy-hit'));
  };
  const until = (tick: number) => { while (field.tick < tick) step(); };
  const state = () => combat.sample(horde, slot, field.tick, stats);
  until(2);
  assert.equal(state().phase, 'WINDUP');
  const start = combat.get(horde, slot)!.start;
  return { field, horde, slot, operator, obstacles, combat, hits, until, state, start, impact: start + windupTicks };
}

test('battlefield holds the attack pose, consumes one event, recovers and preserves the sustained cooldown', () => {
  const { field, horde, slot, operator, hits, until, state, start, impact } = encounter();
  const initialHP = operator.hp;
  const x = horde.x[slot], z = horde.z[slot], yaw = horde.yaw[slot];
  until(impact - 1);
  assert.equal(state().phase, 'WINDUP');
  assert.equal(state().remainingTicks, 1);
  assert.equal(operator.hp, initialHP);
  assert.equal(hits.length, 0);
  assert.deepEqual([horde.x[slot], horde.z[slot], horde.yaw[slot]], [x, z, yaw]);
  until(impact);
  const id = `${horde.id[slot]}:${start}`;
  assert.equal(state().phase, 'ACTIVE');
  assert.equal(state().remainingTicks, activeTicks);
  assert.equal(operator.hp, initialHP - stats.meleeDamage);
  assert.deepEqual(hits, [{ type: 'enemy-hit', tick: impact, attack: id, enemy: horde.id[slot],
    target: operator.id, life: operator.life, amount: stats.meleeDamage,
    direction: { x: x - operator.x, z: z - operator.z } }]);
  enemyCombatTick(field, impact);
  assert.equal(operator.hp, initialHP - stats.meleeDamage);
  until(impact + activeTicks);
  assert.equal(state().phase, 'RECOVERY');
  assert.equal(state().reservation, undefined);
  assert.equal(state().remainingTicks, recoveryTicks);
  until(start + attackTicks);
  assert.equal(field.enemyCombat.get(horde, slot), undefined);
  until(start + cooldown - 1);
  assert.equal(hits.length, 1);
  assert.equal(field.enemyCombat.totals.starts, 1);
  until(start + cooldown);
  assert.equal(state().phase, 'WINDUP');
  until(start + cooldown + windupTicks);
  assert.equal(hits.length, 2);
  assert.notEqual(hits[1].attack, id);
});

for (const change of ['range', 'angle', 'cover', 'volume'] as const) {
  test(`the impact revalidates ${change} after a valid windup`, () => {
    const { horde, slot, operator, obstacles, hits, until, combat, state, impact } = encounter();
    const hp = operator.hp;
    if (change === 'range') operator.z = -6;
    if (change === 'angle') operator.z = horde.z[slot] + 1;
    if (change === 'cover') obstacles.push({ kind: 'barrier', x: 0, z: .6, halfX: 1, halfZ: .025, height: 1.5 });
    if (change === 'volume') operator.y = 2;
    until(impact + activeTicks);
    assert.equal(state().phase, 'RECOVERY');
    assert.equal(state().result, change);
    operator.x = operator.y = operator.z = 0;
    obstacles.length = 0;
    until(impact + activeTicks + recoveryTicks - 1);
    assert.equal(operator.hp, hp);
    assert.equal(hits.length, 0);
    assert.equal(combat.totals.starts, 1);
  });
}

test('an operator entering contact on the last active tick takes a single hit', () => {
  const { operator, until, hits, impact } = encounter();
  operator.z = -6;
  until(impact + activeTicks - 2);
  assert.equal(hits.length, 0);
  operator.z = 0;
  until(impact + activeTicks - 1);
  assert.equal(hits.length, 1);
});

test('a miss requests a different attack position through the existing approach system', () => {
  const { field, horde, slot, operator, until, start, impact } = encounter();
  operator.z = -5;
  until(impact + activeTicks);
  assert.equal(field.navigation.attackSector[slot], -1);
  assert.ok(field.navigation.repositionSector[slot] >= 0);
  operator.z = 0;
  until(start + attackTicks + field.registry.swarm.hordeAi.steeringTicks);
  assert.ok(field.navigation.attackSector[slot] >= 0);
  assert.equal(field.navigation.repositionSector[slot], -1);
  assert.equal(horde.count, 1);
});

test('a lethal interruption frees the same sector for a recycled enemy slot', () => {
  const { field, horde, slot, operator, combat, until } = encounter();
  const replaced = horde.id[slot];
  const reservation = combat.get(horde, slot)!.reservation;
  assert.ok(damageEnemy(horde, slot, stats.health));
  assert.equal(horde.spawn(0, 1, SCHABE_TYPE), slot);
  horde.target[slot] = operator.slot;
  until(field.tick + field.enemyCombat.timing.decisionTicks);
  const current = combat.get(horde, slot);
  assert.ok(current && current.owner !== replaced);
  assert.equal(current.reservation, reservation);
});

for (const failure of ['death in windup', 'death in active', 'stagger', 'operator death', 'new life', 'slot reuse'] as const) {
  test(`attack cancellation handles ${failure}`, () => {
    const { field, horde, slot, operator, combat, hits, until, state, impact } = encounter();
    const enemyId = horde.id[slot];
    if (failure === 'death in active') {
      operator.z = -6;
      until(impact);
      assert.equal(state().phase, 'ACTIVE');
      operator.z = -1;
    }
    if (failure === 'death in windup' || failure === 'death in active') {
      assert.ok(damageEnemy(horde, slot, stats.health));
      const recycled = horde.spawn(10, 10, SCHABE_TYPE);
      assert.equal(recycled, slot);
      assert.notEqual(horde.id[slot], enemyId);
    } else if (failure === 'stagger') {
      assert.ok(staggerEnemy(horde, field.stagger, slot, field.tick, windupTicks + 1, 2, 0, 0, 1));
    } else if (failure === 'operator death') {
      damagePlayer(operator, operator.hp, field.tick);
    } else if (failure === 'new life') {
      operator.life++;
    } else {
      field.removePlayer(operator.id);
      Object.assign(field.addPlayer(operator.id), { x: 0, z: 0, protectedUntil: 0 });
    }
    until(impact);
    assert.equal(hits.length, 0);
    assert.equal(combat.snapshotStart(horde, slot, field.tick), undefined);
    if (failure === 'stagger') assert.equal(state().result, 'stagger');
    if (failure === 'operator death' || failure === 'new life' || failure === 'slot reuse') {
      assert.equal(state().result, 'target-lost');
      assert.equal(state().reservation, undefined);
    }
  });
}

test('actual left and right dives can escape the locked strike, and an overlapping airborne dive takes damage', () => {
  for (const { escape, strafe } of [{ escape: true, strafe: -1 }, { escape: true, strafe: 1 }, { escape: false, strafe: 1 }]) {
    const { field, operator, hits, start, until, impact } = encounter();
    const before = operator.hp;
    if (!escape) until(impact - 5);
    assert.ok(field.receiveInput(operator.id, { seq: 1, life: operator.life, forward: 0, strafe,
      yaw: 0, pitch: 0, sprint: false, fire: false, posture: 'dive' }));
    until(impact);
    assert.equal(operator.posture.current, 'DIVING');
    assert.ok(operator.y > 0);
    assert.ok(operator.posture.started > start);
    until(impact + activeTicks);
    assert.equal(hits.length, escape ? 0 : 1);
    assert.equal(operator.hp, before - (escape ? 0 : stats.meleeDamage));
  }
});

test('one operator can receive multiple simultaneous attacks from separate sectors', () => {
  const { field, horde, operator, hits, start, until, combat } = encounter();
  const flank = horde.spawn(0, -1.1, SCHABE_TYPE);
  horde.yaw[flank] = Math.PI;
  const duplicateLane = horde.spawn(0, 1.3, SCHABE_TYPE);
  for (const slot of [flank, duplicateLane]) horde.target[slot] = operator.slot;
  enemyCombatTick(field, start + 1);
  const attack = combat.get(horde, flank);
  assert.ok(attack);
  assert.equal(combat.get(horde, duplicateLane), undefined);
  assert.notEqual(attack.reservation, combat.get(horde, 0)!.reservation);
  until(attack.start + windupTicks);
  assert.equal(hits.length, 2);
  assert.equal(new Set(hits.map((event) => event.attack)).size, 2);
});

test('secondary targets keep their own range, cover and damage path', () => {
  const field = new Battlefield(74);
  const horde = field.horde;
  const slot = horde.spawn(0, 0, SCHABE_TYPE);
  const convict = { id: 'convict', x: 0, z: -1, hp: 60, damage(amount: number) { this.hp -= amount; } };
  const ship = { x: 0, z: -1, hp: 60, damage(amount: number) { this.hp -= amount; } };
  const phase = field.enemyCombat;
  const target = (tick: number) => tick < windupTicks ? convict : ship;
  for (let tick = 0; tick < cooldown + attackTicks; tick++) {
    phase.update(horde, field.players, tick, ENEMY_TYPES, field.movementBalance, undefined, () => target(tick));
  }
  assert.equal(convict.hp, 60);
  assert.equal(ship.hp, 60 - stats.meleeDamage);
  assert.equal(phase.totals.interruptions, 1);
  assert.equal(horde.attackAt[slot], cooldown * 2);
});

test('low cover that intersects the strike blocks Convict and Albatross impacts', () => {
  for (const id of ['convict', undefined]) {
    const field = new Battlefield(74);
    const slot = field.horde.spawn(0, 0, SCHABE_TYPE);
    const target = { ...(id && { id }), x: 0, z: -1, hp: 60, damage(amount: number) { this.hp -= amount; } };
    const update = (tick: number, obstacles: Obstacle[] = []) => field.enemyCombat.update(
      field.horde, field.players, tick, ENEMY_TYPES, field.movementBalance, { ...BODENBRUCH.world, obstacles }, () => target);
    const start = BALANCE.swarm.meleeAttack.decisionTicks;
    update(start);
    assert.equal(field.enemyCombat.sample(field.horde, slot, start, stats).phase, 'WINDUP');
    const cover: Obstacle[] = [{ kind: 'barrier', x: 0, z: -.5, halfX: 1, halfZ: .05, height: .85 }];
    const end = start + windupTicks + activeTicks - 1;
    for (let tick = start + 1; tick <= end; tick++) update(tick, cover);
    assert.equal(field.enemyCombat.sample(field.horde, slot, end, stats).result, 'cover');
    assert.equal(target.hp, 60);
  }
});

test('horde snapshots encode attack start in each phase and reject malformed extensions', () => {
  const { field, horde, slot, start, impact, until, combat } = encounter();
  const frame = new HordeFrame();
  const read = () => encodeHorde(horde, field.tick, undefined, combat);
  for (const tick of [field.tick, impact, impact + activeTicks]) {
    until(tick);
    const bytes = read();
    assert.ok(decodeHorde(bytes, frame));
    assert.deepEqual([frame.windupTicks, frame.activeTicks, frame.recoveryTicks], [windupTicks, activeTicks, recoveryTicks]);
    assert.equal(tick - frame.attackAge[frame.byId.get(horde.id[slot])!] + 1, start);
    for (const delta of [1, 2, 3]) assert.equal(decodeHorde(bytes.subarray(0, bytes.length - delta), frame), false);
    const invalid = bytes.slice();
    invalid[invalid.length - 4] = 250;
    assert.equal(decodeHorde(invalid, frame), false);
  }
  until(start + attackTicks);
  assert.ok(decodeHorde(read(), frame));
  assert.equal(frame.attackAge[0], 0);
});

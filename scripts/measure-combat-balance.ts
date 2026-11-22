import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  BALANCE, BALANCE_SOURCES, CAMERA_LIFT, CAMERA_SHOULDER, CARRIER_WORLD, LOOK_HEIGHT, MAX_PITCH, NET,
  SCHABE_TYPE, SOURCE_FILES, createBalanceRegistry, postureCollider, wrapAngle,
} from '@freefall/shared';
import type { BalanceRegistry, PlayerInput, PositionXZ, WeaponSlot } from '@freefall/shared';
import { Battlefield, seededRandom } from '../apps/server/src/simulation/Battlefield.ts';
import type { SimPlayer } from '../apps/server/src/simulation/Player.ts';

// These fixtures use the normal simulation and input path. Only the range suppresses pursuit.
const WORLD = { ...CARRIER_WORLD, id: 'fixture.combat-range', half: 110, obstacles: [] };
const TICK_HZ = NET.tickHz;
const SEEDS = Array.from({ length: 16 }, (_, i) => 7 + i * 19);
const WEAPONS = ['primary', 'secondary'] as const;
const POSTURES = ['STANDING', 'CROUCHING', 'PRONE', 'SUPINE'] as const;
type RangePosture = (typeof POSTURES)[number];
const IDLE = { forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };

class CombatField extends Battlefield {
  private readonly stationary: boolean;
  constructor(seed: number, registry: BalanceRegistry, stationary = true) {
    super(seed, WORLD, registry);
    this.stationary = stationary;
  }
  protected override get respawns(): boolean { return false; }
  protected override updateTargets(): void { if (!this.stationary) super.updateTargets(); }
}

function step(field: CombatField, controls: (operator: SimPlayer) => Partial<PlayerInput> = () => IDLE): void {
  for (const operator of field.players) if (operator) {
    assert.ok(field.receiveInput(operator.id, { ...IDLE, ...controls(operator), life: operator.life, seq: operator.lastInputSeq + 1 }));
  }
  field.step();
}

function player(field: CombatField, slot: WeaponSlot, posture: RangePosture = 'STANDING'): SimPlayer {
  const operator = field.addPlayer('operator-' + field.players.filter(Boolean).length);
  Object.assign(operator, { x: 0, y: 0, z: 0, protectedUntil: 0 });
  if (slot === 'secondary') {
    step(field, () => ({ equipment: slot }));
    for (let i = 0; i < operator.loadout.switchTicks; i++) step(field);
  }
  if (posture === 'CROUCHING') step(field, () => ({ posture: 'crouch' }));
  if (posture === 'PRONE' || posture === 'SUPINE') {
    step(field, () => ({ posture: 'dive', forward: posture === 'PRONE' ? 1 : -1 }));
    for (let i = 0; i < Math.ceil(field.movementBalance.diveSeconds * TICK_HZ); i++) step(field);
  }
  assert.equal(operator.equipment.slot, slot);
  assert.equal(operator.posture.current, posture);
  return operator;
}

function aimAt(field: CombatField, operator: SimPlayer, point: PositionXZ, height: number): Partial<PlayerInput> {
  const dx = point.x - operator.x, dz = point.z - operator.z;
  const distance = Math.hypot(dx, dz);
  const shoulder = Math.min(.98, CAMERA_SHOULDER / Math.max(.01, distance));
  const yaw = wrapAngle(Math.atan2(dx, -dz) - Math.asin(shoulder));
  const lookHeight = operator.posture.current === 'STANDING' ? LOOK_HEIGHT :
    postureCollider(operator.posture, field.tick, field.movementBalance).lookHeight;
  const pitch = Math.atan2(height - operator.y - lookHeight - CAMERA_LIFT, Math.sqrt(Math.max(.04, distance ** 2 - CAMERA_SHOULDER ** 2)));
  return { yaw, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch)), aim: true };
}

const rounded = (value: number) => Number(value.toFixed(3));
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
function distribution(values: number[]) {
  if (!values.length) return null;
  const ordered = values.toSorted((a, b) => a - b);
  const percentile = (fraction: number) => ordered[Math.ceil(ordered.length * fraction) - 1];
  return { count: values.length, mean: rounded(total(values) / values.length), p50: rounded(percentile(.5)), p95: rounded(percentile(.95)) };
}

function range(registry: BalanceRegistry, seed: number, slot: WeaponSlot, posture: RangePosture, metres: number,
  targets: number, style: 'held' | 'burst' | 'move') {
  const field = new CombatField(seed, registry);
  const operator = player(field, slot, posture);
  const point = { x: operator.x, z: operator.z - metres };
  const height = registry.enemiesByWireType[SCHABE_TYPE]!.gameplay.hitHeight;
  assert.ok(field.horde.spawn(point.x, point.z, SCHABE_TYPE) >= 0);
  const ttk: number[] = [], shotsPerResolvedTarget: number[] = [];
  let first = -1, targetShots = 0, maxPitchDegrees = 0;
  const limit = (targets === 1 ? 4 : 9) * TICK_HZ;
  for (let elapsed = 0; elapsed < limit && ttk.length < targets; elapsed++) {
    const aimed = aimAt(field, operator, point, height);
    const fire = style !== 'burst' || elapsed % 21 < 9;
    step(field, () => ({ ...aimed, fire, strafe: style === 'move' ? (elapsed % 30 < 15 ? .45 : -.45) : 0 }));
    maxPitchDegrees = Math.max(maxPitchDegrees, operator.recoil.pitch * 180 / Math.PI);
    const shot = field.shots[0];
    if (!shot) continue;
    if (first < 0) first = field.tick;
    targetShots++;
    if (!shot.eliminated) continue;
    ttk.push((field.tick - first) / TICK_HZ);
    shotsPerResolvedTarget.push(targetShots);
    first = -1;
    targetShots = 0;
    if (ttk.length < targets) assert.ok(field.horde.spawn(point.x, point.z, SCHABE_TYPE) >= 0);
  }
  return { shots: field.stats.data.shots[slot], hits: field.stats.data.hits[slot], kills: ttk.length, maxPitchDegrees,
    ttk, shotsPerResolvedTarget, damage: field.stats.data.damage[slot], reloads: field.stats.data.magazinesUsed[slot] };
}

function rangeBatch(registry: BalanceRegistry, slot: WeaponSlot, posture: RangePosture, metres: number, targets: number,
  style: 'held' | 'burst' | 'move' = 'held') {
  const runs = SEEDS.map((seed) => range(registry, seed, slot, posture, metres, targets, style));
  const shots = total(runs.map((run) => run.shots)), hits = total(runs.map((run) => run.hits)), kills = total(runs.map((run) => run.kills));
  return { slot, posture, metres, targets, style, trials: runs.length, shots, hits, misses: shots - hits, kills,
    hitRate: rounded(hits / Math.max(1, shots)), ammoPerKill: kills ? rounded(shots / kills) : null,
    ttkSeconds: distribution(runs.flatMap((run) => run.ttk)),
    shotsPerResolvedTarget: distribution(runs.flatMap((run) => run.shotsPerResolvedTarget)),
    sustainedDamagePerSecond: targets > 1 ? rounded(total(runs.map((run) => run.damage)) / (SEEDS.length * 9)) : undefined,
    maxPitchDegrees: rounded(Math.max(...runs.map((run) => run.maxPitchDegrees))), reloads: total(runs.map((run) => run.reloads)) };
}

function ammunition(registry: BalanceRegistry, slot: WeaponSlot, tactical: boolean) {
  const field = new CombatField(7, registry);
  const operator = player(field, slot);
  const startTick = field.tick;
  const initialRounds = operator.ammo + operator.equipment.magazines[slot] * operator.loadout.weapons[slot].magazineSize;
  const refill = { empty: 0, tactical: 0, discarded: 0 };
  for (let i = 0; i < 90 * TICK_HZ && (operator.ammo || operator.equipment.magazines[slot]); i++) {
    const reload = tactical && i === 45;
    step(field, () => ({ fire: !reload, reload }));
    for (const event of field.combatEvents) if (event.type === 'reload' && event.phase === 'MAGAZINE_INSERTION') {
      refill[event.discarded ? 'tactical' : 'empty']++;
      refill.discarded += event.discarded;
    }
  }
  const fired = field.stats.data.shots[slot];
  assert.equal(initialRounds, fired + refill.discarded);
  assert.equal(operator.ammo, 0);
  assert.equal(operator.equipment.magazines[slot], 0);
  return { slot, policy: tactical ? 'one-tactical-reload' : 'empty-only',
    initialRounds, fired, ...refill, depletionSeconds: rounded((field.tick - startTick) / TICK_HZ) };
}

function loadTest(registry: BalanceRegistry, seed: number, operators: number, count: number, weapon: WeaponSlot) {
  const field = new CombatField(seed, registry, false);
  const crew = Array.from({ length: operators }, () => field.addPlayer('operator-' + field.players.filter(Boolean).length));
  if (weapon === 'secondary') {
    step(field, () => ({ equipment: weapon }));
    for (let i = 0; i < field.loadout.switchTicks; i++) step(field);
  }
  assert.ok(crew.every((member) => member.equipment.slot === weapon));
  for (const member of crew) member.x = (member.slot - (operators - 1) / 2) * 6;
  for (const member of crew) Object.assign(member, { y: 0, z: 0, protectedUntil: 0 });
  const random = seededRandom(seed ^ 0x688b);
  const height = registry.enemiesByWireType[SCHABE_TYPE]!.gameplay.hitHeight;
  for (let i = 0; i < count; i++) {
    const lane = i % operators;
    const x = crew[lane].x + (random() - .5) * 5;
    const z = -12 - Math.floor(i / operators) * .65 - random() * 6;
    assert.ok(field.horde.spawn(x, z, SCHABE_TYPE) >= 0);
  }
  const startTick = field.tick;
  for (let i = 0; i < 18 * TICK_HZ && field.horde.count && crew.some(({ hp }) => hp > 0); i++) {
    step(field, (member) => {
      if (!member.hp) return IDLE;
      let nearest = Infinity, point: PositionXZ | undefined;
      const { horde } = field;
      for (let index = 0; index < horde.count; index++) {
        const slot = horde.active[index], x = horde.x[slot], z = horde.z[slot];
        const distance = (member.x - x) ** 2 + (member.z - z) ** 2;
        if (distance >= nearest) continue;
        nearest = distance;
        point = { x, z };
      }
      return point ? { ...aimAt(field, member, point, height), fire: true } : IDLE;
    });
  }
  const combat = field.stats.snapshot();
  return { seed, operators, weapon, initialEnemies: count, ticks: field.tick - startTick, killed: count - field.horde.count,
    shots: combat.shots[weapon], hits: combat.hits[weapon], ammoLeft: total(crew.map((member) =>
      member.ammo + member.equipment.magazines[weapon] * member.loadout.weapons[weapon].magazineSize)),
    alive: crew.filter(({ hp }) => hp > 0).length, damageTaken: total(crew.map(({ hp, loadout }) => loadout.maxHealth - hp)),
    friendlyFire: combat.friendlyFireDamage.bullet, reloads: combat.magazinesUsed[weapon],
    reloadsInterrupted: combat.reloadsInterrupted, attacks: field.enemyCombat.totals.operatorStarts };
}

function throwFrag(field: CombatField, thrower: SimPlayer) {
  step(field, (member) => member === thrower ? { equipment: 'grenade', pitch: -.64 } : IDLE);
  for (let i = 0; i < thrower.loadout.grenade.throwTicks + thrower.loadout.grenade.fuseTicks; i++) {
    step(field, (member) => member === thrower ? { pitch: -.64 } : IDLE);
    const blast = field.combatEvents.find((event) => event.type === 'blast');
    if (blast) return blast;
  }
  throw new Error('Fixture grenade did not detonate');
}

function equipment(registry: BalanceRegistry) {
  const field = new CombatField(7, registry);
  const operator = player(field, 'primary');
  const ally = player(field, 'primary');
  ally.z = -4;
  step(field, (member) => member === operator ? { ...aimAt(field, operator, ally, 1), fire: true } : IDLE);
  const bulletFriendlyFire = field.stats.data.friendlyFireDamage.bullet;
  assert.ok(bulletFriendlyFire);
  ally.x = 5;
  assert.ok(field.horde.spawn(0, -1.5, SCHABE_TYPE) >= 0);
  step(field, (member) => member === operator ? { equipment: 'melee' } : IDLE);
  for (let i = 0; i < operator.loadout.melee.actionTicks; i++) step(field);
  assert.equal(field.stats.data.meleeKills, 1);
  operator.hp = 49;
  step(field, (member) => member === operator ? { equipment: 'stim' } : IDLE);
  step(field, (member) => member === operator ? { fire: true } : IDLE);
  const interruptedCharges = operator.loadout.medical.maxCharges - operator.equipment.stims;
  assert.equal(interruptedCharges, 0);
  assert.equal(operator.hp, 49);
  step(field, (member) => member === operator ? { equipment: 'stim' } : IDLE);
  for (let i = 0; i < operator.loadout.medical.applicationTicks; i++) step(field);
  const healed = operator.hp - 49;
  assert.equal(healed, operator.loadout.medical.healAmount);
  const probe = new CombatField(7, registry);
  const blastPoint = throwFrag(probe, player(probe, 'primary'));
  Object.assign(ally, { x: 3, z: blastPoint.z });
  for (const x of [-11, -9, -7, -5, -2, 2, 5, 7, 9, 11]) assert.ok(field.horde.spawn(x, blastPoint.z, SCHABE_TYPE) >= 0);
  throwFrag(field, operator);
  return { bulletFriendlyFire, melee: { hits: field.stats.data.meleeHits, kills: field.stats.data.meleeKills },
    medical: { healed, used: operator.loadout.medical.maxCharges - operator.equipment.stims, interruptedCharges },
    frag: { enemies: 10, damage: field.stats.data.grenadeDamageEnemies, kills: field.stats.data.grenadeKills,
      operatorDamage: field.stats.data.friendlyFireDamage.explosion, selfDamage: field.stats.data.selfDamage } };
}

const { values: { snapshot, 'trial-recovery-delay': trialDelay } } = parseArgs({
  options: { snapshot: { type: 'string' }, 'trial-recovery-delay': { type: 'string' } },
});
const sources = snapshot ? Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, file]) => [key, JSON.parse(
  readFileSync(join(snapshot, file), 'utf8'))])) as typeof BALANCE_SOURCES : structuredClone(BALANCE_SOURCES);
if (trialDelay !== undefined) {
  const rifle = sources.weapons.weapons.find(({ id }) => id === 'kestrel-ar-01')!;
  rifle.recoil.recoveryDelaySeconds = Number(trialDelay);
}
const registry = snapshot || trialDelay !== undefined ? createBalanceRegistry(sources) : BALANCE;
const single = WEAPONS.flatMap((slot) => [
  ...[8, 18, 32, 44, 68, 74].map((metres) => rangeBatch(registry, slot, 'STANDING', metres, 1)),
  ...POSTURES.slice(1).map((posture) => rangeBatch(registry, slot, posture, 18, 1)),
  rangeBatch(registry, slot, 'STANDING', 18, 1, 'move'),
]);
const chains = WEAPONS.flatMap((slot) => [8, 18, 32].flatMap((metres) =>
  (['held', 'burst'] as const).map((style) => rangeBatch(registry, slot, 'STANDING', metres, 32, style))));
const pressure = WEAPONS.flatMap((weapon) => [1, 4].flatMap((operators) =>
  (weapon === 'primary' ? [12, 48, 128] : [12, 48]).flatMap((count) =>
    SEEDS.slice(0, 8).map((seed) => loadTest(registry, seed, operators, count, weapon)))));
console.log(JSON.stringify({
  revision: process.env.FREEFALL_SOURCE_REVISION, runtime: process.version,
  fixture: WORLD.id, tickHz: TICK_HZ, version: registry.version, seeds: SEEDS, single, chains, pressure, equipment: equipment(registry),
  ammunition: WEAPONS.flatMap((slot) => [false, true].map((tactical) => ammunition(registry, slot, tactical))),
}, null, 2));

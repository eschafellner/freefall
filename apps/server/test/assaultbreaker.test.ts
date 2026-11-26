import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASSAULT_BREAKER_TYPE, ATTACK_CHARGE, BALANCE, BODENBRUCH, BREACHER_TYPE, CARRIER_WORLD, ENEMY_TRAITS, HordeFrame, JAEGER_TYPE, SCHABE_TYPE,
  aimRay, decodeHorde, directionalArmorClass, modelToWorld, resolveMissionBalance, zoneRayHit,
} from '@freefall/shared';
import type { AimRay } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { EncounterDirector } from '../src/mission/EncounterDirector.ts';
import { encodeHorde } from '../src/networking/snapshots.ts';
import { Battlefield, seededRandom } from '../src/simulation/Battlefield.ts';
import { createPlayer } from '../src/simulation/Player.ts';
import { fireWeapon } from '../src/systems/combat.ts';

const open = { ...CARRIER_WORLD, obstacles: [] };
const zones = ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].zones!;
const zoneClass = (id: string) => zones.find((zone) => zone.id === id)!.armorClass;

test('the assault breaker is a very tough signature enemy: head and upper body class 5, legs class 4, belly class 2', () => {
  const archetype = BALANCE.enemy('swarm.assaultbreaker');
  assert.equal(archetype.displayName, 'Assaultbreaker');
  assert.equal(archetype.factionId, 'swarm');
  assert.ok(archetype.gameplay.health >= 5 * BALANCE.enemy('swarm.durchbruchskaefer').gameplay.health, 'very many hit points');
  for (const id of ['head', 'crest-left', 'crest-right', 'chest', 'back']) assert.equal(zoneClass(id), 5, id);
  for (const id of ['foreleg-left', 'foreleg-right', 'hindleg-left', 'hindleg-right']) assert.equal(zoneClass(id), 4, id);
  assert.equal(zoneClass('belly'), 2);
  assert.ok(ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].staggerImmune);
  assert.ok(ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].groundRadius > ENEMY_TRAITS[BREACHER_TYPE].groundRadius);
  // Without a ray (grenades, convicts, operator melee): class 5 from the front, class 4 elsewhere.
  const traits = ENEMY_TRAITS[ASSAULT_BREAKER_TYPE];
  assert.equal(directionalArmorClass(traits, archetype.armorClass, 0, 0, 0, 0, -5), 5);
  assert.equal(directionalArmorClass(traits, archetype.armorClass, 0, 0, 0, 5, 0), 4);
  assert.equal(directionalArmorClass(traits, archetype.armorClass, 0, 0, 0, 0, 5), 4);
});

test('head-on, every ray meets class 5 or the legs; the belly is only open from below the flanks', () => {
  const belly = zones.findIndex((zone) => zone.id === 'belly');
  let hits = 0, bellyHits = 0;
  for (let x = -2; x <= 2; x += .04) for (let y = .02; y <= 3.3; y += .04) {
    const hit = zoneRayHit(zones, 0, 0, 0, 0, { x, y, z: -12, dx: 0, dy: 0, dz: 1 }, 0, 100);
    if (!hit) continue;
    hits++;
    if (hit.index === belly) bellyHits++;
    else assert.ok(zones[hit.index].armorClass >= 4, `frontal ray at ${x.toFixed(2)}, ${y.toFixed(2)} hits ${zones[hit.index].id}`);
  }
  assert.ok(bellyHits / hits < .02, `belly share head-on ${bellyHits}/${hits}`);
  // From the side: the upper flank is class 5, the low underside between the legs is the belly.
  const side = (y: number, z = 0) => zones[zoneRayHit(zones, 0, 0, 0, 0, { x: -12, y, z, dx: 1, dy: 0, dz: 0 }, 0, 100)!.index].id;
  assert.equal(side(2.2), 'back');
  assert.equal(side(1.5), 'back');
  assert.equal(side(.85), 'belly');
  assert.equal(side(.85, .2), 'belly');
});

/** Camera aim of an operator at the origin through a model-space point of an assault breaker `distance` ahead. */
function aimAt(yaw: number, point: readonly number[], distance = 12) {
  const target = modelToWorld(yaw, 0, 0, -distance, point);
  const aim = { yaw: 0, pitch: 0 };
  const camera: AimRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };
  for (let k = 0; k < 20; k++) {
    aimRay(camera, { x: 0, z: 0 }, aim.yaw, aim.pitch);
    const dx = target.x - camera.x, dy = target.y - camera.y, dz = target.z - camera.z;
    aim.yaw = Math.atan2(dx, -dz);
    aim.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return aim;
}

/** Operator at the origin facing −Z, firing the rifle at a given aim. */
function rifleDamage(yaw: number, aim: { yaw: number; pitch: number }, distance = 12) {
  const horde = new HordeManager();
  const i = horde.spawn(0, -distance, ASSAULT_BREAKER_TYPE);
  horde.yaw[i] = yaw;
  const before = horde.hp[i];
  const p = createPlayer('shooter', 0, 0);
  Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, activeInput: true });
  p.equipment.slot = 'primary';
  p.ammo = p.loadout.weapons.primary.capacity;
  p.input = { seq: 1, yaw: aim.yaw, pitch: aim.pitch, fire: true, aim: true, forward: 0, strafe: 0, sprint: false };
  const ray: AimRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };
  const shot = fireWeapon(horde, p, ray, 1, open);
  return { damage: before - horde.hp[i], armored: (shot?.impact as { armored?: true } | undefined)?.armored };
}

test('the standard rifle glances off the armor but penetrates the belly in full', () => {
  const rifle = createPlayer('x', 0, 0).loadout.weapons.primary.projectile.penetration;
  assert.ok(rifle >= 2 && rifle < 4, 'rifle penetrates class 2 but not 4');
  const front = rifleDamage(Math.PI, aimAt(Math.PI, [0, 1.6, -2.4]));
  assert.equal(front.armored, true);
  // Side on (flank toward the shooter), aimed low under the body between the legs: the belly.
  const belly = rifleDamage(-Math.PI / 2, aimAt(-Math.PI / 2, [0, .85, .1]));
  const flank = rifleDamage(-Math.PI / 2, aimAt(-Math.PI / 2, [0, 1.9, 0]));
  const leg = rifleDamage(-Math.PI / 2, aimAt(-Math.PI / 2, [-1.3, .5, -1.25]));
  assert.equal(flank.armored, true);
  assert.equal(leg.armored, true);
  assert.equal(belly.armored, undefined, 'belly hit is not armored');
  assert.ok(front.damage > 0 && Math.abs(front.damage / belly.damage - BALANCE.armor.nonPenetratingDamageFraction) < 1e-4,
    `${front.damage} vs ${belly.damage}`);
});

/** A battlefield with operators standing at the given points, all facing −Z. */
function field(...points: [number, number][]) {
  const battlefield = new Battlefield(7);
  const players = points.map(([x, z], n) => {
    const player = battlefield.addPlayer('op' + n);
    Object.assign(player, { x, z, yaw: 0, protectedUntil: 0 });
    return player;
  });
  return { battlefield, players };
}

test('the assault breaker lowers its head, charges at the operator and tramples for 1.5 × its melee damage', () => {
  const { battlefield, players: [player] } = field([0, 0]);
  const slot = battlefield.horde.spawn(0, -12, ASSAULT_BREAKER_TYPE);
  const charge = ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].charge!;
  const hp = player.hp;
  let chargeTick = -1, hitTick = -1, startZ = 0;
  for (let tick = 0; tick < 150 && hitTick < 0; tick++) {
    battlefield.step();
    if (chargeTick < 0 && battlefield.enemyCombat.totals.charges) {
      chargeTick = battlefield.tick;
      startZ = battlefield.horde.z[slot];
      const frame = new HordeFrame();
      assert.ok(decodeHorde(encodeHorde(battlefield.horde, battlefield.tick, undefined, battlefield.enemyCombat), frame));
      assert.equal(frame.attackKind[0], ATTACK_CHARGE, 'the charge is replicated');
    }
    if (player.hp < hp) hitTick = battlefield.tick;
  }
  assert.ok(chargeTick > 0, 'the assault breaker charged');
  assert.ok(hitTick - chargeTick >= charge.windupTicks, 'the hit lands after the telegraphed windup');
  assert.equal(hp - player.hp, BALANCE.enemy('swarm.assaultbreaker').gameplay.meleeDamage * 1.5);
  const run = (battlefield.horde.z[slot] - startZ) / ((hitTick - chargeTick - charge.windupTicks) / 30);
  assert.ok(run > 10, 'it runs at charge speed ' + run.toFixed(1));
  assert.equal(battlefield.enemyCombat.totals.trampled, 1);
});

test('a sidestep after the windup dodges the charge; two operators in its path are both trampled', () => {
  const dodge = field([0, 0]);
  const charge = ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].charge!;
  dodge.battlefield.horde.spawn(0, -13, ASSAULT_BREAKER_TYPE);
  const [player] = dodge.players;
  const hp = player.hp;
  let started = -1;
  for (let tick = 0; tick < 120; tick++) {
    dodge.battlefield.step();
    if (started < 0 && dodge.battlefield.enemyCombat.totals.charges) started = dodge.battlefield.tick;
    // Jump 6 m to the side the moment the run begins: the steering cannot follow that fast.
    if (started > 0 && dodge.battlefield.tick === started + charge.windupTicks) player.x = 6;
    if (started > 0 && dodge.battlefield.tick > started + charge.windupTicks + charge.flightTicks) break;
  }
  assert.ok(started > 0);
  assert.equal(player.hp, hp, 'dodged');
  assert.equal(dodge.battlefield.enemyCombat.totals.trampled, 0);

  const line = field([0, 0], [.6, 2.5]);
  line.battlefield.horde.spawn(0, -12, ASSAULT_BREAKER_TYPE);
  for (let tick = 0; tick < 150 && line.battlefield.enemyCombat.totals.trampled < 2; tick++) line.battlefield.step();
  assert.equal(line.battlefield.enemyCombat.totals.trampled, 2, 'both operators in the path are hit');
});

test('close up, the assault breaker gores instead of charging', () => {
  const { battlefield, players: [player] } = field([0, 0]);
  battlefield.horde.spawn(0, -3.4, ASSAULT_BREAKER_TYPE);
  const hp = player.hp;
  for (let tick = 0; tick < 90 && player.hp === hp; tick++) battlefield.step();
  assert.equal(battlefield.enemyCombat.totals.charges, 0);
  assert.equal(hp - player.hp, BALANCE.enemy('swarm.assaultbreaker').gameplay.meleeDamage);
});

function compose(difficultyId: string, ticks: number, guards?: number, cap?: number) {
  const resolved = resolveMissionBalance(BALANCE, difficultyId);
  const balance = guards === undefined ? resolved : { ...resolved, castes: { ...resolved.castes, assaultBreakerNestGuards: guards,
    maxActiveAssaultBreakers: cap ?? resolved.castes.maxActiveAssaultBreakers } };
  const horde = new HordeManager();
  const director = new EncounterDirector(BODENBRUCH, horde, [], balance, seededRandom(3), seededRandom(4), () => {});
  director.deploy(1);
  let most = 0;
  for (let tick = 2; tick < ticks; tick++) {
    director.update(tick, 'ACTIVE_MISSION', false, [], [], [], 0, false);
    let live = 0;
    for (let i = 0; i < horde.count; i++) if (horde.type[horde.active[i]] === ASSAULT_BREAKER_TYPE) live++;
    most = Math.max(most, live);
  }
  return { castes: director.casteSpawns, balance, most };
}

test('assault breakers appear from level 4 (Schwer), rarely at first and more often on higher levels, within the live cap', () => {
  for (const difficulty of BALANCE.difficulties) {
    const castes = resolveMissionBalance(BALANCE, difficulty.id).castes;
    const off = difficulty.level < 4;
    assert.equal(castes.assaultBreakerNestGuards === 0 && castes.assaultBreakersPerReinforcement === 0 && castes.maxActiveAssaultBreakers === 0, off,
      difficulty.id);
  }
  const shares = BALANCE.difficulties.map((d) => d.assaultBreakersPerReinforcement + d.assaultBreakerNestGuards);
  assert.deepEqual([...shares].sort((a, b) => a - b), shares, 'the share rises with the level');
  const hard = BALANCE.difficulties.find((d) => d.level === 4)!;
  assert.ok(hard.assaultBreakerNestGuards <= .15 && hard.assaultBreakersPerReinforcement <= .1, 'rare on Schwer');
  for (const id of ['easy', 'normal', 'challenging']) assert.equal(compose(id, 600).castes.assaultBreakers, 0, id);
  // Guards owed by a nest spawn as assault breakers; beyond the live cap they wait in the nest.
  const guarded = compose('freefall', 1500, 2);
  assert.equal(guarded.castes.assaultBreakers, 2, 'nest guards spawn');
  const capped = compose('freefall', 1500, 3, 1);
  assert.equal(capped.most, 1, 'live cap');
  assert.equal(capped.castes.assaultBreakers, 1, 'no assault breaker beyond the cap');
  // The rolls use their own stream: hunters and breachers are composed exactly as before.
  const plain = compose('freefall', 1500, 0);
  assert.deepEqual({ hunters: plain.castes.hunters, breachers: plain.castes.breachers },
    { hunters: compose('freefall', 1500).castes.hunters, breachers: compose('freefall', 1500).castes.breachers });
});

test('existing castes are unchanged by the new caste', () => {
  assert.deepEqual([SCHABE_TYPE, JAEGER_TYPE, BREACHER_TYPE, ASSAULT_BREAKER_TYPE], [0, 1, 2, 3]);
  assert.equal(ENEMY_TRAITS[BREACHER_TYPE].charge, undefined);
  assert.equal(ENEMY_TRAITS[JAEGER_TYPE].charge, undefined);
});

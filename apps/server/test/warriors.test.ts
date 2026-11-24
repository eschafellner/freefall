import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATTACK_LEAP, BALANCE, aimRay, BODENBRUCH, BREACHER_TYPE, CARRIER_WORLD, ENEMY_TRAITS, HordeFrame, JAEGER_TYPE, SCHABE_TYPE, decodeHorde,
  directionalArmorClass, modelToWorld, resolveMissionBalance, zoneRayHit,
} from '@freefall/shared';
import type { AimRay } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { EncounterDirector } from '../src/mission/EncounterDirector.ts';
import { encodeHorde } from '../src/networking/snapshots.ts';
import { Battlefield, seededRandom } from '../src/simulation/Battlefield.ts';
import { createPlayer } from '../src/simulation/Player.ts';
import { fireWeapon } from '../src/systems/combat.ts';

const open = { ...CARRIER_WORLD, obstacles: [] };
const ray: AimRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };

/** Operator at the origin facing −Z, firing the given slot. */
function shooter(slot: 'primary' | 'secondary') {
  const p = createPlayer('shooter', 0, 0);
  Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, activeInput: true });
  p.equipment.slot = slot;
  p.ammo = p.loadout.weapons[slot].capacity;
  p.input = { seq: 1, yaw: 0, pitch: -.1, fire: true, aim: true, forward: 0, strafe: 0, sprint: false };
  return p;
}

function breacherDamage(yaw: number, slot: 'primary' | 'secondary', aim?: { yaw: number; pitch: number }) {
  const horde = new HordeManager();
  const i = horde.spawn(0, -9, BREACHER_TYPE);
  horde.yaw[i] = yaw;
  const before = horde.hp[i];
  const operator = shooter(slot);
  if (aim) Object.assign(operator.input, aim);
  const shot = fireWeapon(horde, operator, { ...ray }, 1, open);
  return { damage: before - horde.hp[i], impact: shot?.impact };
}

test('the breacher front is medium armor: low-penetration rounds glance off, flanks take full damage', () => {
  const breacher = BALANCE.enemy('swarm.durchbruchskaefer');
  assert.equal(breacher.displayName, 'Durchbruchskäfer');
  assert.deepEqual(breacher.hitZones!.filter((zone) => zone.armorClass === 3).map(({ id }) => id),
    ['head-shield', 'breast-plate', 'pronotum', 'forelimb-left', 'forelimb-right']);
  const pistol = shooter('secondary').loadout.weapons.secondary;
  assert.ok(pistol.projectile.penetration < 3, 'secondary weapon must not penetrate class 3 for this test');
  // Facing the shooter (yaw π faces +Z): the head shield takes the hit.
  const front = breacherDamage(Math.PI, 'secondary');
  // Turned sideways (left flank toward the shooter) or away: the unarmored body takes it.
  const side = breacherDamage(-Math.PI / 2, 'secondary');
  const rear = breacherDamage(0, 'secondary');
  assert.equal(rear.damage, side.damage);
  assert.ok(front.damage > 0 && side.damage > 0);
  assert.ok(Math.abs(front.damage / side.damage - BALANCE.armor.nonPenetratingDamageFraction) < 1e-6, `${front.damage} vs ${side.damage}`);
  assert.equal((front.impact as { armored?: true }).armored, true);
  assert.equal((side.impact as { armored?: true }).armored, undefined);
  // The current rifle round (penetration 3) still penetrates the front.
  const rifle = breacherDamage(Math.PI, 'primary');
  assert.ok(rifle.damage > front.damage * 5);
});

test('the glowing throat sac is a small frontal weak spot that weak rounds still damage in full', () => {
  const zones = ENEMY_TRAITS[BREACHER_TYPE].zones!;
  const weak = zones.findIndex((zone) => zone.id === 'weak-spot');
  assert.equal(zones[weak].armorClass, 1);
  // Head-on sweep across the silhouette: every ray meets an armored zone or the weak spot, which is a small target.
  let hits = 0, weakHits = 0;
  for (let x = -1.6; x <= 1.6; x += .02) for (let y = .02; y <= 2.1; y += .02) {
    const hit = zoneRayHit(zones, 0, 0, 0, 0, { x, y, z: -10, dx: 0, dy: 0, dz: 1 }, 0, 100);
    if (!hit) continue;
    hits++;
    if (hit.index === weak) weakHits++;
    else assert.equal(zones[hit.index].armorClass, 3, `frontal ray at ${x.toFixed(2)}, ${y.toFixed(2)} hits ${zones[hit.index].id}`);
  }
  assert.ok(weakHits > 0 && weakHits / hits < .03, `weak spot share ${weakHits}/${hits}`);
  // Aimed at the sac from an operator's eye height, up to about 50° off the breacher's axis, the sac takes the hit.
  for (const yaw of [0, .4, -.4, .9, -.9]) {
    const target = modelToWorld(yaw, 0, 0, 0, [0, zones[weak].from[1], zones[weak].from[2]]);
    const dx = target.x, dy = target.y - 1.5, dz = target.z + 9, length = Math.hypot(dx, dy, dz);
    const hit = zoneRayHit(zones, yaw, 0, 0, 0, { x: 0, y: 1.5, z: -9, dx: dx / length, dy: dy / length, dz: dz / length }, 0, 100);
    assert.equal(hit?.index, weak, 'yaw ' + yaw);
  }
  // The pistol (penetration below 3) glances off the shield but deals full damage to the sac.
  const shield = breacherDamage(Math.PI, 'secondary');
  // Aim the shoulder camera of the operator at the origin through the sac of a breacher 9 m ahead that faces it.
  const sacPoint = modelToWorld(Math.PI, 0, 0, -9, [0, zones[weak].from[1], zones[weak].from[2]]);
  const aim = { yaw: 0, pitch: 0 };
  const camera: AimRay = { ...ray };
  for (let k = 0; k < 20; k++) {
    aimRay(camera, { x: 0, z: 0 }, aim.yaw, aim.pitch);
    const dx = sacPoint.x - camera.x, dy = sacPoint.y - camera.y, dz = sacPoint.z - camera.z;
    aim.yaw = Math.atan2(dx, -dz);
    aim.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  const sac = breacherDamage(Math.PI, 'secondary', aim);
  const flank = breacherDamage(-Math.PI / 2, 'secondary');
  assert.equal((shield.impact as { armored?: true }).armored, true);
  assert.equal((sac.impact as { armored?: true }).armored, undefined);
  assert.equal(sac.damage, flank.damage);
  assert.ok(sac.damage > shield.damage * 5);
});

test('damage without a ray uses the frontal cone of the breacher; the hunter and Schabe have no front armor', () => {
  const traits = ENEMY_TRAITS[BREACHER_TYPE];
  // Facing −Z (yaw 0): an attacker at −Z is in front, one at +X is beside it.
  assert.equal(directionalArmorClass(traits, 1, 0, 0, 0, 0, -5), 3);
  assert.equal(directionalArmorClass(traits, 1, 0, 0, 0, 5, 0), 1);
  assert.equal(directionalArmorClass(traits, 1, 0, 0, 0, 0, 5), 1);
  assert.equal(directionalArmorClass(ENEMY_TRAITS[JAEGER_TYPE], 1, 0, 0, 0, 0, -5), 1);
  assert.equal(directionalArmorClass(ENEMY_TRAITS[SCHABE_TYPE], 1, 0, 0, 0, 0, -5), 1);
  assert.ok(traits.staggerImmune && traits.vehicleTargets === 'thrusters');
  assert.ok(ENEMY_TRAITS[BREACHER_TYPE].groundRadius > ENEMY_TRAITS[JAEGER_TYPE].groundRadius);
  assert.ok(ENEMY_TRAITS[JAEGER_TYPE].groundRadius > ENEMY_TRAITS[SCHABE_TYPE].groundRadius);
});

/** A battlefield with one operator standing at the origin facing −Z. */
function field() {
  const battlefield = new Battlefield(7);
  const player = battlefield.addPlayer('op');
  Object.assign(player, { x: 0, z: 0, yaw: 0, protectedUntil: 0 });
  return { battlefield, player };
}

test('a hunter behind the operator leaps, flies in an arc and strikes for 16 on landing', () => {
  const { battlefield, player } = field();
  const slot = battlefield.horde.spawn(0, 6.5, JAEGER_TYPE);
  const leap = ENEMY_TRAITS[JAEGER_TYPE].leap!;
  let highest = 0;
  let leapTick = -1;
  const hp = player.hp;
  for (let tick = 0; tick < 90 && player.hp === hp; tick++) {
    battlefield.step();
    if (leapTick < 0 && battlefield.enemyCombat.totals.leaps) {
      leapTick = battlefield.tick;
      const frame = new HordeFrame();
      assert.ok(decodeHorde(encodeHorde(battlefield.horde, battlefield.tick, undefined, battlefield.enemyCombat), frame));
      assert.equal(frame.attackKind[0], ATTACK_LEAP, 'the leap is replicated');
    }
    highest = Math.max(highest, battlefield.enemyCombat.elevation(battlefield.horde, slot, battlefield.tick));
  }
  assert.ok(leapTick > 0, 'the hunter leapt');
  assert.ok(highest > leap.arcHeight * .8, 'airborne arc ' + highest);
  assert.equal(hp - player.hp, 16);
  assert.ok(Math.hypot(battlefield.horde.x[slot], battlefield.horde.z[slot]) < 2.4, 'landed within reach');
});

test('a hunter in front of the operator circles to the flank before it attacks', () => {
  const { battlefield, player } = field();
  const slot = battlefield.horde.spawn(0, -14, JAEGER_TYPE);
  const side = ENEMY_TRAITS[JAEGER_TYPE].flank!.sideCos;
  let flanked = false;
  for (let tick = 0; tick < 150 && !battlefield.enemyCombat.totals.starts; tick++) {
    battlefield.step();
    const dx = battlefield.horde.x[slot] - player.x, dz = battlefield.horde.z[slot] - player.z;
    const bearing = (dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw)) / Math.hypot(dx, dz);
    if (bearing <= side) flanked = true;
  }
  assert.ok(battlefield.flanking.circling > 0, 'the hunter circled');
  assert.ok(flanked, 'it reached the side or rear before its first attack');
  assert.ok(battlefield.enemyCombat.totals.starts > 0, 'and then attacked');
});

test('a Schabe still charges straight in (no flanking, no leap)', () => {
  const { battlefield } = field();
  battlefield.horde.spawn(0, -10, SCHABE_TYPE);
  for (let tick = 0; tick < 120; tick++) battlefield.step();
  assert.equal(battlefield.flanking.circling, 0);
  assert.equal(battlefield.enemyCombat.totals.leaps, 0);
  assert.ok(battlefield.enemyCombat.totals.starts > 0);
});

function compose(difficultyId: string, ticks: number) {
  const balance = resolveMissionBalance(BALANCE, difficultyId);
  const horde = new HordeManager();
  const director = new EncounterDirector(BODENBRUCH, horde, [], balance, seededRandom(3), seededRandom(4), () => {});
  director.deploy(1);
  for (let tick = 2; tick < ticks; tick++) director.update(tick, 'ACTIVE_MISSION', false, [], [], [], 0, false);
  const types = [0, 0, 0];
  for (let i = 0; i < horde.count; i++) types[horde.type[horde.active[i]]]++;
  return { types, castes: director.casteSpawns, balance };
}

test('hunters join patrols from Normal and grow with difficulty; breachers guard nests sparingly', () => {
  const easy = compose('easy', 400);
  assert.equal(easy.types[JAEGER_TYPE] + easy.types[BREACHER_TYPE], 0, 'Leicht has Schaben only');
  const normal = resolveMissionBalance(BALANCE, 'normal').castes;
  assert.ok(normal.hunterPatrolShare > 0 && normal.breachersPerReinforcement > 0 && normal.breacherNestGuards > 0);
  const shares = BALANCE.difficulties.map((difficulty) => difficulty.hunterPatrolShare);
  assert.deepEqual([...shares].sort((a, b) => a - b), shares, 'the hunter share rises with the level');
  const hardest = compose('freefall', 1200);
  assert.ok(hardest.castes.hunters > 0 && hardest.types[JAEGER_TYPE] > 0, 'hunters patrol on FREEFALL');
  assert.ok(hardest.types[SCHABE_TYPE] > hardest.types[BREACHER_TYPE], 'breachers stay rare');
  assert.ok(hardest.castes.breachers > 0, 'nests field breacher guards');
});

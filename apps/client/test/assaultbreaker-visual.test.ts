import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { ASSAULT_BREAKER_TYPE, ATTACK_CHARGE, ATTACK_MELEE, ENEMY_TRAITS, HordeFrame, enemyAttackTiming } from '@freefall/shared';
import { ASSAULT_HEAD_PIVOT, ASSAULT_LEGS, assaultBreakerGeometry } from '../src/rendering/AssaultBreakerModel.ts';
import { ASSAULT_GAIT, ASSAULT_RIG_GLSL, assaultCycle, assaultGallop } from '../src/rendering/AssaultBreakerRig.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';
import { SwarmVisuals } from '../src/rendering/SwarmVisuals.ts';
import { ROLE } from '../src/rendering/WarriorKit.ts';
import { ASSAULT_BREAKER_VISUAL, WarriorVisualLOD } from '../src/rendering/WarriorVisualLOD.ts';
import type { PoseContext, WarriorPose } from '../src/rendering/WarriorVisualLOD.ts';
import type { ContactShadows } from '../src/rendering/ContactShadows.ts';

const triangles = (geometry: T.BufferGeometry) => geometry.getAttribute('position').count / 3;

test('the assault breaker is a giant: taller than the 2.3 m concept, within budget per tier, finite and symmetric', () => {
  // A signature giant: rarely more than a few at once, so the near tier may spend more on its pine-cone armor.
  const budgets = [26_000, 5_000, 1_000];
  for (const tier of [0, 1, 2] as const) {
    const geometry = assaultBreakerGeometry(tier);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    for (const name of ['limb', 'pivot', 'tissue', 'surface', 'color']) assert.ok(geometry.getAttribute(name), name);
    let left = 0, right = 0;
    for (let i = 0; i < position.count; i++) {
      assert.ok(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i) + normal.getX(i) + normal.getY(i) + normal.getZ(i)));
      if (position.getX(i) < -.01) left++;
      if (position.getX(i) > .01) right++;
    }
    assert.ok(Math.abs(left - right) <= position.count * .03, 'bilateral');
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    assert.ok(box.min.y >= -.05 && box.max.y <= 4.1, 'height ' + box.max.y);
    assert.ok(Math.max(-box.min.x, box.max.x) <= 2.4, 'width');
    assert.ok(box.min.z >= -3.9 && box.max.z <= 4.2, 'length');
    if (tier === 0) {
      assert.ok(box.max.y >= 3.3, 'crest well above the 2.3 m of the concept: ' + box.max.y.toFixed(2));
      assert.ok(box.max.z - box.min.z >= 6.5, 'horn tip to tail ' + (box.max.z - box.min.z).toFixed(2));
    }
    assert.ok(triangles(geometry) <= budgets[tier], `tier ${tier}: ${triangles(geometry)}`);
    geometry.dispose();
  }
});

test('legs, head, jaw and tail carry their rig roles; the head swings about the neck joint', () => {
  const geometry = assaultBreakerGeometry(0);
  const limb = geometry.getAttribute('limb'), pivot = geometry.getAttribute('pivot');
  const roles = new Set<number>();
  for (let i = 0; i < limb.count; i++) {
    const role = Math.round(limb.getX(i));
    roles.add(role);
    if (role === ROLE.leg) assert.ok(Math.abs(pivot.getX(i)) > .5, 'hips beside the body');
    if (role === ROLE.head) assert.deepEqual([pivot.getX(i), pivot.getY(i), pivot.getZ(i)].map((v) => +v.toFixed(3)), [...ASSAULT_HEAD_PIVOT]);
  }
  for (const role of [ROLE.leg, ROLE.head, ROLE.jaw, ROLE.tail]) assert.ok(roles.has(role), 'role ' + role);
  assert.ok(!roles.has(ROLE.arm), 'no forelimb role: the strike angle drives the head');
  geometry.dispose();
});

/** Distance from a point to a capsule zone. */
function zoneDistance(p: T.Vector3, zone: { from: readonly number[]; to: readonly number[]; radius: number }): number {
  const a = new T.Vector3(...zone.from), b = new T.Vector3(...zone.to);
  const ab = b.clone().sub(a);
  const t = ab.lengthSq() ? Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
  return p.distanceTo(a.addScaledVector(ab, t)) - zone.radius;
}

test('hit zones sit on the model: the body is covered, the belly zone is the soft underside', () => {
  const zones = ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].zones!;
  const geometry = assaultBreakerGeometry(0);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!.clone().expandByScalar(.05);
  for (const zone of zones) for (const point of [zone.from, zone.to]) assert.ok(box.containsPoint(new T.Vector3(...point)), zone.id);
  // Nearly all vertices of the body, legs and head (not horn tips, crest points and spikes) lie in or just outside a zone.
  const position = geometry.getAttribute('position');
  const p = new T.Vector3();
  let counted = 0, covered = 0;
  for (let i = 0; i < position.count; i += 3) {
    p.fromBufferAttribute(position, i);
    counted++;
    if (zones.some((zone) => zoneDistance(p, zone) < .45)) covered++;
  }
  assert.ok(covered / counted > .8, `coverage ${covered}/${counted}`);
  const belly = zones.find((zone) => zone.id === 'belly')!;
  assert.ok(belly.from[1] - belly.radius < 1 && belly.from[1] + belly.radius < 1.6, 'belly zone hangs under the body');
  geometry.dispose();
});

const context = (speed = 0): PoseContext => ({ speed, time: 3, seed: 1 });
const pose = (): WarriorPose => ({ lift: 0, pitch: 0, roll: 0, crouch: 0, tuck: 0, strike: 0, jaw: 0 });

test('the charge pose rears, lowers the horns, runs and tosses; the gore lowers and tosses the head', () => {
  const charge = enemyAttackTiming(ASSAULT_BREAKER_TYPE, ATTACK_CHARGE);
  const melee = enemyAttackTiming(ASSAULT_BREAKER_TYPE, ATTACK_MELEE);
  const at = (kind: number, elapsed: number, moving = 0, speed = 0) => {
    const out = pose();
    ASSAULT_BREAKER_VISUAL.pose(out, moving, 1, { kind, timing: kind === ATTACK_CHARGE ? charge : melee, elapsed }, context(speed));
    return out;
  };
  const rear = at(ATTACK_CHARGE, charge.windupTicks * .3);
  assert.ok(rear.strike > .2 && rear.pitch > 0 && rear.jaw > .5, 'rears and roars');
  const lowered = at(ATTACK_CHARGE, charge.windupTicks - 1);
  assert.ok(lowered.strike < -.3 && lowered.crouch > .3, 'horns levelled');
  const running = at(ATTACK_CHARGE, charge.windupTicks + charge.flightTicks / 2, 1, 15);
  assert.ok(running.strike < -.3, 'runs head down');
  assert.equal(running.gallop, 1, 'gallops at charge speed');
  const scraping = at(ATTACK_CHARGE, charge.windupTicks * .55);
  assert.ok(scraping.paw! > 0 && scraping.paw! < 1, 'scrapes the ground with a forefoot in the windup');
  assert.equal(at(ATTACK_CHARGE, 0).paw, 0);
  const skid = at(ATTACK_CHARGE, charge.windupTicks + charge.flightTicks + 1);
  assert.equal(skid.brace, 1, 'braces the forefeet as the run ends');
  assert.ok(at(ATTACK_CHARGE, charge.windupTicks + charge.flightTicks + charge.activeTicks + charge.recoveryTicks - .01).brace! < .01);
  const toss = at(ATTACK_CHARGE, charge.windupTicks + charge.flightTicks + charge.activeTicks - .1);
  assert.ok(toss.strike > .3, 'tosses at the end of the run');
  assert.ok(at(ATTACK_MELEE, melee.windupTicks - .5).strike < -.3, 'gore: head down');
  const hook = at(ATTACK_MELEE, melee.windupTicks + melee.activeTicks - .1);
  assert.ok(hook.strike > .3, 'gore: toss');
  assert.ok(hook.surge! > .3, 'gore: lunges forward');
  const walk = pose();
  ASSAULT_BREAKER_VISUAL.pose(walk, 1, 1, undefined, context(3.2));
  assert.ok(Math.abs(walk.strike) < .1 && Math.abs(walk.lift) < .1 && walk.gallop === 0, 'walk nods the head a little');
});

test('legs carry the bone coordinate (hip 0 … knee 1 … ankle 2 … sole 3) and the fore/hind flag of the leg IK', () => {
  for (const tier of [0, 1, 2] as const) {
    const geometry = assaultBreakerGeometry(tier);
    const limb = geometry.getAttribute('limb'), pivot = geometry.getAttribute('pivot'), position = geometry.getAttribute('position');
    let feet = 0, hips = 0;
    for (let i = 0; i < limb.count; i++) {
      if (Math.round(limb.getX(i)) !== ROLE.leg) continue;
      const bone = limb.getZ(i);
      assert.ok(bone >= 0 && bone <= 3, 'bone ' + bone);
      assert.equal(limb.getY(i), pivot.getZ(i) < 0 ? -1 : 1, 'fore legs -1, hind legs +1');
      if (position.getY(i) < .12) {
        feet++;
        assert.ok(bone > 1.9, 'soles and claws follow the foot: ' + bone.toFixed(2));
      }
      if (position.getY(i) > 1.7) {
        hips++;
        assert.ok(bone < .6, 'the top of the leg stays with the hip: ' + bone.toFixed(2));
      }
    }
    assert.ok(feet > 0 && hips > 0);
    geometry.dispose();
  }
});

test('the stance stroke fits the legs, so planted feet reach the ground through the whole stride', () => {
  for (const [hip, knee, ankle] of ASSAULT_LEGS) {
    const upper = Math.hypot(knee[1] - hip[1], knee[2] - hip[2]), lower = Math.hypot(ankle[1] - knee[1], ankle[2] - knee[2]);
    const reach = Math.sqrt((upper + lower) ** 2 - (hip[1] - ankle[1]) ** 2);
    assert.ok(reach > ASSAULT_GAIT.walkDuty * ASSAULT_GAIT.walkCycle / 2 + .05, 'walk stroke ' + reach.toFixed(2));
    assert.ok(reach > ASSAULT_GAIT.runDuty * ASSAULT_GAIT.runCycle / 2, 'gallop stroke ' + reach.toFixed(2));
  }
  assert.equal(assaultGallop(3.2), 0, 'walks at its normal speed');
  assert.equal(assaultGallop(ENEMY_TRAITS[ASSAULT_BREAKER_TYPE].charge!.step * 30), 1, 'gallops in the charge');
  assert.ok(assaultCycle(15) > assaultCycle(3.2), 'longer strides at speed');
});

test('the rig deforms in model space within the vertex attribute limit and casts animated shadows', () => {
  const declared = [...ASSAULT_RIG_GLSL.matchAll(/attribute\s+\w+\s+(\w+);/g)].map((match) => match[1]);
  assert.deepEqual(declared, ['limb', 'motion', 'action', 'body', 'gait']);
  // position, normal, color, surface, tissue, 5 rig attributes, instanceMatrix (4) and the fallen bodies' instance colour.
  assert.ok(3 + 2 + declared.length + 4 + 1 <= 16);
  const visual = new WarriorVisualLOD(new T.Scene(), ASSAULT_BREAKER_VISUAL);
  for (const mesh of (visual as unknown as { meshes: T.InstancedMesh[] }).meshes) {
    assert.equal(mesh.instanceColor, null, 'tinted in the shader');
    assert.ok(mesh.customDepthMaterial, 'shadow pass runs the rig');
    for (const name of ['motion', 'action', 'body', 'gait']) assert.ok(mesh.geometry.getAttribute(name), name);
  }
});

test('swarm visuals draw the assault breaker with its own renderer and replicate the charge kind', () => {
  const scene = new T.Scene();
  const swarm = new SwarmVisuals(scene);
  const frame = (tick: number) => {
    const f = new HordeFrame();
    f.tick = tick;
    f.count = 1;
    f.id[0] = 5; f.x[0] = 0; f.z[0] = -14; f.type[0] = ASSAULT_BREAKER_TYPE; f.byId.set(5, 0);
    f.attackAge[0] = 40 + tick - 10; f.attackKind[0] = ATTACK_CHARGE;
    return f;
  };
  const camera = new T.PerspectiveCamera(60, 1.6, .1, 200);
  camera.updateMatrixWorld();
  const shadows = { add() {} } as unknown as ContactShadows;
  swarm.draw(camera, frame(10), frame(11), .5, 1000, GRAPHICS_QUALITY.high, shadows);
  assert.deepEqual(swarm.warriors.map(({ visible }) => visible), [0, 0, 1]);
  assert.equal(swarm.hit(5, 1000, true)?.type, ASSAULT_BREAKER_TYPE);
  assert.ok(swarm.fallen[ASSAULT_BREAKER_TYPE]);
});

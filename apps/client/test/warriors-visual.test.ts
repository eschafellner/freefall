import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { BALANCE, BREACHER_TYPE, ENEMY_TRAITS, HordeFrame, JAEGER_TYPE, SCHABE_TYPE } from '@freefall/shared';
import { BREACHER_WEAK_SPOT, breacherGeometry } from '../src/rendering/BreacherModel.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';
import { jaegerGeometry } from '../src/rendering/JaegerModel.ts';
import { SwarmVisuals } from '../src/rendering/SwarmVisuals.ts';
import { ROLE } from '../src/rendering/WarriorKit.ts';
import { applyWarriorSurface } from '../src/rendering/WarriorSurface.ts';
import type { ContactShadows } from '../src/rendering/ContactShadows.ts';

const triangles = (geometry: T.BufferGeometry) => geometry.getAttribute('position').count / 3;
const castes = [
  { name: 'Jäger', type: JAEGER_TYPE, build: jaegerGeometry, budgets: [5_000, 1_100, 200], bounds: { x: 1.6, y: 2.0, front: -1.8, back: 1.7 } },
  { name: 'Durchbruchskäfer', type: BREACHER_TYPE, build: breacherGeometry, budgets: [6_000, 1_400, 280], bounds: { x: 1.6, y: 2.1, front: -2.0, back: 1.75 } },
] as const;

test('warrior tiers stay finite, symmetric, inside their full-size footprint and within budget', () => {
  for (const caste of castes) for (const tier of [0, 1, 2] as const) {
    const geometry = caste.build(tier);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    for (const name of ['limb', 'pivot', 'tissue', 'surface', 'color']) assert.ok(geometry.getAttribute(name), caste.name + ' ' + name);
    let left = 0, right = 0;
    for (let i = 0; i < position.count; i++) {
      assert.ok(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i) + normal.getX(i) + normal.getY(i) + normal.getZ(i)));
      if (position.getX(i) < -.01) left++;
      if (position.getX(i) > .01) right++;
    }
    assert.ok(Math.abs(left - right) <= position.count * .03, caste.name + ' bilateral');
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    assert.ok(box.min.y >= 0 && box.max.y <= caste.bounds.y, caste.name + ' height ' + box.max.y);
    assert.ok(Math.max(-box.min.x, box.max.x) <= caste.bounds.x, caste.name + ' width');
    assert.ok(box.min.z >= caste.bounds.front && box.max.z <= caste.bounds.back, caste.name + ' length');
    // Full concept size: 2.6–3.2 m long and 1.3–1.6 m tall at the crest.
    if (tier === 0) assert.ok(box.max.z - box.min.z >= 2.6 && box.max.y >= 1.3, caste.name + ' full size');
    assert.ok(triangles(geometry) <= caste.budgets[tier], `${caste.name} tier ${tier}: ${triangles(geometry)}`);
    geometry.dispose();
  }
});

test('legs, forelimbs and jaws carry their rig roles; limbs swing about joints beside the body', () => {
  for (const caste of castes) {
    const geometry = caste.build(0);
    const limb = geometry.getAttribute('limb'), pivot = geometry.getAttribute('pivot');
    const roles = new Set<number>();
    for (let i = 0; i < limb.count; i++) {
      const role = Math.round(limb.getX(i));
      roles.add(role);
      if (role === ROLE.leg || role === ROLE.arm) {
        assert.ok(Math.abs(pivot.getX(i)) > .15, 'limb joints sit beside the centre line');
        assert.ok(limb.getZ(i) >= 0 && limb.getZ(i) <= 1);
      }
    }
    for (const role of [ROLE.leg, ROLE.arm, ROLE.jaw]) assert.ok(roles.has(role), `${caste.name} role ${role}`);
    geometry.dispose();
  }
});

/** Distance from a point to a capsule zone. */
function zoneDistance(p: T.Vector3, zone: { from: readonly number[]; to: readonly number[]; radius: number }): number {
  const a = new T.Vector3(...zone.from), b = new T.Vector3(...zone.to);
  const ab = b.clone().sub(a);
  const t = ab.lengthSq() ? Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
  return p.distanceTo(a.addScaledVector(ab, t)) - zone.radius;
}

test('hit zones match the models: the breacher front is covered by its armored zones and the small weak spot', () => {
  for (const caste of castes) {
    const zones = ENEMY_TRAITS[caste.type].zones!;
    const geometry = caste.build(0);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!.clone().expandByScalar(.05);
    for (const zone of zones) for (const point of [zone.from, zone.to]) {
      assert.ok(box.containsPoint(new T.Vector3(...point)), `${caste.name} zone ${zone.id} inside the model`);
    }
    geometry.dispose();
  }
  // The glowing throat sac is the unarmored weak-spot zone.
  const weak = ENEMY_TRAITS[BREACHER_TYPE].zones!.find((zone) => zone.id === 'weak-spot')!;
  assert.equal(weak.armorClass, 1);
  assert.deepEqual([(weak.from[0] + weak.to[0]) / 2, weak.from[1], weak.from[2]], [...BREACHER_WEAK_SPOT.center]);
  assert.equal(weak.to[0] - weak.from[0], BREACHER_WEAK_SPOT.halfWidth * 2);
  assert.equal(weak.radius, BREACHER_WEAK_SPOT.radius);
  // Every vertex of the breacher's head and digging arms in front of the body lies in (or just outside) an armored zone
  // or the weak spot.
  const armored = [...ENEMY_TRAITS[BREACHER_TYPE].zones!.filter((zone) => zone.armorClass === 3), weak];
  assert.equal(BALANCE.enemy('swarm.durchbruchskaefer').frontArmor?.armorClass, 3);
  const geometry = breacherGeometry(0);
  const position = geometry.getAttribute('position');
  const p = new T.Vector3();
  let front = 0, covered = 0;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    if (p.z > -1.15 || p.y < .3) continue;
    front++;
    if (armored.some((zone) => zoneDistance(p, zone) < .3)) covered++;
  }
  assert.ok(front > 100 && covered / front > .9, `front coverage ${covered}/${front}`);
});

test('the warrior surface extends the standard shader with plates, sinew and pulsing veins', () => {
  const shader = {
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.physical.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSurface;'),
  };
  applyWarriorSurface(shader);
  assert.match(shader.vertexShader, /vWarriorLocal = position;/);
  for (const marker of ['warriorPits', 'warriorVeins', 'vWarriorPulse', 'schabeBump(-vViewPosition']) assert.ok(shader.fragmentShader.includes(marker), marker);
  assert.ok(shader.fragmentShader.indexOf('warriorVeins * (') < shader.fragmentShader.indexOf('#include <opaque_fragment>'));
});

test('swarm visuals draw each wire type with its own renderer and keep the type of fallen bodies', () => {
  const scene = new T.Scene();
  const swarm = new SwarmVisuals(scene);
  const frame = (tick: number) => {
    const f = new HordeFrame();
    f.tick = tick;
    f.count = 3;
    [SCHABE_TYPE, JAEGER_TYPE, BREACHER_TYPE].forEach((type, i) => {
      f.id[i] = i + 1; f.x[i] = (i - 1) * 4; f.z[i] = -10; f.type[i] = type; f.byId.set(i + 1, i);
    });
    return f;
  };
  const camera = new T.PerspectiveCamera(60, 1.6, .1, 200);
  camera.updateMatrixWorld();
  const shadows = { add() {} } as unknown as ContactShadows;
  swarm.draw(camera, frame(10), frame(11), .5, 1000, GRAPHICS_QUALITY.high, shadows);
  assert.equal(swarm.schabe.visible, 1);
  assert.deepEqual(swarm.warriors.map(({ visible }) => visible), [1, 1, 0]);
  assert.equal(swarm.visible, 3);
  assert.equal(swarm.fallen.length, 4);
  assert.equal(swarm.hit(2, 1000, true)?.type, JAEGER_TYPE);
  assert.equal(swarm.hit(3, 1000, true)?.type, BREACHER_TYPE);
  swarm.draw(camera, frame(11), frame(12), .5, 1100, GRAPHICS_QUALITY.high, shadows);
  assert.equal(swarm.visible, 1, 'killed warriors are hidden until the despawn arrives');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { WORLD_PROFILES, generateWorld, restoreWorld } from '@freefall/shared';
import { createLighting } from '../src/rendering/environment/Lighting.ts';

const referenceWorlds = [
  ['green-plains', 17, '202ac8cea6fc721f'],
  ['desert', 31, 'c9488da7f6db9eb9'],
  ['ice', 48, '4c70c5cf4d66f37a'],
  ['forest', 63, 'e10ac2f3d47c20ef'],
] as const;

test('every generated planet has a distinct, readable atmosphere and retains its v2 world identity', () => {
  assert.equal(WORLD_PROFILES.size, referenceWorlds.length);
  const ids = new Set<string>();
  for (const [id, seed, hash] of referenceWorlds) {
    const { atmosphere } = WORLD_PROFILES.get(id)!;
    const { exposure, sun, fill, environmentIntensity, fog, shadow, sky } = atmosphere;
    assert.match(atmosphere.id, new RegExp(`^${id}\\.[a-z-]+\\.v[1-9]\\d*$`));
    ids.add(atmosphere.id);
    assert.ok(exposure >= .85 && exposure <= 1.15);
    assert.ok(sun.offset.every(Number.isFinite) && sun.offset[1] > 0 && sun.intensity > 0);
    assert.ok(fill.intensity >= 1 && environmentIntensity > 0 && environmentIntensity < 1);
    assert.ok(shadow.extent >= 70 && shadow.extent <= 90 && shadow.radius > 0);
    // At 75 m at least 84% of the unfogged pixel contrast remains.
    assert.ok(fog.density > 0 && Math.exp(-((75 * fog.density) ** 2)) >= .84);
    assert.ok(sky.cloudThreshold > .09 && sky.cloudThreshold < .90);
    assert.ok(sky.cloudScale > 0 && sky.hazeHeight > 0 && sky.hazeHeight < 1 && sky.sunGlow >= 0);
    for (const color of [sun.color, fill.sky, fill.ground, fog.color, sky.zenith, sky.clouds, sky.cloudShadow, sky.belowHorizon]) {
      assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
    }

    const { identity } = generateWorld(id, seed)!;
    assert.equal(identity.id, 'world.generated.' + hash);
    const restored = restoreWorld(JSON.parse(JSON.stringify(identity)))!;
    assert.equal(WORLD_PROFILES.get(restored.identity.planetId)?.atmosphere.id, atmosphere.id);
  }
  assert.equal(ids.size, referenceWorlds.length);
});

test('surface, carrier and arena reuse one light rig and replace the active sky without leaking textures', () => {
  const scene = new T.Scene();
  const lighting = createLighting(scene, true);
  const arena = scene.background as T.DataTexture;
  const fog = scene.fog as T.FogExp2;
  const ice = WORLD_PROFILES.get('ice')!.atmosphere;
  const forest = WORLD_PROFILES.get('forest')!.atmosphere;
  let disposed = 0;
  arena.addEventListener('dispose', () => disposed++);
  assert.equal(lighting.update('surface', false, 51, -29, ice), true);
  const iceSky = scene.background as T.DataTexture;
  iceSky.addEventListener('dispose', () => disposed++);
  assert.notEqual(iceSky, arena);
  assert.equal(scene.environment, iceSky);
  assert.equal(iceSky.type, T.HalfFloatType);
  assert.equal(fog.density, ice.fog.density);
  assert.equal(lighting.exposure, ice.exposure);
  assert.equal(lighting.sun.color.getHex(), ice.sun.color);
  assert.equal(lighting.sun.shadow.radius, ice.shadow.radius);
  assert.deepEqual(lighting.sun.target.position.toArray(), [48, 0, -24]);
  assert.deepEqual(lighting.sun.position.clone().sub(lighting.sun.target.position).toArray(), [...ice.sun.offset]);
  assert.equal(lighting.update('surface', false, 48, -31, ice), false);
  assert.equal(scene.background, iceSky);

  const directFog = fog.color.clone();
  assert.equal(lighting.update('surface', true, 48, -31, ice), true);
  assert.notDeepEqual(fog.color, directFog);
  assert.equal(fog.color.getHex(), ice.fog.color);
  assert.equal(scene.background, iceSky);

  lighting.update('carrier', false, 45, 0, ice);
  assert.ok(scene.background instanceof T.Color);
  const carrier = scene.background;
  scene.background = new T.Color(0x442523);
  assert.equal(lighting.update('carrier', false, 45, 0, ice), false);
  assert.equal(scene.background, carrier);
  assert.equal(scene.environment, arena);
  assert.equal(lighting.exposure, 1);
  assert.deepEqual(lighting.sun.target.position.toArray(), [0, 0, 0]);
  lighting.update('surface', false, 0, 0, ice);
  assert.equal(scene.background, iceSky);
  assert.equal(disposed, 0);
  lighting.update('surface', false, 0, 0, forest);
  const forestSky = scene.background as T.DataTexture;
  forestSky.addEventListener('dispose', () => disposed++);
  assert.equal(disposed, 1);
  assert.ok(forestSky.image.data instanceof Uint16Array && iceSky.image.data instanceof Uint16Array);
  assert.notDeepEqual(forestSky.image.data.slice(4096, 4136), iceSky.image.data.slice(4096, 4136));

  lighting.update('arena', false, 0, 0);
  assert.equal(scene.background, arena);
  assert.equal(fog.density, .0068);
  assert.equal(scene.children.filter((child) => child instanceof T.Light).length, 2);
  lighting.dispose();
  assert.equal(disposed, 3);
  assert.equal(scene.background, null);
  assert.equal(scene.environment, null);
  assert.equal(scene.children.length, 0);
});

test('LDR keeps the planetary sky and fixed surfaces can render without an atmosphere profile', () => {
  const scene = new T.Scene();
  const lighting = createLighting(scene, false);
  const arena = scene.background;
  try {
    lighting.update('surface', false, 62, 80, WORLD_PROFILES.get('desert')!.atmosphere);
    assert.ok(scene.background instanceof T.DataTexture);
    assert.equal(scene.background.type, T.UnsignedByteType);
    assert.equal(scene.background.colorSpace, T.LinearSRGBColorSpace);
    assert.equal(scene.environment, null);
    assert.notEqual(scene.background, arena);

    lighting.update('surface', false, 62, 80);
    assert.equal(scene.background, arena);
    assert.equal((scene.fog as T.FogExp2).density, .0041);
    assert.equal(lighting.exposure, 1);
    assert.deepEqual(lighting.sun.target.position.toArray(), [0, 0, 0]);
  } finally {
    lighting.dispose();
  }
});

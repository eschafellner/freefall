import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { WORLD_PROFILES, generateWorld, groundHeight } from '@freefall/shared';
import { MissionAtmosphere } from '../../server/src/mission/MissionAtmosphere.ts';
import { AtmosphereController, TIME_OF_DAY_LIGHT } from '../src/rendering/environment/AtmosphereController.ts';
import { createLighting, sunOffset } from '../src/rendering/environment/Lighting.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';

const warmth = (hex: number) => { const c = new T.Color(hex); return c.r - c.b; };
const luminance = (c: T.Color) => .2126 * c.r + .7152 * c.g + .0722 * c.b;

test('dawn and dusk light the world from opposite sides with a low, warm sun', () => {
  const { dawn, dusk, day, 'overcast-day': overcast } = TIME_OF_DAY_LIGHT;
  const turn = Math.abs(dusk.azimuth - dawn.azimuth);
  assert.ok(Math.abs(turn - Math.PI) < .05, 'opposite azimuths');
  for (const low of [dawn, dusk]) {
    assert.ok(low.elevation < .4);
    assert.ok(warmth(low.sunColor) > .25, 'warm sun');
    assert.ok(low.glow > 0 && low.zenith > 0, 'coloured sky');
    assert.ok(warmth(low.fillSky) < 0, 'cool fill against the warm key');
  }
  assert.ok(warmth(dusk.sunColor) > warmth(dawn.sunColor), 'dusk is the warmer of the two');
  assert.ok(dusk.elevation < dawn.elevation);
  assert.ok(overcast.sun < day.sun && overcast.fill > day.fill && overcast.glow === 0, 'overcast: soft, diffuse light');
});

test('sunOffset keeps the horizontal distance and scales only the height', () => {
  const profile = WORLD_PROFILES.get('desert')!.atmosphere;
  const [x, y, z] = profile.sun.offset;
  const out = sunOffset(profile, .5, Math.PI / 2, new T.Vector3());
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - Math.hypot(x, z)) < 1e-9);
  assert.equal(out.y, y * .5);
  assert.ok(Math.abs(out.x + z) < 1e-9 && Math.abs(out.z - x) < 1e-9);
});

test('time-of-day light reaches the rig and keeps a readable fill on every planet', () => {
  const scene = new T.Scene();
  const rig = createLighting(scene, false);
  const controller = new AtmosphereController(scene);
  const camera = new T.PerspectiveCamera();
  const fill = scene.children.find((child): child is T.HemisphereLight => child instanceof T.HemisphereLight)!;
  for (const { id, atmosphere } of WORLD_PROFILES.values()) {
    const { identity, world } = generateWorld(id, 63)!;
    camera.position.set(0, groundHeight(world, 0, 0) + 1.2, 0);
    camera.updateMatrixWorld();
    const sides: T.Vector3[] = [];
    for (const preset of ['day', 'dawn', 'dusk'] as const) {
      const state = new MissionAtmosphere(id + preset, identity, 11, 0, preset).state;
      const frame = controller.update(state, world, atmosphere, 10, 1 / 60, camera, GRAPHICS_QUALITY.medium, false, 1, true, false)!;
      rig.update('surface', false, 0, 0, atmosphere, frame);
      assert.ok(fill.intensity >= atmosphere.fill.intensity * .75, `${id} ${preset} fill intensity`);
      assert.ok(luminance(fill.color) > .3, `${id} ${preset} fill colour`);
      assert.ok(scene.environmentIntensity >= atmosphere.environmentIntensity * .7, `${id} ${preset} environment`);
      sides.push(rig.sun.position.clone().setY(0).normalize());
      if (preset !== 'day') assert.ok(rig.sun.color.r - rig.sun.color.b > .15, `${id} ${preset} warm sun`);
    }
    assert.ok(sides[1].dot(sides[2]) < -.95, `${id}: dawn and dusk sun on opposite sides`);
  }
  controller.clear();
  rig.dispose();
});

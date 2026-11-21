import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { NET, WORLD_PROFILES, generateWorld, groundHeight } from '@freefall/shared';
import { MissionAtmosphere } from '../../server/src/mission/MissionAtmosphere.ts';
import { AtmosphereController } from '../src/rendering/environment/AtmosphereController.ts';
import { WeatherParticles } from '../src/rendering/environment/WeatherParticles.ts';
import { createLighting } from '../src/rendering/environment/Lighting.ts';
import { applyVegetationWind, VegetationWind } from '../src/rendering/environment/VegetationWind.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';

test('weather draws through the existing scene and releases its batch at mission change', () => {
  const { identity, world } = generateWorld('ice', 48)!;
  const weather = new MissionAtmosphere('active', identity, 0, 0, 'dusk');
  assert.ok(weather.debug(0, 'weather:windy-snow'));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera();
  const settings = WORLD_PROFILES.get('ice')!.atmosphere;
  camera.position.y = groundHeight(world, 0, 0) + 1;
  camera.updateMatrixWorld();
  const lighting = createLighting(scene, true);
  const controller = new AtmosphereController(scene);
  const draw = (tick: number, quality = 'high' as keyof typeof GRAPHICS_QUALITY, reduced = false) =>
    controller.update(weather.state, world, settings, tick, 1 / 60, camera, GRAPHICS_QUALITY[quality], reduced, 1, true, false);
  const start = draw(0)!;
  const startFog = start.fogDensity;
  const during = draw(NET.tickHz)!;
  assert.equal(controller.metrics()?.progress, .5);
  assert.ok(during.fogDensity >= startFog);
  lighting.update('surface', false, 0, 0, settings, during);
  assert.ok(lighting.exposure < settings.exposure && lighting.exposure >= .85);
  assert.ok(scene.children.some((child) => child.name === 'Planet sky blend' && child.visible));
  weather.update(2 * NET.tickHz);
  const count = (quality: keyof typeof GRAPHICS_QUALITY, reduced = false) => {
    draw(NET.tickHz * 2, quality, reduced);
    return controller.metrics()!.particles;
  };
  assert.equal(count('low'), 64);
  assert.equal(count('medium'), 176);
  assert.equal(count('high'), 320);
  assert.equal(count('high', true), 0);
  const particles = scene.getObjectByName('Local weather') as WeatherParticles['points'];
  let disposals = 0;
  particles.geometry.addEventListener('dispose', () => disposals++);
  particles.material.addEventListener('dispose', () => disposals++);
  draw(62);
  assert.equal(scene.getObjectByName('Local weather'), particles);
  const lastFog = draw(63)!.fogDensity;
  assert.equal(controller.finish('active')?.fogDensity, lastFog);
  assert.equal(controller.finish('active')?.fogDensity, lastFog);
  assert.equal(controller.finish('wrong-instance'), undefined);
  assert.equal(controller.metrics(), undefined);
  assert.deepEqual(controller.wind.flow.value.toArray(), [0, 0, 0, 0]);
  assert.equal(disposals, 2);
  assert.equal(scene.getObjectByName('Local weather'), undefined);
  controller.update(undefined, world, settings, 63, 1 / 60, camera, GRAPHICS_QUALITY.high, false, 1, true, false);
  assert.equal(disposals, 2);
  assert.equal(scene.getObjectByName('Local weather'), undefined);
  const restart = { ...weather.state, instanceId: 'next' };
  controller.update(restart, world, settings, 64, 1 / 60, camera, GRAPHICS_QUALITY.high, false, 1, true, false);
  assert.notEqual(scene.getObjectByName('Local weather'), particles);
  controller.clear();
  lighting.dispose();
  assert.equal(scene.children.length, 0);
});

test('vegetation uses shared uniforms with stable instanced variants and preserves existing shader hooks', () => {
  const wind = new VegetationWind();
  const material = new T.MeshStandardMaterial();
  material.onBeforeCompile = (shader) => { shader.uniforms.range = { value: 23 }; };
  for (const shape of ['ground', 'crown', 'crown-far'] as const) {
    const target = material.clone();
    target.onBeforeCompile = material.onBeforeCompile;
    applyVegetationWind(target, wind, shape);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>' } as Parameters<typeof target.onBeforeCompile>[0];
    target.onBeforeCompile(shader, {} as T.WebGLRenderer);
    assert.equal(shader.uniforms.ffWind, wind.flow);
    assert.equal(shader.uniforms.range.value, 23);
    assert.match(shader.vertexShader, /USE_INSTANCING/);
    assert.match(shader.vertexShader, /heightWeight \* heightWeight/);
    const stableKey = target.customProgramCacheKey();
    wind.flow.value.set(.65, .2, 12, .1);
    assert.equal(target.customProgramCacheKey(), stableKey);
    assert.ok(wind.flow.value.toArray().every(Number.isFinite));
    target.dispose();
  }
  material.dispose();
});

test('all time presets stay within readable light and fog bounds on all four planets', () => {
  const scene = new T.Scene();
  const rig = createLighting(scene, false);
  const controller = new AtmosphereController(scene);
  const camera = new T.PerspectiveCamera();
  for (const { id, atmosphere } of WORLD_PROFILES.values()) {
    const { identity, world } = generateWorld(id, 63)!;
    camera.position.set(0, groundHeight(world, 0, 0) + 1.2, 0);
    camera.updateMatrixWorld();
    for (const preset of ['day', 'overcast-day', 'dawn', 'dusk'] as const) {
      const state = new MissionAtmosphere(id + preset, identity, 11, 0, preset).state;
      const frame = controller.update(state, world, atmosphere, 10, 1 / 60, camera, GRAPHICS_QUALITY.medium, false, 1, true, false);
      assert.ok(frame);
      rig.update('surface', false, 0, 0, atmosphere, frame);
      assert.ok(rig.exposure > .84 && rig.exposure < 1.10);
      assert.ok(rig.sun.intensity >= .58);
      assert.ok((scene.fog as T.FogExp2).density <= .0081);
      assert.ok(rig.sun.position.y > 15);
    }
  }
  controller.clear();
  rig.dispose();
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { FOREST_ID, WORLD_PROFILES } from '@freefall/shared';
import { ROCK_CONTACT_HEIGHT, applyRockSurface } from '../src/rendering/environment/PlanetMaterials.ts';
import { rockDeposit } from '../src/rendering/mission/GeneratedTerrain.ts';

test('rock surface hooks every shader chunk it replaces in the installed three.js', () => {
  const material = new T.MeshStandardMaterial({ map: new T.Texture(), normalMap: new T.Texture() });
  const controls = { dusting: { value: 1 } };
  applyRockSurface(material, { ground: 0x626d3e, dust: 0x4f5a2c, coverage: .4, metres: 1.6 }, controls);
  const shader = {
    uniforms: T.UniformsUtils.clone(T.ShaderLib.standard.uniforms),
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.physical.fragmentShader,
  } as unknown as T.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as T.WebGLRenderer);
  for (const chunk of ['map_fragment', 'normal_fragment_maps']) assert.ok(!shader.fragmentShader.includes(`#include <${chunk}>`), chunk);
  assert.match(shader.vertexShader, /attribute float rockGround;/);
  assert.match(shader.vertexShader, /vRockRise = rockWorld\.y - rockGround;/);
  assert.match(shader.fragmentShader, /rockDeposit/);
  assert.equal((shader.uniforms.rockContact as { value: number }).value, ROCK_CONTACT_HEIGHT);
  // The quality toggle is shared by reference, so configure() reaches compiled programs.
  assert.equal(shader.uniforms.rockDusting, controls.dusting);
  assert.equal(material.customProgramCacheKey(), 'planet-rock-surface-v1');
});

test('every planet gets a rock deposit; ice blocks carry more snow than rock', () => {
  for (const [id, profile] of WORLD_PROFILES) {
    const rock = rockDeposit(id, profile.surface, false);
    assert.ok(rock.coverage > 0 && rock.coverage <= 1, id);
    assert.equal(rock.ground, profile.surface.base, id);
    assert.ok(rock.metres > 0, id);
  }
  const ice = WORLD_PROFILES.get('ice')!.surface;
  assert.ok(rockDeposit('ice', ice, true).coverage > rockDeposit('ice', ice, false).coverage);
  assert.ok(WORLD_PROFILES.has(FOREST_ID));
  assert.equal(rockDeposit('unknown', ice, false).coverage, 0);
});

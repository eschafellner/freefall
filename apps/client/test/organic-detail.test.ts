import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { applySchabeTissue, schabeGeometry, SCHABE_LEGS } from '../src/rendering/SchabeModel.ts';
import { applySurfaceWear } from '../src/rendering/environment/SurfaceWear.ts';
import { rockGeometry } from '../src/rendering/mission/GeneratedTerrain.ts';

const standardShader = () => ({
  uniforms: T.UniformsUtils.clone(T.ShaderLib.standard.uniforms),
  vertexShader: T.ShaderLib.standard.vertexShader,
  fragmentShader: T.ShaderLib.physical.fragmentShader,
}) as unknown as T.WebGLProgramParametersWithUniforms;

test('Schabe tissue shader finds every chunk it extends in the installed three.js', () => {
  const shader = standardShader();
  // The tissue pass reads vSurface from the part-surface pass.
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSurface;');
  applySchabeTissue(shader);
  assert.match(shader.vertexShader, /vSchabeLocal = position;/);
  assert.match(shader.vertexShader, /attribute vec4 tissue;/);
  for (const marker of ['schabeMottle', 'schabeStriae', 'schabeBump(-vViewPosition', 'schabeFilm', 'schabeNoise', 'vSchabePulse']) {
    assert.ok(shader.fragmentShader.includes(marker), marker);
  }
  // Sheen and translucency are added before the final output.
  assert.ok(shader.fragmentShader.indexOf('schabeFilm') < shader.fragmentShader.indexOf('#include <opaque_fragment>'));
});

test('Schabe body is one organic surface: finite normals, symmetric, breathing abdomen, swaying sensor stalks', () => {
  for (const tier of [0, 1, 2] as const) {
    const geometry = schabeGeometry(tier);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    const tissue = geometry.getAttribute('tissue');
    assert.ok(tissue, 'tier ' + tier + ' carries tissue data');
    let left = 0, right = 0, breath = 0, sway = 0;
    for (let i = 0; i < position.count; i++) {
      assert.ok(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i)));
      if (position.getX(i) < -.01) left++;
      if (position.getX(i) > .01) right++;
      if (tissue.getX(i) > 0) {
        breath++;
        // Only the abdomen and cerci breathe.
        assert.ok(position.getZ(i) > 0, 'breathing vertex behind the thorax');
      }
      if (tissue.getY(i) > 0) sway++;
    }
    assert.ok(Math.abs(left - right) <= position.count * .02, 'bilateral');
    if (tier < 2) {
      assert.ok(breath > 0 && sway > 0, 'tier ' + tier + ' breathes and sways');
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Scale stays inside the approved footprint: feet on the ground, body under the hit sphere.
    assert.ok(box.min.y >= 0 && box.max.y < 1, 'height');
    assert.ok(Math.max(-box.min.x, box.max.x) < .95 && box.min.z > -1.25 && box.max.z < .95, 'footprint');
    geometry.dispose();
  }
  assert.equal(SCHABE_LEGS.length, 3);
});

test('surface wear extends the shader of plain props and keeps their program keys apart', () => {
  const metal = applySurfaceWear(new T.MeshStandardMaterial(), 'metal');
  const fabric = applySurfaceWear(new T.MeshStandardMaterial(), 'fabric');
  assert.notEqual(metal.customProgramCacheKey(), fabric.customProgramCacheKey());
  const shader = standardShader();
  metal.onBeforeCompile(shader, undefined as unknown as T.WebGLRenderer);
  assert.match(shader.vertexShader, /vWearWorld = \(wearModel \* vec4\(transformed, 1\.0\)\)\.xyz;/);
  for (const marker of ['wearGrime', 'wearScratch', 'roughnessFactor = clamp(roughnessFactor + wearGrime', 'wearHeight']) {
    assert.ok(shader.fragmentShader.includes(marker), marker);
  }
  // An existing hook still runs first.
  let earlier = false;
  const chained = new T.MeshStandardMaterial();
  chained.onBeforeCompile = () => { earlier = true; };
  applySurfaceWear(chained, 'paint').onBeforeCompile(standardShader(), undefined as unknown as T.WebGLRenderer);
  assert.ok(earlier);
});

test('collision rocks fill the unit box with fractured relief and baked curvature', () => {
  for (const frozen of [false, true]) for (const detailed of [true, false]) {
    const geometry = rockGeometry(frozen, detailed);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new T.Vector3());
    for (const extent of size.toArray()) assert.ok(Math.abs(extent - 2) < 1e-3);
    const cavity = geometry.getAttribute('rockCavity');
    assert.equal(cavity.count, geometry.getAttribute('position').count);
    let hollow = 0, edge = 0;
    for (let i = 0; i < cavity.count; i++) {
      assert.ok(Number.isFinite(cavity.getX(i)) && Math.abs(cavity.getX(i)) <= 1);
      if (cavity.getX(i) > .2) hollow++;
      if (cavity.getX(i) < -.2) edge++;
    }
    assert.ok(hollow > 0 && edge > 0, 'hollows and edges');
    const triangles = geometry.index!.count / 3;
    assert.ok(triangles <= (detailed ? 1_280 : 180), 'rock budget ' + triangles);
    geometry.dispose();
  }
});

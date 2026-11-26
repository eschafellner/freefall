import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { CONVICT_LOOK, DEFAULT_LOOK, createOperatorWardrobe } from '../src/rendering/characters/operator/Catalog.ts';
import { EnemyVisualLOD, SCHABE_GAIT } from '../src/rendering/EnemyVisualLOD.ts';

const triangles = (geometry: T.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

test('operator and convict looks stay within the character budget and carry surface and skin data', () => {
  const wardrobe = createOperatorWardrobe();
  const operator = wardrobe.look(DEFAULT_LOOK);
  const convict = wardrobe.look(CONVICT_LOOK);
  for (const look of [operator, convict]) {
    assert.ok(look.triangles <= 25_000, `${look.key}: ${look.triangles} triangles`);
    for (const geometry of Object.values(look.geometries)) {
      for (const name of ['surface', 'skinIndex', 'skinWeight', 'color', 'normal']) assert.ok(geometry!.getAttribute(name), name);
    }
  }
  // The convict look is its own model, not a recolour, and its custody collar glows.
  assert.notEqual(operator.triangles, convict.triangles);
  let lit = false;
  for (const geometry of Object.values(convict.geometries)) {
    const glow = geometry!.getAttribute('surface');
    for (let i = 0; i < glow.count; i++) lit ||= glow.getY(i) > 1;
  }
  assert.ok(lit, 'custody collar light');
  assert.equal(wardrobe.look({ ...DEFAULT_LOOK }), operator, 'looks are shared');
  wardrobe.dispose();
});

test('Schabe tiers keep their triangle budgets and only legs carry gait weights', () => {
  const scene = new T.Scene();
  const lod = new EnemyVisualLOD(scene);
  const meshes = scene.children.filter((child): child is T.InstancedMesh => child instanceof T.InstancedMesh);
  const budgets = [3_300, 700, 180];
  meshes.forEach((mesh, tier) => assert.ok(triangles(mesh.geometry) <= budgets[tier], `tier ${tier}`));
  const near = meshes[0].geometry;
  const rig = near.getAttribute('rig');
  const position = near.getAttribute('position');
  const groups = new Set<number>();
  for (let i = 0; i < rig.count; i++) {
    if (rig.getY(i) <= 0) continue;
    groups.add(Math.round(rig.getX(i) / Math.PI));
    // Weighted vertices sit beside the body (legs), never on the carapace centre line.
    assert.ok(Math.abs(position.getX(i)) > .2);
  }
  assert.deepEqual([...groups].sort(), [0, 1], 'tripod gait in two phase groups');
  assert.equal(meshes[2].geometry.getAttribute('rig').array.some((value, index) => index % 2 === 1 && value > 0), false, 'far tier is static');
  for (const mesh of meshes) assert.ok(mesh.geometry.getAttribute('gait'), 'live tiers read per-instance gait');
  assert.equal(lod.fallenGeometry.getAttribute('gait'), undefined, 'fallen bodies never walk');
  assert.ok(SCHABE_GAIT.stride > 0 && SCHABE_GAIT.lift > 0);
});

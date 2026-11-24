import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { createSoldierParts } from '../src/rendering/characters/SoldierRig.ts';
import { EnemyVisualLOD, SCHABE_GAIT } from '../src/rendering/EnemyVisualLOD.ts';

const triangles = (geometry: T.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

function rigTriangles(parts: ReturnType<typeof createSoldierParts>): number {
  const once = [parts.pelvis, parts.beltKit, parts.torso, parts.pack, parts.head, ...parts.sleeves];
  const twice = [parts.forearm, parts.glove, parts.thigh, parts.shin, parts.boot];
  return once.reduce((sum, part) => sum + triangles(part.geometry), 0) + 2 * twice.reduce((sum, part) => sum + triangles(part.geometry), 0);
}

test('operator and convict stay within the character triangle budget and carry surface data', () => {
  const operator = createSoldierParts();
  const convict = createSoldierParts({ variant: 'convict' });
  for (const parts of [operator, convict]) {
    assert.ok(rigTriangles(parts) <= 25_000);
    for (const part of [parts.torso, parts.head, parts.boot]) assert.ok(part.geometry.getAttribute('surface'), 'roughness/glow attribute');
  }
  // The convict variant is its own model, not a recolour.
  assert.notEqual(triangles(operator.head.geometry), triangles(convict.head.geometry));
  const glow = convict.head.geometry.getAttribute('surface');
  let lit = false;
  for (let i = 0; i < glow.count; i++) lit ||= glow.getY(i) > 1;
  assert.ok(lit, 'custody collar light');
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

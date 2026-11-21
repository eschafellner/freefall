import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { generateWorld, groundHeight, openGround, restoreWorld, worldChunkId } from '@freefall/shared';
import { DETAIL_ASSETS, detailClearances, detailSeed, placeChunkDetails } from '../src/rendering/environment/EnvironmentDetailPlacement.ts';
import type { DetailAssetId } from '../src/rendering/environment/EnvironmentDetailPlacement.ts';
import { detailGeometry } from '../src/rendering/environment/EnvironmentDetailAssets.ts';
import { createPlanetMaterials } from '../src/rendering/environment/PlanetMaterials.ts';
import { PLANET_SURFACES, surfaceSample } from '../src/rendering/environment/PlanetSurfaces.ts';
import { disposeMissionMeshes } from '../src/rendering/mission/disposeMissionMeshes.ts';
import { GeneratedTerrain } from '../src/rendering/mission/GeneratedTerrain.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';

const worlds = [['green-plains', 17], ['desert', 31], ['ice', 48], ['forest', 63]] as const;

test('four planet material sets use valid packed mipmapped data and dielectric PBR props', () => {
  for (const [planet, seed] of worlds) {
    const { ground, textures, prop } = createPlanetMaterials(planet, seed, 4);
    assert.equal(ground.metalness, 0);
    const atlas = textures[0] as T.DataArrayTexture;
    assert.equal(atlas.colorSpace, T.NoColorSpace);
    assert.equal(atlas.minFilter, T.LinearMipmapLinearFilter);
    assert.equal(atlas.wrapS, T.RepeatWrapping);
    assert.ok(atlas.generateMipmaps && atlas.version > 0);
    const { width, height, depth, data } = atlas.image;
    assert.ok(data instanceof Uint8Array);
    assert.deepEqual([width, height, depth, data.length], [256, 256, 4, 256 * 256 * 16]);
    for (const [i, [finish, color, roughness, scale]] of PLANET_SURFACES[planet].entries()) {
      assert.ok(roughness >= .22 && roughness <= 1 && scale > 1);
      const tile = data.subarray(i * width * height * 4, (i + 1) * width * height * 4);
      const values = new Set<number>();
      const slopes = new Set<number>();
      for (let texel = 0; texel < tile.length; texel += 4) {
        assert.ok(tile[texel + 1] >= .21 * 255 && tile[texel + 1] <= 255);
        values.add(tile[texel]);
        slopes.add(tile[texel + 2]);
      }
      assert.ok(values.size > 18 && slopes.size > 10);
      const material = prop(finish, color, roughness);
      assert.ok(material.normalMap?.generateMipmaps && material.map?.generateMipmaps);
      assert.equal(material.normalMap.colorSpace, T.NoColorSpace);
      assert.equal(material.metalness, 0);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    ground.dispose();
  }
});

test('detail streams replay independently per chunk, vary across seeds and exclude every mission reservation', (t) => {
  for (const [planet, seed] of worlds) {
    const plan = generateWorld(planet, seed)!;
    const clone = restoreWorld(JSON.parse(JSON.stringify(plan.identity)))!;
    const other = generateWorld(planet, seed + 1)!;
    const { world, relays, balloonSites, chunkCells } = plan;
    const sites = detailClearances(world, [...relays, ...balloonSites]);
    const otherSites = detailClearances(other.world, [...other.relays, ...other.balloonSites]);
    const width = world.terrain.step * chunkCells;
    const count = world.terrain.cells / chunkCells;
    const replay = placeChunkDetails(clone.world, sites, 3, 3, width);
    assert.ok(replay.length > 0);
    const ids = new Set<string>();
    const assets = new Map<string, number>();
    for (let z = count - 1; z >= 0; z--) for (let x = count - 1; x >= 0; x--) {
      for (const prop of placeChunkDetails(world, sites, x, z, width)) {
        const asset = DETAIL_ASSETS[prop.asset];
        assert.ok(asset && prop.grade <= asset.maxGrade);
        assert.equal(prop.chunk, worldChunkId(world.id, x, z));
        assert.ok(!ids.has(prop.id));
        ids.add(prop.id);
        assets.set(prop.asset, (assets.get(prop.asset) ?? 0) + 1);
        assert.equal(prop.y, groundHeight(world, prop.x, prop.z));
        assert.equal(Math.floor((prop.x + world.half) / width), x);
        assert.equal(Math.floor((prop.z + world.half) / width), z);
        const radius = asset.radius * prop.scale;
        assert.ok(openGround(world, prop.x, prop.z, radius));
        for (const site of sites) assert.ok(Math.hypot(prop.x - site.x, prop.z - site.z) > site.radius + radius);
        const { weights } = surfaceSample(planet, detailSeed(world), world.terrain, prop.x, prop.z, prop.y, prop.grade);
        assert.ok(weights.every((weight) => weight >= 0 && weight <= 1));
        assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-9);
      }
    }
    assert.deepEqual(placeChunkDetails(world, sites, 3, 3, width), replay);
    assert.notDeepEqual(placeChunkDetails(other.world, otherSites, 3, 3, width).map(({ x, z }) => [x, z]),
      replay.map(({ x, z }) => [x, z]));
    const reserved = detailClearances(world, [{ x: -30, z: -30, radius: width }]);
    assert.equal(placeChunkDetails(world, reserved, 3, 3, width).length, 0);
    t.diagnostic(planet + ' seed ' + seed + ' · ' + ids.size + ' · ' + JSON.stringify(Object.fromEntries(assets)));
  }
});

test('catalog geometry has finite unit normals, a grounded pivot and a measured footprint', (t) => {
  for (const id of Object.keys(DETAIL_ASSETS) as DetailAssetId[]) {
    const asset = DETAIL_ASSETS[id], shape = detailGeometry(id);
    const position = shape.getAttribute('position'), normal = shape.getAttribute('normal');
    assert.equal(position.count, normal.count);
    assert.equal(position.count % 3, 0);
    assert.ok(position.count > 0 && position.count <= 450);
    const box = shape.boundingBox!;
    assert.ok(shape.boundingSphere!.radius > 0 && box.min.y >= -.06 && box.max.y <= asset.height + .025);
    for (let i = 0; i < position.count; i++) {
      assert.ok(Math.hypot(position.getX(i), position.getZ(i)) <= asset.radius);
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-5);
    }
    t.diagnostic(id + ' · ' + position.count / 3 + ' triangles');
    shape.dispose();
  }
});

test('quality changes keep terrain vertices, collision prop instances and shared assets while releasing owned GPU resources', () => {
  const { world, relays, balloonSites } = generateWorld('forest', 63)!;
  const original = JSON.stringify(world);
  const terrain = new GeneratedTerrain(world, [...relays, ...balloonSites], 1);
  const scene = new T.Scene();
  scene.add(terrain.root);
  const shared = new T.MeshStandardMaterial();
  const sampleGeometry = new T.BoxGeometry();
  terrain.root.add(new T.Mesh(sampleGeometry, shared));
  const camera = new T.PerspectiveCamera();
  const tree = world.obstacles.find(({ kind }) => kind === 'tree')!;
  camera.position.set(tree.x, groundHeight(world, tree.x, tree.z) + 1.6, tree.z);
  const objects = (match: (object: T.Object3D) => boolean) => {
    const found: T.InstancedMesh[] = [];
    terrain.root.traverse((object) => { if (object instanceof T.InstancedMesh && match(object)) found.push(object); });
    return found;
  };
  const count = (list: T.InstancedMesh[]) => list.reduce((sum, mesh) => sum + (mesh.visible ? mesh.count : 0), 0);
  const details = objects(({ name }) => name.startsWith(world.id));
  const trunks = objects(({ name }) => name === 'Tree collision trunks');
  const rocks = objects(({ name }) => name.startsWith('Rock collision props'));
  terrain.configure(GRAPHICS_QUALITY.low);
  terrain.update(camera);
  const low = count(details);
  assert.ok(low > 0);
  terrain.configure(GRAPHICS_QUALITY.high);
  terrain.update(camera);
  const high = count(details);
  assert.ok(high > low);
  assert.equal(count(trunks), world.obstacles.filter(({ kind }) => kind === 'tree').length);
  assert.ok(rocks.some(({ name, visible }) => name.endsWith('/far') && visible));
  assert.ok(rocks.some(({ name, visible }) => !name.endsWith('/far') && visible));
  assert.equal(count(rocks), world.obstacles.filter(({ kind }) => kind === 'rock').length);
  assert.ok(details.every((mesh) => !mesh.castShadow && mesh.material instanceof T.Material && !mesh.material.transparent));
  assert.ok(new Set(details.map((mesh) => mesh.geometry)).size < details.length);
  camera.position.set(1000, 50, 1000);
  terrain.update(camera);
  assert.equal(count(details), 0);
  assert.equal(count(rocks), world.obstacles.filter(({ kind }) => kind === 'rock').length);
  assert.equal(JSON.stringify(world), original);

  const resources = new Set<T.BufferGeometry | T.Material | T.Texture | T.InstancedMesh>(terrain.textures);
  terrain.root.traverse((object) => {
    if (object instanceof T.InstancedMesh) resources.add(object);
    if (!(object instanceof T.Mesh)) return;
    resources.add(object.geometry);
    if (object.material !== shared) resources.add(object.material);
  });
  const disposed = new Map<unknown, number>();
  for (const asset of [...resources, shared]) {
    (asset as T.EventDispatcher<{ dispose: object }>).addEventListener('dispose', () => {
      disposed.set(asset, (disposed.get(asset) ?? 0) + 1);
    });
  }
  disposeMissionMeshes(terrain.root, new Set([shared]), [], terrain.textures);
  assert.equal(terrain.root.parent, null);
  assert.equal(disposed.get(shared), undefined);
  assert.equal(disposed.size, resources.size);
  assert.ok([...disposed.values()].every((times) => times === 1));
  shared.dispose();
});

test('the existing Three GLB pipeline imports an in-memory metre-scale mesh and rejects an invalid asset', async () => {
  const json = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { roughnessFactor: .89, metallicFactor: 0 } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }],
  });
  const jsonBytes = Math.ceil(json.length / 4) * 4;
  const glb = new ArrayBuffer(12 + 8 + jsonBytes + 8 + 36);
  const data = new DataView(glb);
  const word = (at: number, value: number) => data.setUint32(at, value, true);
  word(0, 0x46546c67);
  word(4, 2);
  word(8, glb.byteLength);
  word(12, jsonBytes);
  word(16, 0x4e4f534a);
  new Uint8Array(glb, 20, jsonBytes).fill(32).set(new TextEncoder().encode(json));
  word(20 + jsonBytes, 36);
  word(24 + jsonBytes, 0x004e4942);
  for (const [i, value] of [0, 0, 0, 1, 0, 0, 0, 1, 0].entries()) data.setFloat32(28 + jsonBytes + i * 4, value, true);

  const loader = new GLTFLoader();
  const { scene } = await loader.parseAsync(glb, '');
  const mesh = scene.children[0] as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  assert.ok(mesh.isMesh);
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(mesh.geometry.boundingBox?.max.toArray(), [1, 1, 0]);
  assert.equal(mesh.material.roughness, .89);
  assert.equal(mesh.material.metalness, 0);
  disposeMissionMeshes(scene, new Set(), [], []);
  await assert.rejects(() => loader.parseAsync(new Uint8Array([7, 15, 31, 63]).buffer, ''));
});

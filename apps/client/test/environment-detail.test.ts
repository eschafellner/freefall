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
import { MID_PROPS, midPropGeometry } from '../src/rendering/environment/MidPropAssets.ts';
import type { MidPropId } from '../src/rendering/environment/MidPropAssets.ts';
import { placeChunkMidProps } from '../src/rendering/environment/MidPropPlacement.ts';
import { WAR_TRACES, traceGeometry } from '../src/rendering/environment/WarTraceAssets.ts';
import type { TraceId } from '../src/rendering/environment/WarTraceAssets.ts';
import { placeWarTraces } from '../src/rendering/environment/WarTracePlacement.ts';
import { AmbientLife, LIFE_PROFILES } from '../src/rendering/environment/AmbientLife.ts';

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
  assert.equal(count(rocks), world.obstacles.filter(({ kind }, index) => kind === 'rock' && !terrain.traces.solids.has(index)).length);
  assert.ok(details.every((mesh) => !mesh.castShadow && mesh.material instanceof T.Material && !mesh.material.transparent));
  assert.ok(new Set(details.map((mesh) => mesh.geometry)).size < details.length);
  camera.position.set(1000, 50, 1000);
  terrain.update(camera);
  assert.equal(count(details), 0);
  assert.equal(count(rocks), world.obstacles.filter(({ kind }, index) => kind === 'rock' && !terrain.traces.solids.has(index)).length);
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

test('mid props replay per chunk, stay clear of reservations and solids, and switch with the graphics tier', (t) => {
  for (const [planet, seed] of worlds) {
    const plan = generateWorld(planet, seed)!;
    const { world, relays, balloonSites, chunkCells } = plan;
    const sites = detailClearances(world, [...relays, ...balloonSites]);
    const width = world.terrain.step * chunkCells;
    const count = world.terrain.cells / chunkCells;
    const ids = new Set<string>();
    const assets = new Map<string, number>();
    for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
      const props = placeChunkMidProps(world, sites, x, z, width);
      assert.deepEqual(placeChunkMidProps(world, sites, x, z, width), props);
      for (const prop of props) {
        assert.ok(!ids.has(prop.id));
        ids.add(prop.id);
        assets.set(prop.asset, (assets.get(prop.asset) ?? 0) + 1);
        assert.equal(prop.y, groundHeight(world, prop.x, prop.z));
        assert.ok(Math.abs(prop.x) <= world.half && Math.abs(prop.z) <= world.half);
        for (const site of sites) assert.ok(Math.hypot(prop.x - site.x, prop.z - site.z) > site.radius);
        // Root flares sit on trunks; everything else keeps its centre out of every solid.
        if (prop.asset !== 'roots') assert.ok(openGround(world, prop.x, prop.z, .04));
      }
    }
    assert.ok(ids.size > 600, planet + ' ' + ids.size);
    assert.ok(assets.size >= 3);
    const reserved = detailClearances(world, [{ x: -30, z: -30, radius: width * 2 }]);
    assert.ok(placeChunkMidProps(world, reserved, 3, 3, width).every(({ asset }) => asset === 'roots'));
    t.diagnostic(planet + ' · ' + ids.size + ' · ' + JSON.stringify(Object.fromEntries(assets)));
  }
  for (const id of Object.keys(MID_PROPS) as MidPropId[]) {
    const shape = midPropGeometry(id), info = MID_PROPS[id];
    const position = shape.getAttribute('position'), normal = shape.getAttribute('normal');
    assert.ok(position.count > 0 && position.count / 3 <= 900, id);
    const box = shape.boundingBox!;
    assert.ok(box.min.y >= -.16 && box.max.y <= info.height + .05, id);
    assert.ok(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) <= info.radius + .05, id);
    for (let i = 0; i < normal.count; i++) {
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-4, id);
    }
    shape.dispose();
  }
  const { world, relays, balloonSites } = generateWorld('forest', 63)!;
  const terrain = new GeneratedTerrain(world, [...relays, ...balloonSites], 1);
  const mids: T.InstancedMesh[] = [];
  terrain.root.traverse((object) => { if (object instanceof T.InstancedMesh && object.name.startsWith('Mid prop ')) mids.push(object); });
  assert.ok(mids.length > 0);
  const camera = new T.PerspectiveCamera();
  camera.position.set(0, groundHeight(world, 0, 0) + 1.6, 0);
  const visible = () => mids.reduce((sum, mesh) => sum + (mesh.visible ? mesh.count : 0), 0);
  terrain.configure(GRAPHICS_QUALITY.low);
  terrain.update(camera);
  const low = visible();
  assert.ok(mids.every((mesh) => !mesh.castShadow));
  terrain.configure(GRAPHICS_QUALITY.high);
  terrain.update(camera);
  assert.ok(visible() > low && low > 0);
  camera.position.set(1000, 50, 1000);
  terrain.update(camera);
  assert.equal(visible(), 0);
  disposeMissionMeshes(terrain.root, new Set(), [], terrain.textures);
});

test('war traces are deterministic, keep mission reservations clear and only reskin medium rocks', (t) => {
  for (const [planet, seed] of worlds) {
    const { world, relays, balloonSites } = generateWorld(planet, seed)!;
    const reserved = detailClearances(world, [...relays, ...balloonSites]);
    const traces = placeWarTraces(world, reserved);
    assert.deepEqual(placeWarTraces(world, reserved), traces);
    assert.ok(traces.sites.length >= 3 && traces.props.length > 60 && traces.decals.length > 10, planet);
    const swarm = [...world.initialNests.map(({ x, z }) => ({ x, z })), ...world.breachRegions];
    for (const prop of traces.props) {
      const radius = WAR_TRACES[prop.asset].radius * prop.scale;
      assert.equal(prop.y, groundHeight(world, prop.x, prop.z));
      assert.ok(openGround(world, prop.x, prop.z, radius * .5), prop.asset);
      for (const site of reserved) {
        const zone = swarm.some(({ x, z }) => x === site.x && z === site.z);
        assert.ok(Math.hypot(prop.x - site.x, prop.z - site.z) >= (zone ? site.radius * .55 : site.radius + radius), prop.asset);
      }
    }
    for (const [index] of traces.solids) {
      const rock = world.obstacles[index];
      assert.equal(rock.kind, 'rock');
      assert.ok(rock.halfX < 3.6 && rock.halfZ < 3.6);
    }
    t.diagnostic(planet + ' · ' + traces.props.length + ' traces · ' + traces.decals.length + ' decals · ' + traces.solids.size + ' wrecks');
  }
  for (const id of Object.keys(WAR_TRACES) as TraceId[]) {
    const shape = traceGeometry(id), info = WAR_TRACES[id], normal = shape.getAttribute('normal');
    assert.ok(normal.count > 0 && normal.count / 3 <= 900, id);
    if (!('solid' in info)) {
      const box = shape.boundingBox!;
      assert.ok(box.max.y <= info.height + .08 && Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) <= info.radius + .1, id);
    }
    for (let i = 0; i < normal.count; i++) assert.ok(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i)), id);
    shape.dispose();
  }
});

test('ambient life builds alien species per planet, animates on update and hides from the drop altitude', () => {
  for (const [planet, seed] of worlds) {
    const { world } = generateWorld(planet, seed)!;
    const life = new AmbientLife(world);
    const profile = LIFE_PROFILES[planet];
    assert.ok(profile.fliers.length > 0, planet);
    const fliers = life.root.children.filter((child): child is T.InstancedMesh => child instanceof T.InstancedMesh && child.name.startsWith('Ambient fliers'));
    assert.equal(fliers.reduce((sum, mesh) => sum + mesh.count, 0), profile.fliers.reduce((sum, spec) => sum + spec.flocks * spec.perFlock, 0));
    life.configure(GRAPHICS_QUALITY.low);
    const camera = new T.PerspectiveCamera();
    camera.position.set(0, groundHeight(world, 0, 0) + 1.6, 0);
    life.update(camera);
    const before = fliers[0].instanceMatrix.array.slice();
    life.update(camera);
    assert.ok(life.root.visible);
    for (const mesh of fliers) for (const value of mesh.instanceMatrix.array) assert.ok(Number.isFinite(value), planet);
    assert.equal(before.length, fliers[0].instanceMatrix.array.length);
    camera.position.y += 400;
    life.update(camera);
    assert.equal(life.root.visible, false);
    disposeMissionMeshes(life.root, new Set(), [], []);
  }
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

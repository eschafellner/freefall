import * as T from 'three';
import type { MissionDefinition, ObjectiveSnapshot, PositionXZ } from '@freefall/shared';
import { openGround } from '@freefall/shared';
import { landscapeNoise, randomSource, smoothstep } from '../environment/noise.ts';
import type { SurfaceMaterials } from '../environment/SurfaceMaterials.ts';

const unitBox = () => new T.BoxGeometry(1, 1, 1);

function segmentDistance(x: number, z: number, a: PositionXZ, b: PositionXZ): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const along = T.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx ** 2 + dz ** 2), 0, 1);
  return Math.hypot(x - a.x - dx * along, z - a.z - dz * along);
}

function terrain(definition: MissionDefinition, soil: T.Material) {
  const half = definition.world.half;
  const roads = [definition.world.deployment, { x: -128, z: 100 }, { x: -100, z: 34 }, { x: -63, z: 20 },
    { x: 8, z: -17 }, { x: 46, z: -35 }, { x: 92, z: -49 }, { x: 116, z: -93 }, ...(definition.world.serviceApron ? [definition.world.serviceApron] : [])];
  const geometry = new T.PlaneGeometry(2 * (half + 130), 2 * (half + 130), 150, 150).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const colors = new Float32Array(positions.count * 3);
  const warm = new T.Color(0x8b7457);
  const dark = new T.Color(0x4e4840);
  const road = new T.Color(0x635c4e);
  const far = new T.Color(0x666659);
  const color = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const field = landscapeNoise(x * .033, z * .033, 24);
    const height = smoothstep(half + 4, half + 51, edge) * (field ** 2 * 76 + 5 * Math.sin(z * .045));
    let track = Infinity;
    for (let p = 1; p < roads.length; p++) track = Math.min(track, segmentDistance(x, z, roads[p - 1], roads[p]));
    color.copy(warm).lerp(dark, field ** 1.4).lerp(road, (1 - smoothstep(2.9, 6.2, track + field)) * .9);
    color.lerp(far, smoothstep(0, 49, height)).toArray(colors, i * 3);
    positions.setY(i, height);
    uvs.setXY(i, (x + z * .14) / 7, (-z + x * .11) / 7);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh<T.BufferGeometry, T.Material>(geometry, soil);
  mesh.receiveShadow = true;
  return mesh;
}

function sitePlate(parent: T.Group, x: number, z: number, radius: number, text: string, material: T.Material): void {
  const slab = new T.Mesh(new T.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), material);
  slab.position.set(x, .01, z);
  slab.receiveShadow = true;
  parent.add(slab);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(128, 128);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c7b387';
  ctx.fillStyle = '#c7b387';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 112, i * Math.PI / 4 + .045, (i + 1) * Math.PI / 4 - .045);
    ctx.stroke();
  }
  ctx.font = 'bold 58px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 20);
  ctx.strokeRect(-52, -44, 104, 90);
  const random = randomSource(12);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    ctx.globalAlpha = random();
    ctx.fillRect(random() * 256 - 128, random() * 256 - 128, 1 + random() * 3, 1 + random() * 2);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const marking = new T.Mesh(new T.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  marking.position.set(x, .025, z);
  parent.add(marking);
}

export class MissionEnvironment {
  readonly root = new T.Group();
  readonly debug = new T.Group();
  private readonly floor: T.Mesh<T.BufferGeometry, T.Material>;
  private readonly soil: T.Material;
  private readonly simpleSoil: T.Material;
  private readonly lamps = new Map<string, T.MeshStandardMaterial>();

  constructor(definition: MissionDefinition, materials: SurfaceMaterials) {
    const { world, objectives } = definition;
    const random = randomSource(81164);
    const color = new T.Color();
    const cursor = new T.Object3D();
    const box = unitBox();
    const rock = new T.IcosahedronGeometry(1, 1);
    const rockPositions = rock.getAttribute('position');
    for (let i = 0; i < rockPositions.count; i++) {
      const x = rockPositions.getX(i);
      const y = rockPositions.getY(i);
      const z = rockPositions.getZ(i);
      const taper = .87 + .17 * Math.sin(x * 9 + y * 5 - z * 13);
      const ledge = y < -.28 ? 1.17 : 1;
      rockPositions.setXYZ(i, x * taper * ledge, Math.max(0, y + .35) * .73, z * taper * ledge);
    }
    rock.computeVertexNormals();
    const rockMaterial = new T.MeshStandardMaterial({ color: 0xd4c9b8, roughness: .99, flatShading: true });
    const armor = materials.painted;
    const stone = materials.concrete;
    const rockDefs = world.obstacles.filter((o) => o.kind === 'rock');
    const cliffs = new T.InstancedMesh(rock, rockMaterial, rockDefs.length * 4);
    let cliffIndex = 0;
    for (const o of rockDefs) {
      for (let j = 0; j < 4; j++) {
        cursor.position.set(o.x + (j === 0 ? 0 : (random() - .5) * o.halfX), -.15,
          o.z + (j === 0 ? 0 : (random() - .5) * o.halfZ));
        cursor.scale.set(o.halfX * (j ? .63 : 1.06), o.height * (j ? .53 + random() * .4 : 1.1), o.halfZ * (j ? .66 : 1.06));
        cursor.rotation.set(0, (random() - .5) * .15, 0);
        cursor.updateMatrix();
        cliffs.setMatrixAt(cliffIndex, cursor.matrix);
        cliffs.setColorAt(cliffIndex++, color.setHex(j % 2 ? 0x746c5c : 0x82796d).multiplyScalar(.8 + random() * .33));
      }
    }
    cliffs.castShadow = cliffs.receiveShadow = true;
    this.root.add(cliffs);

    const parts = new Map<T.Material, { matrix: T.Matrix4; color: number }[]>();
    const panel = (material: T.Material, tint: number, x: number, y: number, z: number,
      w: number, h: number, d: number, yaw = 0, roll = 0) => {
      cursor.position.set(x, y, z);
      cursor.scale.set(w, h, d);
      cursor.rotation.set(0, yaw, roll);
      cursor.updateMatrix();
      if (!parts.has(material)) parts.set(material, []);
      parts.get(material)!.push({ matrix: cursor.matrix.clone(), color: tint });
    };
    for (const o of world.obstacles) {
      if (o.kind === 'rock') continue;
      const { x, z, halfX, halfZ, height: h } = o;
      const w = halfX * 2;
      const d = halfZ * 2;
      const container = o.kind === 'container';
      const barrier = o.kind === 'barrier';
      panel(container ? armor : stone, container ? 0x5a6351 : barrier ? 0x858275 : 0x787b70, x, h * .5, z, w, h, d);
      if (barrier) {
        for (let i = -halfX + .35; i < halfX; i += .7) panel(armor, 0xb69755, x + i, h * .79, z + halfZ + .012, .28, .23, .035, 0, -.32);
        continue;
      }
      panel(armor, 0x555c53, x, h + .08, z, w + .25, .16, d + .24);
      for (const side of [-1, 1]) {
        const face = z + side * (halfZ + .04);
        const step = container ? .42 : 2.1;
        for (let u = -halfX + .18; u < halfX; u += step) {
          panel(armor, container ? 0x454a40 : 0x8d8d7b, x + u, h * .5, face, container ? .09 : .28, h * .94, .11);
        }
        panel(armor, 0x343d3b, x, h * .54, face, w * (container ? .35 : .54), h * (container ? .12 : .29), .12);
      }
    }

    for (const objective of objectives) {
      if (objective.kind !== 'activate') continue;
      const { id, x, z } = objective;
      sitePlate(this.root, x, z, 6.6, id === 'alpha' ? 'A' : 'B', stone);
      panel(armor, 0x414b46, x, .62, z, 1.15, 1.24, .68);
      panel(armor, 0x222b28, x, 1.28, z, 1.26, .22, .78, 0, .025);
      const indicator = new T.MeshStandardMaterial({ color: 0xd39b58, emissive: 0xc7772e, emissiveIntensity: .7 });
      this.lamps.set(id, indicator);
      panel(indicator, 0xffffff, x, 1.407, z, .7, .045, .38);
      const mastX = x + (id === 'alpha' ? -9 : 10);
      const mastZ = z + 6;
      panel(stone, 0x6b6d62, mastX, .32, mastZ, 2.2, .64, 2.2);
      for (const side of [-1, 1]) {
        panel(armor, 0x6e7566, mastX + side * .59, 6.7, mastZ, .13, 13.4, .13);
        panel(armor, 0x4b5046, mastX + side * .35, 6.7, mastZ + .45, .1, 13.4, .1);
        for (let y = 1; y < 12.5; y += 1.35) {
          panel(armor, 0x6c7268, mastX, y, mastZ, 1.2, .1, .1);
          panel(armor, 0x6c7268, mastX + side * .58, y + .45, mastZ + .23, .10, 1.35, .15, 0, .23 * side);
        }
      }
      const dish = new T.Mesh(new T.SphereGeometry(2.1, 20, 8, 0, Math.PI * 2, 0, Math.PI * .27),
        new T.MeshStandardMaterial({ color: 0x929386, side: T.DoubleSide, roughness: .75, metalness: .37 }));
      dish.scale.y = .65;
      dish.rotation.set(2.02, id === 'alpha' ? .55 : -.46, .23);
      dish.position.set(mastX, 12.9, mastZ);
      this.root.add(dish);
      panel(materials.lamps, 0xe58353, mastX, 13.7, mastZ, .22, .16, .22);
    }

    sitePlate(this.root, world.deployment.x, world.deployment.z, 12, 'LZ', stone);
    for (const site of [world.deployment]) {
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        panel(materials.lamps, 0xc7d9c4,
          site.x + Math.sin(angle) * 11.6, .062, site.z + Math.cos(angle) * 11.6, .32, .07, .19, angle);
      }
    }

    for (const [material, entries] of parts) {
      const mesh = new T.InstancedMesh(box, material, entries.length);
      for (const [i, part] of entries.entries()) {
        mesh.setMatrixAt(i, part.matrix);
        mesh.setColorAt(i, color.setHex(part.color));
      }
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    const gravel = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), rockMaterial, 1600);
    let gravelCount = 0;
    for (let i = 0; i < gravel.count; i++) {
      const x = (random() * 2 - 1) * world.half;
      const z = (random() * 2 - 1) * world.half;
      if (!openGround(world, x, z, .4)) continue;
      const scale = .08 + random() ** 3 * .72;
      cursor.position.set(x, .018, z);
      cursor.scale.set(scale, scale * .62, scale * .78);
      cursor.rotation.set(0, random() * 6.28, 0);
      cursor.updateMatrix();
      gravel.setMatrixAt(gravelCount, cursor.matrix);
      gravel.setColorAt(gravelCount++, color.setHex(0x8b7e6b).multiplyScalar(.6 + random() * .52));
    }
    gravel.count = gravelCount;
    this.root.add(gravel);

    this.soil = materials.soil;
    this.simpleSoil = new T.MeshLambertMaterial({ map: materials.soil.map, vertexColors: true });
    this.floor = terrain(definition, this.soil);
    this.root.add(this.floor);

    const lines = (points: readonly PositionXZ[], tint: number) => {
      const vertices = points.map((p) => new T.Vector3(p.x, .19, p.z));
      this.debug.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(vertices), new T.LineBasicMaterial({ color: tint })));
    };
    for (const region of world.patrolRegions) lines(region.route.waypoints, 0x90bba5);
    for (const region of world.breachRegions) lines(Array.from({ length: 32 }, (_, i) => {
      const angle = i * Math.PI / 16;
      return { x: region.x + Math.cos(angle) * region.radius, z: region.z + Math.sin(angle) * region.radius };
    }), 0xc88c62);
    this.debug.visible = false;
    this.root.add(this.debug);
  }

  simplify(low: boolean): void { this.floor.material = low ? this.simpleSoil : this.soil; }

  updateObjectives(objectives: readonly ObjectiveSnapshot[]): void {
    for (const objective of objectives) {
      const lamp = this.lamps.get(objective.id);
      if (!lamp) continue;
      lamp.emissive.setHex(objective.state === 'complete' ? 0x69b8a0 :
        objective.state === 'locked' ? 0x40332c : 0xd68a3f);
      lamp.emissiveIntensity = objective.state === 'locked' ? .28 : 1.4;
    }
  }

  auxiliaryMaterials(): T.Material[] { return [this.simpleSoil]; }
}

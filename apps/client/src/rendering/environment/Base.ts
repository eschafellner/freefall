import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ENVIRONMENT } from './EnvironmentConfig.ts';
import { randomSource } from './noise.ts';
import type { SurfaceMaterials } from './SurfaceMaterials.ts';

type Material = keyof Pick<SurfaceMaterials, 'concrete' | 'painted' | 'canvas' | 'hardware' | 'lamps'>;

const { colors, perimeter } = ENVIRONMENT;
const zinc = 0x676961;
const nearBlack = 0x262a29;
const khaki = 0x7f7257;
const wornRed = 0x6e4b37;

function barrierGeometry(): T.BufferGeometry {
  const profile = new T.Shape();
  profile.moveTo(-0.36, -0.5);
  profile.lineTo(0.36, -0.5);
  profile.lineTo(0.36, -0.31);
  profile.lineTo(0.17, -0.09);
  profile.lineTo(0.12, 0.5);
  profile.lineTo(-0.12, 0.5);
  profile.lineTo(-0.17, -0.09);
  profile.lineTo(-0.36, -0.31);
  profile.closePath();
  return new T.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false })
    .translate(0, 0, -0.5).rotateY(Math.PI / 2);
}

type Shapes = ReturnType<typeof baseShapes>;

function baseShapes() {
  const dish = new T.RingGeometry(0, 0.5, 28, 6);
  const vertices = dish.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    vertices.setZ(i, 0.78 * (x * x + y * y) - 0.1);
  }
  dish.computeVertexNormals();
  dish.rotateX(-0.41);

  return {
    box: new T.BoxGeometry(),
    bag: new RoundedBoxGeometry(1, 1, 1, 1, 0.17),
    barrier: barrierGeometry(),
    cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 12),
    dish,
  };
}

interface PartList {
  material: Material;
  shape: keyof Shapes;
  matrices: T.Matrix4[];
  colors: number[];
}

// Each site is culled independently. Parts with the same geometry and finish share a draw call.
class Site {
  private readonly parts = new Map<string, PartList>();
  private readonly transform = new T.Object3D();
  private readonly up = new T.Vector3(0, 1, 0);
  private readonly direction = new T.Vector3();

  add(material: Material, color: number, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, yaw = 0, shape: keyof Shapes = 'box'): void {
    this.transform.position.set(x, y, z);
    this.transform.scale.set(sx, sy, sz);
    this.transform.rotation.set(0, yaw, 0);
    this.store(material, color, shape);
  }

  beam(material: Material, color: number, thickness: number,
    ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.direction.set(bx - ax, by - ay, bz - az);
    this.transform.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.transform.scale.set(thickness, this.direction.length(), thickness);
    this.transform.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
    this.store(material, color, 'box');
  }

  private store(material: Material, color: number, shape: keyof Shapes): void {
    const key = `${material}:${shape}`;
    let list = this.parts.get(key);
    if (!list) {
      list = { material, shape, matrices: [], colors: [] };
      this.parts.set(key, list);
    }
    this.transform.updateMatrix();
    list.matrices.push(this.transform.matrix.clone());
    list.colors.push(color);
  }

  attach(scene: T.Object3D, shapes: Shapes, materials: SurfaceMaterials): void {
    const color = new T.Color();
    for (const list of this.parts.values()) {
      const mesh = new T.InstancedMesh(shapes[list.shape], materials[list.material], list.matrices.length);
      for (let i = 0; i < list.matrices.length; i++) {
        mesh.setMatrixAt(i, list.matrices[i]);
        mesh.setColorAt(i, color.setHex(list.colors[i]));
      }
      mesh.computeBoundingSphere();
      mesh.castShadow = list.material !== 'lamps';
      mesh.receiveShadow = list.material !== 'lamps';
      scene.add(mesh);
    }
  }
}

function container(site: Site, x: number, z: number, length: number, color: number, base = 0): void {
  site.add('painted', color, x, base + 1.28, z, length, 2.5, 2.44);
  for (let i = -length / 2 + 0.42; i < length / 2 - 0.3; i += 0.28) {
    site.add('painted', color, x + i, base + 1.3, z + 1.24, 0.105, 2.25, 0.12);
    site.add('painted', color, x + i, base + 1.3, z - 1.24, 0.105, 2.25, 0.12);
  }
  for (const side of [-1, 1]) {
    for (const depth of [-1, 1]) {
      site.add('hardware', nearBlack, x + side * (length / 2 - 0.09), base + 1.29, z + depth * 1.23, 0.18, 2.56, 0.16);
      for (const y of [base + 0.11, base + 2.49]) {
        site.add('painted', zinc, x + side * (length / 2 - 0.09), y, z + depth * 1.24, 0.22, 0.19, 0.18);
      }
    }
    site.add('painted', color, x, base + 0.22, z + side * 1.25, length, 0.23, 0.13);
    site.add('painted', color, x, base + 2.43, z + side * 1.25, length, 0.22, 0.13);
    site.add('painted', colors.paint, x + side * length * 0.33, base + 1.91, z + 1.31, 0.54, 0.12, 0.018);
    site.add('hardware', zinc, x + length * 0.5 + 0.026, base + 1.31, z + side * 0.57, 0.07, 2.13, 0.07);
  }
}

function crates(site: Site, x: number, z: number, seed: number): void {
  const random = randomSource(seed);
  for (let i = 0; i < 6; i++) {
    const width = 0.82 + random() * 0.29;
    const cx = x + i % 3 * 1.16;
    const cz = z + Math.floor(i / 3) * 0.93;
    for (let level = 0; level <= (i % 3 === 1 ? 1 : 0); level++) {
      const y = 0.37 + level * 0.62;
      site.add('painted', i % 2 === 0 ? colors.olive : khaki, cx, y, cz, width, 0.57, 0.77);
      site.add('painted', nearBlack, cx, y - 0.27, cz, width * 1.04, 0.06, 0.8);
      site.add('painted', nearBlack, cx, y + 0.28, cz, width * 1.06, 0.08, 0.81);
      site.add('hardware', zinc, cx, y + 0.21, cz + 0.39, 0.18, 0.08, 0.04);
    }
  }
}

function revetment(site: Site, x: number, z: number, count: number, yaw: number): void {
  for (let i = 0; i < count; i++) {
    const cx = x + Math.cos(yaw) * i * 2.85;
    const cz = z - Math.sin(yaw) * i * 2.85;
    site.add('concrete', i % 2 ? 0x928977 : 0x7d7a6c, cx, 0.46, cz, 2.68, 0.92, 1, yaw, 'barrier');
    for (let j = -2; j <= 2; j++) {
      const offset = j * 0.48;
      site.add('canvas', (i + j) % 3 ? khaki : 0x69634d, cx + Math.cos(yaw) * offset, 1.02,
        cz - Math.sin(yaw) * offset, 0.51, 0.24, 0.46, yaw + j * 0.07, 'bag');
    }
  }
}

function fence(site: Site, x: number, z: number, length: number, yaw: number): void {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  site.add('hardware', zinc, x, 0.33, z, length, 0.062, 0.07, yaw);
  site.add('hardware', zinc, x, 1.96, z, length, 0.062, 0.07, yaw);
  for (let u = -length / 2; u <= length / 2 + 0.1; u += 2.4) {
    site.add('hardware', zinc, x + u * cos, 1.01, z - u * sin, 0.11, 2.15, 0.11, yaw);
  }
  for (let u = -length / 2 + 0.45; u < length / 2 - 0.45; u += 0.82) {
    site.beam('hardware', zinc, 0.029, x + (u - 0.4) * cos, 0.35, z - (u - 0.4) * sin,
      x + (u + 0.4) * cos, 1.94, z - (u + 0.4) * sin);
    site.beam('hardware', zinc, 0.029, x + (u + 0.4) * cos, 0.35, z - (u + 0.4) * sin,
      x + (u - 0.4) * cos, 1.94, z - (u - 0.4) * sin);
  }
}

function floodlight(site: Site, x: number, z: number, yaw: number): void {
  site.add('concrete', 0x7b7669, x, 0.24, z, 0.65, 0.48, 0.65);
  site.add('hardware', zinc, x, 3.8, z, 0.19, 7.6, 0.19, yaw);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  site.add('hardware', nearBlack, x, 7.66, z, 2.18, 0.12, 0.14, yaw);
  for (const offset of [-0.72, 0, 0.72]) {
    site.add('painted', nearBlack, x + cos * offset, 7.51, z - sin * offset, 0.57, 0.3, 0.32, yaw);
    site.add('lamps', colors.paint, x + cos * offset + sin * 0.17, 7.49,
      z - sin * offset + cos * 0.17, 0.48, 0.17, 0.03, yaw);
  }
}

function sign(scene: T.Object3D, x: number, y: number, z: number, main: string, sub: string, width: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Die Beschilderung konnte nicht erzeugt werden.');
  c.fillStyle = '#333a37';
  c.fillRect(0, 0, 512, 128);
  c.strokeStyle = '#9d9982';
  c.lineWidth = 3;
  c.strokeRect(5, 5, 502, 118);
  c.fillStyle = '#aa8750';
  c.fillRect(15, 17, 12, 94);
  c.fillStyle = '#dfd7bf';
  c.font = 'bold 49px monospace';
  c.fillText(main, 44, 65, 449);
  c.font = '21px monospace';
  c.fillText(sub, 45, 99, 448);
  const random = randomSource(516);
  for (let i = 0; i < 1000; i++) {
    c.fillStyle = random() > 0.72 ? '#c2b99a40' : '#21252168';
    c.fillRect(random() * 512, random() * 128, 1 + random() * 4, 0.5 + random() * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const mesh = new T.Mesh(new T.PlaneGeometry(width, width / 4),
    new T.MeshStandardMaterial({ map: texture, roughness: 0.89 }));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function relay(scene: T.Object3D, site: Site): void {
  site.add('concrete', 0x777669, 21, 0.3, -68, 21, 0.6, 10.4);
  site.add('concrete', 0x727468, 21, 2.77, -68, 17.8, 4.94, 8.3);
  site.add('painted', colors.olive, 21, 5.2, -68, 18.6, 0.42, 8.85);
  site.add('painted', nearBlack, 21, 3.72, -63.8, 12.4, 0.89, 0.15);
  for (let i = 0; i < 12; i++) {
    const x = 15.3 + i * 1.03;
    site.add('painted', i % 4 ? 0x4e6665 : 0x83938a, x, 3.72, -63.7, 0.91, 0.69, 0.055);
    site.add('hardware', zinc, x - 0.51, 3.72, -63.65, 0.075, 0.87, 0.1);
  }
  for (const x of [12.1, 29.9]) {
    site.add('concrete', 0x929082, x, 2.8, -63.75, 0.65, 4.6, 0.57);
    site.add('lamps', colors.paint, x, 4.29, -63.41, 0.29, 0.13, 0.08);
  }
  sign(scene, 21.4, 2.28, -63.73, 'BOREAL RELAY', 'FORWARD OPERATING BASE 02', 5.2);
  site.add('painted', colors.olive, 24, 6.78, -70.2, 6.2, 2.7, 4.1);
  site.add('painted', nearBlack, 24, 8.24, -70.2, 6.55, 0.29, 4.28);
  site.add('painted', zinc, 24, 8.62, -70.4, 2.78, 0.62, 2.5);
  site.add('painted', nearBlack, 24, 9.04, -70.4, 1.4, 0.27, 1.52);
  site.add('painted', 0xa6a795, 24, 9.77, -70.3, 4.1, 3.1, 1.95, 0.23, 'dish');
  site.beam('hardware', zinc, 0.17, 24, 9.52, -70.3, 24.37, 10.47, -68.97);
  site.add('lamps', 0xffb77a, 24.37, 10.47, -68.97, 0.17, 0.16, 0.15);

  const mastX = 34;
  const mastZ = -71;
  for (const side of [-1, 1]) {
    for (const depth of [-1, 1]) {
      site.beam('hardware', zinc, 0.14, mastX + side * 1.3, 0, mastZ + depth * 1.3,
        mastX + side * 0.43, 16.7, mastZ + depth * 0.43);
    }
  }
  for (let i = 0; i < 9; i++) {
    const y = 0.5 + i * 1.8;
    const b = 1.3 - i * 0.093;
    for (const side of [-1, 1]) {
      site.add('hardware', zinc, mastX, y, mastZ + side * b, b * 2, 0.12, 0.1);
      site.add('hardware', zinc, mastX + side * b, y, mastZ, 0.1, 0.12, b * 2);
      site.beam('hardware', zinc, 0.08, mastX - b, y, mastZ + side * b,
        mastX + b - 0.09, y + 1.8, mastZ + side * (b - 0.09));
      site.beam('hardware', zinc, 0.08, mastX + side * b, y, mastZ - b,
        mastX + side * (b - 0.09), y + 1.8, mastZ + b - 0.09);
    }
  }
  site.add('painted', wornRed, mastX, 17.45, mastZ, 0.82, 1.49, 0.82);
  site.add('painted', colors.paint, mastX, 17.46, mastZ, 0.86, 0.42, 0.86);
  site.add('lamps', 0xffb261, mastX, 18.29, mastZ, 0.26, 0.2, 0.26);
  site.add('hardware', zinc, mastX, 19.22, mastZ, 0.055, 1.76, 0.055);
  site.add('painted', 0xb5b3a0, mastX - 0.95, 15.9, mastZ, 0.23, 2.15, 0.37);
  site.add('painted', 0xb5b3a0, mastX + 0.95, 14.9, mastZ, 0.23, 2.15, 0.37);
  floodlight(site, 5.6, -perimeter, 0.07);
  floodlight(site, 36, -perimeter, -0.2);
  crates(site, 31.1, -64.4, 746);
  revetment(site, 15, -perimeter + 0.7, 7, 0);
  fence(site, 46, -perimeter, 19.2, 0);
}

function garage(scene: T.Object3D, site: Site): void {
  const x = -23;
  site.add('concrete', 0x797668, x, 0.34, -70, 24.5, 0.68, 13.1);
  site.add('painted', 0x56584c, x, 3, -70, 23, 5.6, 12);
  for (let i = 0; i < 5; i++) {
    site.add('painted', 0x656759, x, 5.8 + i * 0.29, -70, 23.5 + (i % 2) * 0.16, 0.3, 12.6 - i * 2.17);
  }
  for (const cx of [x - 7.7, x, x + 7.7]) {
    site.add('hardware', nearBlack, cx, 2.29, -63.99, 6.8, 3.65, 0.12);
    for (let r = 0; r < 17; r++) {
      site.add('painted', r % 4 === 0 ? 0x5e6257 : 0x53584f, cx, 0.61 + r * 0.198, -63.88, 6.66, 0.16, 0.09);
    }
    site.add('painted', colors.amber, cx - 3.49, 1.68, -63.8, 0.17, 2.26, 0.15);
    site.add('painted', colors.amber, cx + 3.49, 1.68, -63.8, 0.17, 2.26, 0.15);
    site.add('lamps', colors.paint, cx, 4.16, -63.89, 0.62, 0.14, 0.12);
  }
  sign(scene, -23, 4.93, -63.94, 'LOGISTICS', 'WORKSHOP / MOTOR POOL', 4.0);
  container(site, -42, -66.8, 11.8, colors.olive);
  container(site, -43.6, -67.3, 5.9, wornRed, 2.55);
  revetment(site, -51, -perimeter + 0.25, 6, 0);
  floodlight(site, -36, -perimeter, 0.13);
  floodlight(site, -10, -perimeter, -0.19);
  crates(site, -45, -63.4, 781);
}

function east(site: Site): void {
  fence(site, perimeter, -28, 48, Math.PI / 2);
  fence(site, perimeter, 35.5, 33.6, Math.PI / 2);
  revetment(site, perimeter + 0.4, 27, 5, Math.PI / 2);
  for (const z of [-17, -4, 4]) {
    site.add('concrete', 0x7f7c6c, 68, 0.27, z, 9.2, 0.54, 6.4);
    site.add('painted', zinc, 68, 2.82, z, 5.7, 4.5, 4.8, 0, 'cylinder');
    site.add('painted', 0x8d8271, 68, 3.35, z, 5.76, 0.19, 4.86, 0, 'cylinder');
    site.beam('hardware', wornRed, 0.25, 66, 4.2, z, 65, 2.0, z);
    site.add('hardware', wornRed, 64.2, 2, z, 1.6, 0.23, 0.23);
  }
  site.add('hardware', wornRed, 64.2, 2, -6, 0.22, 0.22, 23);
  floodlight(site, 63.4, -18, -Math.PI / 2);
  floodlight(site, 63.4, 34, -Math.PI / 2);
  crates(site, 64, 28, 74);
}

function west(site: Site): void {
  fence(site, -perimeter, -25, 48, -Math.PI / 2);
  fence(site, -perimeter, 35, 33.6, -Math.PI / 2);
  revetment(site, -perimeter, -43, 8, -Math.PI / 2);
  revetment(site, -perimeter, 28, 7, -Math.PI / 2);
  container(site, -69, -9, 11.8, 0x584e40);
  container(site, -68.8, -12, 11.8, colors.olive);
  // Sheared pipe rack and broken roof supports on the outside apron.
  for (let i = 0; i < 8; i++) {
    const z = 12 + i * 2.35;
    site.add('concrete', 0x857b67, -66, 0.23, z, 0.86, 0.46, 0.78);
    site.beam('hardware', zinc, 0.16, -66, 0.45, z, -66 + (i % 3 === 0 ? 0.82 : 0.06), 3.4 - (i % 3) * 0.51, z + i * 0.1);
  }
  site.beam('painted', wornRed, 0.36, -66, 3.15, 12, -65.2, 1.2, 18);
  site.beam('painted', wornRed, 0.36, -65.3, 1.86, 21.4, -64.4, 0.20, 27.5);
  floodlight(site, -63, -19, Math.PI / 2);
  floodlight(site, -63, 36, Math.PI / 2);
}

function south(site: Site): void {
  fence(site, -29.5, perimeter, 48, Math.PI);
  fence(site, 35, perimeter, 33.6, Math.PI);
  revetment(site, 52, perimeter + 0.4, 11, Math.PI);
  container(site, 37, 65.8, 11.8, colors.olive);
  container(site, -30, 65.8, 11.8, 0x595546);
  container(site, -43, 65.8, 5.9, 0x63685d);
  crates(site, -16, 63.6, 3215);
  floodlight(site, 17, 63.4, Math.PI);
  floodlight(site, -7, 63.4, Math.PI);
}

export function createBase(scene: T.Object3D, materials: SurfaceMaterials): void {
  const shapes = baseShapes();
  for (const build of [
    (site: Site) => relay(scene, site),
    (site: Site) => garage(scene, site),
    east, west, south,
  ]) {
    const site = new Site();
    build(site);
    site.attach(scene, shapes, materials);
  }
}

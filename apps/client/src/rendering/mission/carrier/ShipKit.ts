import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** How a material maps its texture: projected from world space (tiles seamlessly across parts) or the geometry's own UVs. */
export interface KitMaterialData { tile?: number; local?: boolean }

/**
 * Marker for a colour variant of a shared base material. The kit draws such parts with the base material and carries
 * the colour in the vertex colours, so all variants of a family merge into one draw call.
 */
export function variant(base: T.Material, color: T.ColorRepresentation, intensity = 1): T.Material {
  const marker = new T.MeshBasicMaterial({ visible: false });
  marker.userData = { base, tint: new T.Color(color).multiplyScalar(intensity) };
  return marker;
}

const unitBox = new T.BoxGeometry(1, 1, 1);
const cylinders = new Map<string, T.BufferGeometry>();
const scratch = new T.Matrix4();
const rotation = new T.Euler();
const quaternion = new T.Quaternion();
const position = new T.Vector3();
const scale = new T.Vector3();
const normal = new T.Vector3();
const vertex = new T.Vector3();
const tint = new T.Color();

function cylinderGeometry(segments: number, open: boolean, taper: number): T.BufferGeometry {
  const key = segments + ':' + open + ':' + taper;
  let geometry = cylinders.get(key);
  if (!geometry) {
    geometry = new T.CylinderGeometry(.5 * taper, .5, 1, segments, 1, open);
    cylinders.set(key, geometry);
  }
  return geometry;
}

export interface PartOptions {
  /** Vertex tint multiplied with the material colour. */
  tint?: T.ColorRepresentation;
  /** Random brightness spread per part (0.05 = ±5 %), breaks up repeated panels. */
  vary?: number;
  pitch?: number;
  roll?: number;
}

/**
 * Static ship geometry: parts are collected per zone and material and merged into one mesh each, so a zone costs one
 * draw call per material and still frustum-culls as a whole. Vertex colours carry a tint per part and a baked
 * darkening towards the deck and into corners, which grounds walls and props without real ambient occlusion.
 */
export class ShipKit {
  zone = 'main';
  /** Small clutter: goes to the zone's detail mesh, which is hidden on Low quality. */
  fine = false;
  private readonly parts = new Map<string, Map<T.Material, T.BufferGeometry[]>>();
  private readonly frames: T.Matrix4[] = [];
  private frame = new T.Matrix4();
  private seed = 0x6d2b79f5;

  random(): number {
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed) + 0x9e3779b9) >>> 0;
    return ((this.seed ^ (this.seed >>> 13)) >>> 0) / 4294967296;
  }

  /** Builds small clutter (hidden on Low quality). */
  detail(build: () => void): void {
    const previous = this.fine;
    this.fine = true;
    try { build(); } finally { this.fine = previous; }
  }

  /** Builds the following parts in a local frame (position and yaw), e.g. one prop. */
  push(x: number, y: number, z: number, yaw = 0): this {
    this.frames.push(this.frame);
    this.frame = this.frame.clone().multiply(scratch.compose(position.set(x, y, z), quaternion.setFromAxisAngle(T.Object3D.DEFAULT_UP, yaw),
      scale.set(1, 1, 1)));
    return this;
  }

  pop(): this {
    this.frame = this.frames.pop() ?? new T.Matrix4();
    return this;
  }

  /** Box centred at (x, y, z) with size (w, h, d), turned by yaw (then pitch about x, roll about z). */
  box(material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, options?: PartOptions): void {
    rotation.set(options?.pitch ?? 0, yaw, options?.roll ?? 0, 'YXZ');
    const matrix = new T.Matrix4().compose(position.set(x, y, z), quaternion.setFromEuler(rotation), scale.set(w, h, d));
    this.add(material, unitBox, matrix, options);
  }

  /** Cylinder along an axis, centred at (x, y, z). taper = top radius / bottom radius. */
  cylinder(material: T.Material, x: number, y: number, z: number, radius: number, length: number,
    axis: 'x' | 'y' | 'z' = 'y', segments = 14, options?: PartOptions & { open?: boolean; taper?: number; yaw?: number }): void {
    rotation.set(axis === 'z' ? Math.PI / 2 : 0, options?.yaw ?? 0, axis === 'x' ? Math.PI / 2 : 0, 'YXZ');
    const matrix = new T.Matrix4().compose(position.set(x, y, z), quaternion.setFromEuler(rotation), scale.set(radius * 2, length, radius * 2));
    this.add(material, cylinderGeometry(segments, options?.open ?? false, options?.taper ?? 1), matrix, options);
  }

  /** Straight run between two points (pipes, cables, rails). */
  rod(material: T.Material, from: readonly [number, number, number], to: readonly [number, number, number], radius: number,
    segments = 8, options?: PartOptions): void {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const length = a.distanceTo(b);
    if (length < 1e-4) return;
    const direction = b.clone().sub(a).normalize();
    const matrix = new T.Matrix4().compose(a.add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP, direction),
      scale.set(radius * 2, length, radius * 2));
    this.add(material, cylinderGeometry(segments, true, 1), matrix, options);
  }

  /** Rectangular member between two points (struts, braces, rails). The cross-section keeps x horizontal where it can. */
  beam(material: T.Material, from: readonly [number, number, number], to: readonly [number, number, number], width: number,
    depth = width, options?: PartOptions): void {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const length = a.distanceTo(b);
    if (length < 1e-4) return;
    const axis = b.clone().sub(a).normalize();
    // Basis: y along the member, x horizontal and perpendicular to it (or world x for vertical members).
    const side = Math.abs(axis.y) > .99 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0).cross(axis).normalize();
    const up = axis.clone().cross(side).normalize();
    const matrix = new T.Matrix4().makeBasis(side.multiplyScalar(width), axis.clone().multiplyScalar(length), up.multiplyScalar(-depth));
    matrix.setPosition(a.add(b).multiplyScalar(.5));
    this.add(material, unitBox, matrix, options);
  }

  /** Any geometry with its own transform (in the current local frame). */
  add(material: T.Material, geometry: T.BufferGeometry, matrix: T.Matrix4, options?: PartOptions): void {
    const family = material.userData as { base?: T.Material; tint?: T.Color };
    const base = family.base ? family.tint : undefined;
    if (family.base) material = family.base;
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    part.applyMatrix4(scratch.multiplyMatrices(this.frame, matrix));
    const source = part.getAttribute('color');
    for (const name of Object.keys(part.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') part.deleteAttribute(name);
    if (!part.getAttribute('uv')) part.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(part.getAttribute('position').count * 2), 2));
    tint.set(options?.tint ?? 0xffffff);
    if (base) tint.multiply(base);
    const spread = options?.vary ?? .035;
    const k = 1 + (this.random() * 2 - 1) * spread;
    const count = part.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = source ? source.getX(i) : 1, g = source ? source.getY(i) : 1, b = source ? source.getZ(i) : 1;
      colors.set([tint.r * k * r, tint.g * k * g, tint.b * k * b], i * 3);
    }
    part.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    const name = this.fine && !this.zone.startsWith('detail') ? 'detail:' + this.zone : this.zone;
    let zone = this.parts.get(name);
    if (!zone) this.parts.set(name, zone = new Map());
    let list = zone.get(material);
    if (!list) zone.set(material, list = []);
    list.push(part);
  }

  /** Bakes the visible meshes of a built model (e.g. a parked lander) into the kit, keeping their materials. */
  bake(object: T.Object3D): void {
    object.updateMatrixWorld(true);
    object.traverseVisible((child) => {
      if (!(child instanceof T.Mesh) || child instanceof T.InstancedMesh || Array.isArray(child.material)) return;
      this.add(child.material, child.geometry, child.matrixWorld, { vary: 0 });
    });
  }

  /** Merges every zone and material into one mesh each and adds them to parent. */
  finish(parent: T.Object3D, groups?: Map<string, T.Object3D>): T.Mesh[] {
    const meshes: T.Mesh[] = [];
    for (const [zone, materials] of this.parts) {
      for (const [material, list] of materials) {
        const geometry = mergeGeometries(list, false);
        for (const part of list) part.dispose();
        if (!geometry) continue;
        project(geometry, material.userData as KitMaterialData);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        const mesh = new T.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.name = 'carrier:' + zone;
        (groups?.get(zone) ?? (zone.startsWith('detail') ? groups?.get('detail') : undefined) ?? parent).add(mesh);
        meshes.push(mesh);
      }
    }
    this.parts.clear();
    return meshes;
  }
}

/**
 * World-space box projection: walls take (horizontal, height), floors and ceilings (x, z), scaled to the material tile.
 * Vertex colours are darkened towards the deck (contact shadow) and slightly towards high ceilings.
 */
function project(geometry: T.BufferGeometry, data: KitMaterialData): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  const colors = geometry.getAttribute('color');
  const tile = data.tile ?? 2;
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    normal.fromBufferAttribute(normals, i);
    if (!data.local && data.tile !== undefined) {
      const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
      if (ay >= ax && ay >= az) uvs.setXY(i, vertex.x / tile, vertex.z / tile);
      else if (ax >= az) uvs.setXY(i, vertex.z * Math.sign(normal.x || 1) / tile, vertex.y / tile);
      else uvs.setXY(i, -vertex.x * Math.sign(normal.z || 1) / tile, vertex.y / tile);
    }
    // Floors and table tops keep their colour; sides darken towards the deck.
    const ground = normal.y > .7 ? 1 : .6 + .4 * T.MathUtils.smoothstep(vertex.y, -.05, .8);
    const up = normal.y < -.5 ? .9 : 1;
    colors.setXYZ(i, colors.getX(i) * ground * up, colors.getY(i) * ground * up, colors.getZ(i) * ground * up);
  }
  uvs.needsUpdate = true;
  colors.needsUpdate = true;
}

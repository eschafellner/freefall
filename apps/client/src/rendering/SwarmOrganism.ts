import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Procedural mesh kit shared by all swarm creatures (Schabe, Jäger, Durchbruchskäfer): colour helpers, a Catmull-Rom
 * profile curve and the Organism builder that merges organic parts with the vertex data the swarm materials read.
 */

export type Vec3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

/** Per-vertex finish of the organic Schabe surface. */
export interface Tissue {
  color: RGB;
  /** Roughness factor (lower is wetter and glossier). */
  gloss?: number;
  /** Self-illumination in the own colour (eyes). */
  glow?: number;
  /** 0 hard chitin … 1 soft, translucent membrane. */
  membrane?: number;
  /** Abdomen breathing weight. */
  breath?: number;
  /** Antenna sway weight (0 base … 1 tip). */
  sway?: number;
  /** Vein pattern strength (wing pads). */
  veins?: number;
}

export const hex = (value: number): RGB => {
  const c = new T.Color(value);
  return [c.r, c.g, c.b];
};
export const blend = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Catmull-Rom through sorted keys [x, ...values]; ends are clamped. */
export function curve(keys: readonly (readonly number[])[], x: number, channel: number): number {
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = Math.min(1, Math.max(0, (x - k1[0]) / (k2[0] - k1[0])));
  const p0 = k0[channel], p1 = k1[channel], p2 = k2[channel], p3 = k3[channel];
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Collects organic parts with smooth normals and the vertex data the Schabe material reads: colour, surface
 * (roughness factor, glow), rig (gait phase, weight from the hip) and tissue (breath, sway, membrane, veins).
 */
export class Organism {
  private readonly parts: T.BufferGeometry[] = [];
  rig?: (p: T.Vector3) => readonly [number, number];
  /**
   * Limb rig for the warrior castes: role, gait phase offset, weight from the root (0) to the tip (1) and side, plus
   * the root joint the vertex swings about. Only geometries built with `limbs` carry the attributes.
   */
  joint?: { role: number; phase: number; side: number; pivot: Vec3; reach: number };
  private readonly limbs: boolean;

  constructor(options: { limbs?: boolean } = {}) {
    this.limbs = options.limbs ?? false;
  }

  /** `paint` receives the vertex index of the (indexed) source as its third argument. */
  add(source: T.BufferGeometry, paint: (p: T.Vector3, n: T.Vector3, vertex: number) => Tissue): void {
    if (!source.getAttribute('normal')) source.computeVertexNormals();
    const lattice = source.index ? Array.from(source.index.array) : undefined;
    const part = source.index ? source.toNonIndexed() : source;
    if (part !== source) source.dispose();
    part.deleteAttribute('uv');
    const position = part.getAttribute('position'), normal = part.getAttribute('normal');
    const count = position.count;
    const color = new Float32Array(count * 3), surface = new Float32Array(count * 2);
    const rig = new Float32Array(count * 2), tissue = new Float32Array(count * 4);
    const limb = this.limbs ? new Float32Array(count * 4) : undefined, pivot = this.limbs ? new Float32Array(count * 3) : undefined;
    const p = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(position, i);
      n.fromBufferAttribute(normal, i);
      const finish = paint(p, n, lattice ? lattice[i] : i);
      color.set(finish.color, i * 3);
      surface.set([finish.gloss ?? .6, finish.glow ?? 0], i * 2);
      if (this.rig) rig.set(this.rig(p), i * 2);
      tissue.set([finish.breath ?? 0, finish.sway ?? 0, finish.membrane ?? 0, finish.veins ?? 0], i * 4);
      if (limb && pivot) {
        const joint = this.joint;
        if (joint) {
          const weight = Math.min(1, Math.hypot(p.x - joint.pivot[0], p.y - joint.pivot[1], p.z - joint.pivot[2]) / joint.reach);
          limb.set([joint.role, joint.phase, weight, joint.side], i * 4);
          pivot.set(joint.pivot, i * 3);
        } else {
          pivot.set([p.x, p.y, p.z], i * 3);
        }
      }
    }
    part.setAttribute('color', new T.BufferAttribute(color, 3));
    part.setAttribute('surface', new T.BufferAttribute(surface, 2));
    part.setAttribute('rig', new T.BufferAttribute(rig, 2));
    part.setAttribute('tissue', new T.BufferAttribute(tissue, 4));
    if (limb && pivot) {
      part.setAttribute('limb', new T.BufferAttribute(limb, 4));
      part.setAttribute('pivot', new T.BufferAttribute(pivot, 3));
    }
    this.parts.push(part);
  }

  /** Tapered limb between points; `bulge` swells the middle like a muscled femur. */
  limb(from: Vec3, to: Vec3, start: number, end: number, radial: number, rows: number, bulge: number,
    paint: (p: T.Vector3, n: T.Vector3, t: number) => Tissue): void {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const length = a.distanceTo(b);
    const geometry = new T.CylinderGeometry(1, 1, length, radial, rows, true);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const t = position.getY(i) / length + .5;
      const r = (start + (end - start) * t) * (1 + bulge * Math.sin(Math.PI * t));
      position.setXYZ(i, position.getX(i) * r, position.getY(i), position.getZ(i) * r);
    }
    geometry.computeVertexNormals();
    geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geometry, (p, n) => paint(p, n, Math.min(1, Math.max(0, p.clone().sub(a).dot(b.clone().sub(a)) / (length * length)))));
  }

  /** Chain of limbs through the points, radius tapering from `start` to `end`. */
  chain(points: readonly Vec3[], start: number, end: number, radial: number, paint: (p: T.Vector3, n: T.Vector3, t: number) => Tissue,
    knuckles = false): void {
    const last = points.length - 1;
    for (let i = 0; i < last; i++) {
      const r0 = start + (end - start) * i / last, r1 = start + (end - start) * (i + 1) / last;
      this.limb(points[i], points[i + 1], r0, r1 * (knuckles ? .82 : 1), radial, 1, 0, (p, n, t) => paint(p, n, (i + t) / last));
      if (knuckles && i > 0) this.add(new T.SphereGeometry(r0 * 1.12, radial, 3).translate(...points[i]), (p, n) => paint(p, n, i / last));
    }
  }

  ellipsoid(center: Vec3, radii: Vec3, widthSegments: number, heightSegments: number, paint: (p: T.Vector3, n: T.Vector3) => Tissue,
    rotation: Vec3 = [0, 0, 0], cover = 1): void {
    const geometry = new T.SphereGeometry(1, widthSegments, heightSegments, 0, Math.PI * 2, 0, Math.PI * cover);
    geometry.scale(...radii);
    geometry.computeVertexNormals();
    geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
    geometry.translate(...center);
    this.add(geometry, paint);
  }

  /**
   * Shell from a (partial) unit sphere: `deform` reshapes the unit point before scaling, so crests, grooves, lips and
   * notches follow the shell. Even segment counts keep the shell mirror-symmetric.
   */
  shell(center: Vec3, radii: Vec3, widthSegments: number, heightSegments: number, cover: number, rotation: Vec3,
    deform: (u: T.Vector3) => void, paint: (p: T.Vector3, n: T.Vector3, u: T.Vector3) => Tissue): void {
    const geometry = new T.SphereGeometry(1, widthSegments, heightSegments, 0, Math.PI * 2, 0, Math.PI * cover);
    const position = geometry.getAttribute('position');
    const units: T.Vector3[] = [];
    const u = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      u.fromBufferAttribute(position, i);
      units.push(u.clone());
      deform(u);
      position.setXYZ(i, u.x * radii[0], u.y * radii[1], u.z * radii[2]);
    }
    geometry.computeVertexNormals();
    geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
    geometry.translate(...center);
    this.add(geometry, (p, n, vertex) => paint(p, n, units[vertex]));
  }

  geometry(): T.BufferGeometry {
    const merged = mergeGeometries(this.parts)!;
    for (const part of this.parts) part.dispose();
    return merged;
  }
}

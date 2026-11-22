import * as T from 'three';
import { bakeOcclusion, combineParts, paintedPart } from './AgentMeshes.ts';

type Vec3 = readonly [number, number, number];

/**
 * Builds a procedural model from rounded primitives. Every part carries a vertex colour, a `surface` attribute
 * (roughness factor, glow) set through `gloss` and `glow`, and optionally a `rig` attribute for vertex animation.
 */
export class ModelParts {
  /** Roughness factor for the following parts: 1 matte fabric, ~.6 polymer plates, ~.4 glass or chitin. */
  gloss = 1;
  /** Self-illumination of the following parts in their own colour. */
  glow = 0;
  /** Per-vertex rig data for the following parts (only kept when the builder was created with `rig`). */
  rig?: (x: number, y: number, z: number) => readonly [number, number];
  private readonly parts: T.BufferGeometry[] = [];
  private readonly contact: number;
  private readonly occlusion: number;
  private readonly rigged: boolean;

  constructor({ contact = .012, occlusion = 1, rig = false } = {}) {
    this.contact = contact;
    this.occlusion = occlusion;
    this.rigged = rig;
  }

  /** Rounded box. `bevel` rounds every edge; 0 keeps a sharp box. */
  box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, bevel = 0, pitch = 0, roll = 0): void {
    let part: T.BufferGeometry;
    if (bevel > .005 && Math.min(w, h, d) > .02) {
      const bevelSize = Math.min(bevel, w / 2 - .0005, h / 2 - .0005, d / 2 - .0005);
      const a = w / 2 - bevelSize;
      const b = h / 2 - bevelSize;
      const r = Math.min(bevelSize * .9, a * .9, b * .9);
      const outline = new T.Shape();
      if (r > .0004) {
        outline.moveTo(-a + r, -b).lineTo(a - r, -b).quadraticCurveTo(a, -b, a, -b + r).lineTo(a, b - r)
          .quadraticCurveTo(a, b, a - r, b).lineTo(-a + r, b).quadraticCurveTo(-a, b, -a, b - r).lineTo(-a, -b + r)
          .quadraticCurveTo(-a, -b, -a + r, -b);
      } else outline.moveTo(-a, -b).lineTo(a, -b).lineTo(a, b).lineTo(-a, b).closePath();
      part = new T.ExtrudeGeometry(outline, {
        // Large plates get a second bevel ring; small parts stay light.
        depth: Math.max(.0002, d - 2 * bevelSize), bevelSize, bevelThickness: bevelSize,
        bevelSegments: Math.min(w, h, d) > .09 ? 2 : 1, curveSegments: Math.max(w, h) > .12 ? 2 : 1, steps: 1,
      }).translate(0, 0, -d / 2 + bevelSize);
    } else {
      part = new T.BoxGeometry(w, h, d);
    }
    this.add(part.rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  /** Ellipsoid; without `detail` the tessellation follows its size (small parts get fewer segments). */
  oval(color: number, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0, roll = 0, detail?: number): void {
    const level = detail ?? Math.min(1, Math.max(.4, Math.max(w, h, d) / .16));
    this.add(new T.SphereGeometry(1, Math.max(5, Math.round(14 * level)), Math.max(4, Math.round(10 * level))).scale(w / 2, h / 2, d / 2)
      .rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  /** Upper part of an ellipsoid (helmet shells, pads). `cover` is the covered fraction of the height (0–1). */
  dome(color: number, x: number, y: number, z: number, w: number, h: number, d: number, cover = .5, pitch = 0, roll = 0): void {
    this.add(new T.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * cover).scale(w / 2, h / 2, d / 2)
      .rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  tube(color: number, x: number, y: number, z: number, top: number, bottom: number, length: number, pitch = 0, roll = 0, radial = 12): void {
    this.add(new T.CylinderGeometry(top, bottom, length, radial).rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  capsule(color: number, x: number, y: number, z: number, radius: number, length: number, pitch = 0, roll = 0): void {
    this.add(new T.CapsuleGeometry(radius, Math.max(.0001, length - radius * 2), 3, 10).rotateX(pitch).rotateZ(roll)
      .translate(x, y, z), color);
  }

  /** Tapered limb segment between two points; `joint` adds a rounded knuckle at the start. */
  segment(color: number, from: Vec3, to: Vec3, start: number, end: number, radial = 6, joint = true): void {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    const length = a.distanceTo(b);
    const geometry = new T.CylinderGeometry(end, start, length, radial, 1, true);
    geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geometry, color);
    if (joint) this.add(new T.SphereGeometry(Math.max(start, end) * 1.12, radial, 3).translate(a.x, a.y, a.z), color);
  }

  mesh(material: T.Material): T.Mesh<T.BufferGeometry, T.Material> {
    return new T.Mesh(this.geometry(), material);
  }

  geometry(): T.BufferGeometry {
    bakeOcclusion(this.parts, this.contact, this.occlusion);
    return combineParts(this.parts);
  }

  private add(geometry: T.BufferGeometry, color: number): void {
    geometry.deleteAttribute('uv');
    const part = paintedPart(geometry, color, [this.gloss, this.glow]);
    if (this.rigged) {
      const positions = part.getAttribute('position');
      const values = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        values.set(this.rig ? this.rig(positions.getX(i), positions.getY(i), positions.getZ(i)) : [0, 0], i * 2);
      }
      part.setAttribute('rig', new T.BufferAttribute(values, 2));
    }
    this.parts.push(part);
  }
}

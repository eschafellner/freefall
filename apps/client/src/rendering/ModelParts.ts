import * as T from 'three';
import { bakeOcclusion, combineParts, paintedPart } from './AgentMeshes.ts';

type Vec3 = readonly [number, number, number];

/** Up to four bone influences of one vertex: bone indices and weights (normalised by the builder). */
export type SkinInfluence = readonly (readonly [bone: number, weight: number])[];

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
  /**
   * Skin weights for the following parts, evaluated at the final (offset) vertex position. Only used when the builder
   * was created with `skinned`; every part then carries `skinIndex` and `skinWeight` for a `SkinnedMesh`.
   */
  skin?: (x: number, y: number, z: number) => SkinInfluence;
  /** Translation added to the following parts (e.g. a bone's bind position, so pieces are authored bone-local). */
  readonly offset = new T.Vector3();
  /** Multiplies the colour of the following parts (seams, worn edges). */
  shade = 1;
  private readonly parts: T.BufferGeometry[] = [];
  /** Parts that neither cast nor receive the baked seam occlusion (large lofted bodies that enclose other parts). */
  private readonly plain: T.BufferGeometry[] = [];
  private readonly contact: number;
  private readonly occlusion: number;
  private readonly rigged: boolean;
  private readonly skinned: boolean;

  constructor({ contact = .012, occlusion = 1, rig = false, skinned = false } = {}) {
    this.contact = contact;
    this.occlusion = occlusion;
    this.rigged = rig;
    this.skinned = skinned;
  }

  /** Adds a prepared geometry (positions and normals) with the current colour, surface, offset and skin settings. */
  custom(geometry: T.BufferGeometry, color: number, occlude = true): void {
    this.add(geometry, color, occlude);
  }

  /** Number of parts added so far. */
  get size(): number { return this.parts.length + this.plain.length; }

  /** Rounded box. `bevel` rounds every edge; 0 keeps a sharp box. Rotations apply as pitch (X), roll (Z), yaw (Y). */
  box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, bevel = 0, pitch = 0, roll = 0, yaw = 0): void {
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
    part.rotateX(pitch).rotateZ(roll);
    if (yaw) part.rotateY(yaw);
    this.add(part.translate(x, y, z), color);
  }

  /**
   * Side-profile prism: a polygon of `[z, y]` points (as seen from the right), extruded `width` across x and centred
   * on `x`. For slanted receivers and housings that a box cannot follow. `bevel` rounds the outline edges.
   */
  profile(color: number, points: readonly (readonly [number, number])[], width: number, x = 0, bevel = 0): void {
    const depth = Math.max(.0002, width - 2 * bevel);
    const part = new T.ExtrudeGeometry(new T.Shape(points.map(([z, y]) => new T.Vector2(z, y))), {
      depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 1, steps: 1,
    });
    // Shape x becomes model z, the extrusion runs across model x.
    this.add(part.translate(0, 0, -depth / 2).rotateY(-Math.PI / 2).translate(x, 0, 0), color);
  }

  /** Ellipsoid; without `detail` the tessellation follows its size (small parts get fewer segments). */
  oval(color: number, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0, roll = 0, detail?: number): void {
    const level = detail ?? Math.min(1, Math.max(.4, Math.max(w, h, d) / .16));
    this.add(new T.SphereGeometry(1, Math.max(5, Math.round(14 * level)), Math.max(4, Math.round(10 * level))).scale(w / 2, h / 2, d / 2)
      .rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  /** Upper part of an ellipsoid (helmet shells, pads). `cover` is the covered fraction of the height (0–1). */
  dome(color: number, x: number, y: number, z: number, w: number, h: number, d: number, cover = .5, pitch = 0, roll = 0, segments = 14): void {
    this.add(new T.SphereGeometry(1, segments, Math.max(6, Math.round(segments * .43)), 0, Math.PI * 2, 0, Math.PI * cover).scale(w / 2, h / 2, d / 2)
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
    return combineParts([...this.parts, ...this.plain]);
  }

  private add(geometry: T.BufferGeometry, color: number, occlude = true): void {
    geometry.deleteAttribute('uv');
    if (this.offset.lengthSq()) geometry.translate(this.offset.x, this.offset.y, this.offset.z);
    const part = paintedPart(geometry, color, [this.gloss, this.glow]);
    // Optional per-vertex brightness written by the geometry itself (lofts darken creases and undersides).
    const shading = part.getAttribute('shade');
    if (this.shade !== 1 || shading) {
      const colors = part.getAttribute('color');
      for (let i = 0; i < colors.count; i++) {
        const f = this.shade * (shading ? shading.getX(i) : 1);
        colors.setXYZ(i, colors.getX(i) * f, colors.getY(i) * f, colors.getZ(i) * f);
      }
      if (shading) part.deleteAttribute('shade');
    }
    if (this.skinned) {
      const positions = part.getAttribute('position');
      const index = new Uint16Array(positions.count * 4);
      const weight = new Float32Array(positions.count * 4);
      for (let i = 0; i < positions.count; i++) {
        const influences = this.skin ? this.skin(positions.getX(i), positions.getY(i), positions.getZ(i)) : [[0, 1] as const];
        // Strongest four, normalised.
        const top = [...influences].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
        top.forEach(([bone, w], k) => {
          index[i * 4 + k] = bone;
          weight[i * 4 + k] = w / total;
        });
        if (!top.length) weight[i * 4] = 1;
      }
      part.setAttribute('skinIndex', new T.Uint16BufferAttribute(index, 4));
      part.setAttribute('skinWeight', new T.BufferAttribute(weight, 4));
    }
    if (this.rigged) {
      const positions = part.getAttribute('position');
      const values = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        values.set(this.rig ? this.rig(positions.getX(i), positions.getY(i), positions.getZ(i)) : [0, 0], i * 2);
      }
      part.setAttribute('rig', new T.BufferAttribute(values, 2));
    }
    (occlude ? this.parts : this.plain).push(part);
  }
}

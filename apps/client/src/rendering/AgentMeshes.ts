import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bakes a flat colour into a non-indexed part. Optional per-vertex surface data: roughness factor and glow. */
export function paintedPart(geometry: T.BufferGeometry, color: number, surface?: readonly [number, number]): T.BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  const tint = new T.Color(color);
  const positions = part.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) tint.toArray(colors, i * 3);
  part.setAttribute('color', new T.BufferAttribute(colors, 3));
  if (surface) {
    const values = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) values.set(surface, i * 2);
    part.setAttribute('surface', new T.BufferAttribute(values, 2));
  }
  return part;
}

export function combineParts(parts: T.BufferGeometry[]): T.BufferGeometry {
  const result = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return result;
}

/**
 * Darkens vertices that sit in seams, under overlaps or face downward, and lifts upward faces slightly: a cheap,
 * baked ambient-occlusion substitute for procedural part meshes. `contact` is the seam width in metres.
 */
export function bakeOcclusion(parts: readonly T.BufferGeometry[], contact: number, strength = 1): void {
  const boxes = parts.map((part) => {
    part.computeBoundingBox();
    return part.boundingBox!;
  });
  const point = new T.Vector3();
  for (const [index, part] of parts.entries()) {
    const positions = part.getAttribute('position');
    const normals = part.getAttribute('normal');
    const colors = part.getAttribute('color');
    for (let v = 0; v < positions.count; v++) {
      point.fromBufferAttribute(positions, v);
      let occlusion = 0;
      for (const [other, box] of boxes.entries()) {
        if (other === index) continue;
        const distance = box.distanceToPoint(point);
        if (distance < contact) occlusion += (1 - distance / contact) * .22;
      }
      const ny = normals ? normals.getY(v) : 0;
      occlusion = Math.min(.38, occlusion) + Math.max(0, -ny) * .18;
      const shade = (1 - occlusion * strength) * (1 + Math.max(0, ny) * .07 * strength);
      colors.setXYZ(v, colors.getX(v) * shade, colors.getY(v) * shade, colors.getZ(v) * shade);
    }
  }
}

/**
 * Standard material that reads the optional `surface` attribute: x scales roughness (plates and chitin < 1),
 * y adds self-illumination in the vertex colour (status lights, eyes).
 */
export function surfaceMaterial(parameters: T.MeshStandardMaterialParameters): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial(parameters);
  material.customProgramCacheKey = () => 'part-surface-v1';
  material.onBeforeCompile = (shader) => applySurface(shader);
  return material;
}

export function applySurface(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
    #include <common>
    attribute vec2 surface;
    varying vec2 vSurface;
  `).replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vSurface = surface;
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
    #include <common>
    varying vec2 vSurface;
  `).replace('#include <roughnessmap_fragment>', `
    #include <roughnessmap_fragment>
    roughnessFactor *= vSurface.x > 0.0 ? vSurface.x : 1.0;
  `).replace('#include <emissivemap_fragment>', `
    #include <emissivemap_fragment>
    totalEmissiveRadiance += diffuseColor.rgb * vSurface.y;
  `);
}

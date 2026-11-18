import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function paintedPart(geometry: T.BufferGeometry, color: number): T.BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  const tint = new T.Color(color);
  const positions = part.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) tint.toArray(colors, i * 3);
  part.setAttribute('color', new T.BufferAttribute(colors, 3));
  return part;
}

export function combineParts(parts: T.BufferGeometry[]): T.BufferGeometry {
  const result = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return result;
}

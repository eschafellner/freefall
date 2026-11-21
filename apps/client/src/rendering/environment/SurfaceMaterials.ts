import * as T from 'three';
import { noise } from './noise.ts';

type Finish = 'soil' | 'concrete' | 'painted';

export function repeatSurfaceMap(data: Uint8Array, size: number, srgb = false): T.DataTexture {
  const texture = new T.DataTexture(data, size, size);
  texture.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function surfaceMaps(finish: Finish, anisotropy: number) {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(albedo.length);
  const normals = new Uint8Array(albedo.length);
  const relief = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const stains = noise(u * 5, v * 5, 72, 5);
      const aggregate = noise(u * 71, v * 71, 4, 71);
      const grains = noise(x, y, 49, size);
      const fleck = Math.max(0, aggregate - 0.67) * 2.9;
      const i = (y * size + x) * 4;
      const value = finish === 'soil' ? 165 + 55 * stains + 32 * grains + 85 * fleck :
        finish === 'concrete' ? 193 + 29 * stains + 18 * grains + 30 * fleck : 204 + 37 * stains + 12 * grains;
      albedo.set([Math.min(255, value), Math.min(255, value * 0.986), Math.min(255, value * 0.965), 255], i);
      const rough = finish === 'painted' ? 156 + 65 * stains : 207 + 32 * stains - 26 * fleck;
      roughness.set([rough, rough, rough, 255], i);
      relief[y * size + x] = finish === 'soil' ? aggregate * 0.63 + grains * 0.3 + fleck :
        aggregate * 0.22 + grains * 0.1;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = relief[y * size + (x + 1) % size] - relief[y * size + (x + size - 1) % size];
      const dy = relief[((y + 1) % size) * size + x] - relief[((y + size - 1) % size) * size + x];
      const n = Math.hypot(dx, dy, 1);
      normals.set([128 - 127 * dx / n, 128 - 127 * dy / n, 128 + 127 / n, 255], (y * size + x) * 4);
    }
  }
  const maps = { map: repeatSurfaceMap(albedo, size, true), normalMap: repeatSurfaceMap(normals, size),
    roughnessMap: repeatSurfaceMap(roughness, size) };
  for (const texture of Object.values(maps)) texture.anisotropy = anisotropy;
  return maps;
}

export function createSurfaceMaterials(renderer: T.WebGLRenderer) {
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const soilMaps = surfaceMaps('soil', anisotropy);
  const concreteMaps = surfaceMaps('concrete', anisotropy);
  const paintedMaps = surfaceMaps('painted', anisotropy);
  return {
    soil: new T.MeshStandardMaterial({
      ...soilMaps, vertexColors: true, roughness: 1, normalScale: new T.Vector2(0.9, 0.9),
    }),
    concrete: new T.MeshStandardMaterial({
      ...concreteMaps, roughness: 0.98, normalScale: new T.Vector2(0.45, 0.45),
    }),
    painted: new T.MeshStandardMaterial({
      ...paintedMaps, roughness: 0.87, metalness: 0.26, normalScale: new T.Vector2(0.35, 0.35),
    }),
    hardware: new T.MeshStandardMaterial({ roughness: 0.56, metalness: 0.62 }),
    canvas: new T.MeshStandardMaterial({ roughness: 0.96 }),
    lamps: new T.MeshStandardMaterial({
      color: 0xc4b892, emissive: 0xffd39b, emissiveIntensity: 0.75, roughness: 0.38,
    }),
  };
}

export type SurfaceMaterials = ReturnType<typeof createSurfaceMaterials>;

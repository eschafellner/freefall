import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { landscapeNoise, smoothstep } from './noise.ts';
import type { TraceDecal } from './WarTracePlacement.ts';

const SIZE = 128;

/** Procedural decal textures (no DOM): blast scorch and branching swarm resin. RGB colour, A coverage. */
function decalTexture(kind: TraceDecal['kind']): T.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const u = i / SIZE * 2 - 1, v = j / SIZE * 2 - 1;
    const r = Math.hypot(u, v), angle = Math.atan2(v, u);
    const n = landscapeNoise(u * 3 + 7, v * 3 + 3, kind === 'scorch' ? 11 : 23);
    let color: [number, number, number], alpha: number;
    if (kind === 'scorch') {
      // Dark blast centre, streaked ejecta rays, soft ragged edge.
      const rays = Math.pow(Math.abs(Math.sin(angle * 9 + n * 3)), 6) * smoothstep(1, .3, r);
      alpha = Math.min(.85, smoothstep(1, .4, r + (n - .5) * .35) * .72 + rays * .35);
      const shade = .06 + .1 * smoothstep(.1, .8, r) + .05 * n;
      color = [shade * 1.05, shade, shade * .9];
    } else {
      // Veins branching out from the centre over a translucent crust.
      const veins = Math.pow(Math.abs(Math.sin(angle * 7 + n * 9 + r * 6)), 18) + Math.pow(Math.abs(Math.sin(angle * 13 - n * 7)), 26) * .6;
      const crust = smoothstep(.75, .1, r + (n - .5) * .5);
      alpha = Math.min(.9, crust * .5 + veins * smoothstep(1, .2, r) * .8) * smoothstep(1, .85, r);
      const glow = veins * .18;
      color = [.14 + glow * .5 + n * .04, .1 + glow * .3, .07 + glow * .1];
    }
    const k = (j * SIZE + i) * 4;
    data[k] = Math.round(Math.min(1, color[0]) * 255);
    data[k + 1] = Math.round(Math.min(1, color[1]) * 255);
    data[k + 2] = Math.round(Math.min(1, color[2]) * 255);
    data[k + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  }
  const texture = new T.DataTexture(data, SIZE, SIZE, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  texture.name = 'decal:' + kind;
  return texture;
}

/** One merged mesh per decal kind, draped over the heightfield a few centimetres above the ground. */
export function createTerrainDecals(world: WorldDefinition, decals: readonly TraceDecal[]): { meshes: T.Mesh[]; textures: T.Texture[] } {
  const meshes: T.Mesh[] = [], textures: T.Texture[] = [];
  for (const kind of ['scorch', 'resin'] as const) {
    const list = decals.filter((decal) => decal.kind === kind);
    if (!list.length) continue;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (const decal of list) {
      const segments = Math.min(24, Math.max(8, Math.round(decal.radius * 1.5)));
      const base = positions.length / 3, cos = Math.cos(decal.yaw), sin = Math.sin(decal.yaw);
      for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) {
        const u = i / segments, v = j / segments;
        const lx = (u * 2 - 1) * decal.radius, lz = (v * 2 - 1) * decal.radius;
        const x = decal.x + lx * cos - lz * sin, z = decal.z + lx * sin + lz * cos;
        positions.push(x, groundHeight(world, x, z) + .035, z);
        uvs.push(u, v);
        if (i < segments && j < segments) {
          const a = base + j * (segments + 1) + i, b = a + 1, c = a + segments + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.name = 'decals/' + kind;
    const map = decalTexture(kind);
    textures.push(map);
    const material = new T.MeshStandardMaterial({
      name: 'Decal ' + kind, map, transparent: true, depthWrite: false, metalness: 0,
      roughness: kind === 'resin' ? .38 : .97, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Terrain decals ' + kind;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    meshes.push(mesh);
  }
  return { meshes, textures };
}

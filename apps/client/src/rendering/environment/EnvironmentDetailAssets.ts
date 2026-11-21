import * as T from 'three';
import { DETAIL_ASSETS } from './EnvironmentDetailPlacement.ts';
import type { DetailAssetId } from './EnvironmentDetailPlacement.ts';
import { randomSource } from './noise.ts';

type Point = readonly [number, number, number];

/** Local metre meshes with their origin at the contact point. All foliage is opaque cut geometry. */
export function detailGeometry(id: DetailAssetId): T.BufferGeometry {
  const info = DETAIL_ASSETS[id];
  const random = randomSource(7449 + Object.keys(DETAIL_ASSETS).indexOf(id) * 233);
  const positions: number[] = [];
  const colors: number[] = [];
  const triangle = (a: Point, b: Point, c: Point, shade: number) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(shade, shade, shade);
  };
  const leaf = (root: Point, tip: Point, width: number, shade: number, sharp = false) => {
    const dx = tip[0] - root[0], dz = tip[2] - root[2];
    const length = Math.hypot(dx, dz) || 1;
    const middle: Point = [root[0] + dx * .42, root[1] * .44 + tip[1] * .56, root[2] + dz * .42];
    const wing = (sign: number): Point => [
      middle[0] - sign * dz * width / length, middle[1] - width * .27, middle[2] + sign * dx * width / length,
    ];
    if (sharp) {
      triangle(wing(-1), wing(1), tip, shade);
      triangle(root, wing(1), wing(-1), shade * .78);
      return;
    }
    for (const sign of [-1, 1]) {
      const side = wing(sign);
      triangle(root, side, middle, shade * .81);
      triangle(middle, side, tip, shade * (sign < 0 ? .84 : 1));
    }
  };

  if (id === 'grass' || id === 'scrub' || id === 'forb' || id === 'fern') {
    const fern = id === 'fern', blades = fern ? 6 : id === 'grass' ? 11 : 7;
    for (let i = 0; i < blades; i++) {
      const angle = i * 2.39996 + random() * .35, x = Math.cos(angle), z = Math.sin(angle);
      const reach = info.radius * (.43 + random() * .43);
      const height = info.height * (.54 + random() * .46);
      const shade = .53 + random() * .46;
      if (fern) {
        const axis = (t: number): Point => [t * reach * x, height * Math.sin(t * 1.86), t * reach * z];
        leaf(axis(0), axis(.55), .012, shade, true);
        leaf(axis(.54), axis(1), .008, shade, true);
        for (let j = 0; j < 5; j++) {
          const t = .26 + j * .137;
          const [rx, ry, rz] = axis(t);
          for (const sign of [-1, 1]) {
            const wing = sign * reach * .38 * (1 - t);
            leaf([rx, ry, rz], [rx + x * reach * .14 - z * wing, ry - .024, rz + z * reach * .14 + x * wing],
              reach * .043 * (1 - t) + .005, shade * (.84 + random() * .14), true);
          }
        }
      } else {
        const loose = id === 'scrub';
        const root: Point = [x * reach * .18, -.02, z * reach * .18];
        const tip: Point = [x * reach, height, z * reach];
        leaf(root, tip, id === 'grass' ? .013 : loose ? .012 : .040, shade, id === 'grass');
        if (loose || id === 'forb') {
          leaf([tip[0] * .64, tip[1] * .50, tip[2] * .64],
            [tip[0] * .84 + z * .041, tip[1] * .67, tip[2] * .84 - x * .041], loose ? .009 : .025, shade * .87);
        }
      }
    }
  } else if (id === 'litter') {
    for (let i = 0; i < 7; i++) {
      const angle = random() * Math.PI * 2, offset = random() * info.radius * .69;
      const x = Math.cos(angle) * offset, z = Math.sin(angle) * offset;
      const direction = random() * Math.PI * 2, size = .035 + random() * .045;
      leaf([x, .016, z], [x + Math.cos(direction) * size, .025 + random() * .022, z + Math.sin(direction) * size],
        size * .24, .54 + random() * .46);
    }
  } else {
    const rock = new T.IcosahedronGeometry(1, id === 'drift' ? 1 : 0);
    const vertices = rock.getAttribute('position');
    const pieces = id === 'scree' ? 4 : id === 'pebble' || id === 'ice-chip' ? 2 : 1;
    for (let j = 0; j < pieces; j++) {
      const spread = j ? info.radius * (.34 + .16 * random()) : 0;
      const angle = j * 2.39996;
      const x = Math.cos(angle) * spread, z = Math.sin(angle) * spread;
      const rx = info.radius * (j ? .24 + random() * .14 : pieces === 1 ? .90 : .48);
      const rz = rx * (id === 'deadwood' ? .17 : .55 + random() * .23);
      const height = info.height * (j ? .27 + random() * .33 : .72 + random() * .28);
      const at = (i: number): Point => [
        x + vertices.getX(i) * rx * (.88 + Math.sin(vertices.getY(i) * 5) * .1),
        Math.max(-.05, vertices.getY(i) * height * .65 + height * .25),
        z + vertices.getZ(i) * rz,
      ];
      for (let i = 0; i < vertices.count; i += 3) triangle(at(i), at(i + 1), at(i + 2),
        id === 'drift' ? .82 + random() * .14 : .55 + random() * .42);
    }
    rock.dispose();
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  mesh.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  mesh.computeVertexNormals();
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.name = id;
  return mesh;
}

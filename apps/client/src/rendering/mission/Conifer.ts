import * as T from 'three';
import { randomSource } from '../environment/noise.ts';

type Point = readonly [number, number, number];

/** Opaque branch sprays in units relative to one tree's crown width and height. */
export function coniferCrown(detailed: boolean): T.BufferGeometry {
  const random = randomSource(78191);
  const vertices: number[] = [], colors: number[] = [];
  const layers = detailed ? 11 : 6;
  const branches = detailed ? 6 : 4;
  const triangle = (a: Point, b: Point, c: Point, shade: number) => {
    vertices.push(...a, ...b, ...c);
    for (const light of [shade * .76, shade * .90, shade]) colors.push(light * .90, light, light * .94);
  };
  for (let level = 0; level < layers; level++) {
    const fraction = level / (layers - .3);
    const phase = level * 2.39996;
    const reach = .96 * (1 - fraction) ** .85;
    const y = .26 + fraction * .76;
    for (let branch = 0; branch < branches; branch++) {
      const angle = phase + branch / branches * Math.PI * 2 + (random() - .5) * .68;
      const cs = Math.cos(angle), sn = Math.sin(angle);
      const length = reach * (.62 + .50 * random());
      const drop = (.021 + .064 * random()) * (1 - fraction * .68);
      const offset = (random() - .5) * .047;
      const point = (along: number, side: number, elevation: number): Point => [
        cs * length * along - sn * length * side, y + elevation + offset, sn * length * along + cs * length * side,
      ];
      const root = point(.03, 0, .025);
      const tip = point(1, 0, -drop * .56);
      const middle = point(.45, 0, .025);
      const shade = .54 + random() * .43;
      const width = .18 + .14 * random();
      for (const sign of [-1, 1]) {
        const shoulder = point(.40, width * sign * (detailed ? .52 : 1), -drop * .7);
        triangle(root, shoulder, middle, shade * .72);
        triangle(middle, shoulder, tip, shade);
        if (!detailed) continue;
        // Alternate upright and downturned shoots, leaving real gaps at the tips.
        for (let spray = 0; spray < 4; spray++) {
          const t = .18 + spray * .15 + random() * .06;
          const spread = width * sign * (1.25 - spray * .16) * (.7 + random() * .40);
          const start = point(t, 0, .023 - drop * t);
          const needleTip = point(t + .25 + random() * .09, spread, -drop * (.63 + random() * .82));
          const shoulder = point(t + .1, spread * .62, -drop * .79);
          const ridge = point(t + .22, spread * .46, .023 + random() * .025);
          triangle(start, shoulder, ridge, shade * .87);
          triangle(ridge, shoulder, needleTip, shade * (.70 + random() * .29));
        }
      }
    }
  }
  for (let side = 0; side < 6; side++) {
    const a = side * Math.PI / 3, b = a + Math.PI / 3;
    triangle([Math.cos(a) * .15, .90, Math.sin(a) * .15], [Math.cos(b) * .15, .90, Math.sin(b) * .15], [0, 1.045, 0], .72);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Broadleaf crown cluster in unit size (radius ~1): a noisy core lobe with outward leaf cards, colour in the vertices
 * (darker inside and below, lighter at the sunlit top).
 */
export function broadleafCrown(detailed: boolean): T.BufferGeometry {
  const random = randomSource(51713);
  const core = new T.IcosahedronGeometry(1, detailed ? 2 : 1);
  const position = core.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const bump = .82 + .12 * Math.sin(x * 4.3 + 1.7) * Math.cos(z * 3.9 + y * 2.6) + .06 * Math.sin(x * 9.7 - y * 8.3 + z * 11.1);
    position.setXYZ(i, x * bump, y * bump * .86, z * bump);
  }
  const vertices = Array.from(position.array as Float32Array);
  core.dispose();
  const colors: number[] = [];
  const tone = (y: number, inner: number) => {
    const light = (.62 + .38 * (y * .5 + .5)) * inner;
    colors.push(light * .92, light, light * .9);
  };
  for (let i = 0; i < vertices.length; i += 3) tone(vertices[i + 1], .82);
  const leaves = detailed ? 90 : 26;
  for (let i = 0; i < leaves; i++) {
    const angle = i * 2.39996 + random() * .5, rise = 1 - 1.7 * (i + .5) / leaves;
    const ring = Math.sqrt(Math.max(0, 1 - rise * rise));
    const dx = Math.cos(angle) * ring, dy = rise, dz = Math.sin(angle) * ring;
    const reach = .78 + random() * .28;
    const root = [dx * reach, dy * reach * .86, dz * reach];
    // Leaf plane: outward and drooping, turned randomly about the radial axis.
    const twist = random() * Math.PI;
    const sx = -dz * Math.cos(twist), sy = Math.sin(twist) * .6, sz = dx * Math.cos(twist);
    const length = (detailed ? .3 : .45) * (.8 + random() * .4), width = length * .38;
    const tip = [root[0] + dx * length * .8, root[1] + (dy * .5 - .35) * length, root[2] + dz * length * .8];
    const mid = [(root[0] * .55 + tip[0] * .45), (root[1] * .55 + tip[1] * .45), (root[2] * .55 + tip[2] * .45)];
    const left = [mid[0] + sx * width, mid[1] + sy * width, mid[2] + sz * width];
    const right = [mid[0] - sx * width, mid[1] - sy * width, mid[2] - sz * width];
    vertices.push(...root, ...left, ...tip, ...root, ...tip, ...right);
    const shade = .85 + random() * .35;
    for (const p of [root, left, tip, root, tip, right]) tone(p[1], shade);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Soft foliage light: bend normals outward from the crown centre.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
    const length = Math.hypot(x, y + .25, z) || 1;
    const nx = x / length * .7 + normals.getX(i) * .3, ny = (y + .25) / length * .7 + normals.getY(i) * .3 + .15, nz = z / length * .7 + normals.getZ(i) * .3;
    const n = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(i, nx / n, ny / n, nz / n);
  }
  return geometry;
}

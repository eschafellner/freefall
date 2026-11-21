import * as T from 'three';
import { randomSource } from '../environment/noise.ts';

type Point = readonly [number, number, number];

/** Opaque branch sprays in units relative to one tree's crown width and height. */
export function coniferCrown(detailed: boolean): T.BufferGeometry {
  const random = randomSource(78191);
  const vertices: number[] = [], colors: number[] = [];
  const layers = detailed ? 9 : 6;
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
        for (let spray = 0; spray < 3; spray++) {
          const t = .22 + spray * .19 + random() * .07;
          const spread = width * sign * (1.31 - spray * .18) * (.74 + random() * .40);
          const start = point(t, 0, .023 - drop * t);
          const needleTip = point(t + .29 + random() * .09, spread, -drop * (.63 + random() * .82));
          const shoulder = point(t + .11, spread * .78, -drop * .79);
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

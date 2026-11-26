import * as T from 'three';

/** Soft additive light cards: glow under ceiling fixtures, light pools on the deck and window bloom. */
export class CardBatch {
  private readonly matrices: T.Matrix4[] = [];
  private readonly dummy = new T.Object3D();
  private readonly material: T.Material;
  constructor(material: T.Material) { this.material = material; }
  add(x: number, y: number, z: number, w: number, h: number, rx: number, ry = 0): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(rx, ry, 0);
    this.dummy.scale.set(w, h, 1);
    this.dummy.updateMatrix();
    this.matrices.push(this.dummy.matrix.clone());
  }
  /** Card lying on the deck (or under a ceiling with down = true). */
  pool(x: number, y: number, z: number, w: number, d: number, down = false): void {
    this.add(x, y, z, w, d, down ? Math.PI / 2 : -Math.PI / 2);
  }
  finish(parent: T.Object3D): T.InstancedMesh | undefined {
    if (!this.matrices.length) return undefined;
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), this.material, this.matrices.length);
    this.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    mesh.renderOrder = 5;
    parent.add(mesh);
    return mesh;
  }
}

export const cardMaterial = (map: T.Texture, color: number, opacity: number) => new T.MeshBasicMaterial({
  map, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false,
});

/** Volume of light falling through one window pane, fading along the ray. */
export function shaft(width: number, height: number, length: number, direction: T.Vector3, color: number, strength = .03): T.Mesh {
  // Open tube: the four sides of a unit box without its caps (z from 0 at the window to 1 at the far end).
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    const nx = (ay + by) === 0 ? Math.sign(ax + bx) : 0, ny = (ax + bx) === 0 ? Math.sign(ay + by) : 0;
    positions.push(ax, ay, 0, bx, by, 0, bx, by, 1, ax, ay, 0, bx, by, 1, ax, ay, 1);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, 0);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  const material = new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(color) }, strength: { value: 1 }, scale: { value: strength } },
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vAlong = position.z;
        vec4 view = modelViewMatrix * vec4(position, 1.);
        vView = -view.xyz; vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint; uniform float strength, scale; varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        // Fade out close to the camera so walking through a shaft never pops.
        float fade = smoothstep(0., .06, vAlong) * pow(max(1. - vAlong, 0.), 1.8) * smoothstep(.6, 3.5, length(vView));
        gl_FragColor = vec4(tint * strength * fade * (.2 + .8 * facing) * scale, 1.);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(new T.Vector3(width, 0, 0), new T.Vector3(0, height, 0), direction.clone().multiplyScalar(length));
  mesh.renderOrder = 6;
  return mesh;
}

/** Dust drifting through the light: a few hundred additive points in a box, animated in the vertex shader. */
export function dust(count: number, min: T.Vector3, max: T.Vector3, color: number): T.Points {
  let seed = 0x1f2e3d;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([min.x + random() * (max.x - min.x), min.y + random() * (max.y - min.y), min.z + random() * (max.z - min.z)], i * 3);
    phases[i] = random() * 100;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new T.BufferAttribute(phases, 1));
  const material = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, tint: { value: new T.Color(color) }, pixelRatio: { value: 1 }, height: { value: max.y - min.y } },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float time, pixelRatio, height; varying float vGlow;
      void main() {
        vec3 p = position;
        float t = time * .05 + phase;
        p.x += sin(t * 1.3 + phase) * .35;
        p.z += cos(t * 1.1 + phase * 1.7) * .35;
        p.y = mod(p.y + time * .04 + phase * .1, height) + ${min.y.toFixed(2)};
        vec4 view = modelViewMatrix * vec4(p, 1.);
        vGlow = (.4 + .6 * sin(t * 4. + phase)) * smoothstep(14., 2., -view.z) * smoothstep(.4, 1.5, -view.z);
        gl_PointSize = pixelRatio * 2.6 * (6. / max(1., -view.z));
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint; varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - .5);
        gl_FragColor = vec4(tint * vGlow * smoothstep(.5, 0., d) * .55, 1.);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

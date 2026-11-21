import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { NET, NEST_COLLAPSE_TICKS, NEST_EXITS, NEST_EXIT_RADIUS, NEST_RADIUS } from '@freefall/shared';
import type { NestSnapshot } from '@freefall/shared';
import { randomSource, smoothstep } from '../environment/noise.ts';
import type { SurfaceMaterials } from '../environment/SurfaceMaterials.ts';

const MAX_NEST_VISUALS = 44;
const MAX_PARTICLES = 720;

function moundGeometry(): T.BufferGeometry {
  const terrain = new T.PlaneGeometry(1, 1, 60, 16);
  const positions = terrain.getAttribute('position');
  const uv = terrain.getAttribute('uv');
  const colors = new Float32Array(positions.count * 3);
  const tint = new T.Color();
  const soil = new T.Color(0x796044);
  const crust = new T.Color(0x30291f);
  for (let row = 0; row <= 16; row++) for (let column = 0; column <= 60; column++) {
    const i = row * 61 + column;
    const radius = .003 + .997 * row / 16;
    const angle = column * Math.PI * 2 / 60;
    const ridges = 1 + .12 * Math.sin(5 * angle + radius * 4) + .07 * Math.sin(angle * 11 - radius * 6);
    const distance = radius * NEST_RADIUS * ridges;
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const h = 3.42 * (1 - radius ** 1.45) ** 1.13 * ridges +
      Math.sin(radius * 31 + angle * 3) * .15 * Math.sin(Math.PI * radius);
    positions.setXYZ(i, x, h - .09, z);
    tint.copy(soil).lerp(crust, .32 + .23 * Math.sin(angle * 9 + radius * 15) + radius * .17);
    tint.toArray(colors, i * 3);
    uv.setXY(i, x * .24, z * .24 + h * .18);
  }
  terrain.setAttribute('color', new T.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  return terrain;
}

function cracksGeometry(): T.BufferGeometry {
  const random = randomSource(331);
  const vertices: number[] = [];
  for (let crack = 0; crack < 12; crack++) {
    let angle = crack * Math.PI / 6;
    let x = Math.sin(angle) * 1.5;
    let z = Math.cos(angle) * 1.5;
    for (let part = 0; part < 5; part++) {
      angle += (random() - .5) * .72;
      const step = .69 + random() * .52;
      const endX = x + Math.sin(angle) * step;
      const endZ = z + Math.cos(angle) * step;
      const side = (.17 - part * .026) * (1 + random());
      vertices.push(x - Math.cos(angle) * side, .045, z + Math.sin(angle) * side,
        x + Math.cos(angle) * side, .045, z - Math.sin(angle) * side, endX, .045, endZ);
      x = endX;
      z = endZ;
    }
  }
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
}

export class SwarmBreachController {
  readonly root = new T.Group();
  private readonly body: T.InstancedMesh;
  private readonly cracks: T.InstancedMesh;
  private readonly crater: T.InstancedMesh;
  private readonly throats: T.InstancedMesh;
  private readonly rims: T.InstancedMesh;
  private readonly rubble: T.InstancedMesh;
  private readonly particles: T.Points;
  private readonly dustPosition = new T.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(T.DynamicDrawUsage);
  private readonly dustShape = new T.BufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2).setUsage(T.DynamicDrawUsage);
  private readonly matrix = new T.Object3D();
  private readonly offsets = Array.from({ length: 36 }, (_, i) => (i * .61803398875) % 1);
  private count = 0;
  world?: WorldDefinition;

  constructor(materials: SurfaceMaterials) {
    const batches = (geometry: T.BufferGeometry, material: T.Material, factor = 1) => {
      const mesh = new T.InstancedMesh(geometry, material, MAX_NEST_VISUALS * factor);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    };
    this.body = batches(moundGeometry(), materials.soil);
    this.body.receiveShadow = true;
    this.cracks = batches(cracksGeometry(), new T.MeshStandardMaterial({ color: 0x261f18, side: T.DoubleSide, roughness: 1 }));
    this.crater = batches(new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x332821, roughness: 1 }));
    this.throats = batches(new T.CircleGeometry(1, 18), new T.MeshBasicMaterial({ color: 0x16120f, side: T.DoubleSide }), NEST_EXITS);
    this.rims = batches(new T.TorusGeometry(1, .16, 5, 20), new T.MeshStandardMaterial({
      color: 0x453223, roughness: .65, metalness: .13,
    }), NEST_EXITS);
    this.rubble = batches(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({
      color: 0x685342, roughness: .98, flatShading: true,
    }), 15);
    const dust = new T.BufferGeometry().setAttribute('position', this.dustPosition).setAttribute('shape', this.dustShape);
    const mist = new T.ShaderMaterial({
      uniforms: { viewportHeight: { value: 700 }, tint: { value: new T.Color(0xad9478) } },
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec2 shape;
        uniform float viewportHeight;
        varying float alpha;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_PointSize = clamp(shape.x * viewportHeight / max(1.0, -p.z), 1.0, 82.0);
          alpha = shape.y * (1.0 - smoothstep(65.0, 150.0, -p.z));
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying float alpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float cloud = max(0.0, 1.0 - dot(uv, uv));
          gl_FragColor = vec4(tint, alpha * cloud * cloud);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.particles = new T.Points(dust, mist);
    this.particles.frustumCulled = false;
    this.root.add(this.particles);
  }

  setViewport(height: number): void {
    (this.particles.material as T.ShaderMaterial).uniforms.viewportHeight.value = height;
  }

  private place(mesh: T.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, pitch = 0): void {
    const matrix = this.matrix;
    matrix.position.set(x, y + groundHeight(this.world, x, z), z);
    matrix.scale.set(sx, sy, sz);
    matrix.rotation.set(pitch, yaw, 0, 'YXZ');
    matrix.updateMatrix();
    mesh.setMatrixAt(mesh.count++, matrix.matrix);
  }

  private plume(x: number, z: number, tick: number, density: number, force: number, seed: number, amount: number): void {
    for (let i = 0; i < amount && this.count < MAX_PARTICLES; i++) {
      const angle = (this.offsets[i] * 6.28 + seed) % 6.28;
      const life = ((tick * (.38 + this.offsets[(i + 1) % 36] * .9) + this.offsets[(i + 18) % 36]) % 1 + 1) % 1;
      const reach = life * force * (.45 + this.offsets[(i + 6) % 36]);
      const y = .08 + (Math.sin(life * 2.62) * (.58 + this.offsets[(i + 9) % 36]) * force) / 2.7;
      this.dustPosition.setXYZ(this.count, x + Math.sin(angle) * reach, y + groundHeight(this.world, x, z), z + Math.cos(angle) * reach);
      this.dustShape.setXY(this.count, .22 + life * force * .43, density * (1 - life) * .61);
      this.count++;
    }
  }

  update(nests: readonly NestSnapshot[], tick: number, camera: T.Camera, low: boolean): void {
    const { body, cracks, crater, rims, throats, rubble } = this;
    body.count = cracks.count = crater.count = rims.count = throats.count = rubble.count = this.count = 0;
    let visible = 0;
    for (const nest of nests) {
      const { id, x, z, rotation } = nest;
      const distance = Math.hypot(camera.position.x - x, camera.position.z - z);
      if (distance > 155 || visible++ >= MAX_NEST_VISUALS) continue;
      const emerging = nest.state === 'EMERGING';
      const dying = nest.state === 'DESTROYING' || nest.state === 'DESTROYED';
      const t = nest.breachId ? T.MathUtils.clamp((tick - nest.startedAt) / (nest.opensAt - nest.startedAt), 0, 1) : 1;
      const collapse = dying ? (nest.state === 'DESTROYED' ? 1 : smoothstep(0, NEST_COLLAPSE_TICKS, tick - nest.destroyedAt)) : 0;
      const ground = smoothstep(.08, .52, t);
      const rise = smoothstep(.31, .95, t);
      const vibration = emerging ? Math.sin(tick * 1.2) * .04 * (1 - rise) : Math.sin(tick * .085 + id) * .022;
      this.place(cracks, x, 0, z, .16 + ground * 1.08, 1, .16 + ground * 1.08, rotation);
      this.place(crater, x, .033, z, .45 + ground * 3.75, 1, .45 + ground * 3.75, rotation);
      if (rise > 0) {
        this.place(body, x, -.21 + vibration, z, .62 + .38 * rise + .2 * collapse, Math.max(.10, rise * (1 - collapse * .86)),
          .62 + .38 * rise + .2 * collapse, rotation);
      }
      for (let i = 0; i < NEST_EXITS && rise > .19 && collapse < .86; i++) {
        const a = rotation + i * Math.PI * 2 / NEST_EXITS;
        const scale = rise * (1 - collapse);
        const hx = x + Math.sin(a) * (2.48 + (1 - rise) * -.82 + collapse * .42);
        const hz = z + Math.cos(a) * (2.48 + (1 - rise) * -.82 + collapse * .42);
        const hy = .36 + vibration + scale * 1.17;
        this.place(throats, hx, hy, hz, .93 * scale, .74 * scale, 1, a, -.47);
        this.place(rims, hx, hy, hz, .99 * scale, .78 * scale, .65 * scale, a, -.47);
      }
      if (distance < 105 && ground > .26) {
        for (let i = 0; i < 15; i++) {
          const angle = rotation + i * 2.39996;
          const spread = 3.4 + this.offsets[i] * 2.4 + collapse;
          const eject = Math.sin(smoothstep(.29, .65, t) * Math.PI) * (1 + this.offsets[i] * 1.6);
          const scale = .14 + this.offsets[(i + 8) % 36] * .43;
          this.place(rubble, x + Math.sin(angle) * spread * ground, eject + .12, z + Math.cos(angle) * spread * ground,
            scale * 1.3, scale * .67, scale, angle, angle * .6);
        }
      }
      const recentSpawn = (tick - nest.lastSpawnAt) / NET.tickHz;
      if (emerging && t < 1) this.plume(x, z, tick / 30, .38, 1.4 + Math.sin(t * Math.PI) * 6, id, low ? 13 : 32);
      if (dying && collapse < 1) this.plume(x, z, tick / 30, (1 - collapse) * .47, 7 + collapse * 3, id, low ? 12 : 30);
      if (!dying && recentSpawn >= 0 && recentSpawn < 1.25) {
        const angle = rotation + nest.exit * Math.PI * 2 / NEST_EXITS;
        this.plume(x + Math.sin(angle) * NEST_EXIT_RADIUS, z + Math.cos(angle) * NEST_EXIT_RADIUS,
          tick / 30, .42 * (1 - recentSpawn / 1.25), 2.4, id, low ? 6 : 12);
      }
    }
    for (const mesh of [body, cracks, crater, rims, throats, rubble]) {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    }
    this.particles.visible = this.count > 0;
    this.particles.geometry.setDrawRange(0, this.count);
    if (this.count) {
      this.dustPosition.needsUpdate = this.dustShape.needsUpdate = true;
    }
  }
}

import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { WeatherParticle, WorldDefinition } from '@freefall/shared';
import { randomSource } from './noise.ts';

export const MAX_WEATHER_PARTICLES = 320;
const GRID_STEP = 5;
const GRID_SIZE = 9;
const RADIUS = 16;

const vertexShader = /* glsl */ `
  uniform vec2 drift;
  uniform vec2 gridOrigin;
  uniform float ground[${GRID_SIZE * GRID_SIZE}];
  uniform float time, density, activeCount, windBand, isSnow, pixelRatio;
  attribute vec4 particle;
  varying float alpha;
  varying float elongated;

  float surface(vec2 xz) {
    vec2 cell = clamp((xz - gridOrigin) / ${GRID_STEP}.0, vec2(0.), vec2(${GRID_SIZE - 1}.0));
    ivec2 ij = min(ivec2(cell), ivec2(${GRID_SIZE - 2}));
    vec2 f = cell - vec2(ij);
    int i = ij.x + ij.y * ${GRID_SIZE};
    return mix(mix(ground[i], ground[i + 1], f.x),
      mix(ground[i + ${GRID_SIZE}], ground[i + ${GRID_SIZE + 1}], f.x), f.y);
  }

  void main() {
    float band = mix(1., step(.79, particle.w) * windBand, isSnow);
    float phase = particle.z * 6.283;
    vec2 gust = vec2(sin(time * .51 + phase), cos(time * .43 + phase)) * mix(.24, .62, isSnow);
    vec2 offset = mod(particle.xy * ${2 * RADIUS}.0 + drift * (.60 + .63 * particle.z) + gust
      - cameraPosition.xz + ${RADIUS}.0, ${2 * RADIUS}.0) - ${RADIUS}.0;
    vec2 xz = cameraPosition.xz + offset;
    float fall = fract(particle.w - time * (.26 + .13 * particle.z));
    float air = mix(.30 + 1.6 * fall * fall, mix(.12 + .45 * fall, .10 + 9.4 * fall, step(band, .15)), isSnow);
    vec4 view = viewMatrix * vec4(xz.x, surface(xz) + air, xz.y, 1.);
    gl_Position = projectionMatrix * view;
    float depth = -view.z;
    float edge = 1. - smoothstep(9.5, 15.6, length(offset));
    float life = smoothstep(0., .11, fall) * (1. - smoothstep(.86, 1., fall));
    float ramp = clamp(activeCount - float(gl_VertexID), 0., 1.);
    alpha = density * ramp * edge * life * smoothstep(1.8, 4.8, depth) * (.45 + .55 * particle.z) *
      mix(.16 + .08 * band, .57 - .17 * band, isSnow);
    float size = mix(12. + 17. * particle.z, 7. + 18. * particle.z, isSnow);
    gl_PointSize = clamp(size / max(1., depth) * pixelRatio, 1., mix(6., 4.1, isSnow) * pixelRatio);
    elongated = mix(1., .35, isSnow) + band * .4;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 tint;
  uniform vec2 screenWind;
  varying float alpha;
  varying float elongated;
  void main() {
    vec2 p = gl_PointCoord - vec2(.5);
    float crossWind = dot(p, vec2(-screenWind.y, screenWind.x));
    float shape = length(vec2(dot(p, screenWind), crossWind * (1. + elongated)));
    float opacity = (1. - smoothstep(.10, .49, shape)) * alpha;
    if (opacity < .012) discard;
    gl_FragColor = vec4(tint, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WeatherParticles {
  private readonly geometry = new T.BufferGeometry();
  private readonly uniforms = {
    drift: { value: new T.Vector2() },
    gridOrigin: { value: new T.Vector2(Infinity, Infinity) },
    ground: { value: new Float32Array(GRID_SIZE ** 2) },
    time: { value: 0 }, density: { value: 0 }, activeCount: { value: 0 },
    windBand: { value: 0 }, isSnow: { value: 0 }, pixelRatio: { value: 1 },
    tint: { value: new T.Color() }, screenWind: { value: new T.Vector2(1, 0) },
  };
  private readonly material = new T.ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false,
  });
  readonly points = new T.Points(this.geometry, this.material);
  count = 0;

  constructor(parent: T.Scene, seed: number) {
    const particles = new Float32Array(MAX_WEATHER_PARTICLES * 4);
    const random = randomSource(seed);
    for (let i = 0; i < particles.length; i++) particles[i] = random();
    const buffer = new T.InterleavedBuffer(particles, 4);
    this.geometry.setAttribute('particle', new T.InterleavedBufferAttribute(buffer, 4, 0));
    // WebGLRenderer reads position.count when resolving the draw range.
    this.geometry.setAttribute('position', new T.InterleavedBufferAttribute(buffer, 3, 0));
    this.geometry.setDrawRange(0, 0);
    this.points.name = 'Local weather';
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.points.visible = false;
    parent.add(this.points);
  }

  update(world: WorldDefinition, camera: T.Camera, kind: WeatherParticle, count: number, velocity: number,
    dt: number, windX: number, windZ: number, gust: number, pixelRatio: number): void {
    const u = this.uniforms;
    u.activeCount.value = Math.max(0, Math.min(MAX_WEATHER_PARTICLES, count));
    this.count = Math.ceil(u.activeCount.value);
    this.points.visible = this.count > 0 && kind !== 'none';
    if (!this.points.visible) return;
    this.geometry.setDrawRange(0, this.count);
    const { x, z } = camera.position;
    const gx = Math.floor((x - RADIUS) / GRID_STEP) * GRID_STEP;
    const gz = Math.floor((z - RADIUS) / GRID_STEP) * GRID_STEP;
    if (gx !== u.gridOrigin.value.x || gz !== u.gridOrigin.value.y) {
      u.gridOrigin.value.set(gx, gz);
      for (let j = 0; j < GRID_SIZE; j++) for (let i = 0; i < GRID_SIZE; i++) {
        u.ground.value[j * GRID_SIZE + i] = groundHeight(world, gx + i * GRID_STEP, gz + j * GRID_STEP);
      }
    }
    const snow = kind === 'snow';
    u.isSnow.value = Number(snow);
    u.density.value = snow ? 1 : .58 + Math.min(.42, gust);
    u.windBand.value = Math.min(1, Math.hypot(windX, windZ));
    u.pixelRatio.value = pixelRatio;
    u.tint.value.setHex(snow ? 0xd6dce0 : 0xb9a48a);
    u.drift.value.x += dt * velocity * windX * (snow ? 2.2 : 3.2);
    u.drift.value.y += dt * velocity * windZ * (snow ? 2.2 : 3.2);
    u.time.value += dt * (snow ? Math.max(.65, velocity) * .52 : Math.max(.36, velocity) * .38);
    const matrix = camera.matrixWorld.elements;
    const sx = windX * matrix[0] + windZ * matrix[2];
    const sy = -(windX * matrix[4] + windZ * matrix[6]);
    u.screenWind.value.set(sx, sy + .16).normalize();
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

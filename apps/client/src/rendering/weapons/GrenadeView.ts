import * as T from 'three';
import { FRAG, MAX_PLAYERS, NET } from '@freefall/shared';
import type { PlayersSnapshot } from '@freefall/shared';

function radialTexture(stops: [number, string][]): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

/** Fixed pool of explosions. Each blast reuses one slot; no objects are created per explosion. */
const MAX_BLASTS = MAX_PLAYERS * FRAG.capacity * 2;
const SMOKE = 10;
const DEBRIS = 14;
const LIFETIME = 3.2;
const SCORCH_LIFETIME = 14;

interface Blast { id: number; x: number; y: number; z: number; radius: number; started: number; seed: number }

export class GrenadeView {
  private readonly canisters: T.InstancedMesh;
  private readonly waves: T.InstancedMesh;
  private readonly flashes: T.InstancedMesh;
  private readonly smoke: T.InstancedMesh;
  private readonly dust: T.InstancedMesh;
  private readonly debris: T.InstancedMesh;
  private readonly scorch: T.InstancedMesh;
  private readonly light = new T.PointLight(0xffb36b, 0, 22, 2);
  private readonly blasts: Blast[] = [];
  private readonly seen = new Set<number>();
  private readonly transform = new T.Object3D();
  private readonly tint = new T.Color();

  constructor(scene: T.Scene) {
    const capacity = MAX_PLAYERS * FRAG.capacity;
    const additive = { transparent: true, depthWrite: false, blending: T.AdditiveBlending } as const;
    this.canisters = new T.InstancedMesh(new T.IcosahedronGeometry(.096, 1),
      new T.MeshStandardMaterial({ color: 0x686a45, roughness: .76 }), capacity);
    this.waves = new T.InstancedMesh(new T.RingGeometry(.88, 1, 40).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0xffd7a0, opacity: .5, side: T.DoubleSide, ...additive }), MAX_BLASTS);
    this.flashes = new T.InstancedMesh(new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: radialTexture([[0, '#fff6dcff'], [.25, '#ffc56fdd'], [1, '#ff7a1f00']]), ...additive }), MAX_BLASTS);
    this.smoke = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: radialTexture([[0, '#4a4540cc'], [.5, '#5b554d88'], [1, '#6b645a00']]), transparent: true, depthWrite: false,
    }), MAX_BLASTS * SMOKE);
    this.dust = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: radialTexture([[0, '#dcc8a3bb'], [.45, '#a4998577'], [1, '#89817100']]), transparent: true, depthWrite: false,
    }), MAX_BLASTS * 8);
    this.debris = new T.InstancedMesh(new T.BoxGeometry(.11, .07, .09),
      new T.MeshStandardMaterial({ color: 0x4d4033, roughness: .95 }), MAX_BLASTS * DEBRIS);
    this.scorch = new T.InstancedMesh(new T.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({
      map: radialTexture([[0, '#120d0ae6'], [.55, '#1d1610a0'], [1, '#2a201600']]), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    }), MAX_BLASTS);
    for (const mesh of [this.canisters, this.waves, this.flashes, this.smoke, this.dust, this.debris, this.scorch]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.waves.setColorAt(0, this.tint);
    this.scorch.renderOrder = -1;
    scene.add(this.light);
  }

  /** Authoritative blast event (server `combat` message). */
  explode(id: number, x: number, y: number, z: number, radius: number, now: number): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
    if (this.blasts.length >= MAX_BLASTS) this.blasts.shift();
    this.blasts.push({ id, x, y: Math.max(.05, y), z, radius, started: now, seed: id * 2.39996 });
  }

  clear(): void {
    this.blasts.length = 0;
    this.seen.clear();
  }

  draw(a: PlayersSnapshot | undefined, b: PlayersSnapshot | undefined, alpha: number, camera: T.Camera, low: boolean, now = performance.now()): void {
    this.canisters.count = 0;
    if (a && b) {
      const tick = T.MathUtils.lerp(a.tick, b.tick, alpha);
      for (const g of a.grenades ?? []) {
        if (tick >= g.detonates) {
          // Fallback for servers without blast events.
          if (!this.seen.has(g.id)) this.explode(g.id, g.x, g.y, g.z, FRAG.blastRadius, now - (tick - g.detonates) / NET.tickHz * 1000);
          continue;
        }
        if (this.canisters.count >= this.canisters.instanceMatrix.count) continue;
        const next = b.grenades?.find((p) => p.id === g.id) ?? g;
        const pose = this.transform;
        pose.position.set(T.MathUtils.lerp(g.x, next.x, alpha), T.MathUtils.lerp(g.y, next.y, alpha), T.MathUtils.lerp(g.z, next.z, alpha));
        pose.quaternion.identity();
        pose.scale.set(1, 1.25, 1);
        pose.updateMatrix();
        this.canisters.setMatrixAt(this.canisters.count++, pose.matrix);
      }
    }
    this.drawBlasts(camera, low, now);
    if (this.canisters.count) this.canisters.instanceMatrix.needsUpdate = true;
  }

  private drawBlasts(camera: T.Camera, low: boolean, now: number): void {
    for (const mesh of [this.waves, this.flashes, this.smoke, this.dust, this.debris, this.scorch]) mesh.count = 0;
    while (this.blasts.length && (now - this.blasts[0].started) / 1000 > SCORCH_LIFETIME) this.blasts.shift();
    const pose = this.transform;
    let brightest = 0;
    for (const blast of this.blasts) {
      const age = (now - blast.started) / 1000;
      if (age < 0) continue;
      const { x, y, z, radius, seed } = blast;
      // Scorch mark stays longest.
      const fade = Math.min(1, (SCORCH_LIFETIME - age) / 3);
      pose.position.set(x, .025, z);
      pose.quaternion.identity();
      pose.scale.setScalar(radius * .26 * Math.min(1, age * 8 + .3) * Math.max(.01, fade));
      pose.updateMatrix();
      this.scorch.setMatrixAt(this.scorch.count++, pose.matrix);
      if (age > LIFETIME) continue;
      // Flash: a few frames of bright core, also lights the scene.
      const flash = Math.max(0, 1 - age / .12);
      brightest = Math.max(brightest, flash);
      if (flash > 0) {
        pose.position.set(x, y + .6, z);
        pose.quaternion.copy(camera.quaternion);
        pose.scale.setScalar(2.2 + radius * .45 * (1 - flash * .4));
        pose.updateMatrix();
        this.flashes.setMatrixAt(this.flashes.count++, pose.matrix);
        this.light.position.set(x, y + 1.2, z);
      }
      // Pressure wave along the ground out to the damage radius.
      const wave = Math.min(1, age / .38);
      if (wave < 1) {
        pose.position.set(x, .06, z);
        pose.quaternion.identity();
        pose.scale.setScalar(.3 + Math.sqrt(wave) * radius);
        pose.updateMatrix();
        this.waves.setMatrixAt(this.waves.count, pose.matrix);
        this.waves.setColorAt(this.waves.count++, this.tint.setScalar((1 - wave) ** 2));
      }
      // Rising smoke column, ground dust ring and thrown soil.
      const smokeCount = low ? 4 : SMOKE;
      for (let i = 0; i < smokeCount; i++) {
        const angle = seed + i * 2.4;
        const life = Math.min(1, age / (LIFETIME * (.65 + (i % 3) * .12)));
        if (life >= 1) continue;
        const drift = radius * (.08 + .03 * i) * Math.sqrt(life);
        pose.position.set(x + Math.sin(angle) * drift, y + .4 + life * (2.2 + i % 4 * .6), z + Math.cos(angle) * drift);
        pose.quaternion.copy(camera.quaternion);
        pose.scale.setScalar((1.2 + life * 3.8) * (1 - life) ** .6);
        pose.updateMatrix();
        this.smoke.setMatrixAt(this.smoke.count++, pose.matrix);
      }
      const dustCount = low ? 3 : 8;
      const dustLife = Math.min(1, age / 1.4);
      if (dustLife < 1) {
        for (let i = 0; i < dustCount; i++) {
          const angle = seed * 1.7 + i * Math.PI * 2 / dustCount;
          const spread = radius * (.2 + .55 * Math.sqrt(dustLife));
          pose.position.set(x + Math.sin(angle) * spread, .3 + dustLife * .5, z + Math.cos(angle) * spread);
          pose.quaternion.copy(camera.quaternion);
          pose.scale.setScalar((1 + dustLife * 3) * (1 - dustLife));
          pose.updateMatrix();
          this.dust.setMatrixAt(this.dust.count++, pose.matrix);
        }
      }
      const debrisCount = low ? 5 : DEBRIS;
      for (let i = 0; i < debrisCount; i++) {
        const angle = seed * 3.1 + i * 2.39996;
        const speed = 3.5 + (i % 5) * 1.3;
        const lift = 4.5 + (i % 4) * 1.6;
        const t = Math.min(age, (lift + Math.sqrt(lift * lift + 2 * 9.81 * y)) / 9.81);
        const height = Math.max(.04, y + lift * t - 4.9 * t * t);
        pose.position.set(x + Math.sin(angle) * speed * t, height, z + Math.cos(angle) * speed * t);
        pose.rotation.set(t * 9 + i, t * 7, t * 5);
        pose.scale.setScalar(.6 + (i % 3) * .45);
        pose.updateMatrix();
        this.debris.setMatrixAt(this.debris.count++, pose.matrix);
      }
    }
    // The light stays in the scene with zero intensity: toggling visibility would recompile every lit material.
    this.light.intensity = brightest * 60;
    for (const mesh of [this.waves, this.flashes, this.smoke, this.dust, this.debris, this.scorch]) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

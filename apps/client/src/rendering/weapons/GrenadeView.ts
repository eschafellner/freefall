import * as T from 'three';
import { FRAG, MAX_PLAYERS, groundHeight } from '@freefall/shared';
import type { ExplosionEvent, GrenadeState, ImpactSurface, PlayersSnapshot, WorldDefinition } from '@freefall/shared';
import { GRAPHICS_QUALITY } from '../GraphicsQuality.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';

const HIGH = GRAPHICS_QUALITY.high;
const SMOKE_LIFE = 1.65;
const FLASH_LIFE = .21;
const UP = new T.Vector3(0, 1, 0);
const SIDE = new T.Vector3(1, 0, 0);
const SOOT = new T.Color(0x635b54);
const FIRE = new T.Color(0xffb566);
const CORE = new T.Color(0xffecd0);

function surface(dust: number, fragments: number, accent: number, density: number, wind: number, flake = 1, sparks = false) {
  return { dust: new T.Color(dust), fragments: new T.Color(fragments), accent: new T.Color(accent), density, wind, flake, sparks };
}

const SURFACES: Record<ImpactSurface, ReturnType<typeof surface>> = {
  snow: surface(0xd5e6ed, 0xb6cbd4, 0xeaf4f6, .49, .32, .52),
  ice: surface(0xb0cbd8, 0x8bb0be, 0xe1f0f3, .26, .16, .47),
  sand: surface(0xb08961, 0x886a4e, 0xc3a478, .53, .73),
  dirt: surface(0x88715d, 0x694d35, 0x9a795a, .39, .24),
  grass: surface(0x8c8268, 0x6e5438, 0x7b894b, .34, .26, .32),
  'forest-floor': surface(0x817461, 0x68503a, 0xad864b, .33, .28, .23),
  wood: surface(0x9a8064, 0x755237, 0xbd9863, .22, .21, .38),
  rock: surface(0x999189, 0x797570, 0xaca59b, .26, .17),
  'frozen-rock': surface(0x8c9ba5, 0x748690, 0xc0d8df, .26, .17, .65),
  concrete: surface(0xaaa29a, 0x8e8173, 0xbfb3a7, .29, .20),
  metal: surface(0x7f7773, 0x726c65, 0xffac57, .12, .12, .34, true),
  neutral: surface(0x958979, 0x7b7167, 0xaaa094, .24, .18),
};

export function explosionSurface(surface?: ImpactSurface) {
  return surface && Object.hasOwn(SURFACES, surface) ? SURFACES[surface] : SURFACES.neutral;
}

/** A noisy, feathered radial mask shared by all instanced plumes or flashes. */
function mask(plume: boolean): T.DataTexture {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
      const radius = Math.hypot(u, v);
      const waves = Math.sin(u * 11 + v * 5) * Math.cos(v * 10 - u * 3);
      const noise = waves * .105 + Math.sin(u * 27 - v * 21) * .044;
      const envelope = Math.max(0, 1 - radius);
      const value = plume ? envelope ** 1.15 * (.78 + noise * 2.2) : envelope ** 1.8;
      const pixel = (y * size + x) * 4;
      pixels[pixel] = pixels[pixel + 1] = pixels[pixel + 2] = 255;
      pixels[pixel + 3] = Math.round(255 * value);
    }
  }
  const texture = new T.DataTexture(pixels, size, size);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function billboards(capacity: number, plume: boolean) {
  const opacity = new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
  const geometry = new T.PlaneGeometry();
  geometry.setAttribute('effectOpacity', opacity);
  const material = new T.MeshBasicMaterial({
    map: mask(plume), transparent: true, depthWrite: false,
    blending: plume ? T.NormalBlending : T.AdditiveBlending,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float effectOpacity; varying float vEffectOpacity;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEffectOpacity = effectOpacity;');
    shader.fragmentShader = 'varying float vEffectOpacity;\n' + shader.fragmentShader
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= vEffectOpacity;\n#include <alphatest_fragment>');
  };
  return { mesh: new T.InstancedMesh(geometry, material, capacity), opacity };
}

interface BlastSlot {
  event?: ExplosionEvent;
  started: number;
  normal: T.Vector3;
  tangent: T.Vector3;
  bitangent: T.Vector3;
}

export class GrenadeView {
  private readonly canisters = new T.InstancedMesh(new T.IcosahedronGeometry(.096, 1),
    new T.MeshStandardMaterial({ color: 0x686a45, roughness: .76 }), MAX_PLAYERS * FRAG.capacity * 2);
  private readonly flashes = billboards(HIGH.explosionSlots * 2, false);
  private readonly plumes = billboards(HIGH.explosionSlots * (HIGH.explosionSmoke + HIGH.explosionDust), true);
  private readonly debris = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0),
    new T.MeshBasicMaterial(), HIGH.explosionSlots * HIGH.explosionDebris);
  private readonly light = new T.PointLight(0xffbe84, 0, 12, 2);
  private readonly slots: BlastSlot[] = Array.from({ length: HIGH.explosionSlots }, () => ({
    started: 0, normal: new T.Vector3(), tangent: new T.Vector3(), bitangent: new T.Vector3(),
  }));
  private readonly meshes = [this.canisters, this.flashes.mesh, this.plumes.mesh, this.debris];
  private readonly transform = new T.Object3D();
  private readonly direction = new T.Vector3();
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;
  private accepted = 0;
  private recycled = 0;
  private dropped = 0;
  private smokeCount = 0;
  private dustCount = 0;
  private updateMs = 0;
  private active = 0;
  private detonationTick = -1;
  private snapshotFloor = -1;
  private last?: ExplosionEvent;
  world?: WorldDefinition;

  constructor(scene: T.Scene) {
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      if (mesh !== this.canisters) {
        mesh.setColorAt(0, CORE);
        mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
      }
      scene.add(mesh);
    }
    this.plumes.mesh.renderOrder = 1;
    this.flashes.mesh.renderOrder = 2;
    scene.add(this.light);
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.clear();
  }

  explode(event: ExplosionEvent, now: number, camera: T.Camera): void {
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y) || !Number.isFinite(event.z) ||
        !Number.isFinite(event.radius) || event.radius <= 0) return;
    this.accepted++;
    this.last = event;
    this.detonationTick = Math.max(this.detonationTick, event.tick);
    const distance = camera.position.distanceTo(this.direction.set(event.x, event.y, event.z));
    if (distance > 105) { this.dropped++; return; }
    let chosen: BlastSlot | undefined;
    let score = distance;
    for (let i = 0; i < this.quality.explosionSlots; i++) {
      const slot = this.slots[i];
      if (!slot.event || now - slot.started >= SMOKE_LIFE * 1000) { chosen = slot; break; }
      const { x, y, z } = slot.event;
      const cost = camera.position.distanceTo(this.direction.set(x, y, z)) + (now - slot.started) * .037;
      if (cost >= score) { score = cost; chosen = slot; }
    }
    if (!chosen) { this.dropped++; return; }
    if (chosen.event) this.recycled++;
    chosen.event = event;
    chosen.started = now;
    const normal = event.contact?.normal;
    chosen.normal.set(0, 1, 0);
    if (normal?.every(Number.isFinite)) {
      chosen.normal.fromArray(normal);
      if (chosen.normal.lengthSq() < .01) chosen.normal.copy(UP);
      chosen.normal.normalize();
    }
    chosen.tangent.crossVectors(chosen.normal, Math.abs(chosen.normal.y) > .85 ? SIDE : UP).normalize();
    chosen.bitangent.crossVectors(chosen.normal, chosen.tangent);
  }

  clear(resetMatch = false): void {
    for (const slot of this.slots) slot.event = undefined;
    for (const mesh of this.meshes) mesh.count = 0;
    this.light.intensity = this.active = this.smokeCount = this.dustCount = this.updateMs = 0;
    this.last = undefined;
    if (resetMatch) this.detonationTick = this.snapshotFloor = -1;
  }

  fence(tick: number): void {
    this.clear();
    this.snapshotFloor = Math.max(this.snapshotFloor, tick);
  }

  metrics() {
    return { grenades: this.canisters.count, blasts: this.active, cap: this.quality.explosionSlots,
      flashes: this.flashes.mesh.count, smoke: this.smokeCount, dust: this.dustCount, debris: this.debris.count,
      lights: Number(this.light.intensity > 0), accepted: this.accepted, dropped: this.dropped, recycled: this.recycled,
      updateMs: this.updateMs, last: this.last };
  }

  private projectile(from: GrenadeState | NonNullable<GrenadeState['release']>, to: GrenadeState, alpha: number): void {
    if (this.canisters.count >= this.canisters.instanceMatrix.count) return;
    const pose = this.transform;
    pose.position.set(T.MathUtils.lerp(from.x, to.x, alpha), T.MathUtils.lerp(from.y, to.y, alpha), T.MathUtils.lerp(from.z, to.z, alpha));
    pose.quaternion.identity();
    pose.scale.set(1, 1.25, 1);
    pose.updateMatrix();
    this.canisters.setMatrixAt(this.canisters.count++, pose.matrix);
  }

  draw(a: PlayersSnapshot | undefined, b: PlayersSnapshot | undefined, alpha: number, head: number, camera: T.Camera,
    now: number, flash: number, reduced: boolean, windX: number, windZ: number): void {
    const started = performance.now();
    for (const mesh of this.meshes) mesh.count = 0;
    this.active = this.smokeCount = this.dustCount = 0;
    this.light.intensity = 0;
    if (b && b.tick >= this.snapshotFloor) {
      if (!a || a.tick < this.snapshotFloor) a = b;
      const tick = T.MathUtils.lerp(a.tick, b.tick, alpha);
      const cutoff = Math.max(head, this.detonationTick);
      for (const g of a.grenades ?? []) {
        if (cutoff >= g.detonates || tick >= g.detonates || (g.release && tick < g.release.tick)) continue;
        this.projectile(g, b.grenades?.find((next) => next.id === g.id) ?? g, alpha);
      }
      for (const g of b.grenades ?? []) {
        const release = g.release;
        if (!release || tick < release.tick || cutoff >= g.detonates || a.grenades?.some((before) => before.id === g.id)) continue;
        this.projectile(release, g, b.tick > release.tick ? (tick - release.tick) / (b.tick - release.tick) : 0);
      }
    }
    let bestLight = 0;
    for (const slot of this.slots) {
      if (!slot.event) continue;
      const age = Math.max(0, (now - slot.started) / 1000);
      if (age >= SMOKE_LIFE) { slot.event = undefined; continue; }
      this.active++;
      bestLight = this.drawBlast(slot, slot.event, camera, age, flash, reduced, windX, windZ, bestLight);
    }
    for (const mesh of this.meshes) {
      if (!mesh.count) continue;
      this.upload(mesh.instanceMatrix, mesh.count);
      if (mesh.instanceColor) this.upload(mesh.instanceColor, mesh.count);
    }
    this.upload(this.flashes.opacity, this.flashes.mesh.count);
    this.upload(this.plumes.opacity, this.plumes.mesh.count);
    this.updateMs = performance.now() - started;
  }

  private upload(attribute: T.BufferAttribute, count: number): void {
    if (!count) return;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }

  private sprite(batch: ReturnType<typeof billboards>, camera: T.Camera, size: number, opacity: number, color: T.Color,
    rotation = 0, aspect = 1): void {
    const pose = this.transform;
    pose.quaternion.copy(camera.quaternion);
    pose.rotateZ(rotation);
    pose.scale.set(size, size * aspect, 1);
    pose.updateMatrix();
    const index = batch.mesh.count++;
    batch.mesh.setMatrixAt(index, pose.matrix);
    batch.mesh.setColorAt(index, color);
    batch.opacity.setX(index, opacity);
  }

  private drawBlast(slot: BlastSlot, event: ExplosionEvent, camera: T.Camera, age: number, flash: number,
    reduced: boolean, windX: number, windZ: number, bestLight: number): number {
    const { x, y, z, radius, id, contact } = event;
    const position = this.transform.position;
    const centerY = Math.max(y, groundHeight(this.world, x, z) + .08);
    const distance = camera.position.distanceTo(position.set(x, centerY, z));
    const size = Math.min(radius, 16);
    const seed = id * 2.39996;
    const distant = distance > 32;
    const flashStrength = Math.min(1, flash) * (reduced ? .40 : 1) * T.MathUtils.clamp((distance - .55) / 3, .13, 1);
    if (age < FLASH_LIFE && flashStrength > 0) {
      const decay = (1 - age / FLASH_LIFE) ** 1.45 * flashStrength;
      // A compact warm core and a softer halo. With flash off, the soot and debris still identify the blast.
      position.addScaledVector(slot.normal, .19);
      this.sprite(this.flashes, camera, size * (.17 + age * 1.65), decay, CORE, seed, 1.18);
      this.sprite(this.flashes, camera, size * (.34 + age * 1.8), decay * .60, FIRE, -seed, .92);
      const score = decay / (1 + distance * .14);
      if (score > bestLight && !reduced && distance < 28) {
        bestLight = score;
        this.light.position.copy(position).addScaledVector(slot.normal, .32);
        this.light.distance = Math.min(16, radius * 1.1);
        this.light.intensity = this.quality.explosionLight * decay;
      }
    }
    const material = explosionSurface(contact?.surface);
    const driftX = T.MathUtils.clamp(windX, -4, 4);
    const driftZ = T.MathUtils.clamp(windZ, -4, 4);
    const detail = distant || reduced ? .5 : 1;
    const smoke = Math.ceil(this.quality.explosionSmoke * detail);
    const dust = contact && distance < 62 ? Math.ceil(this.quality.explosionDust * detail) : 0;
    const fragments = Math.floor(this.quality.explosionDebris * detail);
    for (let i = 0; i < smoke; i++) {
      const life = age / (1.25 + i % 3 * .19);
      if (life >= 1) continue;
      const angle = seed + i * 2.39996;
      const spread = size * (.035 + i * .012) * (.58 + life);
      position.set(x + Math.cos(angle) * spread + driftX * life * .18, centerY + .28 + life * (1.15 + i % 3 * .28),
        z + Math.sin(angle) * spread + driftZ * life * .18);
      position.y = Math.max(position.y, groundHeight(this.world, position.x, position.z) + .23);
      this.sprite(this.plumes, camera, size * (.145 + life * .19), (1 - life) ** 1.35 * .69, SOOT,
        angle + life * (i % 2 ? -.6 : .6), 1.08);
      this.smokeCount++;
    }
    for (let i = 0; i < dust && age < .93; i++) {
      const life = age / .93;
      const angle = seed * 1.37 + i * 2.39996;
      const spread = size * (.06 + i % 3 * .015 + Math.sqrt(life) * .21);
      position.set(x, centerY, z).addScaledVector(slot.tangent, Math.cos(angle) * spread)
        .addScaledVector(slot.bitangent, Math.sin(angle) * spread).addScaledVector(slot.normal, .14 + .43 * life);
      const wind = life * life * material.wind;
      this.direction.set(driftX * wind, 0, driftZ * wind);
      position.addScaledVector(this.direction, 1).addScaledVector(slot.normal, -this.direction.dot(slot.normal));
      position.y = Math.max(position.y, groundHeight(this.world, position.x, position.z) + .18);
      this.sprite(this.plumes, camera, size * (.14 + life * .17), (1 - life) ** 1.3 * material.density, material.dust,
        angle, .82);
      this.dustCount++;
    }
    for (let i = 0; i < fragments; i++) {
      const accent = i % 3 === 0;
      const spark = contact && material.sparks && accent;
      const life = age / (spark ? .28 : .44 + i % 4 * .10);
      if (life >= 1) continue;
      const angle = seed * 1.75 + i * 2.39996;
      const spread = Math.min(size * .42, age * (2.8 + i % 4 * 1.35));
      position.set(x, centerY, z).addScaledVector(slot.tangent, Math.cos(angle) * spread)
        .addScaledVector(slot.bitangent, Math.sin(angle) * spread)
        .addScaledVector(slot.normal, .10 + age * (2.9 + i % 3 * .74));
      position.y -= 4.9 * age * age;
      if (position.y < groundHeight(this.world, position.x, position.z) + .025) continue;
      this.transform.rotation.set(age * 10 + i, age * 7, age * 5 + seed);
      const fragment = (.028 + i % 4 * .011) * (1 - life ** 3);
      this.transform.scale.set(fragment * (spark ? 3 : 1.4), fragment * (accent ? material.flake : 1), fragment);
      this.transform.updateMatrix();
      this.debris.setMatrixAt(this.debris.count, this.transform.matrix);
      this.debris.setColorAt(this.debris.count++, accent ? material.accent : material.fragments);
    }
    return bestLight;
  }
}

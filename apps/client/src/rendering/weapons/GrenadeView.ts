import * as T from 'three';
import { FRAG, MAX_PLAYERS, NET } from '@freefall/shared';
import type { PlayersSnapshot } from '@freefall/shared';

function dustTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, '#dcc8a3bb');
  gradient.addColorStop(.45, '#a4998577');
  gradient.addColorStop(1, '#89817100');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export class GrenadeView {
  private readonly canisters: T.InstancedMesh;
  private readonly waves: T.InstancedMesh;
  private readonly dust: T.InstancedMesh;
  private readonly transform = new T.Object3D();
  private readonly tint = new T.Color();

  constructor(scene: T.Scene) {
    const capacity = MAX_PLAYERS * FRAG.capacity;
    this.canisters = new T.InstancedMesh(new T.IcosahedronGeometry(.096, 1),
      new T.MeshStandardMaterial({ color: 0x686a45, roughness: .76 }), capacity);
    this.waves = new T.InstancedMesh(new T.RingGeometry(.88, 1, 32).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0xffcd8e, transparent: true, opacity: .48,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), capacity);
    this.dust = new T.InstancedMesh(new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: dustTexture(), transparent: true, depthWrite: false }), capacity * 8);
    for (const mesh of [this.canisters, this.waves, this.dust]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  draw(a: PlayersSnapshot | undefined, b: PlayersSnapshot | undefined, alpha: number, camera: T.Camera, low: boolean): void {
    this.canisters.count = this.waves.count = this.dust.count = 0;
    if (!a || !b) return;
    const tick = T.MathUtils.lerp(a.tick, b.tick, alpha);
    for (const g of a.grenades ?? []) {
      const next = b.grenades?.find((p) => p.id === g.id) ?? g;
      const age = (tick - g.detonates) / NET.tickHz;
      if ((age < 0 ? this.canisters.count : this.waves.count) >= MAX_PLAYERS * FRAG.capacity) continue;
      const pose = this.transform;
      pose.position.set(T.MathUtils.lerp(g.x, next.x, alpha), T.MathUtils.lerp(g.y, next.y, alpha),
        T.MathUtils.lerp(g.z, next.z, alpha));
      pose.quaternion.identity();
      if (age < 0) {
        pose.scale.set(1, 1.25, 1);
        pose.updateMatrix();
        this.canisters.setMatrixAt(this.canisters.count++, pose.matrix);
        continue;
      }
      const progress = Math.min(1, age / .46);
      const radius = .22 + Math.sqrt(progress) * FRAG.radius;
      pose.scale.setScalar(radius);
      pose.updateMatrix();
      this.waves.setColorAt(this.waves.count, this.tint.setScalar((1 - progress) ** 2));
      this.waves.setMatrixAt(this.waves.count++, pose.matrix);
      const count = low ? 3 : 8;
      for (let i = 0; i < count; i++) {
        const angle = g.id * .83 + i * 2.4;
        const spread = radius * (.18 + .075 * i);
        pose.position.set(g.x + Math.sin(angle) * spread, g.y + .15 + age * (i % 3 + 1), g.z + Math.cos(angle) * spread);
        pose.quaternion.copy(camera.quaternion);
        pose.scale.setScalar((1.1 + progress * 3.6) * (1 - progress));
        pose.updateMatrix();
        this.dust.setMatrixAt(this.dust.count++, pose.matrix);
      }
    }
    if (this.canisters.count) this.canisters.instanceMatrix.needsUpdate = true;
    if (this.waves.count) {
      this.waves.instanceMatrix.needsUpdate = true;
      this.waves.instanceColor!.needsUpdate = true;
      this.dust.instanceMatrix.needsUpdate = true;
    }
  }
}

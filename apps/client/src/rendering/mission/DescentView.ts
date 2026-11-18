import * as T from 'three';
import type { MissionSnapshot, PositionXZ } from '@freefall/shared';
import { CARRIER_SHIP } from '@freefall/shared';

export class DescentView {
  readonly root = new T.Group();
  private readonly streaks: T.InstancedMesh;
  private readonly ember = new T.MeshBasicMaterial({ color: 0x8cb2b7, transparent: true, opacity: .38, depthWrite: false });
  private readonly dummy = new T.Object3D();
  private readonly sky = new T.Color();
  private readonly planet: T.Mesh;

  constructor() {
    this.streaks = new T.InstancedMesh(new T.BoxGeometry(.065, 1, .065), this.ember, 80);
    this.streaks.frustumCulled = false;
    this.planet = new T.Mesh(new T.SphereGeometry(68, 36, 24),
      new T.MeshBasicMaterial({ color: 0x6d989b, fog: false }));
    const shell = new T.Mesh(new T.SphereGeometry(69.1, 36, 24),
      new T.MeshBasicMaterial({ color: 0xa1d3d6, transparent: true, opacity: .28, side: T.BackSide, fog: false }));
    this.planet.add(shell);
    this.root.add(this.streaks, this.planet);
    this.root.position.set(CARRIER_SHIP.x, 0, CARRIER_SHIP.z);
    this.root.visible = false;
  }

  update(state: MissionSnapshot | undefined, tick: number, low: boolean, scene: T.Scene, position?: PositionXZ): void {
    this.root.visible = !!state;
    if (!state) return;
    const entry = state.phase === 'ATMOSPHERIC_ENTRY';
    const braking = state.phase === 'BRAKING';
    this.root.position.set(position?.x ?? CARRIER_SHIP.x, braking ? 11 : 0, position?.z ?? CARRIER_SHIP.z);
    const t = T.MathUtils.clamp((tick - state.phaseAt) / (state.phaseUntil - state.phaseAt), 0, 1);
    if (!braking) scene.background = this.sky.setHex(entry ? 0x442523 : 0x08161f);
    this.planet.position.set(-28, (entry ? -82 : braking ? -68 : -100) + t * 6, -68);
    this.planet.visible = !entry && !braking;
    this.ember.color.setHex(entry ? 0xff9f65 : braking ? 0xe0d4bd : 0x8eb4bb);
    this.streaks.count = low ? 35 : 80;
    const { dummy } = this;
    for (let i = 0; i < this.streaks.count; i++) {
      const angle = i * 2.39996;
      const radius = 5.3 + i % 13 * 1.65;
      dummy.position.set(Math.cos(angle) * radius, ((tick * (entry ? .73 : .48) + i * 9.59) % 47) - 24,
        Math.sin(angle) * radius - 2);
      dummy.scale.setScalar(i % 2 ? 1 : .57);
      dummy.scale.y *= entry ? 4.6 : braking ? 2.6 : 1.8;
      dummy.updateMatrix();
      this.streaks.setMatrixAt(i, dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
}

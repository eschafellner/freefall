import * as T from 'three';
import type { MissionSnapshot, PositionXZ } from '@freefall/shared';
import { CARRIER_SHIP } from '@freefall/shared';

const SPACE = new T.Color(0x07131b);
const PLASMA = new T.Color(0x5a2418);
const FIRE = new T.Color(0x8a3a1c);
const HAZE = new T.Color(0x8d9ea6);

/**
 * Backdrop of the drop: the carrier receding overhead after release, a planet that fills the view, speed streaks,
 * a sky that burns from black through plasma red into haze during re-entry, and cloud decks rushing past.
 */
export class DescentView {
  readonly root = new T.Group();
  private readonly streaks: T.InstancedMesh;
  private readonly clouds: T.InstancedMesh;
  private readonly ember = new T.MeshBasicMaterial({ color: 0x8cb2b7, transparent: true, opacity: .38, depthWrite: false });
  private readonly cloudMaterial = new T.MeshBasicMaterial({ color: 0xd9dfe0, transparent: true, opacity: 0, depthWrite: false, fog: false });
  private readonly dummy = new T.Object3D();
  private readonly sky = new T.Color();
  private readonly planet: T.Mesh;
  private readonly carrier = new T.Group();

  constructor() {
    this.streaks = new T.InstancedMesh(new T.BoxGeometry(.065, 1, .065), this.ember, 120);
    this.streaks.frustumCulled = false;
    this.clouds = new T.InstancedMesh(new T.SphereGeometry(1, 10, 6), this.cloudMaterial, 18);
    this.clouds.frustumCulled = false;
    this.planet = new T.Mesh(new T.SphereGeometry(68, 36, 24),
      new T.MeshBasicMaterial({ color: 0x6d989b, fog: false }));
    const shell = new T.Mesh(new T.SphereGeometry(69.1, 36, 24),
      new T.MeshBasicMaterial({ color: 0xa1d3d6, transparent: true, opacity: .28, side: T.BackSide, fog: false }));
    this.planet.add(shell);
    // Carrier underside silhouette with hangar lights, left behind after the clamps let go.
    const hull = new T.MeshBasicMaterial({ color: 0x151b1d, fog: false });
    const lights = new T.MeshBasicMaterial({ color: 0xd7e6d2, fog: false });
    const belly = new T.Mesh(new T.BoxGeometry(46, 6, 120), hull);
    const bay = new T.Mesh(new T.BoxGeometry(16, .4, 22), new T.MeshBasicMaterial({ color: 0x232c2d, fog: false }));
    bay.position.y = -3.1;
    this.carrier.add(belly, bay);
    for (let i = 0; i < 14; i++) {
      const lamp = new T.Mesh(new T.BoxGeometry(.6, .3, 1.6), lights);
      lamp.position.set(i % 2 ? 9 : -9, -3.2, -40 + i * 6);
      this.carrier.add(lamp);
    }
    this.root.add(this.streaks, this.clouds, this.planet, this.carrier);
    this.root.position.set(CARRIER_SHIP.x, 0, CARRIER_SHIP.z);
    this.root.visible = false;
  }

  update(state: MissionSnapshot | undefined, tick: number, low: boolean, scene: T.Scene, position?: PositionXZ, shipHeight = 0): void {
    this.root.visible = !!state;
    if (!state) return;
    const dropping = state.phase === 'DROPPING';
    const entry = state.phase === 'ATMOSPHERIC_ENTRY';
    const braking = state.phase === 'BRAKING';
    const t = T.MathUtils.clamp((tick - state.phaseAt) / Math.max(1, state.phaseUntil - state.phaseAt), 0, 1);
    this.root.position.set(position?.x ?? CARRIER_SHIP.x, braking ? shipHeight : 0, position?.z ?? CARRIER_SHIP.z);
    if (!braking) {
      // Black space, then the plasma glow rises, peaks and gives way to atmospheric haze before the burn.
      if (entry) {
        const glow = T.MathUtils.smoothstep(t, 0, .35) * (1 - T.MathUtils.smoothstep(t, .7, 1));
        this.sky.copy(SPACE).lerp(PLASMA, Math.min(1, t * 3)).lerp(FIRE, glow).lerp(HAZE, T.MathUtils.smoothstep(t, .72, 1));
      } else this.sky.copy(SPACE);
      scene.background = this.sky;
    }
    this.carrier.visible = dropping;
    this.carrier.position.set(0, 16 + (t * 1.4) ** 2 * 70, -14);
    // The planet swells while the lander falls towards it.
    this.planet.visible = dropping;
    this.planet.position.set(-28, -100 + t * 22, -68);
    this.planet.scale.setScalar(1 + t * .35);
    const speed = dropping ? .35 + t * .55 : entry ? .95 + .4 * Math.sin(t * Math.PI) : .55 * (1 - t);
    this.ember.color.setHex(entry ? (t > .75 ? 0xd9dcd6 : 0xff9f65) : braking ? 0xe0d4bd : 0x8eb4bb);
    this.ember.opacity = braking ? .3 * (1 - t) : .38;
    this.streaks.count = low ? 50 : 120;
    const { dummy } = this;
    for (let i = 0; i < this.streaks.count; i++) {
      const angle = i * 2.39996;
      const radius = 5.3 + i % 13 * 1.65;
      dummy.position.set(Math.cos(angle) * radius, ((tick * speed + i * 9.59) % 47) - 24, Math.sin(angle) * radius - 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(i % 2 ? 1 : .57);
      dummy.scale.y *= 1.2 + speed * 4;
      dummy.updateMatrix();
      this.streaks.setMatrixAt(i, dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    // Cloud decks rush upward at the end of re-entry and the start of the burn.
    const cloudy = entry ? T.MathUtils.smoothstep(t, .6, .95) : braking ? 1 - T.MathUtils.smoothstep(t, 0, .35) : 0;
    this.clouds.visible = cloudy > .01;
    this.cloudMaterial.opacity = .55 * cloudy;
    this.clouds.count = low ? 9 : 18;
    for (let i = 0; i < this.clouds.count; i++) {
      const angle = i * 2.1;
      const radius = 9 + i % 5 * 5;
      dummy.position.set(Math.cos(angle) * radius, ((tick * 1.25 + i * 19) % 90) - 45, Math.sin(angle) * radius);
      dummy.scale.set(6 + i % 3 * 3, 1.2 + i % 2, 5 + i % 4 * 2);
      dummy.updateMatrix();
      this.clouds.setMatrixAt(i, dummy.matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}

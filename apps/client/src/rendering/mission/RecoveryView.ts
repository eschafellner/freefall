import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { BALLOON, NET } from '@freefall/shared';
import type { ExtractionSnapshot, PlayersSnapshot, PositionXZ } from '@freefall/shared';
import { PanelBatch, emitter, metal, plate, stencil } from './ShipParts.ts';

export class RecoveryView {
  readonly root = new T.Group();
  private readonly envelope = new T.Group();
  private readonly canister = new T.Group();
  private readonly fighter = new T.Group();
  private readonly lid = new T.Group();
  private readonly hook = new T.Group();
  private readonly beacon = emitter(0xff9c41, 2.2);
  private readonly ropes: T.Line[];
  private readonly top = new T.Vector3();
  private readonly path = new T.Vector3();
  private readonly lastEnd = Array.from({ length: 4 }, () => new T.Vector3());
  private readonly ids: (string | undefined)[] = [];

  constructor() {
    const orange = metal(0xbc562f, .83, .04);
    const web = metal(0x4d3930, .93, .06);
    const shell = metal(0x454b40);
    const armor = metal(0x58665e);
    const dark = metal(0x232f30, .53);
    const blue = emitter(0x79beed, 2.7);
    const fabric = new T.SphereGeometry(1, 32, 24);
    const balloon = new T.Mesh(fabric, orange);
    balloon.scale.set(2.35, 1.58, 2.35);
    this.envelope.add(balloon);
    for (let i = 0; i < 4; i++) {
      const seam = new T.Mesh(new T.TorusGeometry(2.32, .045, 5, 30), web);
      seam.rotation.y = i * Math.PI / 4;
      seam.scale.y = .69;
      this.envelope.add(seam);
    }
    plate(this.envelope, web, 0, -1.58, 0, .42, .4, .45);
    plate(this.envelope, this.beacon, 0, 1.65, 0, .4, .23, .4);
    plate(this.canister, shell, 0, .19, 0, 1.05, .38, .77);
    this.lid.position.set(0, .38, -.36);
    plate(this.lid, shell, 0, .045, .36, 1.04, .09, .77);
    plate(this.lid, this.beacon, 0, .104, .37, .84, .038, .16);
    this.canister.add(this.lid);
    stencil(this.envelope, 'SOS', 'FREEFALL  /  RECOVERY', [0, -.1, 2.355], 2.1, 0, '#f1dbaf');

    const parts = new PanelBatch();
    const wing = new T.Mesh(new T.ConeGeometry(5.5, .34, 3), shell);
    wing.rotation.y = Math.PI * .5;
    wing.scale.z = .82;
    this.fighter.add(wing);
    parts.add(armor, 0, .21, -.6, 2.28, 1.04, 7.8);
    parts.add(armor, 0, .08, -4.91, 1.46, .65, 1.4);
    parts.add(dark, 0, .78, -2.48, 1.24, .48, 2.45);
    for (const side of [-1, 1]) {
      parts.add(armor, side * 2.17, .22, 1.03, 1.73, .81, 3.9, side * .18);
      parts.add(dark, side * 2.2, 1.03, 1.89, .19, 1.39, 1.8);
      parts.add(blue, side * 2.22, .16, 2.99, 1.2, .33, .23);
      const exhaust = new T.Mesh(new T.ConeGeometry(.5, 4.8, 9, 1, true),
        new T.MeshBasicMaterial({ color: 0x79beed, opacity: .42, transparent: true, depthWrite: false }));
      exhaust.position.set(side * 2.23, .16, 5.24);
      exhaust.rotation.x = Math.PI / 2;
      this.fighter.add(exhaust);
    }
    this.hook.position.set(0, -.24, .86);
    plate(this.hook, dark, 0, -.38, 0, .18, .75, .18);
    plate(this.hook, this.beacon, 0, -.76, .02, 1.1, .16, .25);
    this.fighter.add(this.hook);
    parts.finish(this.fighter);
    this.ropes = Array.from({ length: 4 }, () => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(9 * 3), 3));
      const line = new T.Line(geometry, new T.LineBasicMaterial({ color: 0xe6c39c, opacity: .93, transparent: true }));
      line.frustumCulled = false;
      this.root.add(line);
      return line;
    });
    this.root.add(this.envelope, this.canister, this.fighter);
    this.root.visible = false;
  }

  get audioPosition(): T.Vector3 | undefined {
    return this.root.visible && this.fighter.visible ? this.fighter.position : undefined;
  }

  update(state: ExtractionSnapshot | undefined, tick: number, dt: number, players: PlayersSnapshot | undefined,
    own: string, position: PositionXZ, world?: WorldDefinition): void {
    this.root.visible = state?.method === 'balloon';
    if (state?.method !== 'balloon') {
      this.ids.length = 0;
      return;
    }
    const base = groundHeight(world, state.x, state.z);
    const age = Math.max(0, (tick - state.startedAt) / NET.tickHz);
    const fill = Math.min(1, age * .66);
    this.top.set(state.x + Math.sin(tick * .031) * .63 * fill, base + .61 + BALLOON.height * Math.min(1, age / 3.4),
      state.z + Math.cos(tick * .027) * .47 * fill);
    const t = T.MathUtils.clamp((tick - state.phaseAt) / Math.max(1, state.endsAt - state.phaseAt), 0, 1);
    const lift = state.phase === 'LIFT';
    this.fighter.visible = state.phase !== 'COUNTDOWN';
    this.fighter.rotation.set(0, Math.PI * .235, lift ? -.17 * t : .15 * (1 - t));
    this.path.set(Math.sin(this.fighter.rotation.y), 0, -Math.cos(this.fighter.rotation.y));
    if (this.fighter.visible) {
      this.fighter.position.copy(this.top);
      if (!lift) {
        this.fighter.position.addScaledVector(this.path, -183 * (1 - t));
        this.fighter.position.y += 1.45 + (1 - t) ** 2 * 46;
      } else {
        this.top.addScaledVector(this.path, 95 * t ** 1.8);
        this.top.y += 48 * t;
        this.fighter.position.copy(this.top);
        this.fighter.position.y += 1.45;
      }
    }
    this.envelope.scale.setScalar(.13 + .87 * fill);
    this.envelope.position.copy(this.top);
    this.envelope.rotation.z = Math.sin(tick * .031) * .07 - (lift ? .42 * t : 0);
    this.canister.position.set(state.x, base, state.z);
    this.lid.rotation.x = -1.9 * Math.min(1, age * 2.7);
    this.hook.rotation.x = lift ? -.2 * t : -1.32 * (1 - T.MathUtils.smoothstep(t, .59, .92));
    this.beacon.emissiveIntensity = 1.45 + .85 * Math.sin(tick * 2 * Math.PI / (NET.tickHz * 1.55));
    this.ropes.forEach((rope, index) => {
      const id = state.securedIds[index];
      const player = id === own ? position : players?.players.find((operator) => operator.id === id);
      rope.visible = Boolean(player);
      if (!player) {
        this.ids[index] = undefined;
        return;
      }
      const end = this.lastEnd[index];
      const offset = lift ? 95 * t ** 1.8 : 0;
      const x = player.x + this.path.x * offset;
      const z = player.z + this.path.z * offset;
      const y = groundHeight(world, player.x, player.z) + 1.25 + (lift ? 45 * t : 0);
      if (id !== this.ids[index] || id === own || lift) end.set(x, y, z);
      else {
        const smoothing = 1 - Math.exp(-dt * 15);
        end.x = T.MathUtils.lerp(end.x, x, smoothing);
        end.y = T.MathUtils.lerp(end.y, y, smoothing);
        end.z = T.MathUtils.lerp(end.z, z, smoothing);
      }
      this.ids[index] = id;
      const slack = lift ? .1 : 2.2 * Math.max(0, 1 - Math.hypot(player.x - state.x, player.z - state.z) / state.radius);
      const attribute = rope.geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i++) {
        const u = i / (attribute.count - 1);
        attribute.setXYZ(i, T.MathUtils.lerp(end.x, this.top.x, u), T.MathUtils.lerp(end.y, this.top.y - 1.5, u) - Math.sin(Math.PI * u) * slack,
          T.MathUtils.lerp(end.z, this.top.z, u));
      }
      attribute.needsUpdate = true;
    });
  }
}

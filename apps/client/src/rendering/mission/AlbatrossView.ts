import * as T from 'three';
import { ALBATROSS, CARRIER_SHIP } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import { PanelBatch, emitter, metal, plate, stencil } from './ShipParts.ts';

const unit = new T.Object3D();
const timeProgress = (tick: number, start: number, end: number) => T.MathUtils.clamp((tick - start) / Math.max(1, end - start), 0, 1);

export class AlbatrossView {
  readonly root = new T.Group();
  private readonly ramp = new T.Group();
  private readonly alarm = emitter(0xb92615);
  private readonly flame = new T.MeshBasicMaterial({ color: 0x9cd8ff, transparent: true, opacity: .65, depthWrite: false });
  private readonly nozzles: { shell: T.MeshStandardMaterial; jet: T.Mesh; smoke: T.Mesh }[] = [];
  private readonly dust: T.InstancedMesh;
  private readonly dustMaterial = new T.MeshBasicMaterial({ color: 0x9f8e74, transparent: true, opacity: .25, depthWrite: false });
  private readonly detail = new T.Group();
  private readonly wreck = new T.Group();
  private readonly hull = metal(0x575d52);

  constructor() {
    const steel = this.hull;
    const plateGray = metal(0x666d62);
    const graphite = metal(0x2a302c, .63, .52);
    const rubber = metal(0x222725, .98, .06);
    const olive = metal(0x605a41);
    const orange = metal(0x9b7536);
    const lamp = emitter(0xd1e3ce, 1.5);
    const cargoLamp = emitter(0xb3b5a0, 1.1);
    const glass = metal(0x314948, .26, .7);
    const staticParts = new PanelBatch();
    const extraParts = new PanelBatch();
    const panel = staticParts.add.bind(staticParts);
    const detail = extraParts.add.bind(extraParts);

    panel(graphite, 0, -.12, .04, 5.28, .24, 10.85);
    panel(steel, 0, 3.62, -.05, 5.62, .62, 10.59);
    panel(plateGray, 0, 4.05, -.28, 3.92, .43, 7.49);
    panel(steel, 0, 1.76, -5.21, 5.16, 3.52, .46);
    panel(steel, 0, 1.82, -6.02, 4.4, 2.93, 1.55);
    panel(graphite, 0, .49, -6.32, 4.73, .54, 1.47);
    panel(glass, 0, 2.67, -6.82, 3.88, .56, .1);
    panel(graphite, 0, 3.07, -6.85, 4.27, .2, .25);
    panel(plateGray, 0, 3.36, 5.22, 5.28, .48, .62);
    panel(this.alarm, 0, 3.33, 5.55, 1.19, .12, .07);
    for (const side of [-1, 1]) {
      panel(steel, side * 2.55, 1.64, 0, .44, 3.28, 10.45);
      panel(plateGray, side * 2.85, 2.12, -.28, .38, .97, 9.73);
      panel(olive, side * 2.85, .65, -.3, .37, .83, 9.99);
      panel(graphite, side * 2.1, .13, 5.28, .62, .26, .61);
      panel(graphite, side * 2.57, -.06, -.22, .56, .38, 7.78);
      panel(lamp, side * 2.21, 2.79, 5.31, .24, .35, .17);
      panel(cargoLamp, side * 1.75, 3.27, -.13, .13, .12, 7.78);
      panel(orange, side * 1.13, .008, .15, .05, .02, 10.17);
      panel(graphite, side * 1.81, 2.85, -.2, .15, .13, 8.85);
      panel(lamp, side * 1.6, 1.44, -6.87, .3, .19, .11);
      for (let row = 0; row < 4; row++) {
        const z = -2.9 + row * 1.6;
        panel(graphite, side * 2.14, .46, z, .75, .15, .81);
        panel(row < 2 ? olive : rubber, side * 2.43, 1.02, z, .19, 1.04, .76);
        panel(graphite, side * 2.44, 1.61, z, .19, .15, .84);
        panel(orange, side * 2.31, 1.17, z, .05, .55, .07);
        detail(lamp, side * 2.302, 1.83, z, .055, .1, .27);
        detail(graphite, side * 3.05, 2.11, z, .1, .49, .13);
      }
      for (const z of [-2.9, 2.9]) {
        panel(graphite, side * 3.54, 2.24, z, 2.8, .64, 1.38);
        detail(olive, side * 3.98, 2.81, z, .46, .35, 1.04);
      }
      stencil(this.root, 'ALBATROSS', '02  /  TACTICAL LANDER', [side * 3.052, 2.21, .13], 2.45, side * Math.PI / 2);
    }
    stencil(this.root, 'OPERATOREN', 'EINSATZPERSONAL  /  PLATZ 01–04', [-2.298, 2.06, 1.66], 2.12, Math.PI / 2, '#a7d5cc');
    stencil(this.root, 'CONVICTS', 'GEWAHRSAM  /  TRANSFER 05–08', [2.298, 2.06, -2.16], 2.12, -Math.PI / 2, '#dca87d');
    stencil(this.root, '02  /  SF', 'SPERRBEREICH  /  RAMPE', [0, 3.63, 5.562], 1.7, 0, '#dddabb');
    this.ramp.position.set(0, .09, 5.17);
    plate(this.ramp, graphite, 0, 0, 1.63, 4.48, .2, 3.25);
    for (let i = 0; i < 6; i++) plate(this.ramp, i % 2 ? steel : olive, 0, .115, i * .48 + .34, 4.22, .027, .17);
    this.root.add(this.ramp);

    const housing = new T.CylinderGeometry(1.15, .97, 2.15, 10);
    const collar = new T.CylinderGeometry(1.03, 1.24, .21, 10);
    const nozzle = new T.TorusGeometry(.71, .14, 7, 14);
    const jet = new T.ConeGeometry(.7, 1, 12, 1, true);
    jet.rotateZ(Math.PI);
    jet.translate(0, -.47, 0);
    const cloud = new T.SphereGeometry(.82, 8, 5);
    for (const location of ALBATROSS.thrusters) {
      const assembly = new T.Group();
      assembly.position.set(location.x, 1.85, location.z);
      const shell = metal(0x535b4c);
      assembly.add(new T.Mesh(housing, shell));
      const lip = new T.Mesh(collar, graphite);
      lip.position.y = -1.02;
      const ring = new T.Mesh(nozzle, metal(0x2a2621));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -.9;
      const plume = new T.Mesh(jet, this.flame);
      plume.position.y = -.92;
      const smoke = new T.Mesh(cloud, new T.MeshBasicMaterial({ color: 0x262825, opacity: .4, transparent: true, depthWrite: false }));
      assembly.add(lip, ring, plume, smoke);
      this.root.add(assembly);
      this.nozzles.push({ shell, jet: plume, smoke });
    }
    const ruin = new PanelBatch();
    for (let i = 0; i < 15; i++) {
      const side = i % 2 ? 1 : -1;
      ruin.add(graphite, side * (3.1 + i % 4 * .79), .09 + i % 3 * .06, 1.9 + Math.sin(i * 2.39996) * 5.4,
        .52 + i % 3 * .28, .13, .48 + i % 5 * .15, i * .82);
      ruin.add(olive, side * 3.14, .72 + i % 4 * .31, -4.9 + i * .69, .16, .26, .9, i * .15);
    }
    ruin.finish(this.wreck);
    staticParts.finish(this.root);
    extraParts.finish(this.detail);
    this.dust = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), this.dustMaterial, 32);
    this.dust.frustumCulled = false;
    this.root.add(this.detail, this.dust, this.wreck);
  }

  update(state: MissionSnapshot, tick: number, low: boolean): void {
    const { albatross, phase, phaseAt, phaseUntil, extraction } = state;
    const flight = phase === 'DROPPING' || phase === 'ATMOSPHERIC_ENTRY' || phase === 'BRAKING';
    const elapsed = timeProgress(tick, phaseAt, phaseUntil);
    const lift = extraction?.method === 'albatross' && extraction.phase === 'LIFT';
    const liftProgress = lift ? timeProgress(tick, extraction.phaseAt, extraction.endsAt) : 0;
    this.root.visible = state.state !== 'RETURN_TO_CARRIER' && !(lift && state.result?.extractionSucceeded);
    this.detail.visible = !low;
    this.root.position.set(albatross?.x ?? CARRIER_SHIP.x, 0, albatross?.z ?? CARRIER_SHIP.z);
    this.root.rotation.set(0, 0, 0);
    if (phase === 'TOUCHDOWN') this.root.position.y = 9 * (1 - Math.min(1, elapsed * 2.5)) ** 1.45;
    if (flight) {
      this.root.rotation.set(-.04 - Math.sin(tick * .4) * .021, 0, Math.sin(tick * .49) * .024);
      this.root.position.y = Math.sin(tick * .6) * .07;
    }
    if (lift) {
      this.root.position.y = liftProgress ** 1.55 * 21;
      this.root.position.z -= liftProgress ** 2 * 17;
      this.root.rotation.x = 0;
    }
    const destroyed = albatross?.lifecycleState === 'DESTROYED';
    this.wreck.visible = destroyed;
    const hit = albatross?.lastHitAt && tick - albatross.lastHitAt < 5;
    this.hull.color.setHex(destroyed ? 0x302a25 : 0x575d52);
    this.hull.emissive.setHex(hit ? 0x38170b : 0x000000);
    const open = !destroyed && (phase === 'DOCKED' || phase === 'BOARDING' || phase === 'DEPLOYED' ||
      (phase === 'TOUCHDOWN' && elapsed > .58));
    const close = phase === 'LOCKED' ? Math.min(1, elapsed * 2.6) : lift ? Math.min(1, liftProgress * 4) : 1;
    const openAtLanding = phase === 'TOUCHDOWN' ? Math.min(1, (elapsed - .58) * 3.5) : 1;
    this.ramp.rotation.x = destroyed ? -.09 : open && !lift ? (-.027 + (1 - openAtLanding) * -1.49) : -1.53 * close;
    const alarm = state.state === 'DEPLOYMENT' || lift;
    this.alarm.emissiveIntensity = destroyed ? 0 : alarm ? 1.8 + .8 * Math.sin(tick * .24) : .34;
    this.flame.color.setHex(phase === 'ATMOSPHERIC_ENTRY' ? 0xffa272 : 0x90cfff);
    this.nozzles.forEach((unit, i) => {
      const engine = albatross?.thrusters[i];
      const broken = destroyed || engine?.state === 'DESTROYED';
      const damaged = engine?.state === 'DAMAGED';
      const hit = engine && engine.lastHitAt > 0 && tick - engine.lastHitAt < 5;
      unit.shell.emissive.setHex(hit ? 0xf67c34 : 0x000000);
      unit.shell.color.setHex(broken ? 0x302622 : damaged ? 0x61503c : 0x535b4c);
      unit.jet.visible = !broken && (lift || extraction?.method === 'albatross' || phase === 'BRAKING' ||
        phase === 'ATMOSPHERIC_ENTRY' || (phase === 'TOUCHDOWN' && elapsed < .38));
      unit.jet.scale.y = (damaged ? .55 : 1) * (2.9 + .8 * Math.sin(tick * .77 + i));
      unit.smoke.visible = Boolean(broken || damaged);
      const drift = (tick / 25 + i * .271) % 1;
      unit.smoke.position.set(.35 * drift, 1.3 + drift * 2.8, .43 * drift);
      unit.smoke.scale.setScalar(.5 + drift);
      (unit.smoke.material as T.MeshBasicMaterial).opacity = .45 * (1 - drift);
    });
    this.dust.visible = phase === 'TOUCHDOWN' && elapsed > .35 && elapsed < .98;
    if (this.dust.visible) {
      const spread = (elapsed - .35) / .63;
      this.dust.count = low ? 14 : 32;
      this.dustMaterial.opacity = .26 * (1 - spread);
      for (let i = 0; i < this.dust.count; i++) {
        const angle = i * 2.39996;
        const radius = 3 + spread * (5 + i % 7);
        unit.position.set(Math.cos(angle) * radius, .17 + spread * (i % 3) * .4, Math.sin(angle) * radius);
        unit.scale.setScalar(.55 + spread * 1.2);
        unit.updateMatrix();
        this.dust.setMatrixAt(i, unit.matrix);
      }
      this.dust.instanceMatrix.needsUpdate = true;
    }
  }
}


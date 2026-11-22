import * as T from 'three';
import { ALBATROSS, CARRIER_SHIP, NET, groundHeight } from '@freefall/shared';
import type { MissionSnapshot, PlayersSnapshot, WorldDefinition } from '@freefall/shared';
import { GRAPHICS_QUALITY } from '../GraphicsQuality.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';
import { PanelBatch, emitter, metal, plate, stencil } from './ShipParts.ts';
import { ModelParts } from '../ModelParts.ts';
import { surfaceMaterial } from '../AgentMeshes.ts';
import { dropPose } from './DropChoreography.ts';
import type { DropPose } from './DropChoreography.ts';
import { SupplyContainerView } from './SupplyContainerView.ts';

const unit = new T.Object3D();
const timeProgress = (tick: number, start: number, end: number) => T.MathUtils.clamp((tick - start) / Math.max(1, end - start), 0, 1);
const DOWNWASH = {
  ice: { tint: 0xc5dae2, width: .86, height: .35 },
  desert: { tint: 0xbf9267, width: 1, height: .43 },
  'green-plains': { tint: 0x82714e, width: .53, height: .19 },
  forest: { tint: 0x91653d, width: .47, height: .25 },
};

const destroyedHull = (albatross: MissionSnapshot['albatross']) => albatross?.lifecycleState === 'DESTROYED';

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
  private readonly supply = new SupplyContainerView();
  /** Rounded hull dressing (one merged mesh); darkened together with the hull when the lander is destroyed. */
  private readonly dressing = surfaceMaterial({ vertexColors: true, roughness: .72, metalness: .35 });
  private readonly heatShield = new T.MeshStandardMaterial({ color: 0x2c2926, roughness: .92, metalness: .1, emissive: 0xff5a1e, emissiveIntensity: 0 });
  private readonly plasma = [.26, .12].map((opacity) => ({ opacity, material: new T.MeshBasicMaterial({
    color: 0xff6a2a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }) }));
  private readonly sheath = new T.Group();
  private readonly gear: T.Group[] = [];
  private readonly shockMaterial = new T.MeshBasicMaterial({ color: 0x9f8e74, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
  private readonly shock: T.Mesh[] = [];
  private readonly debris: T.InstancedMesh;
  private lastTick = 0;
  /** Current flight choreography while deploying (camera and audio read it). */
  pose?: DropPose;

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
    this.root.add(this.buildDressing());
    // Ceramic heat shield under the belly and chin; glows during re-entry.
    plate(this.root, this.heatShield, 0, -.29, -.2, 5.05, .09, 10.7);
    const chinShield = plate(this.root, this.heatShield, 0, .42, -7.12, 4.3, .09, 1.1);
    chinShield.rotation.x = .9;
    // Plasma sheath ahead of the belly (the lander falls belly first) in two additive layers.
    const lower = new T.SphereGeometry(1, 22, 9, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    this.plasma.forEach(({ material }, i) => {
      const shell = new T.Mesh(lower, material);
      shell.scale.set(4.1 + i * 1.6, 3.1 + i * 2.4, 8.2 + i * 2.2);
      shell.position.set(0, -.2, -.6);
      this.sheath.add(shell);
    });
    this.sheath.visible = false;
    this.root.add(this.sheath);
    // Four telescopic landing legs; the lower stage keeps its pad on the ground while the hull compresses.
    const piston = new ModelParts({ occlusion: .4 });
    piston.gloss = .45;
    piston.segment(0x8a8f86, [0, 1.15, 0], [0, .12, 0], .075, .075, 8, false);
    piston.gloss = 1;
    piston.tube(0x262a28, 0, .07, 0, .42, .5, .14, 0, 0, 14);
    piston.box(0x3a3f3a, 0, .2, 0, .32, .14, .32, .04);
    const pistonGeometry = piston.geometry();
    for (const side of [-1, 1]) for (const z of [-3.75, 3.75]) {
      const leg = new T.Group();
      leg.add(new T.Mesh(pistonGeometry, this.dressing));
      leg.position.set(side * 3.22, -.2, z);
      this.root.add(leg);
      this.gear.push(leg);
    }
    // Touchdown shock ring and thrown debris.
    for (let i = 0; i < 2; i++) {
      const ring = new T.Mesh(new T.RingGeometry(.82, 1, 56), this.shockMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.shock.push(ring);
      this.root.add(ring);
    }
    this.debris = new T.InstancedMesh(new T.IcosahedronGeometry(.13, 0), new T.MeshStandardMaterial({ color: 0x4d4436, roughness: .95 }), 44);
    this.debris.frustumCulled = false;
    this.debris.visible = false;
    this.root.add(this.debris);
    this.dust = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), this.dustMaterial, 32);
    this.dust.frustumCulled = false;
    this.root.add(this.detail, this.dust, this.wreck, this.supply.root);
  }

  /** Exterior dressing outside the cabin volume: nose, canopy frame, dorsal spine, skirts, pods, gear struts, lights. */
  private buildDressing(): T.Mesh {
    const m = new ModelParts({ contact: .09, occlusion: .55 });
    const dark = 0x4c5249, mid = 0x60675c, graphite = 0x2a302c, olive = 0x605a41, black = 0x1b1e1c, warn = 0xb08a2e;
    // Armoured chin under the canopy, brow and canopy pillars.
    m.gloss = .7;
    m.box(dark, 0, .98, -6.98, 4.5, 1.45, .9, .28, -.28);
    m.box(mid, 0, 3.22, -6.62, 4.66, .3, .72, .1, .22);
    for (const x of [-1.95, -.66, .66, 1.95]) m.box(graphite, x, 2.67, -6.88, .09, .64, .07, .02);
    // Dorsal spine with heat-exchanger grilles, sensor dome and antennas.
    m.box(mid, 0, 4.46, -.6, 2.3, .42, 6.8, .18);
    for (let i = 0; i < 6; i++) m.box(black, 0, 4.68, -3.4 + i * .55, 1.7, .04, .3, .015);
    m.gloss = .3;
    m.dome(0x2e3a3a, 0, 4.62, -4.4, .92, .72, .92, .5);
    m.gloss = .7;
    m.segment(graphite, [.82, 4.62, 1.8], [.82, 5.7, 2.05], .035, .015, 5);
    m.segment(graphite, [-.6, 4.62, 2.6], [-.6, 5.25, 2.72], .03, .014, 5);
    for (const side of [-1, 1]) {
      // Chamfered roof edges soften the box silhouette; panel seams break up the flanks.
      m.box(mid, side * 2.66, 3.82, -.05, .52, .52, 10.5, .08, 0, side * Math.PI / 4);
      m.box(mid, side * 2.12, 4.28, -.28, .36, .36, 7.4, .06, 0, side * Math.PI / 4);
      for (let i = 0; i < 7; i++) m.box(black, side * 3.06, 1.62, -4.5 + i * 1.5, .025, 2.7, .035);
      m.box(black, side * 3.06, 2.62, -.2, .025, .035, 9.6);
      // Rounded armour skirts, intakes and gear struts on the flanks.
      m.capsule(olive, side * 3.1, .4, -.3, .3, 9.6, Math.PI / 2);
      m.box(black, side * 3.07, 2.9, -4.6, .08, .52, 1.3, .03);
      m.box(black, side * 3.07, 2.9, 4.0, .08, .4, .9, .03);
      for (const z of [-3.75, 3.75]) {
        m.segment(graphite, [side * 2.86, 1.45, z], [side * 3.22, .95, z], .16, .12, 8);
        m.box(mid, side * 2.9, 1.5, z, .36, .5, .7, .08);
      }
      for (const z of [-2.9, 2.9]) {
        // Pylon fairings and pod caps over the existing thruster housings.
        m.box(mid, side * 3.54, 2.62, z, 2.72, .24, 1.5, .1);
        m.dome(mid, side * 4.35, 2.92, z, 2.32, .62, 2.32, .5);
        m.tube(black, side * 4.35, 2.95, z, .58, .58, .07, 0, 0, 16);
        for (const y of [1.25, 2.35]) m.tube(black, side * 4.35, y, z, 1.17 - (2.35 - y) * .08, 1.17 - (2.35 - y) * .08, .07, 0, 0, 14);
        m.box(0x9b7536, side * 4.35 + side * 1.12, 1.8, z, .04, .8, .3, .01);
      }
      // Navigation lights on the forward pylon tips (port red, starboard green) and rear warning chevrons.
      m.glow = 2.2;
      m.box(side < 0 ? 0xff3b30 : 0x3cff6a, side * 4.96, 2.3, -2.9, .12, .12, .2, .03);
      m.glow = 0;
      for (let i = 0; i < 3; i++) m.box(i % 2 ? black : warn, side * (1.4 + i * .32), 3.05, 5.5, .3, .14, .05, .02);
    }
    m.gloss = 1;
    return m.mesh(this.dressing);
  }

  update(state: MissionSnapshot, tick: number, quality: GraphicsQuality, players: PlayersSnapshot | undefined,
    world: WorldDefinition, reducedMotion: boolean): void {
    const low = quality === GRAPHICS_QUALITY.low;
    const { albatross, phase, phaseAt, phaseUntil, extraction } = state;
    this.supply.update(albatross?.supply, tick, Math.max(0, Math.min(.1, (tick - this.lastTick) / NET.tickHz)), players);
    this.lastTick = tick;
    const flight = phase === 'DROPPING' || phase === 'ATMOSPHERIC_ENTRY' || phase === 'BRAKING';
    const elapsed = timeProgress(tick, phaseAt, phaseUntil);
    const lift = extraction?.method === 'albatross' && extraction.phase === 'LIFT';
    const liftProgress = lift ? timeProgress(tick, extraction.phaseAt, extraction.endsAt) : 0;
    this.root.visible = state.state !== 'RETURN_TO_CARRIER' && !(lift && state.result?.extractionSucceeded);
    this.detail.visible = !low;
    this.root.position.set(albatross?.x ?? CARRIER_SHIP.x, 0, albatross?.z ?? CARRIER_SHIP.z);
    this.root.rotation.set(0, 0, 0);
    const seconds = Math.max(0, tick - phaseAt) / NET.tickHz;
    const pose = state.state === 'DEPLOYMENT' ? dropPose(phase, elapsed, seconds, reducedMotion ? 0 : tick) : undefined;
    this.pose = pose;
    if (pose) {
      this.root.position.y = pose.height + (flight && phase !== 'BRAKING' && !reducedMotion ? Math.sin(tick * .6) * .07 : 0);
      this.root.rotation.set(pose.pitch, 0, pose.roll);
    }
    const heat = pose?.heat ?? 0;
    this.heatShield.emissiveIntensity = heat * (1.25 + (reducedMotion ? 0 : .3 * Math.sin(tick * 1.7)));
    this.sheath.visible = heat > .02 && phase === 'ATMOSPHERIC_ENTRY';
    for (const [i, { opacity, material }] of this.plasma.entries()) {
      material.opacity = heat * opacity * (reducedMotion ? .8 : .78 + .22 * Math.sin(tick * (2.3 + i) + i));
      material.color.setHex(heat > .6 ? 0xff8c45 : 0xff5a22);
    }
    const gearDown = pose?.gear ?? 1;
    const squeeze = Math.max(0, pose?.compression ?? 0);
    for (const leg of this.gear) {
      // Stowed legs retract into the strut; while compressed the pad stays planted and the piston slides in.
      leg.position.y = -.2 + (1 - gearDown) * .95 + squeeze;
      leg.visible = !destroyedHull(albatross);
    }
    const impact = pose?.sinceImpact ?? -1;
    for (const [i, ring] of this.shock.entries()) {
      const t = impact < 0 ? -1 : (impact - i * .18) / (1.1 + i * .5);
      ring.visible = t > 0 && t < 1 && !reducedMotion;
      if (!ring.visible) continue;
      const radius = 3.5 + (1 - (1 - t) ** 2.4) * (16 + i * 6);
      ring.scale.set(radius, radius, 1);
      ring.position.y = .12 - this.root.position.y;
    }
    this.shockMaterial.opacity = impact < 0 ? 0 : .55 * Math.exp(-impact * 1.6);
    this.debris.visible = impact >= 0 && impact < 1.6 && !low && !reducedMotion;
    if (this.debris.visible) {
      for (let i = 0; i < this.debris.count; i++) {
        const angle = i * 2.39996, speed = 5.5 + i % 5 * 1.4, rise = 3 + i % 4 * 1.6;
        const t = impact;
        const y = Math.max(0, rise * t - 4.9 * t * t);
        const r = 4.2 + speed * t * (y > 0 ? 1 : .8);
        unit.position.set(Math.cos(angle) * r, y + .1 - this.root.position.y, Math.sin(angle) * r);
        unit.rotation.set(t * (3 + i % 3), t * 2, 0);
        unit.scale.setScalar(.6 + (i % 4) * .35);
        unit.updateMatrix();
        this.debris.setMatrixAt(i, unit.matrix);
      }
      this.debris.instanceMatrix.needsUpdate = true;
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
    this.dressing.color.setHex(destroyed ? 0x5a504a : 0xffffff);
    this.hull.emissive.setHex(hit ? 0x38170b : 0x000000);
    const open = !destroyed && (phase === 'DOCKED' || phase === 'BOARDING' || phase === 'DEPLOYED' ||
      (phase === 'TOUCHDOWN' && elapsed > .58));
    const close = phase === 'LOCKED' ? Math.min(1, elapsed * 2.6) : lift ? Math.min(1, liftProgress * 4) : 1;
    const openAtLanding = phase === 'TOUCHDOWN' ? Math.min(1, (elapsed - .58) * 3.5) : 1;
    this.ramp.rotation.x = destroyed ? -.09 : open && !lift ? (-.027 + (1 - openAtLanding) * -1.49) : -1.53 * close;
    const alarm = state.state === 'DEPLOYMENT' || lift;
    this.alarm.emissiveIntensity = destroyed ? 0 : alarm ? 1.8 + (reducedMotion ? 0 : .45 * Math.sin(tick * .24)) : .34;
    this.flame.color.setHex(phase === 'ATMOSPHERIC_ENTRY' ? 0xffa272 : 0x90cfff);
    const thrust = pose?.thrust ?? 0;
    this.nozzles.forEach((unit, i) => {
      const engine = albatross?.thrusters[i];
      const broken = destroyed || engine?.state === 'DESTROYED';
      const damaged = engine?.state === 'DAMAGED';
      const hit = engine && engine.lastHitAt > 0 && tick - engine.lastHitAt < 5;
      unit.shell.emissive.setHex(hit ? 0xf67c34 : 0x000000);
      unit.shell.color.setHex(broken ? 0x302622 : damaged ? 0x61503c : 0x535b4c);
      unit.jet.visible = !broken && (lift || extraction?.method === 'albatross' || thrust > .04);
      const burn = pose ? .5 + 1.35 * thrust : 1;
      unit.jet.scale.set(pose ? .8 + .45 * thrust : 1, (damaged ? .55 : 1) * (2.9 + .8 * Math.sin(tick * .77 + i)) * burn, pose ? .8 + .45 * thrust : 1);
      unit.smoke.visible = Boolean(broken || damaged);
      const drift = (tick / 25 + i * .271) % 1;
      unit.smoke.position.set(.35 * drift, 1.3 + drift * 2.8, .43 * drift);
      unit.smoke.scale.setScalar(.5 + drift);
      (unit.smoke.material as T.MeshBasicMaterial).opacity = .45 * (1 - drift);
    });
    // Downwash builds while the retro burn nears the ground; the slam throws a dense cloud that settles slowly.
    const brakingWash = pose && phase === 'BRAKING' && pose.height < 30 ? .12 + .42 * (1 - pose.height / 30) : -1;
    const touchdownWash = phase === 'TOUCHDOWN' ? Math.max(brakingWash, .5 + .5 * Math.min(1, seconds / 3)) : brakingWash;
    const departureWash = lift ? liftProgress / .35 : -1;
    const spread = Math.max(touchdownWash, departureWash);
    this.dust.visible = this.root.visible && !state.result && !destroyed && spread > 0 && spread < 1;
    this.dust.count = 0;
    if (this.dust.visible) {
      const profile = DOWNWASH[world.planetId as keyof typeof DOWNWASH] ?? DOWNWASH['green-plains'];
      const active = albatross ? albatross.thrusters.filter(({ state }) => state !== 'DESTROYED').length / 4 : 1;
      this.dust.count = reducedMotion ? 8 : low ? 14 : quality === GRAPHICS_QUALITY.high ? 32 : 22;
      this.dustMaterial.color.setHex(profile.tint);
      this.dustMaterial.opacity = .24 * Math.sin(Math.PI * spread) * active * (reducedMotion ? .5 : 1);
      const { x, y, z } = this.root.position;
      for (let i = 0; i < this.dust.count; i++) {
        const angle = i * 2.39996;
        const radius = 3 + spread * (5 + i % 7) * profile.width * (phase === 'TOUCHDOWN' ? 1.6 : 1);
        const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
        const height = groundHeight(world, x + dx, z + dz) - y + .17 + spread * (i % 3) * profile.height;
        unit.position.set(dx, height, dz);
        const size = (.43 + spread * .85) * profile.width * (phase === 'TOUCHDOWN' ? 1.7 : 1);
        unit.scale.set(size, size * .42, size);
        unit.updateMatrix();
        this.dust.setMatrixAt(i, unit.matrix);
      }
      this.dust.instanceMatrix.needsUpdate = true;
    }
  }
}


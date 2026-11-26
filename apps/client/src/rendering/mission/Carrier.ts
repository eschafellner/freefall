import * as T from 'three';
import type { MissionSnapshot, PositionXZ } from '@freefall/shared';
import { carrierAlarm } from '../../audio/CarrierAlarm.ts';
import { emitter } from './ShipParts.ts';
import { CarrierBeacons } from './CarrierBeacons.ts';
import { CarrierHologram } from './CarrierHologram.ts';
import { CarrierSpace, glow } from './CarrierSpace.ts';
import { CardBatch, cardMaterial } from './carrier/CarrierEffects.ts';
import type { CarrierContext } from './carrier/CarrierContext.ts';
import { carrierPalette } from './carrier/CarrierPalette.ts';
import { buildAirlock, buildMess, buildRooms } from './carrier/CarrierStructure.ts';
import { buildHangar } from './carrier/CarrierHangar.ts';
import { buildProps } from './carrier/CarrierProps.ts';
import { CarrierDoors } from './carrier/CarrierDoors.ts';
import { CarrierScreens } from './carrier/CarrierScreens.ts';
import { CarrierExterior } from './carrier/CarrierExterior.ts';
import { ShipKit } from './carrier/ShipKit.ts';

const WHITE = new T.Color(0xd0d4bf);
const ALARM_RED = new T.Color(0xff3a22);

/**
 * Skyfall Carrier, Deck 03: mess atrium with galleries, four side rooms, Krankenstation and Mannschaftsquartier,
 * pressure airlock and the hangar with Albatross 02. Layout and collision come from `CARRIER_WORLD`; this view builds the
 * detailed interior from merged, procedurally textured geometry, the space outside and the alarm lighting.
 */
export class Carrier {
  readonly root = new T.Group();
  private readonly detail = new T.Group();
  private readonly alarm = emitter(0xd93521, .9);
  private readonly lit = emitter(0xd0d4bf, 1.9);
  private readonly space = new CarrierSpace();
  private readonly hologram = new CarrierHologram();
  private readonly beacons: CarrierBeacons;
  private readonly doors: CarrierDoors;
  private readonly screens: CarrierScreens;
  private readonly exterior: CarrierExterior;
  private readonly lights: CarrierContext['lights'] = [];
  private readonly shafts: T.ShaderMaterial[] = [];
  private readonly ticks: CarrierContext['tick'] = [];
  private readonly fill = new T.HemisphereLight(0x9fb9c4, 0x2b2622, .45);
  private red = 0;
  private last = 0;

  constructor() {
    const kit = new ShipKit();
    const p = carrierPalette();
    const soft = glow([[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.35)'], [1, 'rgba(0,0,0,0)']]).map!;
    const glows = new Map<string, CardBatch>();
    const context: CarrierContext = {
      kit, p, lit: this.lit, alarm: this.alarm, root: this.root, detail: this.detail, shafts: this.shafts, lights: this.lights,
      tick: this.ticks,
      ceilingGlow: new CardBatch(cardMaterial(soft, 0xffe7c4, .3)),
      floorGlow: new CardBatch(cardMaterial(soft, 0xffe7c4, .06)),
      glow(color, opacity) {
        const key = color + ':' + opacity;
        let batch = glows.get(key);
        if (!batch) glows.set(key, batch = new CardBatch(cardMaterial(soft, color, opacity)));
        return batch;
      },
      addLight: (color, intensity, distance, x, y, z, low = false, decay = 1.5) => {
        const light = new T.PointLight(color, intensity, distance, decay);
        light.position.set(x, y, z);
        this.lights.push({ light, color: new T.Color(color), intensity, low });
        this.root.add(light);
        return light;
      },
    };
    buildMess(context);
    buildRooms(context);
    buildAirlock(context);
    buildHangar(context);
    this.screens = new CarrierScreens(context);
    buildProps(context, this.screens);
    this.doors = new CarrierDoors(context);
    this.exterior = new CarrierExterior(context);
    kit.finish(this.root, new Map([['detail', this.detail]]));
    context.ceilingGlow.finish(this.detail);
    context.floorGlow.finish(this.detail);
    for (const batch of glows.values()) batch.finish(this.root);

    // Light rig: the hologram, mess fixtures, under-gallery fill, one per room (off on Low) and the hangar floods.
    context.addLight(0xffe2c0, 26, 26, 0, 7.4, -8.2);
    context.addLight(0xffe2c0, 26, 26, 0, 7.4, 8.6);
    for (const side of [-1, 1]) context.addLight(0xffd2a4, 9, 15, side * 10.1, 4.1, 0, true, 1.6);

    this.beacons = new CarrierBeacons([
      { position: [-3.42, 4.76, -16.3], light: true }, { position: [3.42, 4.76, -16.3], light: true },
      { position: [0, 4.16, -20], hanging: true },
      { position: [-6, 10.62, -25.6], hanging: true }, { position: [6, 10.62, -25.6], hanging: true },
      { position: [-10.2, 10.82, -45.6] }, { position: [10.2, 10.82, -45.6] },
      { position: [-10.2, 4.54, -15.6], hanging: true }, { position: [10.2, 4.54, -15.6], hanging: true },
    ]);
    this.root.add(this.detail, this.space.root, this.hologram.root, this.beacons.root, this.fill);
  }

  /** `operators`: positions of the operators on deck (doors open for them). */
  update(now: number, state: MissionSnapshot | undefined, low: boolean, pixelRatio = 1, operators: readonly PositionXZ[] = []): void {
    const dt = Math.min(.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const seconds = now / 1000;
    const level = carrierAlarm(state);
    this.detail.visible = !low;
    this.space.update(now, pixelRatio);
    const lamps = this.beacons.update(now, level, low);
    this.red += ((level === 2 ? 1 : 0) - this.red) * Math.min(1, dt * 3);
    this.hologram.update(now, this.red, low, pixelRatio);
    const pulse = .5 + .5 * Math.sin(now * .0075);
    // Under alarm the work lights drop and turn red; the boarding call only warms them a little.
    for (const { light, color, intensity, low: optional } of this.lights) {
      light.visible = !(low && optional);
      light.color.copy(color).lerp(ALARM_RED, this.red * .75);
      light.intensity = intensity * (1 - this.red * (.45 + .2 * pulse));
    }
    this.lit.emissive.copy(WHITE).lerp(ALARM_RED, this.red * .7);
    this.lit.emissiveIntensity = 1.9 * (1 - this.red * .35);
    this.alarm.emissiveIntensity = level === 2 ? 1.8 + 1.6 * pulse : level === 1 ? 1.1 + .5 * lamps * pulse : .68;
    for (const material of this.shafts) material.uniforms.strength.value = 1 - this.red * .4;
    this.doors.update(dt, state, operators);
    this.screens.update(seconds, low, this.red);
    this.exterior.update(seconds);
    for (const tick of this.ticks) tick(seconds, dt);
  }
}

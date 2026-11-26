import * as T from 'three';
import { glow } from '../CarrierSpace.ts';
import type { CarrierContext } from './CarrierContext.ts';
import { ShipKit } from './ShipKit.ts';
import { shipSurfaces, surface } from './ShipTextures.ts';

/** Materials outside the hull ignore the interior fog (they are hundreds of metres away). */
const hullMaterial = (color: number, roughness = .7, metalness = .5) => new T.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true, fog: false });
const glowMaterial = (color: number) => new T.MeshBasicMaterial({ color, fog: false, toneMapped: false });

interface Blinker { sprite: T.Sprite; phase: number; period: number }

/** Frigate of the escort group: long armoured hull, bridge tower, engine block, window rows and running lights. */
function frigate(length: number, hull: T.Material, dark: T.Material, windows: T.Material, engine: T.Material, flood: T.Material): T.Group {
  const kit = new ShipKit();
  const w = length * .13, h = length * .09;
  kit.box(hull, 0, 0, 0, w, h, length * .7);
  kit.beam(hull, [0, 0, -length * .35], [0, -h * .1, -length * .52], w * .8, h * .8);
  kit.box(dark, 0, -h * .55, -length * .05, w * .7, h * .2, length * .6);
  kit.box(hull, 0, h * .75, length * .12, w * .4, h * .6, length * .16);
  kit.box(dark, 0, h * 1.15, length * .1, w * .5, h * .2, length * .08);
  kit.box(hull, 0, 0, length * .42, w * 1.25, h * 1.1, length * .16);
  for (const s of [-1, 1]) {
    kit.box(dark, s * w * .62, 0, -length * .05, w * .25, h * .5, length * .5);
    kit.box(windows, s * w * .505, h * .18, -length * .1, .2, h * .05, length * .45);
    kit.box(windows, s * w * .505, -h * .12, -length * .02, .2, h * .04, length * .3);
    kit.cylinder(dark, s * w * .35, 0, length * .51, h * .28, length * .04, 'z', 14);
    kit.cylinder(engine, s * w * .35, 0, length * .535, h * .22, length * .01, 'z', 14);
  }
  kit.cylinder(dark, 0, h * .1, length * .51, h * .34, length * .04, 'z', 16);
  kit.cylinder(engine, 0, h * .1, length * .535, h * .27, length * .01, 'z', 16);
  kit.box(windows, 0, h * .82, length * .04, w * .38, h * .08, .3);
  // Floodlit hull sections (name plate, bridge face) so the silhouette reads against the dark sky.
  for (const s of [-1, 1]) {
    kit.box(flood, s * w * .502, h * .05, -length * .22, .15, h * .5, length * .14);
    kit.box(flood, s * w * .202, h * .75, length * .12, .15, h * .45, length * .12);
    for (let z = -length * .3; z < length * .3; z += length * .06) kit.box(windows, s * w * .505, h * -.3, z, .2, h * .06, length * .02);
  }
  kit.box(dark, 0, h * 1.6, length * .14, .3, h * .9, .3);
  const group = new T.Group();
  kit.finish(group);
  return group;
}

/**
 * Outside the hull: the carrier's own aft deck and engine nacelles below the panorama window, escort frigates of the
 * formation (one ahead of the open hangar gate) and a shuttle that passes the windows on a slow orbit.
 */
export class CarrierExterior {
  private readonly blinkers: Blinker[] = [];
  private readonly shuttle = new T.Group();
  private readonly plumes: T.Sprite[] = [];

  constructor(c: CarrierContext) {
    // Hull plating: the wall panel texture at a large tile, no interior fog.
    const hull = surface(shipSurfaces().panel, 0x4a514f, { tile: 7, metalness: .55 });
    const dark = surface(shipSurfaces().metal, 0x23292a, { tile: 5, metalness: .5 });
    hull.fog = dark.fog = false;
    const windows = glowMaterial(0xffd9a0);
    const flood = surface(shipSurfaces().panel, 0x6c7472, { tile: 6, metalness: .3, emissive: 0x8a9496, emissiveIntensity: .22 });
    flood.fog = false;
    const engine = glowMaterial(0x8fd0ff);
    const root = new T.Group();
    root.name = 'carrier:exterior';
    c.root.add(root);
    const plume = glow([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(160,215,255,.55)'], [1, 'rgba(0,0,0,0)']], 0x9fd6ff, .9);
    plume.fog = false;
    const lamp = glow([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.4)'], [1, 'rgba(0,0,0,0)']]);
    lamp.fog = false;
    const blink = (parent: T.Object3D, x: number, y: number, z: number, color: number, size: number, period = 1.6, phase = 0) => {
      const sprite = new T.Sprite(lamp.clone());
      sprite.material.color.setHex(color);
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(size);
      parent.add(sprite);
      this.blinkers.push({ sprite, phase, period });
    };

    // The carrier itself, aft of the mess: deck slab under the panorama window and two engine nacelles.
    const own = new ShipKit();
    own.box(hull, 0, -3.2, 52, 64, 6, 70);
    own.box(dark, 0, -.4, 30, 30, .6, 26);
    for (let x = -24; x <= 24; x += 6) own.box(dark, x, -.1, 46 + (x % 12 ? 8 : 0), 2.5, 1.2, 4);
    // Deck lights in two rows towards the stern and a few vents and hatches on the aft deck.
    for (let z = 22; z < 86; z += 4) for (const x of [-9, 9]) own.box(windows, x, -.15, z, .5, .1, .5);
    for (let i = 0; i < 14; i++) {
      const x = (own.random() - .5) * 50, z = 24 + own.random() * 60;
      own.box(own.random() < .5 ? dark : hull, x, -.05 + own.random() * .4, z, 1 + own.random() * 4, .4 + own.random() * 1.2, 1 + own.random() * 5);
    }
    own.box(hull, 0, 1.5, 70, 10, 5, 20);
    own.box(dark, 0, 4.5, 70, 2, 3, 2);
    own.cylinder(dark, 0, 9, 70, .15, 8, 'y', 6);
    for (const s of [-1, 1]) {
      own.cylinder(hull, s * 36, 2, 70, 7, 76, 'z', 24);
      own.cylinder(dark, s * 36, 2, 30, 7.4, 4, 'z', 24);
      own.cylinder(dark, s * 36, 2, 110, 7.6, 6, 'z', 24);
      own.cylinder(engine, s * 36, 2, 113.2, 6, .4, 'z', 24);
      own.box(hull, s * 24, 0, 70, 16, 3, 30);
      for (let z = 40; z < 104; z += 8) own.box(windows, s * (36 - 7.05 * s), 3.5, z, .2, .5, 3);
      for (let k = 0; k < 6; k++) own.box(dark, s * 36, 2, 38 + k * 13, 15.2, 15.2, .8);
      const glowSprite = new T.Sprite(plume);
      glowSprite.position.set(s * 36, 2, 118);
      glowSprite.scale.setScalar(26);
      root.add(glowSprite);
      this.plumes.push(glowSprite);
      blink(root, s * 31, 0, 17.6, s < 0 ? 0xff3b2b : 0x3cff6a, 2.4, 2.2, s < 0 ? 0 : .4);
      blink(root, s * 43, 9.4, 70, 0xffffff, 3, 1.3, s < 0 ? .2 : .9);
    }
    own.finish(root);

    // Escorts: one ahead of the gate, one off the port side, one against the planet to starboard.
    const escorts: [number, number, number, number, number][] = [
      [46, 26, -240, 92, 1.95], [-160, 18, 12, 96, .35], [190, 34, -40, 64, -1.1],
    ];
    for (const [x, y, z, length, yaw] of escorts) {
      const ship = frigate(length, hull, dark, windows, engine, flood);
      ship.position.set(x, y, z);
      ship.rotation.y = yaw;
      root.add(ship);
      blink(ship, -length * .14, 0, -length * .2, 0xff3b2b, length * .05, 1.8, x * .01);
      blink(ship, length * .14, 0, -length * .2, 0x3cff6a, length * .05, 1.8, x * .01 + .3);
      blink(ship, 0, length * .16, length * .14, 0xffffff, length * .06, 1.1, .5);
      const exhaust = new T.Sprite(plume);
      exhaust.position.set(0, 0, length * .6);
      exhaust.scale.setScalar(length * .35);
      ship.add(exhaust);
    }

    // Shuttle on a slow orbit around the carrier.
    const shuttleKit = new ShipKit();
    shuttleKit.box(hull, 0, 0, 0, 3, 1.6, 9);
    shuttleKit.beam(hull, [0, 0, -4.5], [0, -.2, -6.5], 2.2, 1.2);
    shuttleKit.box(dark, 0, -.4, 1, 7, .25, 3);
    shuttleKit.box(windows, 0, .4, -5, 1.6, .3, .6);
    shuttleKit.cylinder(engine, 0, 0, 4.6, .6, .2, 'z', 12);
    shuttleKit.finish(this.shuttle);
    blink(this.shuttle, -3.6, -.4, 1, 0xff3b2b, 1.4, 1, 0);
    blink(this.shuttle, 3.6, -.4, 1, 0x3cff6a, 1.4, 1, .5);
    const trail = new T.Sprite(plume);
    trail.position.set(0, 0, 6);
    trail.scale.setScalar(6);
    this.shuttle.add(trail);
    root.add(this.shuttle);
    root.traverse((object) => { object.frustumCulled = !(object instanceof T.Sprite) && object.frustumCulled; });
  }

  update(seconds: number): void {
    for (const { sprite, phase, period } of this.blinkers) {
      const t = ((seconds / period + phase) % 1 + 1) % 1;
      sprite.material.opacity = t < .1 ? 1 : .07;
    }
    for (const [i, sprite] of this.plumes.entries()) sprite.material.opacity = .75 + .2 * Math.sin(seconds * 7 + i * 2);
    // Ellipse around the carrier, past the gate and the panorama window; the nose follows the path.
    const a = seconds * (Math.PI * 2 / 95);
    const x = Math.sin(a) * 140, z = Math.cos(a) * 190 - 20, y = 18 + Math.sin(a * 2) * 6;
    this.shuttle.position.set(x, y, z);
    this.shuttle.rotation.y = Math.atan2(-Math.cos(a) * 140, Math.sin(a) * 190);
  }
}

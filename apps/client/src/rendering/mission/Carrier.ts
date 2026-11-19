import * as T from 'three';
import { CARRIER_BENCHES, CARRIER_ROOMS, CARRIER_WORLD } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import { PanelBatch, emitter, metal, plate, stencil } from './ShipParts.ts';

function planetTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(512, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const u = x * Math.PI / 256;
    const v = y * Math.PI / 256;
    const ridge = Math.sin(3 * u + Math.cos(9 * v)) + .51 * Math.sin(7 * u - 13 * v) +
      .35 * Math.cos(29 * u + 19 * v) + .18 * Math.sin(71 * u + 93 * v);
    const cloud = Math.max(0, Math.sin(9 * v + 2 * Math.sin(u * 7 + 4 * v)) + Math.cos(u * 11) - 1);
    const cap = Math.abs(Math.cos(v)) ** 40;
    pixels.data[i] = 11 + Math.max(0, ridge) * 38 + cloud * 44 + cap * 75;
    pixels.data[i + 1] = 65 + Math.max(0, ridge) * 34 + cloud * 71 + cap * 85;
    pixels.data[i + 2] = 65 + Math.max(0, ridge) * 22 + cloud * 100 + cap * 95;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export class Carrier {
  readonly root = new T.Group();
  private readonly detail = new T.Group();
  private readonly planet: T.Mesh;
  private readonly reticle: T.Group;
  private readonly alarm = emitter(0xd93521, .9);
  private readonly doors = new T.Group();

  constructor() {
    const structure = new PanelBatch();
    const details = new PanelBatch();
    const deck = metal(0x353c3b, .92);
    const frame = metal(0x39413d);
    const armor = metal(0x535e58);
    const trim = metal(0x252826);
    const equipment = metal(0x535743);
    const yellow = metal(0xaf852c);
    const lit = emitter(0xd0d4bf, 1.9);
    const lcd = emitter(0x789383, .75);
    const red = this.alarm;
    const panel = structure.add.bind(structure);
    const detail = details.add.bind(details);

    for (let z = -15; z <= 15; z += 3) for (let x = -10.5; x <= 10.5; x += 3) {
      panel((x + z * 3) % 6 > 0 ? armor : deck, x, -.075, z, 2.968, .15, 2.965);
      detail(trim, x, .008, z - 1.32, 2.5, .019, .04);
    }
    panel(deck, 0, -.12, .1, 24, .21, 34);
    panel(frame, 0, 4.95, .15, 24.8, .42, 34.2);
    panel(deck, 0, -.11, -28, 15, .22, 24);
    panel(frame, 0, 5.25, -28, 15.2, .4, 24);
    panel(frame, 0, 2.5, -39.8, 15.2, 5, .4);
    for (const side of [-1, 1]) {
      panel(frame, side * 7.35, 2.45, -29, .45, 5, 22);
      for (const z of [-16, -13, -4.5, 4.5, 13, 16]) {
        panel(frame, side * 11.66, 2.44, z, .84, 4.88, .5);
        panel(armor, side * 11.46, 3.6, z, .12, 1.58, .73);
        panel(lit, side * 11.38, 2.9, z, .11, .57, .13);
      }
      for (let z = -15; z < 16; z += 5) {
        panel(trim, side * 7.8, 4.66, z, 1.04, .26, 3.25);
        panel(lit, side * 7.8, 4.5, z, .63, .08, 2.88);
        panel(armor, side * 10.2, 4.5, z, .25, .25, 5.05);
        detail(yellow, side * 10.6, 4.45, z, .08, .25, 5.05);
      }
      for (let z = -16; z <= 16; z += .78) {
        panel(yellow, side * 2.6, .014, z, .075, .03, .57);
      }
      for (let z = -26; z < -17; z += 2.15) {
        panel(red, side * 2.69, .04, z, .16, .08, .95);
        panel(lit, side * 1.8, 4.48, z, .32, .08, 1);
      }
      const door = new T.Group();
      plate(door, armor, 0, 1.95, 0, 2.75, 3.9, .34);
      plate(door, frame, 0, 2.85, .21, 2.5, .32, .12);
      plate(door, yellow, 0, .47, .22, 2.5, .22, .12);
      door.position.set(side * 4.05, 0, -17.3);
      this.doors.add(door);
    }
    this.root.add(this.doors);

    for (const wall of CARRIER_WORLD.obstacles) {
      const { x, z, halfX, halfZ, height } = wall;
      if (z < -25 || (x === 0 && z === 0) || CARRIER_BENCHES.includes(wall)) continue;
      if (wall.bottom !== undefined) {
        panel(frame, x, (wall.bottom + height) / 2, z, halfX * 2, height - wall.bottom, halfZ * 2);
        for (const side of [-1, 1]) {
          detail(yellow, x, wall.bottom + .05, z + side * halfZ, halfX * 2, .10, .025);
        }
        continue;
      }
      const furniture = height < 2 && halfX >= .5;
      panel(furniture ? equipment : armor, x, height * .5, z, halfX * 2, height, halfZ * 2);
      if (!furniture && halfX < 1 && height >= 2) {
        detail(frame, x, .18, z, halfX * 2 + .16, .34, halfZ * 2);
        detail(equipment, x, 3.86, z, halfX * 2 + .08, .29, halfZ * 2);
      } else if (furniture) {
        detail(trim, x, height + .036, z, halfX * 2.08, .12, halfZ * 2.05);
        detail(lcd, x, height + .1, z, .96, .07, .7);
        for (const u of [-1.5, 0, 1.5]) {
          detail(frame, x + u, .35, z + halfZ + .045, 1.12, .47, .12);
        }
      }
    }
    for (const { x, z, halfX } of CARRIER_BENCHES) {
      panel(trim, x, .35, z, halfX * 2, .13, .63);
      panel(equipment, x, .46, z, halfX * 2, .14, .55);
      panel(armor, x, .65, z - .27, halfX * 2, .37, .10);
      for (const side of [-1, 1]) {
        panel(frame, x + side * (halfX - .19), .22, z, .15, .45, .47);
      }
    }
    for (const z of [-15, -10, -5, 0, 5, 10, 15]) {
      panel(armor, 0, 4.68, z, 23.9, .23, .3);
      panel(armor, 0, 4.76, z + 2.5, 7, .14, .09);
      panel(lit, 0, 4.69, z + 2.5, 5.5, .08, .055);
      for (const x of [-3.8, 3.8]) detail(trim, x, 4.57, z, .22, .2, 5);
    }
    for (const room of CARRIER_ROOMS) {
      const side = Math.sign(room.x);
      panel(deck, room.x - side * .4, -.11, room.z, 13.3, .22, 9);
      panel(frame, room.x - side * .4, 4.92, room.z, 13.3, .32, 9);
      panel(lit, room.x, 4.64, room.z - 1.35, 5, .12, .52);
      panel(lcd, room.x + side * 3.6, 1.1, room.z - 4.16, 1.7, .68, .08);
      for (let i = 0; i < 4; i++) {
        panel(equipment, room.x + side * 4.6, 1.25, room.z - 2.8 + i * 1.6, 1.4, 2.5, 1.42);
        detail(frame, room.x + side * 3.85, 1.48, room.z - 2.8 + i * 1.6, .1, .21, .93);
      }
      stencil(this.root, room.label, 'SKYFALL  /  CREW DECK', [side * 11.57, 3.47, room.z], 3.1, -side * Math.PI / 2);
    }
    for (const x of [-3, 3]) {
      panel(frame, x, 2.43, -17.06, .36, 4.86, 1.03);
      panel(red, x + Math.sign(x) * .26, 2.4, -16.51, .17, 1.72, .12);
      for (let i = 0; i < 6; i++) detail(yellow, x + Math.sign(x) * .67, .011, -15.4 + i * .45, .86, .027, .16, .5);
    }
    for (const side of [-1, 1]) {
      // Flush inspection housings above the checkpoint. Reuse the existing panel batches.
      panel(trim, side * 3.35, 3.76, -16.21, .36, .24, .46, side * .20);
      detail(lcd, side * 3.35, 3.74, -15.99, .12, .09, .04, side * .20);
      panel(equipment, side * 6.4, 2.55, -16.60, 3.75, 1.22, .08);
    }
    stencil(this.root, 'PERSONENKONTROLLE', 'SEKTOR 03  /  ZUGANG WIRD ERFASST', [-6.4, 2.55, -16.53], 3.52);
    stencil(this.root, 'VERLUSTREGISTER', 'ERSATZ ZUGEWIESEN  /  WIDERSPRUCH GESPERRT', [6.4, 2.55, -16.53], 3.52, 0, '#c7a598');
    stencil(this.root, 'ALBATROSS 02', 'BOARDING  /  LUFTSCHLEUSE', [0, 4.23, -16.52], 4.8);
    stencil(this.root, 'SKYFALL', 'FLOTTENKOMMANDO  /  DECK 03', [0, 3.15, 16.65], 6.5, Math.PI);
    stencil(this.root, 'MISSIONSKONSOLE', 'DEV\' AULT  /  TAKTISCHE PLANUNG', [0, .74, 1.61], 2.85, 0, '#c6c9ad');

    panel(frame, 0, .34, 0, 2.64, .68, 2.64);
    panel(armor, 0, .84, 0, 3.16, .36, 3.16);
    panel(lcd, 0, 1.04, 0, 2.1, .047, 2.1);
    panel(trim, 0, 1.10, 0, 1.87, .08, 1.87);
    this.planet = new T.Mesh(new T.SphereGeometry(1.07, 48, 32),
      new T.MeshBasicMaterial({ map: planetTexture(), toneMapped: false, transparent: true, opacity: .91 }));
    this.planet.position.y = 2.48;
    this.planet.rotation.z = .24;
    this.reticle = new T.Group();
    for (const radius of [1.25, 1.43, 1.62]) {
      const ring = new T.Mesh(new T.TorusGeometry(radius, .011, 5, 80),
        new T.MeshBasicMaterial({ color: 0xa3baac, transparent: true, opacity: .53, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.57 - (radius - 1.25) * .8;
      this.reticle.add(ring);
    }
    const beam = new T.Mesh(new T.CylinderGeometry(1.3, .6, 1.3, 32, 1, true),
      new T.MeshBasicMaterial({ color: 0x42a895, transparent: true, opacity: .08, depthWrite: false, side: T.DoubleSide }));
    beam.position.y = 1.72;
    structure.finish(this.root);
    details.finish(this.detail);
    this.root.add(this.detail, this.planet, this.reticle, beam, new T.HemisphereLight(0xd4ece4, 0x829085, 1.2));
  }

  update(now: number, state: MissionSnapshot | undefined, low: boolean): void {
    this.detail.visible = !low;
    this.planet.rotation.y = now * .0002;
    this.planet.position.y = 2.46 + Math.sin(now * .0013) * .052;
    this.reticle.rotation.y = now * .00012;
    const alarm = state?.state === 'DEPLOYMENT';
    this.alarm.emissiveIntensity = alarm ? 1.45 + .85 * Math.sin(now * .005) : .68;
    const open = alarm ? 1.37 : 4.05;
    this.doors.children.forEach((door, i) => { door.position.x = (i === 0 ? -1 : 1) * open; });
  }
}

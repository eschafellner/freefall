import * as T from 'three';
import { CARRIER_CABINS, CARRIER_LOCKERS, CARRIER_ROOMS } from '@freefall/shared';
import { schabeGeometry } from '../../SchabeModel.ts';
import { stencil } from '../ShipParts.ts';
import type { CarrierContext, PropBuilder } from './CarrierContext.ts';
import type { CarrierScreens } from './CarrierScreens.ts';

export const ROOM_ACCENT: Record<string, number> = {
  AUSRÜSTUNG: 0xffb35c, WAFFENKAMMER: 0xff5a3c, RÜSTUNG: 0x7fa8ff, FORSCHUNG: 0x3fe0c0,
};
const WHITE = new T.Color(0xd0d4bf);

function helmet(c: CarrierContext, material: T.Material, x: number, y: number, z: number, r = .15): void {
  c.kit.add(material, new T.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.Matrix4().makeTranslation(x, y, z));
}

/** Armour suit on a stand (about 1.9 m): helmet with visor, plated torso, pauldrons, gauntlets, armoured legs. Faces +z. */
function suit(c: CarrierContext, x: number, y: number, z: number, plate: T.Material, visor: T.Material): void {
  const { kit, p } = c;
  kit.push(x, y, z);
  // Stand: post behind the back, cross bar at the shoulders.
  kit.cylinder(p.frameDark, 0, .75, -.24, .03, 1.5, 'y', 8);
  kit.box(p.frameDark, 0, 1.42, -.2, .5, .04, .04);
  for (const s of [-1, 1]) {
    // Leg: boot, shin guard, knee pad, thigh plate.
    kit.box(p.black, s * .12, .07, .04, .16, .14, .3);
    kit.box(plate, s * .12, .33, .02, .15, .38, .17, 0, { pitch: -.04 });
    kit.box(plate, s * .12, .56, .07, .16, .1, .07, 0, { pitch: .3 });
    kit.box(p.frameDark, s * .12, .62, 0, .13, .1, .13);
    kit.box(plate, s * .125, .8, .015, .17, .32, .19, 0, { roll: s * .04 });
    // Arm: pauldron, upper arm, elbow, forearm gauntlet, hand.
    kit.box(plate, s * .33, 1.38, 0, .2, .12, .26, 0, { roll: s * -.35 });
    kit.box(plate, s * .35, 1.27, 0, .16, .12, .24, 0, { roll: s * -.2 });
    kit.box(p.frameDark, s * .33, 1.12, 0, .1, .26, .11, 0, { roll: s * .08 });
    kit.box(plate, s * .345, .9, .03, .12, .24, .13, 0, { roll: s * .06, pitch: -.15 });
    kit.box(p.black, s * .35, .74, .05, .09, .1, .1);
  }
  // Hips and belt with pouches.
  kit.box(p.frameDark, 0, .98, 0, .36, .12, .22);
  for (const s of [-1, 0, 1]) kit.box(p.olive, s * .13, .98, .12, .09, .1, .06);
  // Torso: abdomen, chest plate in two angled halves, collar, back plate and power pack.
  kit.box(p.frameDark, 0, 1.1, 0, .32, .14, .2);
  for (const s of [-1, 1]) kit.box(plate, s * .09, 1.28, .05, .2, .3, .14, s * -.18, { pitch: -.06 });
  kit.box(plate, 0, 1.43, .03, .36, .07, .2);
  kit.box(plate, 0, 1.27, -.1, .36, .34, .1);
  kit.box(p.frameDark, 0, 1.25, -.18, .26, .3, .1);
  kit.box(visor, .07, 1.32, .125, .05, .02, .01);
  kit.box(p.lcd, -.08, 1.2, .12, .06, .04, .01);
  // Neck seal and helmet with visor band and ear pieces.
  kit.cylinder(p.frameDark, 0, 1.49, 0, .07, .06, 'y', 10);
  kit.add(plate, new T.SphereGeometry(.135, 16, 12), new T.Matrix4().makeScale(1, 1.08, 1.12).setPosition(0, 1.64, 0));
  kit.box(p.black, 0, 1.635, .095, .25, .085, .09, 0, { pitch: .1 });
  kit.box(visor, 0, 1.64, .137, .22, .035, .012, 0, { pitch: .1 });
  for (const s of [-1, 1]) kit.cylinder(p.frameDark, s * .13, 1.62, 0, .045, .04, 'x', 10);
  kit.pop();
}

/** Rifle standing upright, muzzle up, facing +z. */
function rifle(c: CarrierContext, x: number, y: number, z: number, variant: number): void {
  const { kit, p } = c;
  kit.box(p.black, x, y + .2, z, .05, .4, .12);
  kit.box(variant % 2 ? p.grey : p.olive, x, y + .58, z, .07, .42, .14);
  kit.box(p.black, x, y + .5, z + .1, .05, .2, .07, 0, { pitch: .2 });
  kit.box(p.black, x, y + .86, z - .02, .06, .18, .1);
  kit.cylinder(p.steel, x, y + 1.05, z - .02, .016, .42, 'y', 6);
  if (variant % 3 === 0) kit.box(p.black, x, y + .78, z - .07, .05, .12, .05);
}

export const ROOM_BUILDERS: Record<string, PropBuilder> = {
  'ausruestung-station'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.olive, 0, .5, -.05, w, 1, d * .75);
    kit.box(p.frameDark, 0, .06, d * .32, w, .12, .06);
    for (let x = -w / 2 + .6; x < w / 2; x += .9) kit.box(p.frameDark, x, .55, d * .33, .03, .8, .02);
    kit.box(p.steel, 0, 1.02, 0, w + .06, .05, d);
    kit.box(p.frameDark, -w / 2 + .7, 1.45, -.2, .9, .62, .06, 0, { pitch: -.15 });
    screens.place('supply', -w / 2 + .7, 1.45, -.165, .84, .54, 0, -.15);
    kit.box(p.black, -w / 2 + .7, 1.06, .2, .55, .03, .2);
    kit.box(p.grey, .3, 1.15, .15, .3, .2, .25);
    kit.box(p.led, .3, 1.2, .28, .1, .02, .01);
    for (let i = 0; i < 4; i++) kit.box(i % 2 ? p.olive : p.fabricTan, w / 2 - .55, 1.08 + i * .07, -.1, .5, .06, .4, 0, { vary: .08 });
    kit.box(p.olive, w / 2 - .5, 1.25, .25, .45, .4, .35);
    kit.box(p.yellow, w / 2 - .5, 1.3, .43, .3, .06, .01);
    // Hatch behind the counter and the overhead sign.
    kit.box(p.frameDark, 0, 2.6, -d / 2 + .05, w, .1, .1);
    kit.box(p.warm, 0, 2.54, -d / 2 + .05, w - .4, .02, .06);
  },
  'ausruestung-near'(c, _s, _prop, w, d) { shelving(c, w, d, ['crate', 'box', 'can', 'helmet', 'box', 'crate']); },
  'waffenkammer-station'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.steel, 0, .95, .1, w, .08, d * .8);
    for (const x of [-w / 2 + .15, w / 2 - .15]) for (const z of [-.45, .65]) kit.box(p.frameDark, x, .46, z, .1, .92, .1);
    kit.box(p.frameDark, 0, .2, .1, w - .2, .06, d * .7);
    kit.box(p.red, -w / 2 + .5, .55, .1, .8, .6, d * .65);
    for (let i = 0; i < 3; i++) kit.box(p.frameDark, -w / 2 + .5, .4 + i * .18, .63, .7, .01, .01);
    // Vice and a stripped carbine on the bench.
    kit.box(p.grey, w / 2 - .5, 1.06, .3, .25, .14, .3);
    kit.box(p.grey, w / 2 - .5, 1.16, .3, .08, .1, .4);
    kit.box(p.black, 0, 1.0, .3, .9, .04, .14);
    kit.box(p.grey, .2, 1.03, .1, .35, .06, .1);
    kit.cylinder(p.steel, -.4, 1.01, .1, .015, .5, 'x', 6);
    kit.box(p.black, -.1, 1.01, -.05, .1, .03, .18);
    for (let i = 0; i < 6; i++) kit.cylinder(p.yellow, -.9 + i * .04, 1.0, -.2, .006, .05, 'y', 6);
    // Pegboard with tools.
    kit.box(p.frameDark, 0, 1.75, -d / 2 + .1, w, 1.4, .05);
    kit.detail(() => {
      for (let i = 0; i < 14; i++) {
        const x = -w / 2 + .3 + (i % 7) * (w - .6) / 6, y = 1.35 + Math.floor(i / 7) * .55;
        kit.box(i % 3 ? p.steel : p.red, x, y, -d / 2 + .15, .05, .3, .03);
      }
    });
    kit.beam(p.frameDark, [w / 2 - .3, 1.0, -.5], [w / 2 - .5, 1.8, 0], .04, .04);
    kit.cylinder(p.frameDark, w / 2 - .5, 1.8, .05, .12, .08, 'y', 12);
    kit.cylinder(p.warm, w / 2 - .5, 1.75, .05, .1, .02, 'y', 12);
    screens.place('weapon', -w / 2 + .9, 2.0, -d / 2 + .14, 1.1, .62);
  },
  'waffenkammer-near'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    for (let i = 0; i < 8; i++) {
      const x = -w / 2 + .6 + i * (w - 2.2) / 7;
      const stack = 1 + Math.floor(kit.random() * 3);
      for (let k = 0; k < stack; k++) {
        kit.box(p.olive, x, .24 + k * .48, 0, .95, .46, .58, (kit.random() - .5) * .08, { vary: .1 });
        kit.box(p.yellow, x, .3 + k * .48, .295, .5, .06, .01);
        kit.box(p.frameDark, x, .47 + k * .48, 0, .97, .02, .6);
      }
    }
    kit.box(p.grey, w / 2 - .7, 1.1, -.05, 1.2, 2.2, d * .85);
    kit.box(p.frameDark, w / 2 - .7, 1.1, d * .38, .02, 2.0, .01);
    kit.box(p.led, w / 2 - .45, 1.3, d * .38, .06, .1, .02);
  },
  'ruestung-station'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    kit.cylinder(p.frameDark, 0, .1, 0, .78, .2, 'y', 32);
    const ring = new T.TorusGeometry(.7, .025, 6, 48);
    ring.rotateX(Math.PI / 2);
    kit.add(p.blueLamp, ring, new T.Matrix4().makeTranslation(0, .21, 0));
    suit(c, 0, .2, 0, p.grey, p.blueLamp);
    for (const s of [-1, 1]) {
      // Robot arm: base, two links, gripper reaching for the shoulder.
      const base: [number, number, number] = [s * (w / 2 - .35), .3, -.2];
      kit.cylinder(p.yellow, base[0], .15, base[2], .22, .3, 'y', 16);
      kit.beam(p.yellow, base, [s * .95, 1.4, -.35], .14, .14);
      kit.beam(p.yellow, [s * .95, 1.4, -.35], [s * .5, 1.65, -.1], .1, .1);
      kit.cylinder(p.frameDark, s * .95, 1.4, -.35, .1, .18, 'x', 12);
      kit.box(p.frameDark, s * .46, 1.62, -.08, .06, .12, .16);
    }
    kit.box(p.frameDark, w / 2 - .25, 1.2, d / 2 - .2, .06, 1.2, .06);
    kit.box(p.frameDark, w / 2 - .25, 1.85, d / 2 - .2, .9, .55, .06, -.4);
    screens.place('armor', w / 2 - .25 + Math.sin(-.4) * .04, 1.85, d / 2 - .2 + Math.cos(-.4) * .04, .82, .47, -.4);
  },
  'ruestung-near'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + 1 + i * (w - 2) / 4;
      kit.box(p.frameDark, x, .05, 0, 1.8, .1, d);
      for (let k = 0; k < 6; k++) kit.box(p.frameDark, x - .75 + k * .3, .55, -d / 2 + .1, .04, 1, .04);
      for (let k = 0; k < 5; k++) kit.box(k % 2 ? p.grey : p.olive, x - .6 + k * .3, .6, 0, .05, .9 + kit.random() * .2, .7, 0, { roll: .1, vary: .08 });
      kit.box(p.steel, x, 1.6, 0, 1.8, .04, d * .9);
      for (let k = 0; k < 3; k++) helmet(c, k % 2 ? p.grey : p.olive, x - .55 + k * .55, 1.62, 0, .16);
    }
  },
  'forschung-station'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.white, 0, .45, 0, w, .9, d * .8);
    kit.box(p.black, 0, .93, 0, w + .04, .05, d * .85);
    for (let x = -w / 2 + .45; x < w / 2; x += .85) kit.box(p.frameDark, x, .45, d * .4, .02, .8, .01);
    // Microscope, sample rack with glowing vials, centrifuge.
    kit.box(p.white, -w / 2 + .55, 1.0, 0, .25, .1, .3);
    kit.beam(p.white, [-w / 2 + .55, 1.0, -.1], [-w / 2 + .55, 1.4, -.05], .06, .06);
    kit.cylinder(p.black, -w / 2 + .55, 1.28, .05, .04, .25, 'y', 10, { pitch: .4 });
    kit.box(p.frameDark, -.2, 1.0, .1, .6, .08, .2);
    for (let i = 0; i < 8; i++) kit.cylinder(i % 3 ? p.green : p.teal, -.45 + i * .07, 1.09, .1, .015, .14, 'y', 6);
    kit.cylinder(p.white, .5, 1.03, -.05, .2, .16, 'y', 18);
    kit.cylinder(p.frameDark, .5, 1.12, -.05, .17, .02, 'y', 18);
    // Holo emitter with a slowly turning specimen projection above it (see the specimen tanks).
    kit.cylinder(p.frameDark, w / 2 - .45, .98, .05, .16, .06, 'y', 18);
    kit.cylinder(p.teal, w / 2 - .45, 1.015, .05, .12, .01, 'y', 18);
    kit.box(p.frameDark, 0, 1.7, -d / 2 + .1, 1.4, .82, .06);
    screens.place('specimen', 0, 1.7, -d / 2 + .135, 1.3, .73);
    kit.box(p.frameDark, 0, 1.15, -d / 2 + .12, .06, .5, .06);
  },
  'forschung-near'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + .9 + i * 1.7;
      kit.box(p.white, x, 1.1, 0, 1.6, 2.2, d * .9);
      kit.box(p.glass, x, 1.45, d * .46, 1.4, 1.2, .02);
      for (const y of [1.0, 1.45, 1.9]) {
        kit.box(p.steel, x, y, .05, 1.5, .02, d * .7);
        for (let k = 0; k < 5; k++) kit.cylinder([p.white, p.teal, p.amber][(k + i) % 3], x - .6 + k * .3, y + .1, .05, .05, .18, 'y', 8);
      }
    }
    // Fume hood with lit interior and the cryo freezer.
    kit.box(p.white, w / 2 - 1.7, .45, 0, 2, .9, d);
    kit.box(p.white, w / 2 - 1.7, 2.0, -.1, 2, .5, d * .8);
    kit.box(p.cool, w / 2 - 1.7, 1.73, -.1, 1.8, .02, d * .6);
    kit.box(p.glass, w / 2 - 1.7, 1.3, d * .4, 1.9, .8, .02);
    kit.box(p.frameDark, w / 2 - 1.7, 1.3, -d / 2 + .05, 1.9, .8, .02);
    kit.box(p.white, -w / 2 + 6.2, .8, 0, 1, 1.6, d * .9);
    kit.box(p.blueLamp, -w / 2 + 6.2, 1.4, d * .46, .5, .06, .01);
    screens.place('vitals', -w / 2 + 6.2, 1.05, d * .455, .7, .4);
  },
  'ausruestung-extra'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.fabricTan, 0, .07, 0, w, .14, d, 0, { tint: 0x9a8a6a });
    for (const x of [-w / 2 + .1, 0, w / 2 - .1]) kit.box(p.fabricTan, x, .07, 0, .12, .16, d + .02, 0, { tint: 0x7a6a4a });
    for (let i = 0; i < 4; i++) kit.box(i % 2 ? p.olive : p.fabricTan, (i % 2 - .5) * .85, .45 + Math.floor(i / 2) * .5, 0, .8, .48, d * .85, 0, { vary: .1 });
    for (const x of [-.4, .4]) kit.box(p.yellow, x, .62, 0, .04, 1.0, d * .87);
    kit.box(p.paper, .2, .75, d * .43, .25, .18, .01);
  },
  'waffenkammer-extra'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.steel, 0, .82, 0, w, .05, d * .8);
    for (const x of [-w / 2 + .1, w / 2 - .1]) for (const z of [-d * .32, d * .32]) kit.box(p.frameDark, x, .4, z, .06, .8, .06);
    kit.box(p.rubber, 0, .85, 0, w * .8, .01, d * .6);
    kit.box(p.black, -.1, .88, 0, .9, .05, .12, .2);
    kit.cylinder(p.steel, .45, .87, .05, .015, .45, 'x', 6, { yaw: .2 });
    kit.box(p.olive, .55, .9, -.2, .3, .1, .2);
    for (let i = 0; i < 4; i++) kit.cylinder([p.white, p.red, p.yellow, p.white][i], -.6 + i * .08, .9, -.25, .025, .1, 'y', 8);
    kit.cylinder(p.fabric, 0, .5, d / 2 + .35, .18, .06, 'y', 12);
    kit.cylinder(p.frameDark, 0, .25, d / 2 + .35, .03, .5, 'y', 6);
  },
  'ruestung-extra'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.blue, 0, .45, 0, w, .9, d);
    kit.box(p.frameDark, 0, .92, 0, w * .8, .04, d * .8);
    for (const x of [-w / 2 + .15, w / 2 - .15]) kit.box(p.blue, x, 1.5, 0, .2, 1.2, d * .6);
    kit.box(p.blue, 0, 2.05, 0, w, .3, d * .7);
    kit.cylinder(p.steel, 0, 1.6, 0, .12, .7, 'y', 12);
    kit.box(p.frameDark, 0, 1.22, 0, .8, .08, .6);
    kit.box(p.grey, 0, .96, 0, .7, .04, .5, .2);
    kit.box(p.hazard, 0, 1.93, d * .36, w, .1, .01);
    kit.box(p.led, w / 2 - .25, .7, d / 2 + .005, .08, .08, .01);
    kit.box(p.green, w / 2 - .4, .7, d / 2 + .005, .08, .08, .01);
  },
  'forschung-extra'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.white, 0, .3, 0, w, .6, d * .9);
    kit.cylinder(p.white, 0, .72, 0, .42, w - .1, 'x', 20);
    kit.cylinder(p.teal, 0, .72, 0, .36, w - .2, 'x', 20);
    kit.box(p.glass, 0, .98, 0, w - .3, .02, .5);
    for (const s of [-1, 1]) kit.cylinder(p.frameDark, s * (w / 2 - .02), .72, 0, .45, .06, 'x', 20);
    kit.box(p.frameDark, w / 2 - .3, .3, d / 2 + .01, .4, .3, .02);
    kit.box(p.teal, w / 2 - .3, .35, d / 2 + .02, .3, .1, .01);
    kit.rod(p.steel, [-w / 2 + .1, .9, -.2], [-w / 2 + .1, 4.6, -.2], .05);
  },
  'med-bed'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.white, 0, .35, 0, w, .12, d);
    for (const x of [-w / 2 + .1, w / 2 - .1]) for (const z of [-d / 2 + .08, d / 2 - .08]) kit.box(p.frameDark, x, .17, z, .06, .34, .06);
    kit.box(p.paper, 0, .5, 0, w - .1, .18, d - .1);
    kit.box(p.blue, .2, .6, 0, w * .62, .04, d - .06);
    kit.box(p.paper, -w / 2 + .3, .63, 0, .4, .1, d * .6);
    kit.box(p.white, -w / 2 + .03, .75, 0, .06, .5, d);
    kit.box(p.steel, .2, .72, d / 2 - .02, w * .7, .03, .03);
    // Monitor arm at the head end and an IV stand.
    kit.box(p.frameDark, -w / 2 + .2, 1.2, -d / 2 + .02, .06, 1.2, .06);
    kit.box(p.frameDark, -w / 2 + .4, 1.75, -d / 2 + .15, .56, .36, .05, .5);
    screens.place('vitals', -w / 2 + .4 + Math.sin(.5) * .03, 1.75, -d / 2 + .15 + Math.cos(.5) * .03, .5, .3, .5);
    kit.cylinder(p.steel, -w / 2 - .25, .9, d / 2 - .1, .015, 1.8, 'y', 6);
    kit.box(p.glass, -w / 2 - .25, 1.65, d / 2 - .1, .12, .2, .05);
    kit.cylinder(p.frameDark, -w / 2 - .25, .02, d / 2 - .1, .2, .04, 'y', 10);
  },
  'med-scanner'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.white, 0, .3, 0, w * .55, .6, d * .9);
    kit.box(p.paper, 0, .64, 0, w * .5, .08, d * .85);
    for (const z of [-.3, .3]) {
      const ring = new T.TorusGeometry(.78, .09, 10, 40);
      kit.add(p.white, ring, new T.Matrix4().makeTranslation(0, .7, z));
      const glowRing = new T.TorusGeometry(.7, .02, 6, 40);
      kit.add(p.teal, glowRing, new T.Matrix4().makeTranslation(0, .7, z + (z > 0 ? -.09 : .09)));
    }
    kit.box(p.frameDark, w / 2 - .1, .55, -d / 2 + .3, .2, 1.1, .3);
    kit.box(p.teal, w / 2 - .1, 1.0, -d / 2 + .46, .14, .2, .01);
    c.floorGlow.pool(0, .03, 0, 2.4, 2.4);
  },
  'med-cabinet'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.white, 0, 1.2, 0, w, 2.4, d * .9);
    for (let x = -w / 2 + .55; x < w / 2; x += 1.1) {
      kit.box(p.glass, x, 1.6, d * .46, 1, 1.4, .02);
      kit.box(p.frameDark, x - .55, 1.2, d * .45, .02, 2.3, .02);
      for (const y of [1.15, 1.6, 2.05]) {
        kit.box(p.steel, x, y, .1, 1, .02, d * .6);
        for (let k = 0; k < 4; k++) kit.box([p.white, p.red, p.blue, p.paper][(k + Math.round(x)) & 3], x - .35 + k * .23, y + .09, .1, .16, .16, .2, 0, { vary: .1 });
      }
    }
    kit.box(p.red, 0, 2.62, d * .3, .5, .14, .02);
    kit.box(p.red, 0, 2.62, d * .3, .14, .5, .02);
    kit.box(p.yellow, w / 2 - .5, .5, d * .47, .4, .5, .08);
    kit.box(p.green, w / 2 - .5, .66, d * .52, .1, .04, .01);
  },
  bunk(c, _s, _prop, w, d) {
    const { kit, p } = c;
    for (const x of [-w / 2 + .04, w / 2 - .04]) for (const z of [-d / 2 + .04, d / 2 - .04]) kit.box(p.frameDark, x, 1.3, z, .06, 2.6, .06);
    const blankets = [p.olive, p.fabricRed, p.fabric, p.blue, p.fabricTan];
    for (const y of [.32, 1.17, 2.02]) {
      kit.box(p.frameDark, 0, y, 0, w, .05, d);
      kit.box(p.paper, 0, y + .08, 0, w - .12, .12, d - .1);
      kit.box(blankets[Math.floor(kit.random() * blankets.length)], .25, y + .15, .02, w * .7, .05, d - .06, 0, { vary: .1 });
      kit.box(p.paper, -w / 2 + .25, y + .17, 0, .32, .08, d * .6);
      kit.box(p.warm, -w / 2 + .1, y + .6, -d / 2 + .06, .08, .04, .04);
      if (kit.random() < .35) kit.box(p.fabricLight, .4 + kit.random() * .3, y + .42, d / 2 - .02, .7, .62, .015, 0, { vary: .1, tint: 0x9aa8a0 });
      if (kit.random() < .4) kit.box(p.paper, .3, y + .45, -d / 2 + .02, .12, .16, .01, 0, { vary: .2 });
    }
    for (let y = .6; y < 2.2; y += .3) kit.box(p.steel, w / 2 - .04, y, 0, .03, .03, d);
  },
  'crew-table'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.grey, 0, .75, 0, w, .05, d);
    kit.box(p.frameDark, 0, .37, 0, .1, .74, .1);
    kit.box(p.frameDark, 0, .02, 0, .5, .04, .5);
    for (const z of [-d / 2 - .35, d / 2 + .35]) {
      kit.cylinder(p.fabric, -.05, .45, z, .18, .06, 'y', 12);
      kit.cylinder(p.frameDark, -.05, .22, z, .03, .44, 'y', 6);
    }
    for (let i = 0; i < 6; i++) kit.box(p.paper, -.15 + kit.random() * .3, .78, -.4 + kit.random() * .8, .06, .005, .09, kit.random() * 3);
    kit.cylinder(p.white, .2, .82, .3, .04, .1, 'y', 8);
    kit.cylinder(p.amber, -.2, .9, -.6, .05, .25, 'y', 8);
  },
};

type Item = 'crate' | 'box' | 'can' | 'helmet';
function shelving(c: CarrierContext, w: number, d: number, items: Item[]): void {
  const { kit, p } = c;
  const units = Math.round(w / 2.5), unit = w / units;
  for (let u = 0; u <= units; u++) for (const z of [-d / 2 + .04, d / 2 - .04]) kit.box(p.frameDark, -w / 2 + u * unit, 1.1, z, .06, 2.2, .06);
  for (const y of [.12, .78, 1.44, 2.1]) {
    kit.box(p.steel, 0, y, 0, w, .03, d);
    if (y > 2) continue;
    kit.fine = true;
    for (let x = -w / 2 + .3; x < w / 2 - .25;) {
      const item = items[Math.floor(kit.random() * items.length)];
      const size = item === 'crate' ? .62 : item === 'box' ? .42 : item === 'can' ? .3 : .34;
      if (kit.random() < .82) {
        if (item === 'crate') {
          kit.box(p.olive, x + size / 2, y + .2, 0, size, .38, d * .8, 0, { vary: .1 });
          kit.box(p.yellow, x + size / 2, y + .26, d * .4, size * .6, .05, .01);
        } else if (item === 'box') kit.box(p.fabricTan, x + size / 2, y + .16, 0, size, .3, d * .7, (kit.random() - .5) * .2, { vary: .15 });
        else if (item === 'can') kit.box(p.yellow, x + size / 2, y + .13, 0, size, .24, .2, 0, { vary: .1 });
        else helmet(c, p.olive, x + size / 2, y + .015, 0, .15);
      }
      x += size + .08;
    }
    kit.fine = false;
  }
}

/** Far-wall row of each side room: lockers, weapon racks, armour alcoves or specimen tanks. */
function wallRow(c: CarrierContext, label: string, accent: T.Material, color: number): void {
  const { kit, p } = c;
  const dim = c.p.lamp(color, .16);
  const w = 10.8;
  switch (label) {
    case 'AUSRÜSTUNG':
      for (let i = 0; i < 7; i++) {
        const x = -w / 2 + .77 + i * 1.543;
        kit.box(p.olive, x, 1.25, 0, 1.46, 2.5, .74, 0, { vary: .06 });
        for (const s of [-1, 1]) {
          kit.box(p.frameDark, x + s * .36, 1.3, .375, .64, 2.2, .02);
          for (let k = 0; k < 4; k++) kit.box(p.black, x + s * .36, 2.05 + k * .06, .38, .4, .025, .01);
          kit.box(p.steel, x + s * .08, 1.3, .39, .03, .24, .03);
          kit.box(p.white, x + s * .36, 1.75, .38, .32, .07, .01);
        }
        kit.box(accent, x - .5, 2.4, .38, .1, .04, .01);
        if (kit.random() < .6) kit.cylinder(p.fabricTan, x, 2.68, 0, .17, .9, 'x', 10, { vary: .1 });
      }
      break;
    case 'WAFFENKAMMER':
      kit.box(p.frameDark, 0, 1.2, -.3, w, 2.4, .14);
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 1.35 + i * 2.7;
        kit.box(p.frame, x, 1.2, -.1, 2.5, 2.3, .06);
        kit.box(p.frameDark, x, .35, .1, 2.5, .12, .4);
        kit.detail(() => { for (let k = 0; k < 6; k++) rifle(c, x - 1.0 + k * .4, .42, .05, i * 6 + k); });
        // Grille doors (one rack stands open).
        if (i !== 2) {
          for (let g = 0; g < 9; g++) kit.box(p.steel, x - 1.2 + g * .3, 1.2, .3, .03, 2.2, .03);
          for (const y of [.2, 1.2, 2.25]) kit.box(p.steel, x, y, .3, 2.5, .04, .04);
          kit.box(p.led, x + 1.1, 1.3, .33, .05, .08, .02);
        }
      }
      kit.box(accent, 0, 2.45, .05, w, .04, .04);
      break;
    case 'RÜSTUNG':
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 1.35 + i * 2.7;
        kit.box(p.frameDark, x, 1.25, -.25, 2.5, 2.5, .2);
        kit.box(dim, x, 1.25, -.14, 2.1, 2.2, .02);
        for (const s of [-1, 1]) kit.box(p.frameDark, x + s * 1.2, 1.25, 0, .12, 2.5, .7);
        kit.box(p.frameDark, x, 2.45, 0, 2.5, .1, .7);
        kit.cylinder(p.frameDark, x, .06, 0, .45, .12, 'y', 20);
        suit(c, x, .12, 0, i % 2 ? p.olive : p.grey, i === 3 ? p.amber : p.blueLamp);
        kit.box(p.glass, x, 1.25, .34, 2.3, 2.3, .02);
      }
      break;
    case 'FORSCHUNG':
      kit.box(p.frameDark, 0, 1.25, -.3, w, 2.5, .1);
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 1.35 + i * 2.7;
        kit.cylinder(p.frameDark, x, .2, 0, .42, .4, 'y', 24);
        kit.cylinder(p.teal, x, .41, 0, .36, .02, 'y', 24);
        kit.cylinder(p.glass, x, 1.3, 0, .36, 1.8, 'y', 24, { open: true });
        kit.cylinder(p.frameDark, x, 2.3, 0, .42, .3, 'y', 24);
        for (const s of [-1, 1]) kit.cylinder(p.steel, x + s * .2, 3.6, -.1, .05, 2.4, 'y', 8);
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * Math.PI * 2 + .4;
          kit.box(p.frameDark, x + Math.cos(a) * .37, 1.3, Math.sin(a) * .37, .04, 1.8, .04);
        }
        kit.box(p.frameDark, x + .9, 1.2, -.1, .5, .8, .2);
        kit.box(p.teal, x + .9, 1.35, .01, .3, .12, .01);
        kit.box(p.led, x + .9, 1.05, .01, .06, .06, .01);
      }
      break;
  }
}

/** Swarm specimens floating in the research tanks: one instanced Schabe model, glowing liquid around it. */
function specimens(c: CarrierContext, positions: T.Vector3[]): void {
  const geometry = schabeGeometry(1);
  geometry.computeBoundingBox();
  const size = new T.Vector3();
  geometry.boundingBox!.getSize(size);
  const scale = .62 / Math.max(size.x, size.y, size.z);
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .1, emissive: 0x0d3b35, emissiveIntensity: .8 });
  const mesh = new T.InstancedMesh(geometry, material, positions.length);
  const dummy = new T.Object3D();
  positions.forEach((position, i) => {
    dummy.position.copy(position);
    dummy.rotation.set(-Math.PI / 2 + .2, i * 1.7, .3 * (i % 2 ? 1 : -1));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.computeBoundingSphere();
  c.detail.add(mesh);
  const liquid = new T.MeshBasicMaterial({ color: 0x1fb89f, transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false });
  const column = new T.CylinderGeometry(.34, .34, 1.76, 24, 1, true);
  for (const position of positions) {
    const fluid = new T.Mesh(column, liquid);
    fluid.position.set(position.x, 1.3, position.z);
    fluid.renderOrder = 4;
    c.root.add(fluid);
  }
  let t = 0;
  c.tick.push((seconds) => {
    if (Math.abs(seconds - t) < .05) return;
    t = seconds;
    positions.forEach((position, i) => {
      dummy.position.set(position.x, position.y + Math.sin(seconds * .5 + i) * .05, position.z);
      dummy.rotation.set(-Math.PI / 2 + .2, i * 1.7 + seconds * .08, .3 * (i % 2 ? 1 : -1));
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

export function buildRoomProps(c: CarrierContext, _screens: CarrierScreens): void {
  const { kit, p } = c;
  for (const room of CARRIER_ROOMS) {
    const side = Math.sign(room.x), away = Math.sign(room.z);
    const color = ROOM_ACCENT[room.label] ?? 0xd0d4bf;
    const accent = c.p.lamp(color, 2.2);
    kit.zone = side < 0 ? 'port' : 'starboard';
    // Accent bands on both partitions, a light pool and the room light (off on Low).
    for (const dz of [-1, 1]) kit.box(accent, room.x, 3.2, room.z + dz * 5.73, 16.4, .05, .03);
    c.glow(color, .05).pool(room.x, .04, room.z, 11, 8);
    c.addLight(new T.Color(color).lerp(WHITE, .35).getHex(), 24, 15, room.x, 4.05, room.z, true, 1.6);
    const row = CARRIER_LOCKERS.find((locker) => Math.sign(locker.x) === side && Math.sign(locker.z) === away)!;
    kit.push(row.x, 0, row.z, away > 0 ? Math.PI : 0);
    wallRow(c, room.label, accent, color);
    kit.pop();
    stencil(c.root, room.label, 'SKYFALL  /  CREW DECK  /  STATION', [room.x - side * 1.5, 4.05, room.z - away * 5.7], 3.4, away > 0 ? 0 : Math.PI);
    if (room.label === 'FORSCHUNG') {
      // The row faces the room with yaw 0 (bow side), so local x is world x.
      specimens(c, [0, 1, 2, 3].map((i) => new T.Vector3(row.x - 5.4 + 1.35 + i * 2.7, 1.25, row.z)));
    }
  }
  for (const cabin of CARRIER_CABINS) {
    const medbay = cabin.x < 0;
    kit.zone = medbay ? 'port' : 'starboard';
    c.addLight(medbay ? 0xe2f4ff : 0xffc890, medbay ? 12 : 9, 12, cabin.x, 3.3, 0, true, 1.6);
    const side = Math.sign(cabin.x);
    stencil(c.root, cabin.label, medbay ? 'SANITÄT  /  DECK 03' : 'KOJEN 1–24  /  RUHEZEIT 22–06', [cabin.x + side * 8.2, 3.05, 0], 2.6, -side * Math.PI / 2);
    if (medbay) {
      // Curtain rails between the beds.
      for (const x of [-17.75, -21.4]) for (const s of [-1, 1]) {
        kit.box(p.steel, x, 3.1, s * 2.2, .03, .03, 1.1);
        kit.box(p.fabricLight, x, 2.0, s * 2.25, .02, 2.1, .9);
      }
    } else {
      // A few pin-ups and notes on the walls.
      for (const [x, s] of [[16.95, 1], [22.35, -1]] as const) kit.box(p.paper, x, 2.9, s * 2.73, .5, .7, .02, 0, { tint: 0xc8b090 });
    }
  }
}

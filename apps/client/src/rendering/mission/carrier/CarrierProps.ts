import * as T from 'three';
import { CARRIER_PROPS, CARRIER_HALLS } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import { floorPaint } from './CarrierDecals.ts';
import { footprint } from './CarrierContext.ts';
import type { CarrierContext, PropBuilder } from './CarrierContext.ts';
import type { CarrierScreens } from './CarrierScreens.ts';
import { ROOM_BUILDERS, buildRoomProps } from './CarrierRoomProps.ts';
import { HANGAR_BUILDERS, buildHangarProps } from './CarrierHangarProps.ts';

/** Things people leave on a mess table: trays with food, cups, a helmet, a datapad. */
function tableClutter(c: CarrierContext, w: number, y: number): void {
  const { kit, p } = c;
  const seats = Math.floor(w / .85);
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + .45 + i * (w - .9) / Math.max(1, seats - 1);
    for (const side of [-1, 1]) {
      const r = kit.random();
      if (r < .35) continue;
      const z = side * .24;
      if (r < .75) {
        kit.box(p.grey, x, y + .012, z, .42, .024, .3, 0, { vary: .08 });
        kit.box(r < .55 ? p.olive : p.fabricTan, x - .08, y + .04, z, .14, .03, .12);
        kit.box(p.white, x + .1, y + .04, z - .03, .1, .03, .16);
        kit.cylinder(p.white, x + .12, y + .06, z + .09, .035, .08, 'y', 10);
      } else if (r < .88) {
        kit.cylinder(p.white, x, y + .05, z, .04, .1, 'y', 10);
        kit.cylinder(p.steel, x + .14, y + .05, z + .05, .035, .1, 'y', 10);
      } else {
        // Helmet left on the table.
        const helmet = new T.SphereGeometry(.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        kit.add(p.olive, helmet, new T.Matrix4().makeTranslation(x, y, z));
        kit.box(p.black, x, y + .07, z + side * .13, .2, .06, .02);
      }
    }
  }
  if (kit.random() < .6) {
    kit.box(p.black, -w / 4, y + .01, 0, .26, .02, .18, .3);
    kit.box(p.lcd, -w / 4, y + .022, 0, .22, .005, .14, .3);
  }
}

const BUILDERS: Record<string, PropBuilder> = {
  'mess-table'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.grey, 0, .75, 0, w, .05, d);
    kit.box(p.frameDark, 0, .715, 0, w + .02, .03, d + .02);
    for (const x of [-w / 2 + .35, w / 2 - .35]) {
      kit.box(p.frameDark, x, .36, 0, .08, .7, d * .7);
      kit.box(p.frameDark, x, .025, 0, .14, .05, d * .9);
    }
    kit.box(p.frameDark, 0, .3, 0, w - .7, .08, .08);
    kit.detail(() => tableClutter(c, w, .775));
  },
  'mess-bench'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.fabric, 0, .44, 0, w, .07, d * .95);
    kit.box(p.frameDark, 0, .39, 0, w - .1, .04, d * .7);
    for (const x of [-w / 2 + .3, 0, w / 2 - .3]) kit.box(p.frameDark, x, .2, 0, .06, .4, d * .55);
  },
  'wall-unit'(c, screens, _prop, w, d) {
    const { kit, p } = c;
    const back = -d / 2;
    kit.box(p.olive, 0, .45, back + .35, w, .9, .7);
    for (let x = -w / 2 + .5; x < w / 2; x += 1) {
      kit.box(p.frameDark, x - .5, .45, back + .705, .02, .82, .01);
      kit.box(p.steel, x - .12, .62, back + .72, .16, .03, .03);
    }
    kit.box(p.steel, 0, .92, back + .37, w + .04, .04, .76);
    kit.box(p.frameDark, 0, 1.75, back + .04, 2.1, 1.25, .08);
    screens.place(w > 3.5 ? 'roster' : 'fleet', 0, 1.75, back + .085, 1.9, 1.07);
    // Water dispenser, cups and a first-aid box.
    kit.box(p.white, w / 2 - .45, 1.25, back + .2, .4, .6, .3);
    kit.box(p.blueLamp, w / 2 - .45, 1.4, back + .36, .1, .05, .02);
    kit.cylinder(p.glass, w / 2 - .45, 1.72, back + .2, .14, .35, 'y', 14);
    for (let i = 0; i < 3; i++) kit.cylinder(p.white, -w / 2 + .3 + i * .12, .98, back + .5, .035, .08, 'y', 8);
    kit.box(p.white, -w / 2 + .45, 1.5, back + .1, .45, .35, .16);
    kit.box(p.red, -w / 2 + .45, 1.5, back + .19, .12, .04, .01);
    kit.box(p.red, -w / 2 + .45, 1.5, back + .19, .04, .12, .01);
    kit.box(p.frameDark, 0, 2.55, back + .08, w, .06, .16);
  },
  'ready-bench'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.frameDark, 0, .26, 0, w, .52, d * .6);
    kit.box(p.fabric, 0, .5, 0, w, .06, d * .7);
    kit.fine = true;
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + .5 + i * (w - 1) / 3;
      if (kit.random() < .6) kit.add(p.olive, new T.SphereGeometry(.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.Matrix4().makeTranslation(x, .53, 0));
      else kit.cylinder(p.olive, x, .66, 0, .17, .55, 'x', 12, { vary: .12 });
    }
    // Duffel bags on the deck.
    kit.cylinder(p.fabricTan, -w / 2 + .6, .18, d / 2 + .25, .18, .6, 'x', 12);
    kit.cylinder(p.olive, w / 2 - .9, .16, d / 2 + .22, .16, .55, 'x', 12, { yaw: .5 });
    kit.fine = false;
  },
  'gear-rack'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    const back = -d / 2;
    kit.box(p.frameDark, 0, 1.15, back + .05, w, 2.3, .1);
    for (let x = -w / 2; x <= w / 2 + .01; x += w / 4) kit.box(p.frameDark, x, 1.15, back + .4, .08, 2.3, .8);
    for (const y of [.4, 1.25, 2.05]) kit.box(p.steel, 0, y, back + .45, w, .04, .7);
    kit.fine = true;
    for (let i = 0; i < 8; i++) {
      const x = -w / 2 + .35 + i * (w - .7) / 7;
      kit.add(p.olive, new T.SphereGeometry(.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.Matrix4().makeTranslation(x, 2.07, back + .4));
      kit.box(i % 3 ? p.olive : p.grey, x, 1.62, back + .35, .42, .55, .2, 0, { vary: .1 });
      kit.box(p.frameDark, x, 1.95, back + .3, .04, .12, .04);
      kit.box(p.fabricTan, x, .62, back + .4, .3, .38, .3, 0, { vary: .15 });
    }
    kit.fine = false;
  },
  galley(c, screens, _prop, w, d) {
    const { kit, p } = c;
    const front = d / 2;
    kit.box(p.steel, 0, .5, 0, w, 1, d);
    kit.box(p.frameDark, 0, .06, front - .02, w, .12, .06);
    kit.box(p.steel, 0, 1.02, 0, w + .06, .04, d + .06);
    // Steam table with pans of food and a sneeze guard.
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + .55 + i * (w - 1.1) / 4;
      kit.box(p.frameDark, x, 1.03, front - .55, .8, .02, .5);
      kit.box([p.olive, p.fabricTan, p.red, p.yellow, p.fabricTan][i], x, 1.04, front - .55, .72, .03, .42, 0, { vary: .1 });
    }
    kit.box(p.glass, 0, 1.38, front - .3, w - .2, .02, .5, 0, { pitch: -.5 });
    kit.box(p.frameDark, 0, 1.75, front - .55, w, .1, .3);
    kit.box(p.warm, 0, 1.69, front - .55, w - .3, .02, .18);
    c.floorGlow.pool(0, 1.06, front - .55, w, .9);
    for (const x of [-w / 2 + .1, w / 2 - .1]) kit.box(p.steel, x, 1.4, front - .55, .05, .75, .05);
    // Back wall: dispensers and the menu board.
    kit.box(p.steel, 0, 1.4, -d / 2 + .15, w, .8, .3);
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + .7 + i * (w - 1.4) / 3;
      kit.box(p.white, x, 1.55, -d / 2 + .34, .5, .5, .1);
      kit.box(p.green, x, 1.7, -d / 2 + .395, .2, .04, .01);
    }
    kit.box(p.frameDark, 0, 2.55, -d / 2 + .05, w * .8, 1, .08);
    screens.place('supply', 0, 2.55, -d / 2 + .1, w * .78, .9);
    // Tray stack and cutlery bins at the start of the line.
    kit.fine = true;
    for (let i = 0; i < 8; i++) kit.box(p.grey, w / 2 - .3, 1.05 + i * .025, front - .3, .42, .02, .32, 0, { vary: .03 });
    kit.fine = false;
  },
  refreshment(c, _s, _prop, w, d) {
    const { kit, p } = c;
    const back = -d / 2;
    const colors = [p.red, p.blue, p.frameDark];
    const lamps = [p.lamp(0xffa53a, .9), p.lamp(0x4f9dff, .9), p.lamp(0x5cff9c, .8)];
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + .7 + i * 1.15;
      kit.box(colors[i], x, 1.0, back + .45, 1.0, 2.0, .9);
      kit.box(p.black, x - .1, 1.25, back + .91, .68, 1.2, .02);
      kit.box(lamps[i], x - .1, 1.25, back + .92, .6, 1.1, .01);
      kit.box(p.frameDark, x + .37, 1.0, back + .92, .12, .5, .03);
      kit.box(p.black, x - .1, .4, back + .92, .5, .14, .03);
      kit.box(lamps[i], x - .1, 1.92, back + .92, .8, .1, .01);
    }
    // Coffee machine on a counter.
    kit.box(p.olive, w / 2 - .55, .45, back + .35, .9, .9, .7);
    kit.box(p.steel, w / 2 - .55, .92, back + .35, .94, .04, .74);
    kit.box(p.black, w / 2 - .55, 1.25, back + .25, .5, .6, .4);
    kit.box(p.amber, w / 2 - .55, 1.42, back + .46, .12, .04, .01);
    kit.cylinder(p.white, w / 2 - .45, 1.0, back + .5, .04, .1, 'y', 8);
    for (let i = 0; i < 2; i++) c.floorGlow.pool(-w / 2 + .6 + i * 1.15, .03, back + 1.3, 1.2, 1.1);
  },
  'lounge-sofa'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.frameDark, 0, .15, 0, w, .3, d);
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + w / 6 + i * w / 3;
      kit.box(p.fabricRed, x, .38, .06, w / 3 - .04, .16, d - .2, 0, { vary: .06 });
      kit.box(p.fabricRed, x, .7, -d / 2 + .12, w / 3 - .04, .5, .22, 0, { vary: .06, pitch: -.12 });
    }
    for (const x of [-w / 2 + .08, w / 2 - .08]) kit.box(p.fabricRed, x, .5, 0, .16, .4, d);
  },
  'lounge-table'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.frameDark, 0, .2, 0, w * .6, .4, d * .5);
    kit.box(p.glass, 0, .44, 0, w, .03, d);
    kit.box(p.frame, 0, .425, 0, w + .02, .01, d + .02);
    kit.cylinder(p.white, -.3, .5, .1, .04, .1, 'y', 10);
    kit.cylinder(p.white, .25, .5, -.12, .04, .1, 'y', 10);
    kit.box(p.black, .05, .47, .05, .24, .02, .16, .6);
  },
  console(c, screens) {
    const { kit, p } = c;
    kit.box(p.frameDark, 0, .34, 0, 2.64, .68, 2.64);
    kit.box(p.frame, 0, .84, 0, 3.16, .36, 3.16);
    kit.box(p.black, 0, 1.03, 0, 2.9, .04, 2.9);
    for (const [radius, tube] of [[.36, .03], [.62, .012], [1.18, .02]] as const) {
      const ring = new T.TorusGeometry(radius, tube, 6, 64);
      ring.rotateX(Math.PI / 2);
      kit.add(p.teal, ring, new T.Matrix4().makeTranslation(0, 1.07, 0));
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      kit.box(p.teal, Math.cos(a) * .9, 1.06, Math.sin(a) * .9, .34, .02, .03, -a);
    }
    for (const s of [-1, 1]) for (const t of [-1, 1]) kit.box(p.cool, s * 1.56, .62, t * 1.56, .06, .5, .06);
    // Operator panels on the four rims, tilted towards the user.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const x = Math.sin(a) * 1.42, z = Math.cos(a) * 1.42;
      kit.box(p.frameDark, x, 1.04, z, 1.4, .08, .3, a, { pitch: .25 });
      screens.place(i % 2 ? 'status' : 'map', x * 1.01, 1.09, z * 1.01, 1.2, .24, a, -Math.PI / 2 + .25);
    }
    stencil(c.root, 'MISSIONSKONSOLE', 'DEV\' AULT  /  TAKTISCHE PLANUNG', [0, .74, 1.59], 2.85, 0, '#c6c9ad');
  },
};

/** Ops ring above the console: a suspended truss ring with four tactical displays and a light ring underneath. */
function opsRing(c: CarrierContext, screens: CarrierScreens): void {
  const { kit, p } = c;
  const y = 7.2, r = 3.4;
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const a = (i + .5) / segments * Math.PI * 2;
    const length = 2 * r * Math.sin(Math.PI / segments) + .02;
    kit.box(p.frameDark, Math.cos(a) * r, y, Math.sin(a) * r, .3, .9, length, -a);
    kit.box(p.frame, Math.cos(a) * (r + .16), y, Math.sin(a) * (r + .16), .04, .7, length - .1, -a);
  }
  const torus = new T.TorusGeometry(r - .1, .05, 8, 72);
  torus.rotateX(Math.PI / 2);
  kit.add(p.teal, torus, new T.Matrix4().makeTranslation(0, y - .47, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const x = Math.sin(a) * (r + .3), z = Math.cos(a) * (r + .3);
    kit.box(p.frameDark, x, y - .1, z, 2.8, 1.62, .14, a, { pitch: .18 });
    screens.place((['map', 'fleet', 'radar', 'status'] as const)[i], x + Math.sin(a) * .08, y - .1, z + Math.cos(a) * .08, 2.6, 1.46, a, .18);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    kit.cylinder(p.steel, Math.cos(a) * r, (y + CARRIER_HALLS.mess.ceiling - 1.15) / 2 + .2, Math.sin(a) * r, .025,
      CARRIER_HALLS.mess.ceiling - 1.15 - y - .1, 'y', 6);
  }
}

/** Low duct bridge across the lounge corner (operators crouch underneath). */
function serviceFrame(c: CarrierContext): void {
  const { kit, p } = c;
  const x = -6.5, z = 12.4;
  for (const s of [-1, 1]) {
    kit.box(p.frameDark, x + s * 1.4, .68, z, .26, 1.37, .74);
    kit.box(p.hazard, x + s * 1.4, .3, z, .28, .4, .76);
  }
  kit.box(p.yellow, x, 1.5, z, 3.06, .27, .84);
  kit.cylinder(p.grey, x, 1.5, z, .2, 3.4, 'x', 14);
  kit.cylinder(p.olive, x, 1.5, z + .3, .12, 3.4, 'x', 12);
  kit.box(p.hazard, x, 1.38, z, 2.9, .05, .86);
  // The duct rises to the gallery and the deck at both ends.
  kit.cylinder(p.grey, x - 1.7, 3.1, z, .2, 3.2, 'y', 14);
  kit.cylinder(p.olive, x + 1.7, .75, z + .3, .12, 1.5, 'y', 12);
  stencil(c.root, 'KOPF EINZIEHEN', 'WARTUNGSRAHMEN  /  1,37 M', [x, 1.92, z + .43], 1.5, 0, '#d4a63a');
}

/** Plants along the panorama window, posters, fire points and other things that make the deck feel used. */
function messDressing(c: CarrierContext, screens: CarrierScreens): void {
  const { kit, p } = c;
  kit.zone = 'detail';
  // Hydroponic planters on the window sill.
  for (const x of [-10.6, -8.8, 8.8, 10.6]) {
    kit.box(p.frameDark, x, .25, 16.45, 1.5, .5, .4);
    kit.box(p.soil, x, .51, 16.45, 1.4, .02, .32);
    for (let i = 0; i < 9; i++) {
      const lx = x - .6 + kit.random() * 1.2, h = .3 + kit.random() * .5;
      const leaf = new T.ConeGeometry(.06 + kit.random() * .06, h, 5);
      kit.add(i % 2 ? p.plant : p.plantDark, leaf, new T.Matrix4().makeRotationZ((kit.random() - .5) * .6).setPosition(lx, .52 + h / 2, 16.45 + (kit.random() - .5) * .2));
    }
    kit.box(p.green, x, .05, 16.25, 1.3, .02, .02);
  }
  // Fire points and intercoms on the pillars facing the hall.
  for (const prop of CARRIER_PROPS) {
    if (prop.prop !== 'pillar') continue;
    const s = -Math.sign(prop.x);
    kit.box(p.red, prop.x + s * .4, 1.2, prop.z, .08, .5, .26);
    kit.cylinder(p.red, prop.x + s * .52, 1.05, prop.z, .09, .45, 'y', 10);
    kit.box(p.white, prop.x + s * .37, 1.65, prop.z, .02, .18, .22);
    kit.box(p.frameDark, prop.x + s * .38, 2.6, prop.z, .06, .3, .2);
    kit.box(p.green, prop.x + s * .42, 2.68, prop.z, .01, .03, .03);
  }
  // Hanging fleet banners between the ribs, high in the atrium.
  for (const [z, x] of [[-11.35, -8.2], [5.65, 8.2], [-5.65, 8.2], [11.35, -8.2]] as const) {
    kit.box(p.frameDark, x, 9.05, z, .08, .08, 2.4);
    kit.box(Math.abs(z) > 10 ? p.red : p.blue, x, 7.7, z, .02, 2.6, 2.2, 0, { vary: 0 });
    kit.box(p.yellow, x + .015, 8.4, z, .02, .12, 2.2, 0, { vary: 0 });
    kit.box(p.white, x + .016, 7.5, z, .02, .9, .9, 0, { vary: 0 });
  }
  // Painted deck markings: deck number before the window, boarding arrow in the lane to the airlock.
  floorPaint(c.detail, [{ text: 'DECK 03', size: .62 }, { text: 'SKYFALL  /  MESSE', size: .3 }], 0, 15.3, 5.2, 1.8, Math.PI, '#c99a2e');
  floorPaint(c.detail, [{ text: '▲  ALBATROSS 02  ▲', size: .55 }, { text: 'BOARDING', size: .35 }], 0, -12.6, 4.6, 1.3, 0, '#c99a2e');
  floorPaint(c.detail, [{ text: 'MISSIONSKONSOLE', size: .7 }], 0, 5.3, 3.4, .6, 0, '#5fd8c4', .55);
}

export function buildProps(c: CarrierContext, screens: CarrierScreens): void {
  const { kit } = c;
  const builders: Record<string, PropBuilder> = { ...BUILDERS, ...ROOM_BUILDERS, ...HANGAR_BUILDERS };
  for (const prop of CARRIER_PROPS) {
    const builder = builders[prop.prop];
    if (!builder) continue;
    kit.zone = Math.abs(prop.x) <= 12.3 && Math.abs(prop.z) <= 17.3 ? 'mess' : prop.z < -23 ? 'hangar' : prop.x < 0 ? 'port' : 'starboard';
    const { w, d } = footprint(prop);
    kit.push(prop.x, 0, prop.z, prop.yaw ?? 0);
    builder(c, screens, prop, w, d);
    kit.pop();
  }
  kit.zone = 'mess';
  opsRing(c, screens);
  serviceFrame(c);
  messDressing(c, screens);
  buildRoomProps(c, screens);
  buildHangarProps(c, screens);
}

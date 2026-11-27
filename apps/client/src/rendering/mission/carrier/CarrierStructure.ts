import * as T from 'three';
import {
  CARRIER_CABIN_CEILING, CARRIER_CABINS, CARRIER_DOORS, CARRIER_GALLERY, CARRIER_HALLS, CARRIER_PROPS, CARRIER_ROOM_CEILING, CARRIER_ROOMS,
  CARRIER_WALLS, CARRIER_WINDOW_WALLS,
} from '@freefall/shared';
import type { Obstacle } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import { CARRIER_SUN } from '../CarrierSpace.ts';
import { dust, shaft } from './CarrierEffects.ts';
import { DOOR_SIGN, MESS_DOORS } from './CarrierSigns.ts';
import type { CarrierContext } from './CarrierContext.ts';
import { shipSurfaces, surface } from './ShipTextures.ts';

const MESS = CARRIER_HALLS.mess;
const H = MESS.ceiling;
const G = CARRIER_GALLERY;
const RC = CARRIER_ROOM_CEILING;
const CC = CARRIER_CABIN_CEILING;
const inMess = (wall: Obstacle) => Math.abs(wall.x) <= 12.31 && Math.abs(wall.z) <= 17.31 && Math.abs(wall.x) > 3.4;

/** Window band in a hull wall: sill, lintel, mullions, glass and the hull ledge outside with running lights. */
export function windowWall(c: CarrierContext, wall: Obstacle, sill: number, lintel: number, top: number, wallMaterial: T.Material,
  tint: number, pane = 3.2): void {
  const { kit, p } = c;
  const alongX = wall.halfX > wall.halfZ;
  const length = 2 * (alongX ? wall.halfX : wall.halfZ);
  const thick = 2 * (alongX ? wall.halfZ : wall.halfX);
  const inward = alongX ? -Math.sign(wall.z) : -Math.sign(wall.x);
  const region = length - 1.6;
  const panes = Math.max(1, Math.round(region / pane));
  const width = region / panes;
  const put = (material: T.Material, u: number, y: number, w: number, h: number, depth: number, n = 0) =>
    alongX ? kit.box(material, wall.x + u, y, wall.z + n * inward, w, h, depth)
      : kit.box(material, wall.x + n * inward, y, wall.z + u, depth, h, w);
  for (const s of [-1, 1]) put(wallMaterial, s * (length / 2 - .4), top / 2, .8, top, thick);
  put(wallMaterial, 0, sill / 2, region, sill, thick);
  put(wallMaterial, 0, (top + lintel) / 2, region, top - lintel, thick);
  put(p.frameDark, 0, sill + .04, region + .2, .08, thick + .36);
  put(p.steel, 0, sill + .1, region - .1, .04, .06, thick / 2 + .14);
  put(p.frameDark, 0, lintel - .06, region + .2, .16, thick + .26);
  put(c.lit, 0, lintel - .16, region - .4, .03, .05, thick / 2 + .1);
  // Exterior: hull ledge below the band with a row of running lights.
  put(p.frameDark, 0, -.6, length + 1.4, .7, 5, -(thick / 2 + 2.5));
  put(p.frameDark, 0, top + .35, length + 1.4, .7, 3, -(thick / 2 + 1.5));
  for (let u = -length / 2; u <= length / 2 + .01; u += length / 6) put(c.alarm, u, -.22, .14, .08, .14, -(thick / 2 + 4.8));
  const cards = c.glow(tint, .2);
  for (let i = 0; i < panes; i++) {
    const u = -region / 2 + width * (i + .5);
    put(p.glass, u, (sill + lintel) / 2, width - .3, lintel - sill, .03);
    const reach = thick / 2 + 1.6;
    if (alongX) cards.pool(wall.x + u, .035, wall.z + inward * reach, width * 1.1, 3.4);
    else cards.pool(wall.x + inward * reach, .035, wall.z + u, 3.4, width * 1.1);
  }
  for (let i = 0; i <= panes; i++) {
    const u = -region / 2 + width * i;
    put(p.frameDark, u, (sill + lintel) / 2, i % panes ? .26 : .4, lintel - sill, thick + .16);
    put(p.frame, u, (sill + lintel) / 2, .1, lintel - sill - .1, .04, thick / 2 + .1);
  }
}

/** The two-storey mess: colonnade, galleries, ribbed roof, ops ring mounts, panorama window and the Leitstand window. */
export function buildMess(c: CarrierContext): void {
  const { kit, p } = c;
  kit.zone = 'mess';
  // Deck: plates, a darker central lane with painted lines, the console inlay and grilles along the walls.
  kit.box(p.deck, 0, -.1, 0, 24.6, .2, 34.6);
  kit.box(p.deckDark, 0, .006, 0, 6.6, .012, 34.2);
  for (const side of [-1, 1]) {
    for (let z = -16.6; z <= 16.6; z += .9) if (Math.abs(z) > 4.9) kit.box(p.yellow, side * 3.3, .014, z, .08, .02, .55, 0, { vary: .1 });
    kit.box(p.grate, side * 11.2, .008, 0, 1, .014, 34);
    kit.box(p.frameDark, side * 10.68, .01, 0, .05, .02, 34);
  }
  const inlay = new T.CircleGeometry(4.7, 48);
  inlay.rotateX(-Math.PI / 2);
  kit.add(p.deckDark, inlay, new T.Matrix4().makeTranslation(0, .016, 0));
  const ring = new T.RingGeometry(4.45, 4.55, 64);
  ring.rotateX(-Math.PI / 2);
  kit.add(p.teal, ring, new T.Matrix4().makeTranslation(0, .02, 0));
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    kit.box(i % 6 ? p.steel : p.yellow, Math.cos(a) * 4.2, .02, Math.sin(a) * 4.2, .5, .016, .06, -a);
  }

  // Walls: side walls between the doorways, lintels over the doors, the bow wall around the Leitstand window.
  for (const wall of CARRIER_WALLS) {
    if (!inMess(wall)) continue;
    if (Math.abs(wall.z + 17) < .01) {
      kit.box(p.wallWarm, wall.x, 2.8, wall.z, wall.halfX * 2, 5.6, wall.halfZ * 2);
      continue;
    }
    kit.box(p.wallWarm, wall.x, H / 2, wall.z, wall.halfX * 2, H, wall.halfZ * 2);
  }
  for (const door of CARRIER_DOORS) {
    if (door.axis !== 'x' || Math.abs(door.x) !== 12) continue;
    kit.box(p.wallWarm, door.x, (door.height + H) / 2, door.z, .6, H - door.height, door.width);
  }
  // Bow wall above the airlock: Leitstand window band (5.6–8.6 m) and the head above it.
  for (const side of [-1, 1]) kit.box(p.wallWarm, side * 9.4, 7.1, -17, 5.6, 3, .6);
  kit.box(p.wallWarm, 0, 9.2, -17, 24.6, 1.2, .6);
  kit.box(p.wallWarm, 0, 4.9, -17, 6.2, 1.4, .6);
  kit.box(p.glass, 0, 7.1, -16.98, 13.2, 3, .03);
  kit.box(p.frameDark, 0, 5.62, -16.62, 13.8, .2, .5);
  kit.box(p.frameDark, 0, 8.6, -16.66, 13.8, .2, .42);
  for (const x of [-6.6, -3.3, 0, 3.3, 6.6]) kit.box(p.frameDark, x, 7.1, -16.7, Math.abs(x) > 6 ? .34 : .2, 3, .34);
  kit.box(c.lit, 0, 5.5, -16.4, 12.8, .03, .06);

  // Wall dressing along both side walls: kick plate, two pipe runs, a cable tray and pilasters. The pipes duck into
  // the wall either side of every door sign (flange, elbow stub and a wall collar), so nothing crosses a sign.
  for (const side of [-1, 1]) {
    const face = side * 11.68;
    kit.box(p.frameDark, face, .16, 0, .08, .32, 34);
    const half = DOOR_SIGN.width / 2 + DOOR_SIGN.margin;
    const gaps = MESS_DOORS.filter((door) => Math.sign(door.x) === side).map((door) => [door.z - half, door.z + half] as const)
      .sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    let start = -17;
    for (const [from, to] of gaps) { runs.push([start, from]); start = to; }
    runs.push([start, 17]);
    for (const [y, r, material] of [[3.92, .085, p.olive], [4.18, .06, p.steel]] as const) {
      const offset = face - side * .14;
      for (const [from, to] of runs) {
        kit.cylinder(material, offset, y, (from + to) / 2, r, to - from, 'z', 10);
        for (const end of [from, to]) {
          if (Math.abs(end) > 16.9) continue;
          const inward = end === from ? 1 : -1;
          kit.cylinder(p.frameDark, offset, y, end + inward * .06, r + .03, .06, 'z', 10);
          kit.cylinder(material, (offset + face) / 2, y, end + inward * r, r, .14, 'x', 10);
          kit.cylinder(p.frameDark, face - side * .01, y, end + inward * r, r + .045, .04, 'x', 12);
        }
      }
    }
    const clear = (z: number) => gaps.every(([from, to]) => z < from - .1 || z > to + .1);
    for (let z = -16; z <= 16; z += 2) if (clear(z)) kit.box(p.frameDark, face - side * .1, 4.05, z, .16, .42, .06);
    for (const [from, to] of runs) for (const end of [from + .45, to - .45]) {
      if (Math.abs(end) < 16.5 && clear(end)) kit.box(p.frameDark, face - side * .1, 4.05, end, .16, .42, .06);
    }
    for (const z of [-16.2, -12.6, -5.6, -2.3, 2.3, 5.6, 12.6, 16.2]) {
      kit.box(p.frame, face - side * .06, 1.9, z, .16, 3.8, .36);
    }
  }

  // Galleries: slab, fascia with a light line, grating deck, railing, downlights underneath.
  for (const side of [-1, 1]) {
    const mid = side * (G.edge + 11.7) / 2;
    const width = 11.7 - G.edge;
    kit.box(p.ceiling, mid, (G.underside + G.floor) / 2, 0, width, G.floor - G.underside, 34);
    kit.box(p.grate, mid, G.floor + .01, 0, width, .02, 34);
    kit.box(p.frameDark, side * (G.edge + .05), (G.underside + G.floor) / 2, 0, .3, G.floor - G.underside + .2, 34);
    kit.box(c.lit, side * (G.edge + .2), G.underside - .05, 0, .06, .04, 33.4);
    c.ceilingGlow.add(side * (G.edge + .6), G.underside - .08, 0, 1.2, 33, Math.PI / 2);
    for (let z = -15; z <= 15.01; z += 3.75) {
      kit.cylinder(p.frameDark, side * 10.2, G.underside - .03, z, .3, .06, 'y', 16);
      kit.cylinder(p.warm, side * 10.2, G.underside - .07, z, .22, .03, 'y', 16);
      c.floorGlow.pool(side * 10.2, .03, z, 3.2, 3.2);
    }
    // Railing: posts, top and mid rail, glass infill and kick plate.
    const railX = side * (G.edge + .12);
    for (let z = -16.6; z <= 16.61; z += 1.66) kit.box(p.steel, railX, G.floor + .53, z, .06, 1.05, .06);
    kit.cylinder(p.steel, railX, G.floor + 1.07, 0, .045, 33.4, 'z', 10);
    kit.cylinder(p.steel, railX, G.floor + .55, 0, .02, 33.4, 'z', 6);
    kit.box(p.glass, railX, G.floor + .55, 0, .02, .8, 33.2);
    kit.box(p.frameDark, railX, G.floor + .08, 0, .08, .16, 33.4);
    // Upper level: doors to the crew quarters and lit cabin windows.
    const wall = side * 11.66;
    for (const z of [-13, -5, 3, 11]) {
      kit.box(p.frameDark, wall, G.floor + 1.3, z, .2, 2.6, 1.7);
      kit.box(p.grey, wall - side * .08, G.floor + 1.2, z, .1, 2.35, 1.3);
      kit.box(p.frameDark, wall - side * .14, G.floor + 1.2, z, .02, 2.2, .04);
      kit.box(p.green, wall - side * .14, G.floor + 2.75, z + .5, .03, .06, .14);
      kit.box(p.lcd, wall - side * .14, G.floor + 1.6, z - .45, .02, .12, .22);
    }
    for (const z of [-9, -1, 7, 15]) {
      kit.box(p.frameDark, wall, G.floor + 1.65, z, .2, 1.2, 2.3);
      kit.box(c.p.cabinWindow, wall - side * .05, G.floor + 1.65, z, .04, .95, 2.05);
      kit.box(p.frameDark, wall - side * .1, G.floor + 1.65, z, .04, .95, .06);
    }
    for (let z = -15; z <= 15.01; z += 6) {
      kit.box(p.frameDark, wall - side * .06, G.floor + 3.1, z + 2, .14, .14, .5);
      kit.box(p.warm, wall - side * .14, G.floor + 3.04, z + 2, .04, .04, .4);
    }
  }

  // Colonnade: two-storey pillars carrying galleries and roof.
  for (const pillar of CARRIER_PROPS) {
    if (pillar.prop !== 'pillar') continue;
    const { x, z } = pillar;
    kit.box(p.frameDark, x, .16, z, .96, .32, .96);
    kit.box(p.hazard, x, .52, z, .76, .4, .76);
    kit.box(p.frame, x, 2.45, z, .72, 3.6, .72);
    kit.box(p.frameDark, x, 4.35, z, .92, .5, .92);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) kit.box(p.frameDark, x + dx * .37, 2.45, z + dz * .37, dx ? .04 : .5, 3.4, dz ? .04 : .5);
    kit.box(p.frame, x + Math.sign(x) * .1, (G.floor + H) / 2, z, .5, H - G.floor, .5);
    kit.box(p.frameDark, x + Math.sign(x) * .1, H - .5, z, .7, .4, .7);
    kit.box(c.lit, x - Math.sign(x) * .37, 3.0, z, .03, 1.2, .08);
  }

  // Roof: slab, transverse ribs with knee braces, a central spine truss, cable trays, a ventilation duct and fixtures.
  kit.box(p.ceiling, 0, H + .2, 0, 24.6, .4, 34.6);
  const ribs = [-14.2, -8.5, -2.8, 2.8, 8.5, 14.2];
  for (const z of ribs) {
    kit.box(p.frameDark, 0, H - .35, z, 23.4, .7, .45);
    kit.box(p.frame, 0, H - .72, z, 23.4, .06, .65);
    for (const side of [-1, 1]) {
      kit.beam(p.frameDark, [side * 11.6, 7.2, z], [side * 9.3, H - .66, z], .4, .45);
      kit.box(p.frameDark, side * 11.52, (G.floor + 7.4) / 2, z, .3, 7.4 - G.floor, .5);
    }
  }
  for (const side of [-1, 1]) {
    kit.box(p.frameDark, side * .75, H - .25, 0, .22, .22, 34);
    kit.box(p.frameDark, side * .75, H - 1.15, 0, .18, .18, 34);
    for (let z = -16; z < 16; z += 2) {
      kit.beam(p.frame, [side * .75, H - 1.15, z], [side * .75, H - .25, z + 1], .07, .07);
      kit.beam(p.frame, [side * .75, H - .25, z + 1], [side * .75, H - 1.15, z + 2], .07, .07);
    }
    kit.box(p.steel, side * 6.4, H - .12, 0, .6, .05, 34);
    for (const dx of [-.18, -.06, .08, .2]) kit.cylinder(dx > 0 ? p.rubber : p.red, side * 6.4 + dx, H - .02, 0, .035, 34, 'z', 6);
  }
  for (let z = -16; z <= 16; z += 4) kit.box(p.frameDark, 0, H - 1.15, z, 1.5, .1, .1);
  kit.cylinder(p.grey, -7.6, H - 1.45, 0, .42, 34, 'z', 18);
  for (let z = -15; z <= 15; z += 2.5) {
    kit.cylinder(p.frameDark, -7.6, H - 1.45, z, .45, .12, 'z', 18);
    kit.box(p.frameDark, -7.6, H - .95, z, .06, .9, .08);
  }
  const bays = [-11.35, -5.65, 0, 5.65, 11.35];
  for (const z of bays) for (const side of [-1, 1]) {
    const x = side * 4.4;
    kit.box(p.frameDark, x, H - 1.0, z, .6, .2, 3.9);
    kit.box(c.lit, x, H - 1.12, z, .4, .03, 3.6);
    for (const dz of [-1.6, 1.6]) kit.cylinder(p.steel, x, H - .45, z + dz, .015, .9, 'y', 4);
    c.ceilingGlow.add(x, H - 1.14, z, 1.6, 4.8, Math.PI / 2);
    c.floorGlow.pool(x, .03, z, 5.2, 6.4);
  }

  // Panorama window in the aft wall: two storeys of glass between I-beam mullions, sill bench and header.
  const windowZ = 17;
  kit.box(p.wallWarm, 0, .5, windowZ, 24.6, 1, .6);
  kit.box(p.frameDark, 0, 1.04, windowZ - .1, 23.2, .08, .9);
  kit.box(p.frameDark, 0, H - .3, windowZ, 24.6, .6, .7);
  for (const side of [-1, 1]) kit.box(p.wallWarm, side * 11.95, H / 2, windowZ, .7, H, .6);
  kit.box(p.glass, 0, (1.04 + H - .6) / 2, windowZ, 23, H - 1.64, .03);
  kit.box(p.frameDark, 0, G.floor, windowZ - .05, 23, .26, .5);
  for (const x of [-7.6, -3.8, 0, 3.8, 7.6]) {
    kit.box(p.frameDark, x, (1.04 + H) / 2, windowZ, .16, H - 1, .5);
    kit.box(p.frame, x, (1.04 + H) / 2, windowZ - .27, .45, H - 1.1, .06);
    kit.box(p.frame, x, (1.04 + H) / 2, windowZ + .27, .45, H - 1.1, .06);
  }
  kit.box(c.lit, 0, 1.12, windowZ - .5, 22.6, .03, .04);
  // Outside: hull ledge below the window and the aft deck of the carrier.
  kit.box(p.frameDark, 0, -.7, windowZ + 3, 26, .8, 5.4);
  for (let x = -12; x <= 12; x += 4) kit.box(c.alarm, x, -.28, windowZ + 5.5, .16, .08, .16);
  const sunCards = c.glow(0xffd9a8, .14);
  const columns = [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5];
  const ray = CARRIER_SUN.clone().negate();
  for (const x of columns) {
    sunCards.pool(x, .035, windowZ - 2.2, 3.6, 3.6);
    const beam = shaft(3.4, H - 1.9, 24, ray, 0xffd6a0, .014);
    beam.matrix.setPosition(x, (1.04 + H - .6) / 2, windowZ - .1);
    c.shafts.push(beam.material as T.ShaderMaterial);
    c.detail.add(beam);
  }

  // Dust drifting through the sunlight in front of the window.
  const motes = dust(320, new T.Vector3(-11, .4, 2), new T.Vector3(11, 8.5, 16.4), 0xffe2b8);
  c.detail.add(motes);
  const moteUniforms = (motes.material as T.ShaderMaterial).uniforms;
  c.tick.push((seconds) => { moteUniforms.time.value = seconds; });

  // Leitstand (hangar control) behind the Leitstand window, above the airlock: lit consoles and crew.
  const lit = surface(shipSurfaces().panel, 0x4e5a5c, { tile: 2.4, emissive: 0x1d2a30, emissiveIntensity: 1 });
  kit.box(p.deckDark, 0, 5.25, -20, 13.2, .1, 5.4);
  kit.box(lit, 0, 9.05, -20, 13.2, .2, 5.4);
  for (const side of [-1, 1]) kit.box(lit, side * 6.7, 7.1, -20, .2, 3.8, 5.4);
  for (const z of [-18.1, -21.9]) {
    const facing = z > -20 ? 1 : -1;
    kit.box(p.frameDark, 0, 5.75, z, 11.4, .9, .9);
    kit.box(p.blueLamp, 0, 6.24, z + facing * .2, 11, .03, .45, 0, { pitch: facing * .35 });
    for (let x = -5; x <= 5; x += 2.5) {
      kit.box(p.black, x, 6.75, z - facing * .1, 1.1, .7, .05, 0, { pitch: -facing * .2 });
      kit.box(p.teal, x, 6.75, z - facing * .07, 1, .6, .02, 0, { pitch: -facing * .2 });
    }
  }
  for (const [x, z, turn] of [[-3.2, -18.9, 0], [1.6, -18.95, .4], [3.9, -21.2, Math.PI]] as const) crew(c, x, 5.3, z, turn);
  for (let x = -5; x <= 5; x += 2.5) kit.box(c.lit, x, 8.92, -20, 1.4, .04, .3);
}

/** Seated or standing crew silhouette at a console (back-lit, no detail needed). */
export function crew(c: CarrierContext, x: number, y: number, z: number, yaw: number, seated = false): void {
  const { kit, p } = c;
  kit.push(x, y, z, yaw);
  const hip = seated ? .5 : .95;
  kit.box(p.blue, 0, hip + .32, 0, .44, .62, .26, 0, { vary: .15 });
  kit.box(p.blue, 0, hip + .66, 0, .52, .12, .3);
  kit.cylinder(p.fabricTan, 0, hip + .82, 0, .07, .12, 'y', 8);
  kit.cylinder(p.black, 0, hip + .98, .01, .12, .24, 'y', 10);
  if (!seated) for (const s of [-1, 1]) kit.box(p.blue, s * .11, hip / 2, 0, .16, hip, .18);
  else {
    for (const s of [-1, 1]) kit.box(p.blue, s * .11, .5, -.22, .16, .14, .45);
    kit.box(p.frameDark, 0, .42, .05, .5, .08, .5);
  }
  for (const s of [-1, 1]) kit.box(p.blue, s * .3, hip + .4, -.1, .12, .5, .14, 0, { pitch: .6 });
  kit.pop();
}

/** Side rooms and cabins: deck, ceiling with beams and fixtures, partitions, hull window bands. */
export function buildRooms(c: CarrierContext): void {
  const { kit, p } = c;
  for (const room of [...CARRIER_ROOMS, ...CARRIER_CABINS]) {
    const cabin = room.z === 0;
    const depth = cabin ? 6.3 : 12.5;
    const ceiling = cabin ? CC : RC;
    kit.zone = room.x < 0 ? 'port' : 'starboard';
    kit.box(cabin ? p.deckWarm : p.deck, room.x, -.1, room.z, 17.4, .2, depth);
    kit.box(p.ceiling, room.x, ceiling + .15, room.z, 17.4, .3, depth);
    if (cabin) kit.box(p.ceiling, room.x, (ceiling + RC) / 2 + .15, room.z, 17.4, RC - ceiling, depth - .2);
    for (const u of [-6.25, -2.1, 2.1, 6.25]) kit.box(p.frameDark, room.x + u, ceiling - .16, room.z, .32, .32, depth - .3);
    const fixtures = cabin ? [-4.2, 4.2] : [-4.2, 0, 4.2];
    for (const u of fixtures) {
      kit.box(p.frameDark, room.x + u, ceiling - .1, room.z, .52, .2, cabin ? 3.6 : 7.6);
      kit.box(c.lit, room.x + u, ceiling - .21, room.z, .3, .03, cabin ? 3.3 : 7.2);
      // Cabins are low: a glow card would sit right above the camera there.
      if (!cabin) c.ceilingGlow.add(room.x + u, ceiling - .23, room.z, 1.6, 8.4, Math.PI / 2);
    }
    c.floorGlow.pool(room.x, .03, room.z, 12, cabin ? 4.4 : 9);
  }
  for (const wall of CARRIER_WALLS) {
    if (Math.abs(wall.x) < 12.4 || Math.abs(wall.z) > 15.3) continue;
    kit.zone = wall.x < 0 ? 'port' : 'starboard';
    kit.box(p.wall, wall.x, RC / 2, wall.z, wall.halfX * 2, RC, wall.halfZ * 2);
    if (wall.halfZ > wall.halfX) continue;
    for (const side of [-1, 1]) {
      kit.box(p.frameDark, wall.x, .16, wall.z + side * (wall.halfZ + .04), wall.halfX * 2, .32, .08);
      kit.box(p.frame, wall.x, 3.5, wall.z + side * (wall.halfZ + .05), wall.halfX * 2, .12, .1);
    }
    for (let u = -7.5; u <= 7.51; u += 2.5) kit.box(p.frame, wall.x + u, RC / 2, wall.z, .3, RC, wall.halfZ * 2 + .14);
  }
  for (const wall of CARRIER_WINDOW_WALLS) {
    if (Math.abs(wall.x) < 28) continue;
    kit.zone = wall.x < 0 ? 'port' : 'starboard';
    const cabin = Math.abs(wall.z) < .01;
    windowWall(c, wall, cabin ? 1.35 : 1.05, cabin ? 2.75 : 3.95, RC, p.wall, wall.x > 0 ? 0x6fb4ff : 0x26304a, cabin ? 1.6 : 3.2);
  }
}

/** Pressure airlock between mess and hangar: grated deck, ribbed walls, decontamination and a scanner arch. */
export function buildAirlock(c: CarrierContext): void {
  const { kit, p } = c;
  kit.zone = 'airlock';
  const { minZ, maxZ, ceiling } = CARRIER_HALLS.airlock;
  const mid = (minZ + maxZ) / 2, length = maxZ - minZ;
  kit.box(p.deckDark, 0, -.1, mid, 6.8, .2, length + .6);
  kit.box(p.grate, 0, .006, mid, 5.4, .012, length - .4);
  for (const z of [maxZ - .3, minZ + .3]) kit.box(p.hazard, 0, .012, z, 6, .02, .5);
  for (const wall of CARRIER_WALLS) if (Math.abs(Math.abs(wall.x) - 3.1) < .01) kit.box(p.wallDark, wall.x, ceiling / 2, wall.z, wall.halfX * 2, ceiling, wall.halfZ * 2);
  kit.box(p.ceiling, 0, (ceiling + 5.2) / 2, mid, 6.8, 5.2 - ceiling, length);
  for (const z of [-17.7, -19.1, -20.9, -22.3]) {
    for (const side of [-1, 1]) {
      kit.box(p.frameDark, side * 2.74, ceiling / 2, z, .2, ceiling, .34);
      kit.box(p.hazard, side * 2.62, .45, z, .04, .9, .34);
    }
    kit.box(p.frameDark, 0, ceiling - .15, z, 5.7, .3, .34);
  }
  for (const side of [-1, 1]) {
    // Pipes, decontamination nozzles and pressure gauges.
    for (const [y, r] of [[3.2, .07], [3.45, .05], [3.65, .05]] as const) kit.cylinder(y > 3.3 ? p.steel : p.yellow, side * 2.7, y, mid, r, length, 'z', 8);
    for (const z of [-18.4, -21.6]) {
      for (const y of [1, 1.8, 2.6]) kit.cylinder(p.steel, side * 2.76, y, z, .05, .16, 'x', 8);
      kit.cylinder(p.frameDark, side * 2.78, 1.5, z + .5, .14, .06, 'x', 16);
      kit.cylinder(p.white, side * 2.74, 1.5, z + .5, .11, .02, 'x', 16);
    }
    kit.box(c.lit, side * 1.6, ceiling - .32, mid, .12, .03, length - .4);
    // Scanner arch: lit bars in the middle frame pair.
    kit.box(p.teal, side * 2.6, 2, mid, .05, 3.2, .08);
  }
  kit.box(p.teal, 0, ceiling - .34, mid, 5.1, .05, .08);
  c.floorGlow.pool(0, .03, mid, 5, 5.6);
  // Portal on the mess side: heavy jambs with hazard bands and the header.
  for (const side of [-1, 1]) {
    kit.box(p.frameDark, side * 3.42, 2.3, -16.55, .64, 4.6, .9);
    kit.box(p.hazard, side * 3.12, 2.1, -16.55, .06, 4.2, .7);
    kit.box(p.frameDark, side * 3.42, 2.3, -23.45, .64, 4.6, .9);
    kit.box(p.hazard, side * 3.12, 2.1, -23.45, .06, 4.2, .7);
  }
  kit.box(p.frameDark, 0, 4.42, -16.55, 7.5, .44, .9);
  kit.box(p.frameDark, 0, 4.42, -23.45, 7.5, .44, .9);
  // Signs in a housing on top of each portal header (top 4.64 m), flush with its front and below the Leitstand sill
  // (5.52 m), so the deep header cannot hide their lower edge from the deck.
  for (const [z, facing, title, sub] of [[-16.55, 1, 'ALBATROSS 02', 'BOARDING  /  LUFTSCHLEUSE'],
    [-23.45, -1, 'STARTPLATZ 02', 'HANGAR  /  DRUCKSCHLEUSE']] as const) {
    kit.box(p.frameDark, 0, 5.07, z, 3.36, .86, .9);
    kit.box(p.lamp(0xd8e2dc, .8), 0, 4.67, z + facing * .46, 3.0, .015, .02);
    stencil(c.root, title, sub, [0, 5.07, z + facing * .455], 3.2, facing > 0 ? 0 : Math.PI);
  }
}


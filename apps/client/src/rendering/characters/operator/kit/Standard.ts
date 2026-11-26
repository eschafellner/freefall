import type { WardrobeItem } from '../Wardrobe.ts';
import type * as T from 'three';
import { loft } from '../BodyLoft.ts';
import type { Ring } from '../BodyLoft.ts';
import { belt, boot, glove, hard, lit, pouch, suit, toeCap, torsoBand } from './Parts.ts';

/**
 * FR-7 Feldpanzer: the standard issue of the Skyfall operators. Khaki-grey plates over a charcoal padded suit: plate
 * carrier with magazine pouches, layered pauldrons, tassets, knee cops and greaves, a closed combat helmet with a
 * wrap-around visor and the radio pack. Ochre stencil stripes mark the shoulders and the helmet.
 */
/** Pauldron-like shell: a loft around the shoulder joint, tilted outward by `tilt` and moved out by `out`. */
function shell(side: number, rings: Ring[], tilt: number, out: number, cap = .02): T.BufferGeometry {
  return loft(rings, 20, cap ? { top: cap, bottom: .01 } : {}).rotateZ(side * tilt).translate(side * out, 0, .006);
}

const C = {
  suit: 0x3b4139,
  panel: 0x474e43,
  suitDark: 0x272b28,
  plate: 0x6d7462,
  plateShade: 0x5e6556,
  plateDark: 0x4a5146,
  edge: 0x8f9583,
  trim: 0xc39b45,
  strap: 0x25292a,
  webbing: 0x4a4b3b,
  rubber: 0x1e2221,
  metal: 0x8c8e83,
  glass: 0x132730,
  light: 0x86d0de,
};

export const FR7_ARMOR: WardrobeItem = {
  id: 'fr7', slot: 'armor', name: 'FR-7 Feldpanzer', weight: 'mittel',
  description: 'Standardpanzerung mit Plattenträger, Schulterschalen, Beintaschen und Knieschützern.',
  build(kit) {
    suit(kit, { fabric: C.suit, panel: C.panel, dark: C.suitDark, padding: C.strap });
    // Cummerbund under the plates and the duty belt.
    torsoBand(kit, C.webbing, 1.12, 1.235, .02);
    belt(kit, C.strap, .98, 1.04, .014);
    kit.on('UpperChest', (m) => {
      hard(m, () => {
        // Front plate with a raised centre panel and a chamfered top edge.
        m.box(C.plate, 0, -.012, -.17, .31, .24, .046, .03, -.08);
        m.box(C.plateShade, 0, -.004, -.196, .19, .17, .014, .006, -.08);
        m.box(C.plate, 0, .118, -.152, .22, .04, .05, .016, -.55);
        for (const side of [-1, 1]) m.box(C.plate, side * .13, .094, -.158, .09, .05, .04, .014, -.4, side * -.45);
        // Back plate with a spine ridge.
        m.box(C.plate, 0, .0, .136, .3, .26, .042, .026, .06);
        m.box(C.plateShade, 0, .0, .158, .05, .22, .012, .005, .06);
      });
      for (const side of [-1, 1]) {
        // Padded shoulder straps with quick-release buckles.
        m.box(C.webbing, side * .112, .124, -.012, .07, .042, .28, .014, 0, -side * .14);
        hard(m, () => m.box(C.metal, side * .1, .085, -.16, .032, .026, .016, .005, -.3), .45);
        m.box(C.webbing, side * .19, -.03, -.012, .04, .2, .21, .014);
      }
      // Padded collar.
      m.tube(C.suitDark, 0, .16, .012, .088, .104, .05);
      // Comms box with a status light and an ochre stencil stripe.
      pouch(m, C.webbing, C.metal, -.088, .042, -.212, .07, .055, .035, -.08);
      lit(m, 1.2, () => m.box(C.light, -.066, .052, -.232, .008, .008, .004, .002));
      hard(m, () => m.box(C.trim, .085, .068, -.2, .075, .014, .004, .002, -.08), .5);
    });
    kit.on('Chest', (m) => {
      // Three magazine pouches under the plate and two on the sides.
      for (const x of [-.08, 0, .08]) pouch(m, C.webbing, C.metal, x, -.01, -.164, .074, .12, .055, -.04);
      for (const side of [-1, 1]) pouch(m, C.webbing, C.metal, side * .17, -.01, -.05, .048, .1, .075);
    }, 'cloth');
    kit.on('Hips', (m) => {
      hard(m, () => {
        m.box(C.metal, 0, .045, -.126, .064, .036, .016, .006);
        // Groin fauld under the buckle.
        m.box(C.plateDark, 0, -.035, -.118, .13, .09, .022, .01, .12);
      }, .55);
      pouch(m, C.webbing, C.metal, -.18, .01, .03, .06, .09, .08, 0, .12);
      m.box(C.webbing, 0, -.005, .135, .19, .1, .05, .02);
      hard(m, () => m.oval(C.plateDark, -.17, .03, -.085, .07, .095, .07));
    }, 'cloth');
    kit.anchor('SecondaryWeapon', 'Hips', [.21, -.13, .045]);
    kit.both('Pauldron', (m, side) => {
      hard(m, () => {
        // Rounded shell over the deltoid, tilted outward, with a lame beneath and a rolled edge.
        m.custom(shell(side, [
          { y: .08, rx: .065, front: .07 },
          { y: .058, rx: .114, front: .116 },
          { y: .02, rx: .132, front: .128 },
          { y: -.03, rx: .135, front: .13 },
          { y: -.055, rx: .128, front: .122 },
        ], -.38, .038), C.plate, false);
        m.custom(shell(side, [
          { y: -.044, rx: .137, front: .132 },
          { y: -.03, rx: .138, front: .133 },
        ], -.38, .038, 0), C.edge, false);
        m.custom(shell(side, [
          { y: -.05, rx: .112, front: .112 },
          { y: -.085, rx: .118, front: .116 },
          { y: -.11, rx: .108, front: .106 },
        ], -.62, .07), C.plateShade, false);
      });
      hard(m, () => m.box(C.trim, side * .075, .07, -.06, .024, .05, .006, .002, 0, side * -.4, side * .2), .5);
    });
    kit.marker('LeftPauldron', [-.17, -.012, .008], [-1, .36, 0], [.07, .055]);
    kit.both('UpperArm', (m, side) => {
      m.box(C.strap, side * .056, -.2, .0, .014, .028, .118, .005);
      hard(m, () => m.box(C.plate, side * .06, -.16, .0, .022, .1, .09, .009), .66);
    }, 'cloth');
    kit.both('LowerArm', (m, side) => {
      hard(m, () => {
        // Elbow cup and forearm guard on the outside.
        m.oval(C.plateDark, side * .006, .008, .046, .08, .085, .06);
        m.box(C.plate, side * .034, -.12, .008, .026, .16, .074, .01, 0, side * .05);
        m.box(C.edge, side * .048, -.06, .008, .006, .02, .06, .002);
      });
    });
    kit.both('Hand', (m, side) => glove(m, side, { color: C.rubber, palm: 0x343633, knuckle: C.plateDark, cuff: C.strap }), 'cloth');
    kit.both('UpperLeg', (m, side) => {
      // Thigh plate on the front, holster panel on the right, a drop pouch on the left.
      hard(m, () => m.box(C.plate, side * .01, -.2, -.098, .125, .16, .026, .012, .06), .62);
      m.box(C.strap, 0, -.13, 0, .21, .026, .22, .01);
      m.box(C.strap, 0, -.29, 0, .19, .022, .2, .008);
      if (side < 0) pouch(m, C.webbing, C.metal, -.09, -.2, .01, .045, .11, .085);
    }, 'cloth');
    kit.both('Tasset', (m, side) => {
      hard(m, () => {
        m.box(C.plateShade, side * .05, -.1, -.05, .12, .13, .022, .01, .12, side * -.18, side * -.5);
        m.box(C.edge, side * .05, -.04, -.056, .1, .012, .026, .004, .12, side * -.18, side * -.5);
      });
    });
    kit.both('LowerLeg', (m) => {
      hard(m, () => {
        // Knee cop and greave.
        m.oval(C.plate, 0, -.002, -.078, .135, .135, .09);
        m.box(C.edge, 0, -.002, -.122, .075, .02, .012, .004);
        m.box(C.plateShade, 0, -.19, -.066, .1, .2, .03, .012, -.04);
      });
      m.box(C.rubber, 0, -.045, -.014, .14, .02, .13, .008);
    });
    const shoe = { color: C.rubber, sole: 0x161817, cap: C.plateDark, trim: C.webbing, shaft: C.strap, scale: 1.08 };
    kit.both('Foot', (m) => boot(m, shoe), 'cloth');
    kit.both('Toes', (m) => toeCap(m, shoe), 'cloth');
  },
};

export const FR7_HELMET: WardrobeItem = {
  id: 'fr7-helm', slot: 'helmet', name: 'FR-7 Gefechtshelm',
  description: 'Geschlossener Helm mit Rundumvisier, Kieferschutz und Funkmodulen.',
  build(kit) {
    kit.on('Head', (m) => {
      hard(m, () => {
        // One-piece shell: squared jaw, a recessed eye band under an overhanging brow, flared neck guard at the back.
        m.custom(loft([
          { y: -.055, rx: .097, front: .112, back: .128, n: 2.6, shade: .78 },
          { y: -.018, rx: .117, front: .136, back: .14, n: 2.9 },
          { y: .028, rx: .128, front: .144, back: .146, n: 2.9 },
          { y: .052, rx: .132, front: .132, back: .148, n: 2.8, shade: .85 },
          { y: .098, rx: .136, front: .13, back: .15, n: 2.7, shade: .85 },
          { y: .122, rx: .139, front: .165, back: .151, n: 2.6 },
          { y: .168, rx: .131, front: .152, back: .144, n: 2.5 },
          { y: .214, rx: .103, front: .114, back: .114, n: 2.2 },
        ].map((ring) => ({ ...ring, z: -.012 })), 24, { top: .045, bottom: .01 }), C.plate, false);
        // Seam above the brow, cheek seams and breathing vents in the jaw.
        m.custom(loft([
          { y: .14, rx: .1365, front: .1615, back: .1505, n: 2.55 },
          { y: .148, rx: .1355, front: .1595, back: .1495, n: 2.55 },
        ].map((ring) => ({ ...ring, z: -.012 })), 24), C.plateShade, false);
        for (const side of [-1, 1]) {
          // Ear modules carry the comms.
          m.tube(C.plateDark, side * .138, .055, .01, .05, .054, .03, 0, Math.PI / 2, 16);
          m.tube(C.edge, side * .155, .055, .01, .03, .032, .012, 0, Math.PI / 2, 12);
          m.box(C.plateDark, side * .085, -.02, -.128, .012, .06, .03, .004, .1, 0, side * .55);
        }
        for (const y of [-.028, -.01, .008]) m.box(C.rubber, 0, y, -.152, .05, .007, .012, .002, .12);
        // Lamp on the right side.
        m.box(C.rubber, .14, .13, -.045, .03, .03, .075, .008);
      });
      // Visor glass in the eye band: proud at the front, sinking into the shell towards the sides.
      hard(m, () => lit(m, .34, () => m.custom(loft([
        { y: .054, rx: .124, front: .142, back: .1, n: 2.9 },
        { y: .076, rx: .127, front: .146, back: .1, n: 2.9 },
        { y: .098, rx: .126, front: .141, back: .1, n: 2.9 },
      ].map((ring) => ({ ...ring, z: -.012 })), 24), C.glass, false)), .08);
      // Ochre stencil stripe on the left side.
      hard(m, () => m.box(C.trim, -.134, .155, -.01, .006, .022, .1, .002, 0, .2), .5);
      lit(m, 1.4, () => m.oval(C.light, .14, .13, -.085, .022, .022, .006));
      // Antenna on the left comms module.
      m.tube(C.rubber, -.152, .19, .02, .004, .007, .2, -.12, .1, 6);
    });
  },
};

export const RADIO_PACK: WardrobeItem = {
  id: 'funk', slot: 'pack', name: 'Funkrucksack',
  description: 'Funkgerät, Verbandspäckchen und Seitentaschen.',
  build(kit) {
    kit.on('Backpack', (m) => {
      m.box(C.suitDark, 0, -.005, .03, .26, .29, .05, .02);
      hard(m, () => {
        m.box(C.plate, 0, .0, .095, .275, .275, .12, .035, .04);
        m.box(C.plateShade, 0, .1, .1, .24, .05, .11, .02, .04);
      });
      pouch(m, C.webbing, C.metal, 0, -.105, .165, .2, .075, .045);
      m.box(C.rubber, 0, -.015, .158, .19, .072, .016, .006);
      lit(m, 1.3, () => m.box(C.light, .06, .012, .167, .03, .012, .003, .002));
      for (const side of [-1, 1]) {
        m.box(C.strap, side * .09, .0, .162, .026, .24, .022, .008, .04);
        pouch(m, C.webbing, C.metal, side * .16, -.05, .09, .045, .12, .085);
      }
      // Field dressing with a cross and the antenna.
      m.box(0x535749, -.07, -.085, .2, .11, .07, .036, .012);
      m.box(0xcac7ae, -.07, -.085, .22, .04, .01, .003);
      m.box(0xcac7ae, -.07, -.085, .22, .01, .04, .003);
      m.tube(C.rubber, .1, .2, .1, .007, .011, .22, .12, 0, 8);
    });
    kit.marker('Backpack', [0, .098, .157], [0, 0, 1]);
    kit.anchor('Backpack', 'Backpack', [0, .06, .16]);
  },
};

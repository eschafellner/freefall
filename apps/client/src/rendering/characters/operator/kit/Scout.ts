import type { WardrobeItem } from '../Wardrobe.ts';
import { loft } from '../BodyLoft.ts';
import { belt, boot, glove, hard, lit, pouch, suit, toeCap, torsoBand } from './Parts.ts';

/**
 * SR-4 Späher: light reconnaissance kit. Khaki suit, a soft chest rig over a thin plate, quilted shoulder pads,
 * light knee pads and low boots; the open helmet shows goggles and a balaclava.
 */
const C = {
  suit: 0x564e3d,
  panel: 0x625a47,
  dark: 0x332f25,
  plate: 0x434942,
  plateShade: 0x393f39,
  edge: 0x6f766a,
  trim: 0xc8693a,
  webbing: 0x6b624a,
  strap: 0x2e2b24,
  rubber: 0x24231f,
  metal: 0x8c8a7b,
  skin: 0x9c7a62,
  glass: 0x2b4a4c,
  light: 0x9fe0b8,
};

export const SR4_ARMOR: WardrobeItem = {
  id: 'sr4', slot: 'armor', name: 'SR-4 Späher', weight: 'leicht',
  description: 'Leichte Aufklärungsausrüstung: weiches Brustgeschirr, Polster statt Platten, schnelle Stiefel.',
  build(kit) {
    suit(kit, { fabric: C.suit, panel: C.panel, dark: C.dark, padding: C.dark });
    torsoBand(kit, C.webbing, 1.14, 1.2, .012);
    belt(kit, C.strap, .99, 1.03, .01);
    kit.on('UpperChest', (m) => {
      // Thin front plate inside a chest rig with radio and magazine pouches.
      hard(m, () => m.box(C.plate, 0, -.02, -.156, .26, .2, .03, .02, -.08), .66);
      for (const x of [-.075, 0, .075]) pouch(m, C.webbing, C.metal, x, -.07, -.186, .066, .1, .045, -.06);
      pouch(m, C.webbing, C.metal, .095, .045, -.18, .05, .07, .04, -.08);
      lit(m, 1.2, () => m.box(C.light, .11, .06, -.204, .008, .008, .004, .002));
      for (const side of [-1, 1]) {
        m.box(C.webbing, side * .1, .1, -.04, .05, .03, .23, .01, -.4, -side * .1);
        m.box(C.webbing, side * .19, -.04, -.01, .035, .16, .2, .012);
      }
      // Shemagh wrapped round the neck.
      m.tube(C.panel, 0, .16, .012, .095, .11, .06, 0, 0, 16);
      m.box(C.panel, -.03, .08, -.12, .1, .12, .03, .02, -.3, .15);
      // Back panel with a hydration bladder.
      m.box(C.webbing, 0, -.01, .125, .26, .24, .03, .014, .06);
    }, 'cloth');
    kit.on('Hips', (m) => {
      hard(m, () => m.box(C.metal, 0, .045, -.12, .05, .03, .014, .005), .45);
      pouch(m, C.webbing, C.metal, -.18, .0, .03, .055, .085, .075, 0, .12);
      pouch(m, C.webbing, C.metal, .0, .0, .13, .12, .08, .045);
    }, 'cloth');
    kit.anchor('SecondaryWeapon', 'Hips', [.205, -.13, .04]);
    kit.both('Pauldron', (m, side) => {
      // Quilted shoulder pads instead of plates.
      m.custom(loft([
        { y: .07, rx: .06, front: .065 },
        { y: .045, rx: .092, front: .094 },
        { y: -.01, rx: .1, front: .1 },
        { y: -.045, rx: .096, front: .096 },
      ], 16, { top: .02, bottom: .01 }).rotateZ(side * -.4).translate(side * .03, 0, .006), C.panel, false);
      m.custom(loft([
        { y: .006, rx: .102, front: .102 },
        { y: .016, rx: .103, front: .103 },
      ], 16).rotateZ(side * -.4).translate(side * .03, 0, .006), C.dark, false);
    }, 'cloth');
    kit.marker('LeftPauldron', [-.122, -.02, .008], [-1, .4, 0], [.06, .045]);
    kit.both('LowerArm', (m, side) => {
      hard(m, () => m.oval(C.plate, side * .004, .006, .046, .07, .07, .05), .66);
      m.box(C.strap, 0, -.15, .0, .11, .02, .11, .006);
    });
    kit.both('Hand', (m, side) => glove(m, side, { color: C.webbing, palm: C.dark, cuff: C.dark }), 'cloth');
    kit.both('UpperLeg', (m, side) => {
      m.box(C.strap, 0, -.15, 0, .2, .024, .21, .01);
      if (side > 0) pouch(m, C.webbing, C.metal, .095, -.22, .0, .045, .1, .08);
      else pouch(m, C.webbing, C.metal, -.09, -.18, -.02, .045, .12, .085);
    }, 'cloth');
    kit.both('LowerLeg', (m) => {
      hard(m, () => m.oval(C.plate, 0, -.004, -.074, .115, .11, .07), .66);
      m.box(C.strap, 0, -.04, -.01, .13, .018, .13, .006);
    });
    const shoe = { color: 0x4a4335, sole: 0x262420, cap: 0x3c362b, trim: C.dark, shaft: 0x4a4335, scale: 1.02 };
    kit.both('Foot', (m) => boot(m, shoe), 'cloth');
    kit.both('Toes', (m) => toeCap(m, shoe), 'cloth');
  },
};

export const SR4_HELMET: WardrobeItem = {
  id: 'sr4-haube', slot: 'helmet', name: 'SR-4 Späherhelm',
  description: 'Offener Gefechtshelm mit Schutzbrille, Sturmhaube und Gehörschutz.',
  build(kit) {
    kit.on('Head', (m) => {
      // Balaclava over the head, skin around the eyes.
      m.custom(loft([
        { y: -.05, rx: .062, front: .07, back: .07 },
        { y: -.01, rx: .085, front: .1, back: .094 },
        { y: .06, rx: .094, front: .108, back: .102 },
        { y: .13, rx: .09, front: .1, back: .1 },
      ].map((ring) => ({ ...ring, z: -.012 })), 18, { top: .04, bottom: .01 }), C.dark, false);
      m.oval(C.skin, 0, .082, -.098, .1, .05, .05);
    }, 'cloth');
    kit.on('Head', (m) => {
      hard(m, () => {
        // Ballistic shell with a rim, rails and NVG shroud.
        m.custom(loft([
          { y: .1, rx: .122, front: .138, back: .14, n: 2.3 },
          { y: .15, rx: .121, front: .134, back: .138, n: 2.3 },
          { y: .2, rx: .1, front: .112, back: .116, n: 2.2 },
        ].map((ring) => ({ ...ring, z: -.012 })), 22, { top: .05, bottom: .006 }), C.plate, false);
        m.custom(loft([
          { y: .094, rx: .127, front: .144, back: .146, n: 2.3 },
          { y: .108, rx: .127, front: .144, back: .146, n: 2.3 },
        ].map((ring) => ({ ...ring, z: -.012 })), 22), C.plateShade, false);
        for (const side of [-1, 1]) m.box(C.edge, side * .12, .15, -.0, .012, .022, .15, .004);
        m.box(C.plateShade, 0, .17, -.138, .06, .04, .03, .01, .2);
        // Goggles over the eyes.
        m.box(C.rubber, 0, .082, -.118, .16, .045, .04, .014, .05);
      });
      hard(m, () => lit(m, .3, () => {
        for (const side of [-1, 1]) m.oval(C.glass, side * .038, .082, -.14, .058, .036, .016);
      }), .15);
      for (const side of [-1, 1]) {
        hard(m, () => m.tube(C.rubber, side * .108, .06, .0, .046, .046, .04, 0, Math.PI / 2, 14), .7);
        m.box(C.rubber, side * .08, .0, -.04, .012, .09, .012, .004, .35);
      }
      hard(m, () => m.box(C.trim, .12, .18, .03, .004, .016, .06, .002), .5);
    });
  },
};

export const SUPPLY_PACK: WardrobeItem = {
  id: 'versorgung', slot: 'pack', name: 'Versorgungsrucksack',
  description: 'Großer Tragerahmen mit Munitionskiste und Seitentaschen.',
  build(kit) {
    kit.on('Backpack', (m) => {
      m.box(C.dark, 0, .0, .03, .28, .34, .05, .02);
      hard(m, () => {
        // Ammunition can on the frame.
        m.box(C.plate, 0, .05, .12, .26, .2, .14, .02);
        m.box(C.plateShade, 0, .16, .12, .2, .03, .1, .01);
        m.box(C.edge, 0, .05, .192, .2, .14, .006, .003);
      });
      pouch(m, C.webbing, C.metal, 0, -.12, .12, .24, .1, .1);
      for (const side of [-1, 1]) pouch(m, C.webbing, C.metal, side * .17, -.02, .09, .05, .16, .1);
      hard(m, () => m.box(C.trim, 0, .09, .196, .12, .02, .003, .001), .5);
    }, 'cloth');
    kit.marker('Backpack', [0, .01, .199], [0, 0, 1]);
    kit.anchor('Backpack', 'Backpack', [0, .05, .2]);
  },
};

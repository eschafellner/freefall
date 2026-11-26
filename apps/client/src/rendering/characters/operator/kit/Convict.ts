import type { WardrobeItem } from '../Wardrobe.ts';
import { belt, boot, glove, hard, lit, pouch, suit, toeCap } from './Parts.ts';

/** Convicts: prison overall with reflective bands, strapped-on scrap plates, a hood with respirator and a duffel. */
const C = {
  overall: 0xb4592a,
  overallDark: 0x8f4422,
  band: 0xd9d2a2,
  plate: 0x5d625e,
  rust: 0x6e5a48,
  strap: 0x2b2926,
  hood: 0x6b665a,
  glove: 0x8b7a58,
  boot: 0x3d3129,
  steel: 0x4d5255,
  fastener: 0x90917e,
  canvas: 0x5e5a46,
};

export const CONVICT_ARMOR: WardrobeItem = {
  id: 'gewahrsam', slot: 'armor', name: 'Gewahrsamsoverall', weight: 'leicht',
  build(kit) {
    suit(kit, { fabric: C.overall, dark: C.overallDark, bands: C.band, padding: C.overallDark });
    belt(kit, C.strap, .99, 1.025, .008);
    kit.on('UpperChest', (m) => {
      // Overall zip and mismatched scrap plates strapped over the chest.
      m.box(0x2f2f2b, 0, -.04, -.134, .018, .2, .01, .004, -.06);
      hard(m, () => {
        m.box(C.plate, -.07, .0, -.158, .17, .15, .03, .02, -.1, .07);
        m.box(C.rust, .075, -.045, -.152, .15, .17, .028, .018, -.08, -.1);
        m.box(C.plate, 0, -.01, .128, .27, .2, .03, .02, .06);
      }, .55);
      for (const [x, y, roll] of [[-.02, .02, .62], [.02, -.08, -.55]] as const) m.box(C.strap, x, y, -.176, .4, .028, .012, .005, -.08, roll);
      for (const side of [-1, 1]) {
        m.box(C.strap, side * .11, .12, -.005, .045, .03, .27, .008);
        hard(m, () => m.box(C.fastener, side * .15, -.06, -.17, .022, .022, .01, .004), .45);
      }
    });
    kit.on('Hips', (m) => pouch(m, 0x8c4a24, C.fastener, .17, -.01, -.03, .05, .09, .08), 'cloth');
    kit.anchor('SecondaryWeapon', 'Hips', [.205, -.13, .04]);
    kit.both('Pauldron', (m, side) => hard(m, () => m.box(side < 0 ? C.rust : C.plate, side * .05, .01, .0, .08, .03, .12, .012, 0, side * -.4), .6));
    kit.marker('LeftPauldron', [-.098, -.03, .01], [-1, .3, 0]);
    kit.both('LowerArm', (m, side) => m.box(C.strap, side * .0, -.14, .0, .1, .02, .1, .006), 'cloth');
    kit.both('Hand', (m, side) => glove(m, side, { color: C.glove, palm: 0x7a6a4c, cuff: 0x6f6046 }), 'cloth');
    kit.both('LowerLeg', (m, side) => {
      hard(m, () => m.oval(side < 0 ? C.rust : C.plate, 0, -.03, -.058, .11, .1, .06), .6);
      m.box(C.strap, 0, -.05, -.01, .13, .02, .13, .006);
    });
    const shoe = { color: C.boot, sole: 0x2a221c, cap: 0x4a3a2e, trim: 0x6d5f4f };
    kit.both('Foot', (m) => boot(m, shoe), 'cloth');
    kit.both('Toes', (m) => toeCap(m, shoe), 'cloth');
  },
};

export const CONVICT_HOOD: WardrobeItem = {
  id: 'gewahrsam-haube', slot: 'helmet', name: 'Gewahrsamshaube',
  build(kit) {
    kit.on('Head', (m) => {
      m.oval(0x9c7a62, 0, .08, -.008, .17, .21, .185);
      // Hood, respirator with twin filters and cheap goggles.
      m.oval(C.hood, 0, .1, .02, .225, .25, .235);
      m.box(C.hood, 0, .02, .05, .19, .12, .16, .05);
      hard(m, () => {
        m.oval(0x2c2f2d, 0, .035, -.09, .118, .1, .09);
        for (const side of [-1, 1]) m.tube(0x3e4340, side * .058, .022, -.112, .026, .028, .04, Math.PI / 2, side * .5);
        m.box(0x262b2b, 0, .102, -.1, .15, .038, .03, .012);
        for (const side of [-1, 1]) m.oval(0x5f6d63, side * .038, .103, -.114, .044, .03, .012);
      }, .45);
    }, 'cloth');
    // Steel custody collar with its status light.
    kit.on('Neck', (m) => {
      hard(m, () => m.tube(C.steel, 0, .01, .0, .078, .078, .032, 0, 0, 16), .45);
      lit(m, 1.6, () => m.box(0xffa24a, 0, .01, -.08, .022, .014, .01, .003));
    });
  },
};

export const CONVICT_DUFFEL: WardrobeItem = {
  id: 'seesack', slot: 'pack', name: 'Seesack',
  build(kit) {
    kit.on('Backpack', (m) => {
      // Canvas duffel strapped across the back; the rear face stays where the stencil expects it.
      m.capsule(C.canvas, 0, .0, .085, .085, .3, 0, Math.PI / 2);
      for (const x of [-.08, .08]) m.box(C.strap, x, .0, .085, .022, .18, .18, .006);
      m.box(C.canvas, 0, .0, .145, .2, .12, .03, .02);
    }, 'cloth');
    kit.anchor('Backpack', 'Backpack', [0, .0, .14]);
  },
};

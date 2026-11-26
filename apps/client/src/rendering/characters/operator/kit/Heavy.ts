import type * as T from 'three';
import type { WardrobeItem } from '../Wardrobe.ts';
import { loft, torsoRings, torsoWeights, band } from '../BodyLoft.ts';
import type { Ring } from '../BodyLoft.ts';
import { belt, boot, glove, hard, lit, pouch, suit, toeCap } from './Parts.ts';

/**
 * BW-9 Bollwerk: heavy assault armour. Gunmetal plates with hazard-yellow edges over a padded suit: a high gorget,
 * segmented abdomen, triple pauldrons, rerebraces, gauntlets, cuisses, knee cops and full greaves.
 */
const C = {
  suit: 0x2a2d2d,
  panel: 0x333737,
  dark: 0x1b1d1e,
  plate: 0x515754,
  plateShade: 0x434946,
  plateDark: 0x333836,
  edge: 0x7d837d,
  trim: 0xd5ad3a,
  webbing: 0x3b3d38,
  strap: 0x222526,
  rubber: 0x1a1c1c,
  metal: 0x8a8c86,
  glass: 0x4a1a12,
  light: 0xffb15a,
};

function shell(side: number, rings: Ring[], tilt: number, out: number, cap = .02): T.BufferGeometry {
  return loft(rings, 20, cap ? { top: cap, bottom: .01 } : {}).rotateZ(side * tilt).translate(side * out, 0, .006);
}

export const BW9_ARMOR: WardrobeItem = {
  id: 'bw9', slot: 'armor', name: 'BW-9 Bollwerk', weight: 'schwer',
  description: 'Schwere Sturmpanzerung mit Halsberge, Bauchschienen, Dreifach-Schulterschalen und Beinschienen.',
  build(kit) {
    suit(kit, { fabric: C.suit, panel: C.panel, dark: C.dark, padding: C.strap, bulk: .008 });
    // Segmented abdomen plates as skinned bands, so they flex with the spine.
    kit.skin(torsoWeights, (m) => {
      for (const [from, to] of [[1.05, 1.11], [1.115, 1.175]] as const) {
        m.custom(loft(band(torsoRings(.008), from, to, .03, 2, 3), 22), C.plateShade, false);
        m.custom(loft(band(torsoRings(.008), to - .008, to, .033, 1, 3), 22), C.trim, false);
      }
    }, 'plate');
    belt(kit, C.strap, .97, 1.04, .02);
    kit.on('UpperChest', (m) => {
      hard(m, () => {
        // Breastplate with a raised keel, back plate and a high gorget round the neck.
        m.box(C.plate, 0, -.02, -.175, .34, .27, .058, .035, -.08);
        m.box(C.plateShade, 0, -.01, -.205, .06, .23, .02, .008, -.08);
        m.box(C.trim, 0, -.152, -.188, .3, .016, .03, .006, -.08);
        m.box(C.plate, 0, .0, .14, .33, .28, .05, .03, .06);
        m.custom(loft([
          { y: .1, rx: .15, front: .17, back: .14, n: 2.6 },
          { y: .15, rx: .13, front: .15, back: .125, n: 2.6 },
          { y: .2, rx: .112, front: .126, back: .112, n: 2.4 },
        ].map((ring) => ({ ...ring, z: .0 })), 22), C.plate, false);
        m.custom(loft([
          { y: .196, rx: .116, front: .13, back: .116, n: 2.4 },
          { y: .208, rx: .112, front: .126, back: .112, n: 2.4 },
        ], 22), C.trim, false);
      });
      for (const side of [-1, 1]) m.box(C.webbing, side * .2, -.03, -.01, .04, .2, .22, .014);
      lit(m, 1.3, () => m.box(C.light, -.1, .07, -.214, .012, .012, .004, .002));
    });
    kit.on('Hips', (m) => {
      hard(m, () => {
        m.box(C.plate, 0, -.04, -.13, .18, .12, .03, .012, .14);
        m.box(C.trim, 0, -.095, -.122, .16, .014, .03, .004, .14);
        m.box(C.plate, 0, -.03, .135, .22, .11, .03, .012, -.12);
      });
      pouch(m, C.webbing, C.metal, -.19, .01, .03, .065, .1, .085, 0, .12);
    });
    kit.anchor('SecondaryWeapon', 'Hips', [.225, -.13, .05]);
    kit.both('Pauldron', (m, side) => {
      hard(m, () => {
        m.custom(shell(side, [
          { y: .095, rx: .07, front: .075 },
          { y: .07, rx: .13, front: .132 },
          { y: .025, rx: .152, front: .146 },
          { y: -.03, rx: .155, front: .148 },
          { y: -.06, rx: .146, front: .14 },
        ], -.34, .045), C.plate, false);
        m.custom(shell(side, [{ y: -.045, rx: .157, front: .151 }, { y: -.03, rx: .158, front: .152 }], -.34, .045, 0), C.trim, false);
        m.custom(shell(side, [{ y: -.06, rx: .13, front: .13 }, { y: -.095, rx: .136, front: .134 }, { y: -.12, rx: .126, front: .124 }], -.6, .08), C.plateShade, false);
        m.custom(shell(side, [{ y: -.115, rx: .112, front: .112 }, { y: -.145, rx: .116, front: .114 }, { y: -.165, rx: .106, front: .104 }], -.78, .1), C.plateDark, false);
      });
    });
    kit.marker('LeftPauldron', [-.19, -.005, .008], [-1, .32, 0], [.075, .058]);
    kit.both('UpperArm', (m, side) => {
      hard(m, () => {
        m.box(C.plate, side * .062, -.18, .0, .03, .13, .11, .012);
        m.box(C.plateShade, side * .05, -.18, -.055, .07, .12, .02, .008, 0, 0, side * -.4);
      });
    });
    kit.both('LowerArm', (m, side) => {
      hard(m, () => {
        m.oval(C.plate, side * .006, .006, .05, .095, .1, .07);
        m.box(C.plate, side * .028, -.12, .006, .05, .18, .1, .016, 0, side * .04);
        m.box(C.trim, side * .055, -.04, .006, .006, .02, .08, .002);
      });
    });
    kit.both('Hand', (m, side) => glove(m, side, { color: C.dark, palm: 0x2a2c2c, knuckle: C.plate, cuff: C.plateShade, gauntlet: .03 }));
    kit.both('UpperLeg', (m, side) => {
      hard(m, () => {
        // Cuisse over the front and outside of the thigh.
        m.box(C.plate, side * .01, -.2, -.102, .14, .22, .03, .014, .06);
        m.box(C.plateShade, side * .085, -.2, -.03, .03, .2, .12, .012, 0, 0, side * .2);
      });
      m.box(C.strap, 0, -.31, 0, .2, .022, .21, .008);
    });
    kit.both('Tasset', (m, side) => {
      hard(m, () => {
        m.box(C.plate, side * .06, -.1, -.06, .14, .16, .026, .012, .1, side * -.15, side * -.5);
        m.box(C.trim, side * .06, -.175, -.068, .12, .012, .03, .004, .1, side * -.15, side * -.5);
      });
    });
    kit.both('LowerLeg', (m) => {
      hard(m, () => {
        m.oval(C.plate, 0, .0, -.082, .15, .15, .1);
        m.box(C.trim, 0, .0, -.13, .08, .02, .012, .004);
        m.box(C.plate, 0, -.2, -.07, .115, .24, .04, .016, -.04);
        m.box(C.plateShade, 0, -.2, .045, .1, .2, .03, .012, .06);
      });
    });
    const shoe = { color: C.dark, sole: 0x141515, cap: C.plateShade, trim: C.webbing, shaft: C.plateDark, scale: 1.16 };
    kit.both('Foot', (m) => boot(m, shoe));
    kit.both('Toes', (m) => toeCap(m, shoe));
  },
};

export const BW9_HELMET: WardrobeItem = {
  id: 'bw9-helm', slot: 'helmet', name: 'BW-9 Bollwerkhelm',
  description: 'Schwerer Helm mit schmalem Sehschlitz und verstärkten Wangenplatten.',
  build(kit) {
    kit.on('Head', (m) => {
      hard(m, () => {
        // Squared shell, narrow vision slit under a heavy brow.
        m.custom(loft([
          { y: -.06, rx: .11, front: .13, back: .135, n: 3.2, shade: .8 },
          { y: -.02, rx: .13, front: .15, back: .148, n: 3.4 },
          { y: .05, rx: .138, front: .156, back: .152, n: 3.4 },
          { y: .072, rx: .138, front: .142, back: .152, n: 3.3, shade: .8 },
          { y: .094, rx: .139, front: .142, back: .153, n: 3.3, shade: .8 },
          { y: .112, rx: .141, front: .17, back: .154, n: 3.2 },
          { y: .17, rx: .132, front: .152, back: .146, n: 3 },
          { y: .21, rx: .108, front: .118, back: .118, n: 2.6 },
        ].map((ring) => ({ ...ring, z: -.012 })), 24, { top: .04, bottom: .01 }), C.plate, false);
        m.box(C.plateShade, 0, .23, -.01, .03, .03, .25, .01, -.06);
        for (const side of [-1, 1]) {
          m.box(C.plateShade, side * .118, .0, -.08, .04, .11, .1, .014, .05, 0, side * .4);
          m.box(C.trim, side * .132, .0, -.08, .01, .1, .04, .003, .05, 0, side * .4);
        }
        for (const y of [-.03, -.012, .006]) m.box(C.rubber, 0, y, -.175, .06, .007, .012, .002, .14);
      });
      // Vision slit glows faintly.
      hard(m, () => lit(m, .9, () => m.custom(loft([
        { y: .074, rx: .128, front: .146, back: .1, n: 3.3 },
        { y: .092, rx: .128, front: .146, back: .1, n: 3.3 },
      ].map((ring) => ({ ...ring, z: -.012 })), 24), C.glass, false)), .1);
    });
  },
};

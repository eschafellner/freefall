import type * as T from 'three';
import type { ModelParts } from '../../../ModelParts.ts';
import type { WardrobeItem } from '../Wardrobe.ts';
import { loft, torsoRings, torsoWeights, band } from '../BodyLoft.ts';
import type { Ring } from '../BodyLoft.ts';
import { belt, boot, glove, hard, lit, pouch, suit, toeCap } from './Parts.ts';

/**
 * KR-12 Koloss: over-heavy armour on a load-bearing exoskeleton. Blue-grey steel plates with orange hazard edges, a
 * closed cuirass with a high collar, segmented abdomen, layered pauldrons with neck guards, exoskeleton struts along
 * arms and legs, twin power cells on the lower back and a heavy visor-slit helmet.
 */
const C = {
  suit: 0x23272b,
  panel: 0x2d3237,
  dark: 0x181b1e,
  plate: 0x4d5863,
  plateShade: 0x3e4852,
  plateDark: 0x2d343b,
  edge: 0x8b97a1,
  trim: 0xd9772c,
  strut: 0x9ba2a8,
  joint: 0x5f676e,
  strap: 0x1f2326,
  rubber: 0x16191b,
  glow: 0x7fd3ff,
  glass: 0x3a1210,
  eye: 0xff6040,
};

function shell(side: number, rings: Ring[], tilt: number, out: number, cap = .02): T.BufferGeometry {
  return loft(rings, 20, cap ? { top: cap, bottom: .01 } : {}).rotateZ(side * tilt).translate(side * out, 0, .006);
}

/** Exoskeleton strut: a rod with end caps between two points of one bone (bone-local). */
function strut(m: ModelParts, from: readonly [number, number, number], to: readonly [number, number, number], radius = .011): void {
  hard(m, () => {
    m.segment(C.strut, from, to, radius, radius * .85, 8, false);
    m.oval(C.joint, ...from, radius * 3.2, radius * 3.2, radius * 3.2);
    m.oval(C.joint, ...to, radius * 2.6, radius * 2.6, radius * 2.6);
  }, .45);
}

export const KR12_ARMOR: WardrobeItem = {
  id: 'kr12', slot: 'armor', name: 'KR-12 Koloss', weight: 'ueberschwer',
  description: 'Überschwere Panzerung auf einem Stützexoskelett.',
  build(kit) {
    suit(kit, { fabric: C.suit, panel: C.panel, dark: C.dark, padding: C.strap, bulk: .014 });
    // Three abdomen lames that flex with the spine.
    kit.skin(torsoWeights, (m) => {
      for (const [from, to] of [[1.0, 1.055], [1.06, 1.115], [1.12, 1.18]] as const) {
        m.custom(loft(band(torsoRings(.014), from, to, .036, 2, 3), 22), C.plateShade, false);
        m.custom(loft(band(torsoRings(.014), to - .007, to, .039, 1, 3), 22), C.trim, false);
      }
    }, 'plate');
    belt(kit, C.strap, .95, 1.0, .03);
    kit.on('UpperChest', (m) => {
      hard(m, () => {
        // Cuirass: breastplate with keel and shoulder wings, back plate, high collar.
        m.box(C.plate, 0, -.025, -.182, .37, .29, .07, .04, -.08);
        m.box(C.plateShade, 0, -.01, -.218, .07, .25, .024, .01, -.08);
        for (const side of [-1, 1]) {
          m.box(C.plate, side * .15, .06, -.16, .12, .12, .06, .025, -.2, side * -.35);
          m.box(C.plateShade, side * .205, -.03, -.03, .05, .24, .24, .02);
        }
        m.box(C.trim, 0, -.168, -.196, .32, .018, .034, .006, -.08);
        m.box(C.plate, 0, -.005, .148, .35, .3, .06, .035, .06);
        m.custom(loft([
          { y: .09, rx: .165, front: .19, back: .155, n: 2.7 },
          { y: .16, rx: .145, front: .17, back: .138, n: 2.7 },
          { y: .225, rx: .124, front: .142, back: .124, n: 2.5 },
        ], 22), C.plate, false);
        m.custom(loft([
          { y: .22, rx: .128, front: .146, back: .128, n: 2.5 },
          { y: .233, rx: .124, front: .142, back: .124, n: 2.5 },
        ], 22), C.trim, false);
        // Exoskeleton spine up the back plate.
        m.box(C.strut, 0, .0, .184, .03, .26, .02, .008);
        for (const y of [-.1, .0, .1]) m.box(C.joint, 0, y, .19, .06, .022, .018, .006);
      });
      lit(m, 1.4, () => m.box(C.glow, -.11, .08, -.22, .014, .014, .004, .002));
    });
    kit.on('Chest', (m) => {
      // Twin power cells on the lower back with glowing charge strips.
      hard(m, () => {
        for (const side of [-1, 1]) {
          m.tube(C.plateDark, side * .085, -.07, .145, .042, .042, .14, 0, 0, 14);
          m.tube(C.edge, side * .085, .005, .145, .03, .036, .018, 0, 0, 12);
        }
        m.box(C.strut, 0, -.07, .12, .16, .03, .03, .008);
      }, .4);
      lit(m, 1.6, () => { for (const side of [-1, 1]) m.box(C.glow, side * .085, -.07, .19, .012, .09, .004, .002); });
    });
    kit.on('Hips', (m) => {
      hard(m, () => {
        m.box(C.plate, 0, -.045, -.14, .2, .14, .034, .014, .14);
        m.box(C.trim, 0, -.11, -.13, .18, .014, .034, .004, .14);
        m.box(C.plate, 0, -.035, .145, .25, .13, .034, .014, -.12);
        // Hip joints of the exoskeleton.
        for (const side of [-1, 1]) m.tube(C.joint, side * .2, -.04, 0, .035, .035, .03, 0, Math.PI / 2, 14);
      });
      pouch(m, C.plateDark, C.edge, -.2, .02, .05, .065, .1, .085, 0, .12);
    });
    kit.anchor('SecondaryWeapon', 'Hips', [.24, -.13, .06]);
    kit.both('Pauldron', (m, side) => {
      hard(m, () => {
        m.custom(shell(side, [
          { y: .105, rx: .075, front: .08 },
          { y: .078, rx: .142, front: .144 },
          { y: .03, rx: .165, front: .158 },
          { y: -.03, rx: .168, front: .16 },
          { y: -.065, rx: .158, front: .15 },
        ], -.3, .05), C.plate, false);
        m.custom(shell(side, [{ y: -.05, rx: .17, front: .162 }, { y: -.035, rx: .171, front: .163 }], -.3, .05, 0), C.trim, false);
        m.custom(shell(side, [{ y: -.065, rx: .142, front: .14 }, { y: -.1, rx: .148, front: .145 }, { y: -.128, rx: .138, front: .134 }], -.55, .085), C.plateShade, false);
        m.custom(shell(side, [{ y: -.12, rx: .124, front: .122 }, { y: -.152, rx: .128, front: .124 }, { y: -.174, rx: .116, front: .112 }], -.74, .11), C.plateDark, false);
        // Neck guard standing on the pauldron.
        m.box(C.plate, -side * .04, .13, .0, .02, .09, .2, .01, 0, side * .25);
      });
    });
    kit.marker('LeftPauldron', [-.205, .0, .008], [-1, .3, 0], [.08, .062]);
    kit.both('UpperArm', (m, side) => {
      hard(m, () => {
        m.box(C.plate, side * .066, -.17, .0, .034, .15, .12, .014);
        m.box(C.plateShade, side * .052, -.17, -.06, .08, .13, .022, .01, 0, 0, side * -.4);
      });
      strut(m, [side * .095, -.06, .03], [side * .085, -.27, .035]);
    });
    kit.both('LowerArm', (m, side) => {
      hard(m, () => {
        m.oval(C.plate, side * .006, .006, .054, .105, .11, .08);
        m.box(C.plate, side * .03, -.12, .006, .056, .19, .108, .018, 0, side * .04);
        m.box(C.trim, side * .06, -.05, .006, .006, .022, .09, .002);
      });
      strut(m, [side * .07, .0, .03], [side * .062, -.2, .025]);
    });
    kit.both('Hand', (m, side) => glove(m, side, { color: C.plateDark, palm: C.dark, knuckle: C.plate, cuff: C.plateShade, gauntlet: .045 }));
    kit.both('UpperLeg', (m, side) => {
      hard(m, () => {
        m.box(C.plate, side * .01, -.19, -.108, .15, .26, .034, .016, .06);
        m.box(C.plateShade, side * .092, -.19, -.025, .034, .24, .14, .014, 0, 0, side * .2);
        m.box(C.trim, side * .01, -.315, -.112, .13, .014, .036, .004, .06);
      });
      strut(m, [side * .118, -.02, .0], [side * .112, -.4, .0], .013);
    });
    kit.both('Tasset', (m, side) => {
      hard(m, () => {
        m.box(C.plate, side * .065, -.11, -.065, .15, .18, .03, .014, .1, side * -.15, side * -.5);
        m.box(C.trim, side * .065, -.19, -.074, .13, .012, .034, .004, .1, side * -.15, side * -.5);
      });
    });
    kit.both('LowerLeg', (m, side) => {
      hard(m, () => {
        m.oval(C.plate, 0, .0, -.088, .165, .165, .11);
        m.box(C.trim, 0, .0, -.142, .09, .022, .012, .004);
        m.box(C.plate, 0, -.2, -.076, .13, .26, .046, .018, -.04);
        m.box(C.plateShade, 0, -.2, .05, .11, .22, .036, .014, .06);
        m.tube(C.joint, side * .09, .0, .0, .04, .04, .03, 0, Math.PI / 2, 14);
      });
      strut(m, [side * .095, -.01, .0], [side * .085, -.36, .02], .013);
    });
    const shoe = { color: C.dark, sole: 0x101213, cap: C.plateShade, trim: C.strap, shaft: C.plateDark, scale: 1.24 };
    kit.both('Foot', (m) => boot(m, shoe));
    kit.both('Toes', (m) => toeCap(m, shoe));
  },
};

export const KR12_HELMET: WardrobeItem = {
  id: 'kr12-helm', slot: 'helmet', name: 'KR-12 Kolosshelm',
  description: 'Schwerer Helm mit Sehschlitz, Sensorpaar und Kieferpanzer.',
  build(kit) {
    kit.on('Head', (m) => {
      hard(m, () => {
        m.custom(loft([
          { y: -.07, rx: .12, front: .14, back: .145, n: 3.3, shade: .8 },
          { y: -.025, rx: .14, front: .16, back: .158, n: 3.5 },
          { y: .045, rx: .146, front: .164, back: .16, n: 3.5 },
          { y: .068, rx: .146, front: .15, back: .16, n: 3.4, shade: .8 },
          { y: .086, rx: .147, front: .15, back: .161, n: 3.4, shade: .8 },
          { y: .104, rx: .149, front: .178, back: .162, n: 3.3 },
          { y: .165, rx: .14, front: .16, back: .154, n: 3.1 },
          { y: .215, rx: .112, front: .122, back: .122, n: 2.7 },
        ].map((ring) => ({ ...ring, z: -.012 })), 24, { top: .04, bottom: .01 }), C.plate, false);
        // Crest plate, jaw armour and the two sensor lenses over the slit.
        m.box(C.plateShade, 0, .24, -.01, .05, .03, .26, .012, -.06);
        m.box(C.trim, 0, .255, -.01, .012, .012, .24, .004, -.06);
        for (const side of [-1, 1]) {
          m.box(C.plateShade, side * .125, -.01, -.085, .05, .13, .11, .016, .05, 0, side * .38);
          m.tube(C.plateDark, side * .045, .13, -.178, .018, .02, .02, Math.PI / 2, 0, 12);
        }
        for (const y of [-.04, -.022, -.004]) m.box(C.rubber, 0, y, -.186, .07, .007, .012, .002, .14);
      });
      hard(m, () => lit(m, 1.1, () => {
        m.custom(loft([
          { y: .07, rx: .136, front: .154, back: .1, n: 3.4 },
          { y: .084, rx: .136, front: .154, back: .1, n: 3.4 },
        ].map((ring) => ({ ...ring, z: -.012 })), 24), C.glass, false);
        for (const side of [-1, 1]) m.oval(C.eye, side * .045, .13, -.19, .016, .016, .006);
      }), .1);
    });
  },
};

import { ModelParts } from '../ModelParts.ts';
import type * as T from 'three';
import type { WeaponParts, WeaponProfile } from './WeaponVisualController.ts';

/**
 * MP-99, procedural: compact 10 mm submachine gun. Boxy steel upper with a vented barrel shroud, polymer lower,
 * straight 40-round magazine ahead of the trigger guard, vertical foregrip and a two-rod sliding stock. Local origin at
 * the grip, front along -Z, meters (about 0.66 m with the stock extended).
 *
 * Moving parts: `slide` is the bolt in the right ejection port together with the left charging handle. It cycles on
 * every shot; during the reload the support hand racks it once the new magazine sits (`MP99_HANDLING.charge`).
 */
export function createMp99(finish: T.MeshStandardMaterial): WeaponParts {
  const upper = 0x3a4143;
  const phosphate = 0x22272a;
  const polymer = 0x564f3e;
  const rubber = 0x232622;
  const steel = 0x5f6564;
  const dark = 0x111618;
  const m = new ModelParts();
  // Pistol grip with stippled bands, polymer trigger housing and guard.
  m.box(polymer, 0, -.026, .02, .052, .112, .066, .008, -.2);
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.037 - i * .014, .05 - i * .004, .053, .004, .009);
  m.box(polymer, 0, .026, -.07, .05, .032, .17, .006);
  m.box(phosphate, 0, .002, -.066, .044, .012, .088, .003); // trigger guard
  m.box(steel, 0, .026, -.06, .01, .036, .008, .001, .19); // trigger
  m.box(phosphate, -.026, .034, -.03, .006, .012, .02, .002); // ambidextrous selector
  m.box(phosphate, .026, .034, -.03, .006, .012, .02, .002);
  // Steel upper receiver with top rail and ejection port.
  m.box(upper, 0, .074, -.11, .058, .074, .29, .008);
  m.box(phosphate, 0, .116, -.11, .036, .012, .25, .002);
  for (let i = 0; i < 10; i++) m.box(steel, 0, .124, .002 - i * .024, .036, .004, .01);
  m.box(dark, .03, .08, -.085, .002, .026, .062); // ejection port
  m.box(dark, -.03, .092, -.06, .002, .008, .1); // charging handle slot
  for (const z of [-.02, -.2]) for (const side of [-1, 1]) m.tube(steel, side * .03, .05, z, .004, .004, .004, 0, Math.PI / 2, 8);
  // Magazine well ahead of the trigger guard, flared at the bottom.
  m.box(polymer, 0, .016, -.165, .044, .05, .054, .006);
  m.box(polymer, 0, -.006, -.165, .05, .012, .062, .004);
  m.box(steel, .025, .012, -.138, .006, .014, .012, .002); // magazine release
  // Vented barrel shroud, short barrel and a three-slot compensator.
  m.box(phosphate, 0, .074, -.3, .05, .054, .1, .006);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) m.box(dark, side * .0255, .078, -.268 - i * .022, .002, .016, .012);
  m.tube(steel, 0, .074, -.37, .011, .011, .07, Math.PI / 2);
  m.tube(phosphate, 0, .074, -.41, .016, .016, .04, Math.PI / 2);
  for (let i = 0; i < 3; i++) m.box(dark, 0, .09, -.398 - i * .011, .008, .004, .006);
  m.tube(dark, 0, .074, -.431, .0075, .0075, .003, Math.PI / 2);
  // Rail under the shroud and a short vertical foregrip.
  m.box(phosphate, 0, .043, -.3, .03, .008, .09, .002);
  m.box(polymer, 0, -.004, -.29, .03, .086, .034, .009, .12);
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.012 - i * .016, -.288 - i * .002, .031, .004, .035);
  // Sliding stock: end cap, two steel rods and a rubber butt plate.
  m.box(phosphate, 0, .07, .05, .052, .062, .03, .006);
  for (const [x, y] of [[-.018, .092], [.018, .092], [0, .052]] as const) m.tube(steel, x, y, .13, .005, .005, .16, Math.PI / 2, 0, 8);
  m.box(phosphate, 0, .072, .212, .052, .1, .016, .004);
  m.box(rubber, 0, .072, .224, .054, .108, .012, .004);
  m.box(0x6d756f, 0, .112, -.11, .052, .003, .27, .001); // worn upper edge

  // Compact reflex sight on the rail.
  const optic = new ModelParts();
  optic.box(phosphate, 0, .006, 0, .032, .012, .05, .002);
  optic.box(phosphate, 0, .026, -.014, .032, .03, .006, .002);
  for (const side of [-1, 1]) optic.box(phosphate, side * .014, .026, -.006, .004, .03, .018, .001);
  optic.box(0x3b5652, 0, .027, -.013, .022, .02, .002);
  optic.box(steel, .019, .012, .006, .008, .012, .016, .002);

  // Straight 40-round magazine, socket-local: its top sits inside the well.
  const magazine = new ModelParts();
  magazine.box(polymer, 0, -.08, 0, .03, .22, .042, .005, .08);
  magazine.box(phosphate, 0, -.193, -.009, .036, .014, .05, .004, .08);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) magazine.box(phosphate, side * .0152, -.04 - i * .036, -.002 - i * .003, .001, .02, .028, 0, .08);

  // Bolt face in the right port and the left charging handle move together.
  const slide = new ModelParts();
  slide.box(steel, .027, .08, -.085, .006, .02, .05, .002);
  slide.box(phosphate, -.034, .092, -.03, .012, .012, .012, .002);
  slide.box(steel, -.043, .092, -.03, .014, .016, .022, .004);

  return { body: m.geometry(), optic: optic.geometry(), magazine: magazine.geometry(), slide: slide.geometry(), finish };
}

/** Sockets and reload choreography of the MP-99 (fractions of `reloadSeconds`, server timeline 0.16 / 0.56). */
export const MP99_HANDLING: WeaponProfile = {
  weaponId: 'mp-99',
  action: 'slide',
  sockets: {
    Muzzle: [0, .074, -.433], EjectionPort: [.031, .08, -.085], SupportHand: [-.014, -.006, -.29], Barrel: [0, .074, -.34],
    Optic: [0, .122, -.11], Underbarrel: [0, .039, -.3], Magazine: [0, -.004, -.165], Stock: [0, .07, .05],
  },
  cycle: { travel: .022, seconds: .05 },
  magazine: { drop: [-.07, -.27, .05], roll: -.2, hand: [-.024, -.19, .004] },
  // After the magazine sits: reach to the charging handle, rack it back, let it slam forward, return to the foregrip.
  charge: { hand: [-.05, .09, -.03], reach: [.6, .68], pull: [.68, .74], release: .77, back: [.79, .9], travel: .045 },
};

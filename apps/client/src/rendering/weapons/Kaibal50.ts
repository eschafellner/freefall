import { ModelParts } from '../ModelParts.ts';
import type * as T from 'three';
import type { WeaponParts, WeaponProfile } from './WeaponVisualController.ts';

const SPACING = .0145;
const BORE_Y = .085;
const BREECH_Z = -.14;

/**
 * Kaibal 50, procedural: side-by-side double rifle in 7.77 × 50 mm with a break action. Steel action with hinge pin,
 * top lever and two triggers, composite stock with a semi-pistol grip, 60 cm barrels on a monobloc with a top rib,
 * express rear sight and bead, composite forend. Local origin at the grip, front along -Z, meters (about 1.06 m).
 *
 * Moving parts: `slide` is the barrel group (barrels, monobloc, rib, forend) that tips around the hinge pin;
 * `magazine` are the two rounds in the support hand, `spent` the two cases the ejectors throw out.
 */
export function createKaibal50(finish: T.MeshStandardMaterial): WeaponParts {
  const steel = 0x4c5254;
  const blued = 0x24292c;
  const composite = 0x4d3d2d;
  const checker = 0x2f261d;
  const rubber = 0x222320;
  const dark = 0x0f1213;
  const brass = 0xa8843f;
  const copper = 0x9a5a36;
  const m = new ModelParts();
  // Semi-pistol grip with checkering and the stock as one side profile, rubber recoil pad.
  m.box(composite, 0, -.024, .02, .046, .11, .062, .008, -.24);
  for (let i = 0; i < 3; i++) m.box(checker, 0, -.032 - i * .016, .044 - i * .004, .047, .006, .03);
  m.profile(composite, [[-.008, .104], [.06, .096], [.3, .072], [.3, -.062], [.26, -.066], [.12, -.006], [.05, .026], [-.008, .035]], .044, 0, .006);
  m.box(rubber, 0, .005, .307, .046, .14, .016, .006);
  m.box(checker, 0, .058, .17, .046, .004, .1, 0, -.08); // cheek line
  // Action: steel body with darker side plates, hinge pin, trigger guard and two triggers.
  m.box(steel, 0, .07, -.075, .05, .07, .13, .008);
  for (const side of [-1, 1]) m.box(blued, side * .0252, .068, -.08, .001, .05, .1, .001);
  m.tube(steel, 0, .045, BREECH_Z, .011, .011, .054, 0, Math.PI / 2);
  m.box(steel, 0, .106, -.02, .022, .006, .07, .002); // top tang
  m.box(blued, 0, .022, -.07, .03, .026, .1, .004); // trigger plate
  m.box(steel, 0, -.002, -.062, .03, .008, .09, .003); // trigger guard
  m.box(steel, 0, .024, -.046, .008, .036, .007, .001, .2); // rear trigger
  m.box(steel, 0, .026, -.072, .008, .036, .007, .001, .3); // front trigger
  m.box(steel, 0, .104, -.004, .012, .008, .016, .002); // safety

  // Top lever on the tang (optic socket).
  const lever = new ModelParts();
  lever.box(steel, 0, .004, 0, .014, .008, .05, .003, 0, 0);
  lever.box(steel, .014, .004, .022, .03, .008, .012, .003);

  // Barrel group, built in weapon space; the controller hangs it on the hinge pin.
  const barrels = new ModelParts();
  for (const side of [-1, 1]) {
    barrels.tube(blued, side * SPACING, BORE_Y, -.44, .0135, .0135, .6, Math.PI / 2);
    barrels.tube(dark, side * SPACING, BORE_Y, -.741, .0068, .0068, .003, Math.PI / 2);
    barrels.tube(dark, side * SPACING, BORE_Y, BREECH_Z - .0005, .0075, .0075, .002, Math.PI / 2); // chamber mouths
  }
  barrels.box(steel, 0, .078, -.172, .056, .05, .064, .006); // monobloc
  barrels.box(steel, 0, .052, -.19, .02, .022, .09, .003); // lump on the hinge
  barrels.box(blued, 0, .1, -.46, .012, .006, .56, .001); // rib
  barrels.box(steel, 0, .106, -.215, .024, .012, .008, .002); // express sight
  barrels.box(dark, 0, .111, -.215, .006, .006, .009);
  barrels.tube(brass, 0, .108, -.728, .0028, .0028, .008, 0, 0, 8); // bead
  barrels.box(blued, 0, .068, -.62, .03, .012, .03, .003); // barrel band
  barrels.box(composite, 0, .058, -.3, .05, .038, .2, .01); // forend
  for (let i = 0; i < 4; i++) barrels.box(checker, 0, .039, -.24 - i * .04, .051, .004, .022);

  // Two rounds (magazine socket = chamber mouths): brass case, copper bullet towards the muzzle.
  const rounds = new ModelParts();
  const spent = new ModelParts();
  for (const side of [-1, 1]) {
    rounds.tube(brass, side * SPACING, 0, -.025, .0068, .0068, .05, Math.PI / 2, 0, 10);
    rounds.tube(brass, side * SPACING, 0, .0015, .0074, .0074, .003, Math.PI / 2, 0, 10);
    rounds.tube(copper, side * SPACING, 0, -.062, .0015, .0046, .024, Math.PI / 2, 0, 10);
    spent.tube(brass, side * SPACING, 0, -.025, .0068, .0068, .05, Math.PI / 2, 0, 10);
    spent.tube(dark, side * SPACING, 0, -.0505, .0046, .0046, .001, Math.PI / 2, 0, 10);
  }

  return { body: m.geometry(), optic: lever.geometry(), magazine: rounds.geometry(), slide: barrels.geometry(), spent: spent.geometry(), finish };
}

/** Sockets and break-action choreography (fractions of 0.8 s, server timeline 0.3 / 0.7). */
export const KAIBAL50_HANDLING: WeaponProfile = {
  weaponId: 'kaibal-50',
  action: 'break',
  sockets: {
    Muzzle: [0, BORE_Y, -.742], EjectionPort: [0, .1, BREECH_Z], SupportHand: [-.014, .03, -.3], Barrel: [0, BORE_Y, -.6],
    Optic: [0, .11, -.035], Underbarrel: [0, .04, -.3], Magazine: [0, BORE_Y, BREECH_Z], Stock: [0, .07, .05],
  },
  // Open fast, rounds from the belt into the chambers, close with the forend.
  hinge: { pivot: [0, .045, BREECH_Z], angle: .62, open: [.02, .16], close: [.76, .9] },
  magazine: { drop: [-.11, -.24, .12], roll: -.5, hand: [-.012, -.012, -.03] },
  barrelSpacing: SPACING,
  ejectsPerShot: false,
};

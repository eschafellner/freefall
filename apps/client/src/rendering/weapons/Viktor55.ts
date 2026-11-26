import { ModelParts } from '../ModelParts.ts';
import type * as T from 'three';
import type { WeaponParts, WeaponProfile } from './WeaponVisualController.ts';

/**
 * Viktor 55, procedural: .55 submachine gun with a low bore axis. Tall slab-sided upper with a full-length rail high
 * above the barrel, a sloping lower housing ("chin") in front of the magazine well that takes the bolt's downward
 * recoil travel, straight 35-round magazine directly ahead of the trigger guard, short vertical foregrip and a
 * skeletal folding stock. Local origin at the grip, front along -Z, meters (about 0.66 m with the stock unfolded).
 *
 * Moving parts: `slide` is the bolt in the right ejection port and the left charging handle near the front. It
 * cycles on every shot and stays locked back from the magazine release until the bolt catch drops it after insertion.
 */
export function createViktor55(finish: T.MeshStandardMaterial): WeaponParts {
  const upper = 0x34393b;
  const housing = 0x4e5343;
  const phosphate = 0x202426;
  const rubber = 0x222522;
  const steel = 0x5a6060;
  const dark = 0x101416;
  const m = new ModelParts();
  // Upright grip, thick polymer trigger guard.
  m.box(housing, 0, -.028, .024, .05, .114, .064, .008, -.15);
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.04 - i * .015, .051 - i * .002, .051, .004, .01);
  m.box(housing, 0, .012, -.045, .05, .036, .15, .006);
  m.box(housing, 0, -.008, -.06, .046, .012, .07, .004); // trigger guard
  m.box(steel, 0, .02, -.052, .01, .034, .008, .001, .1); // trigger
  m.box(phosphate, -.026, .036, -.012, .005, .014, .024, .002); // selector
  // Tall upper receiver with a high full-length rail; the bore sits low, in line with the grip hand.
  m.profile(upper, [[.05, .03], [.05, .13], [-.2, .13], [-.285, .072], [-.285, .03]], .056, 0, .006); // nose slopes onto the shroud
  m.box(phosphate, 0, .138, -.12, .034, .014, .37, .002);
  for (let i = 0; i < 15; i++) m.box(steel, 0, .147, .05 - i * .024, .034, .004, .01);
  m.box(dark, .029, .07, -.075, .002, .026, .062); // ejection port
  m.box(dark, -.029, .11, -.17, .002, .008, .09); // charging handle slot
  for (const side of [-1, 1]) {
    m.box(phosphate, side * .029, .05, -.15, .002, .012, .17); // side seam
    for (const z of [.01, -.12, -.21]) m.tube(steel, side * .029, .1, z, .004, .004, .004, 0, Math.PI / 2, 8);
  }
  // Low barrel shroud with slots, barrel and a slotted flash hider.
  m.box(upper, 0, .045, -.29, .05, .05, .1, .008);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) m.box(dark, side * .0255, .05, -.262 - i * .024, .002, .012, .014);
  m.tube(steel, 0, .04, -.37, .011, .011, .07, Math.PI / 2);
  m.tube(phosphate, 0, .04, -.405, .015, .015, .045, Math.PI / 2);
  for (const side of [-1, 1]) m.box(dark, side * .0145, .04, -.412, .002, .006, .024);
  m.tube(dark, 0, .04, -.428, .0075, .0075, .003, Math.PI / 2);
  // Sloping lower housing between foregrip and magazine well, then the well itself.
  m.profile(housing, [[-.13, .034], [-.25, .034], [-.25, .016], [-.155, -.056], [-.13, -.056]], .05, 0, .004);
  m.box(housing, 0, .008, -.112, .046, .06, .056, .007);
  m.box(housing, 0, -.02, -.112, .05, .012, .062, .004);
  m.box(steel, -.026, -.004, -.088, .005, .012, .012, .002); // magazine release
  // Recessed seams along the chin slope.
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) m.box(phosphate, side * .0291, .005 - i * .02, -.215 + i * .027, .002, .006, .028, 0, .63);
  // Short rail and vertical foregrip under the shroud.
  m.box(phosphate, 0, .015, -.3, .03, .008, .08, .002);
  m.box(housing, 0, -.032, -.302, .03, .084, .034, .009, .1);
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.04 - i * .016, -.301 - i * .0016, .031, .004, .035);
  // Skeletal stock, unfolded: hinge block, top bar, angled strut and butt plate.
  m.box(phosphate, 0, .096, .06, .05, .05, .026, .006);
  m.box(phosphate, 0, .104, .14, .028, .026, .16, .004);
  m.box(phosphate, 0, .056, .14, .022, .018, .15, .003, -.3);
  m.box(phosphate, 0, .075, .222, .046, .11, .02, .005);
  m.box(rubber, 0, .075, .234, .05, .118, .012, .004);
  m.box(0x6f766c, 0, .129, -.1, .05, .003, .28, .001); // worn upper edge

  // Folding iron sights: rear aperture (optic socket) and front post on the rail.
  const optic = new ModelParts();
  optic.box(phosphate, 0, .008, 0, .03, .016, .022, .002);
  optic.box(phosphate, 0, .024, 0, .026, .018, .006, .002);
  optic.box(dark, 0, .026, 0, .008, .008, .008);
  optic.box(phosphate, 0, .008, -.27, .022, .016, .018, .002);
  optic.box(steel, 0, .022, -.27, .004, .016, .004);

  // Straight 35-round magazine, socket-local: the top sits inside the well.
  const magazine = new ModelParts();
  magazine.box(phosphate, 0, -.075, 0, .032, .2, .044, .006);
  magazine.box(housing, 0, -.18, -.004, .038, .016, .052, .005);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) magazine.box(upper, side * .0162, -.04 - i * .045, .004, .001, .03, .024);

  const slide = new ModelParts();
  slide.box(steel, .026, .07, -.075, .006, .02, .05, .002);
  slide.box(phosphate, -.033, .11, -.15, .012, .012, .012, .002);
  slide.box(steel, -.042, .11, -.15, .014, .016, .022, .004);

  return { body: m.geometry(), optic: optic.geometry(), magazine: magazine.geometry(), slide: slide.geometry(), finish };
}

/** Sockets and reload choreography of the Viktor 55 (fractions of `reloadSeconds`, server timeline 0.14 / 0.6). */
export const VIKTOR55_HANDLING: WeaponProfile = {
  weaponId: 'viktor-55',
  action: 'slide',
  sockets: {
    Muzzle: [0, .04, -.43], EjectionPort: [.03, .07, -.075], SupportHand: [-.014, -.03, -.302], Barrel: [0, .04, -.34],
    Optic: [0, .145, .02], Underbarrel: [0, .011, -.3], Magazine: [0, -.026, -.112], Stock: [0, .096, .06],
  },
  cycle: { travel: .018, seconds: .04 },
  // Fast swap: bolt locks back as the empty magazine leaves and drops forward right after the new one seats.
  lock: { from: .1, until: .66, travel: .03 },
  magazine: { drop: [-.06, -.24, .04], roll: -.16, hand: [-.024, -.18, .004] },
};

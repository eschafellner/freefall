import type { ModelParts } from '../../../ModelParts.ts';
import { BODY } from '../OperatorSkeleton.ts';
import type { Side } from '../OperatorSkeleton.ts';
import type { PieceKit } from '../Wardrobe.ts';
import { armRings, armWeights, band, legRings, legWeights, loft, neckRings, neckWeights, torsoRings, torsoWeights } from '../BodyLoft.ts';
import type { Ring } from '../BodyLoft.ts';

/** Shared building blocks for wardrobe items: suit lofts, pouches, gloves, boots. */

/** Polymer, steel or glass: lower roughness than fabric while drawing. */
export function hard(m: ModelParts, draw: () => void, gloss = .62): void {
  const before = m.gloss;
  m.gloss = gloss;
  draw();
  m.gloss = before;
}

export function lit(m: ModelParts, glow: number, draw: () => void): void {
  const before = m.glow;
  m.glow = glow;
  draw();
  m.glow = before;
}

/** Pouch with a slightly wider flap and a fastener. */
export function pouch(m: ModelParts, color: number, fastener: number, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0, roll = 0): void {
  m.box(color, x, y, z, w, h, d, Math.min(w, h, d) * .22, pitch, roll);
  m.box(color, x, y + h * .36, z - Math.sign(z || -1) * d * .04, w * 1.06, h * .3, d * 1.05, Math.min(w, d) * .18, pitch, roll);
  hard(m, () => m.box(fastener, x, y + h * .22, z + Math.sign(z || -1) * d * .53, w * .22, h * .1, .006, .002, pitch, roll), .5);
}

export interface SuitStyle {
  fabric: number;
  /** Quilted panels on upper arms and thighs. */
  panel?: number;
  /** Sleeves and trousers when they differ from the torso. */
  sleeve?: number;
  legs?: number;
  dark: number;
  /** Extra thickness of padded suits in metres. */
  bulk?: number;
  /** Reflective or coloured bands (convict overall). */
  bands?: number;
  /** Knee and elbow padding sewn into the suit. */
  padding?: number;
}

const mirror = (rings: Ring[], x: number) => rings.map((ring) => ({ ...ring, x }));

/** Skinned base suit: torso, neck, arms and legs with quilted panels and padded knees and elbows. */
export function suit(kit: PieceKit, style: SuitStyle): void {
  const bulk = style.bulk ?? 0;
  const torso = torsoRings(bulk);
  const panel = style.panel ?? style.fabric;
  kit.skin(torsoWeights, (m) => {
    m.custom(loft(torso, 22, { bottom: .028 }), style.fabric, false);
    // Waist seam and side panels.
    m.custom(loft(band(torso, 1.07, 1.095, .003, 1), 22), style.dark, false);
    if (style.bands) m.custom(loft(band(torso, 1.12, 1.15, .004, 1), 22), style.bands, false);
  });
  kit.skin(neckWeights, (m) => m.custom(loft(neckRings(), 14, { top: .02 }), style.dark, false));
  for (const side of [-1, 1] as const) {
    const arm = mirror(armRings(bulk), side * BODY.shoulderWidth);
    const leg = mirror(legRings(bulk), side * BODY.hipWidth);
    kit.skin(armWeights(side), (m) => {
      m.custom(loft(arm, 14, { top: .035, bottom: .012 }), style.sleeve ?? style.fabric, false);
      m.custom(loft(band(arm, 1.095, 1.14, .006, 2), 14), style.padding ?? style.dark, false);
      for (const y of [1.33, 1.25]) m.custom(loft(band(arm, y - .03, y, .004, 2), 14), panel, false);
      m.custom(loft(band(arm, .9, .93, .003, 1), 14), style.dark, false);
      if (style.bands) m.custom(loft(band(arm, 1.2, 1.225, .004, 1), 14), style.bands, false);
    });
    kit.skin(legWeights(side), (m) => {
      m.custom(loft(leg, 16, { top: .03, bottom: .012 }), style.legs ?? style.fabric, false);
      m.custom(loft(band(leg, .465, .54, .008, 2), 16), style.padding ?? style.dark, false);
      for (const y of [.86, .78, .7]) m.custom(loft(band(leg, y - .045, y, .005, 2), 16), panel, false);
      m.custom(loft(band(leg, .2, .23, .003, 1), 16), style.dark, false);
      if (style.bands) m.custom(loft(band(leg, .63, .66, .006, 1), 16), style.bands, false);
    });
  }
}

/** Waist belt as a skinned band around the pelvis. */
export function belt(kit: PieceKit, color: number, from = .985, to = 1.035, grow = .012): void {
  kit.skin(torsoWeights, (m) => m.custom(loft(band(torsoRings(), from, to, grow, 2, 3), 22), color, false), 'cloth');
}

/** Ring of webbing around the torso (cummerbund, harness straps). */
export function torsoBand(kit: PieceKit, color: number, from: number, to: number, grow: number, channel: 'cloth' | 'plate' = 'cloth', bulk = 0): void {
  kit.skin(torsoWeights, (m) => m.custom(loft(band(torsoRings(bulk), from, to, grow, 3, 3), 22), color, false), channel);
}

export interface GloveStyle {
  color: number;
  palm?: number;
  knuckle?: number;
  cuff?: number;
  /** Gauntlet length up the forearm. */
  gauntlet?: number;
}

/**
 * Gloved fist closed around a bar along the hand's Z axis (weapon grip, handguard). Bone-local to the hand; the
 * grip axis runs through `GRIP_POINT`.
 */
export function glove(m: ModelParts, side: Side, style: GloveStyle): void {
  const s = side;
  const palm = style.palm ?? style.color;
  m.tube(style.cuff ?? style.color, 0, -.004 + (style.gauntlet ?? 0) / 2, 0, .042, .038, .036 + (style.gauntlet ?? 0));
  // Back of the hand and palm.
  m.box(style.color, s * .004, -.052, 0, .032, .078, .088, .012);
  m.box(palm, -s * .012, -.05, 0, .012, .07, .082, .005);
  // Fingers wrapped around the grip: proximal row down the outside, distal row back up the inside.
  m.box(style.color, s * .002, -.103, .0, .03, .032, .084, .012, 0, s * -.2);
  m.box(palm, -s * .033, -.094, 0, .022, .036, .08, .009, 0, s * .25);
  for (const z of [-.03, -.01, .01, .03]) m.box(style.color, -s * .02, -.116, z, .028, .012, .018, .005, 0, s * .1);
  // Thumb over the front of the grip.
  m.capsule(style.color, -s * .012, -.055, -.05, .012, .055, -.6, s * .55);
  if (style.knuckle !== undefined) hard(m, () => {
    m.box(style.knuckle!, s * .021, -.083, 0, .01, .03, .078, .004);
    m.box(style.knuckle!, s * .02, -.04, 0, .008, .04, .06, .004);
  }, .55);
}

/** Point the fist closes around, in hand-bone space. */
export const GRIP_POINT = (side: Side) => [-side * .022, -.088, 0] as const;

export interface BootStyle {
  color: number;
  sole: number;
  cap?: number;
  trim?: number;
  shaft?: number;
  /** Heavier boots are wider and taller. */
  scale?: number;
}

/** Shoe on the foot bone (ankle origin, sole 8.5 cm below). */
export function boot(m: ModelParts, style: BootStyle): void {
  const k = style.scale ?? 1;
  const h = BODY.ankle;
  m.tube(style.shaft ?? style.color, 0, .045 * k, .004, .052 * k, .056 * k, .13 * k, 0, 0, 14);
  m.box(style.color, 0, -h + .045, -.02, .108 * k, .07, .2, .03);
  hard(m, () => {
    m.box(style.cap ?? style.color, 0, -h + .05, .058, .1 * k, .075, .045, .02);
    m.box(style.sole, 0, -h + .012, -.026, .118 * k, .024, .222, .008);
  }, .7);
  if (style.trim !== undefined) for (let i = 0; i < 3; i++) m.box(style.trim, 0, -.004 - i * .018, -.05 + i * .006, .07 * k, .008, .012, .002, -.5);
}

/** Toe cap on the toe bone (ball of the foot origin). */
export function toeCap(m: ModelParts, style: BootStyle): void {
  const k = style.scale ?? 1;
  const ground = -BODY.ankle - (-.057);
  hard(m, () => {
    m.oval(style.cap ?? style.color, 0, ground + .036, -.036, .106 * k, .062, .1);
    m.box(style.sole, 0, ground + .011, -.03, .114 * k, .022, .082, .008);
  }, .7);
}

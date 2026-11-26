import { OperatorWardrobe } from './Wardrobe.ts';
import type { OperatorLook, WardrobeItem } from './Wardrobe.ts';
import { FR7_ARMOR, FR7_HELMET, RADIO_PACK } from './kit/Standard.ts';
import { SR4_ARMOR, SR4_HELMET, SUPPLY_PACK } from './kit/Scout.ts';
import { BW9_ARMOR, BW9_HELMET } from './kit/Heavy.ts';
import { CONVICT_ARMOR, CONVICT_DUFFEL, CONVICT_HOOD } from './kit/Convict.ts';

/**
 * Every wardrobe item the client can draw. Operator items (`operator: true`) are what a future armoury offers; the
 * convict items dress the escorted prisoners.
 */
export const WARDROBE: readonly WardrobeItem[] = [
  FR7_ARMOR, SR4_ARMOR, BW9_ARMOR,
  FR7_HELMET, SR4_HELMET, BW9_HELMET,
  RADIO_PACK, SUPPLY_PACK,
  CONVICT_ARMOR, CONVICT_HOOD, CONVICT_DUFFEL,
];

/** Standard issue until the armoury assigns looks per operator. */
export const DEFAULT_LOOK: OperatorLook = { armor: 'fr7', helmet: 'fr7-helm', pack: 'funk' };
export const CONVICT_LOOK: OperatorLook = { armor: 'gewahrsam', helmet: 'gewahrsam-haube', pack: 'seesack' };
/** Example sets: light, medium, heavy. */
export const LOOK_PRESETS: Readonly<Record<'leicht' | 'mittel' | 'schwer', OperatorLook>> = {
  leicht: { armor: 'sr4', helmet: 'sr4-haube', pack: 'funk' },
  mittel: DEFAULT_LOOK,
  schwer: { armor: 'bw9', helmet: 'bw9-helm', pack: 'versorgung' },
};

export function createOperatorWardrobe(): OperatorWardrobe { return new OperatorWardrobe(WARDROBE); }

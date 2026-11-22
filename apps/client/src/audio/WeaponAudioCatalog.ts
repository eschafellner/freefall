import type { WeaponSlot } from '@freefall/shared';

/** Sample routing and mix values are client presentation. Gameplay still resolves weapon slots on the server. */
interface WeaponRecordings {
  near: readonly [string, string];
  distant: string;
  remove: string;
  insert: string;
  finish?: string;
  casing?: string;
  level: number;
}

export const WEAPON_RECORDINGS: Readonly<Record<WeaponSlot, WeaponRecordings>> = {
  primary: {
    near: ['kestrel-shot-1', 'kestrel-shot-2'], distant: 'kestrel-shot-distant',
    remove: 'kestrel-mag-out', insert: 'kestrel-mag-in', finish: 'kestrel-reload-finish',
    casing: 'weapon-casing-hard', level: .91,
  },
  secondary: {
    near: ['p01-shot-1', 'p01-shot-2'], distant: 'p01-shot-distant',
    remove: 'p01-mag-out', insert: 'p01-mag-in-slide', level: .84,
  },
};

export const WEAPON_SWITCH_ASSET = 'weapon-switch-foley';
export const WEAPON_ASSET_IDS = [WEAPON_SWITCH_ASSET, ...Object.values(WEAPON_RECORDINGS).flatMap(
  ({ near, distant, remove, insert, finish, casing }) =>
    [...near, distant, remove, insert, ...[finish, casing].filter((id): id is string => id !== undefined)],
)];

export const PLANET_WEAPON_MIX: Readonly<Partial<Record<string, { reflections: number; distantCutoff: number }>>> = {
  'green-plains': { reflections: .64, distantCutoff: 1800 },
  desert: { reflections: .83, distantCutoff: 2000 },
  ice: { reflections: .94, distantCutoff: 2400 },
  forest: { reflections: .43, distantCutoff: 1350 },
};

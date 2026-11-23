/** Sample routing and mix values are client presentation. Gameplay still resolves weapons on the server. */
export type WeaponSound = 'rifle' | 'pistol' | 'shotgun';

interface WeaponRecordings {
  near: readonly [string, string];
  distant: string;
  remove: string;
  insert: string;
  finish?: string;
  casing?: string;
  level: number;
  /** Playback rate of the shot layers (below 1: heavier, longer report). */
  pitch?: number;
  /** Pump-action weapon: a synthesized slide rack follows every shot. */
  pump?: boolean;
}

/** Keyed by `weapons.json › sounds.fire`. */
export const WEAPON_RECORDINGS: Readonly<Record<WeaponSound, WeaponRecordings>> = {
  rifle: {
    near: ['kestrel-shot-1', 'kestrel-shot-2'], distant: 'kestrel-shot-distant',
    remove: 'kestrel-mag-out', insert: 'kestrel-mag-in', finish: 'kestrel-reload-finish',
    casing: 'weapon-casing-hard', level: .91,
  },
  pistol: {
    near: ['p01-shot-1', 'p01-shot-2'], distant: 'p01-shot-distant',
    remove: 'p01-mag-out', insert: 'p01-mag-in-slide', level: .84,
  },
  // VX-13 Cerberus: no own recordings yet. The Kestrel report slowed down reads as a 13-gauge blast; one shell click
  // per inserted round and a synthesized pump after each shot.
  shotgun: {
    near: ['kestrel-shot-1', 'kestrel-shot-2'], distant: 'kestrel-shot-distant',
    remove: 'p01-mag-out', insert: 'p01-mag-in-slide', finish: 'kestrel-reload-finish',
    level: 1, pitch: .7, pump: true,
  },
};

export const WEAPON_SWITCH_ASSET = 'weapon-switch-foley';
export const WEAPON_ASSET_IDS = [...new Set([WEAPON_SWITCH_ASSET, ...Object.values(WEAPON_RECORDINGS).flatMap(
  ({ near, distant, remove, insert, finish, casing }) =>
    [...near, distant, remove, insert, ...[finish, casing].filter((id): id is string => id !== undefined)],
)])];

export const PLANET_WEAPON_MIX: Readonly<Partial<Record<string, { reflections: number; distantCutoff: number }>>> = {
  'green-plains': { reflections: .64, distantCutoff: 1800 },
  desert: { reflections: .83, distantCutoff: 2000 },
  ice: { reflections: .94, distantCutoff: 2400 },
  forest: { reflections: .43, distantCutoff: 1350 },
};

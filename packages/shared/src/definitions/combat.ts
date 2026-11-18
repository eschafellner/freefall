export interface WeaponDefinition {
  id: string;
  name: string;
  category: 'assault-rifle' | 'pistol';
  roundsPerSecond: number;
  damage: number;
  range: number;
  magazineSize: number;
  reloadSeconds: number;
  visualAssetId: string;
}

export const TEST_RIFLE = Object.freeze({
  id: 'kestrel-ar-01',
  name: 'Kestrel AR-01',
  category: 'assault-rifle',
  roundsPerSecond: 10,
  damage: 24,
  range: 72,
  magazineSize: 30,
  reloadSeconds: 2.1,
  visualAssetId: 'weapon.kestrel-ar-01',
} as const satisfies WeaponDefinition);

export const SERVICE_PISTOL = Object.freeze({
  id: 'p-01', name: 'P-01 Dienstpistole', category: 'pistol', roundsPerSecond: 4,
  damage: 18, range: 44, magazineSize: 12, reloadSeconds: 1.45, visualAssetId: 'weapon.p-01',
} as const satisfies WeaponDefinition);

export const WEAPONS = { primary: TEST_RIFLE, secondary: SERVICE_PISTOL } as const;
export type WeaponSlot = keyof typeof WEAPONS;
export const SIDEARM_RESERVE = 48;
export const SWITCH_SECONDS = .48;
export const FRAG = { id: 'equipment.frag_grenade', capacity: 2, throwSeconds: .52, releaseSeconds: .22,
  fuseSeconds: 1.65, radius: 7, damage: 110, nestMultiplier: 1.45 } as const;
export const STIM = { id: 'equipment.medical_stim', capacity: 5, seconds: 1.2, fraction: .4 } as const;

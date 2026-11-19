/**
 * Weapon and equipment aliases. All values live in the balance registry (`balance/data/weapons.json` and
 * `balance/data/equipment.json`). These exports keep existing imports working and must not hold own values.
 */
import { BALANCE, BASE_LOADOUT } from '../balance/defaults.ts';
import type { WeaponSlot } from '../balance/definitions.ts';

export type { WeaponDefinition, WeaponSlot } from '../balance/definitions.ts';

const loadout = BALANCE.loadout(BALANCE.operator.loadoutId);

export const TEST_RIFLE = BALANCE.weapon(loadout.primaryWeaponId);
export const SERVICE_PISTOL = BALANCE.weapon(loadout.secondaryWeaponId);
export const WEAPONS: Readonly<Record<WeaponSlot, typeof TEST_RIFLE>> = Object.freeze({ primary: TEST_RIFLE, secondary: SERVICE_PISTOL });
export const SWITCH_SECONDS = loadout.weaponSwitchSeconds;
export const FRAG = BALANCE.grenade(loadout.grenadeId);
export const STIM = BALANCE.medical(loadout.medicalId);
export const MELEE = BALANCE.melee(loadout.meleeId);
export const COMBAT = BALANCE.combat;

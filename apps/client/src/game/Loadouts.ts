/**
 * Client view of operator loadouts. The server owns the effective loadout; the client resolves the same shared data
 * for its own prediction (recoil, fire rate) and reads remote weapons from `PlayerState.weapons` for presentation.
 */
import { BALANCE, BASE_LOADOUT, STANDARD_LOADOUT, reserveInRounds, resolveSelection, resolveWeapon, validateLoadoutSelection } from '@freefall/shared';
import type { EffectiveLoadout, EffectiveWeapon, LoadoutSelection, PlayerState, WeaponSlot } from '@freefall/shared';

const weapons = new Map<string, EffectiveWeapon>();

/** Effective weapon with its default ammunition. Unknown IDs (older server) fall back to the standard weapon. */
export function weaponById(id: string | undefined, slot: WeaponSlot): EffectiveWeapon {
  if (!id || !BALANCE.weapons.has(id)) return BASE_LOADOUT.weapons[slot];
  let weapon = weapons.get(id);
  if (!weapon) weapons.set(id, weapon = resolveWeapon(BALANCE, id));
  return weapon;
}

export function playerWeapon(player: Pick<PlayerState, 'weapons'> | undefined, slot: WeaponSlot): EffectiveWeapon {
  return weaponById(player?.weapons?.[slot], slot);
}

/** Reserve in its unit: whole magazines or loose rounds (single feed, break action). */
export function reserveLabel(weapon: EffectiveWeapon, reserve: number): string {
  return reserveInRounds(weapon.feed) ? `${reserve} PAT` : `${reserve} MAG`;
}

export function resolveOwnLoadout(selection: LoadoutSelection): EffectiveLoadout {
  try {
    return resolveSelection(BALANCE, selection);
  } catch {
    return BASE_LOADOUT;
  }
}

const STORAGE_KEY = 'freefall.loadout.v1';

/** Last loadout accepted by a server, restored when joining the next room. */
export function storedSelection(): LoadoutSelection | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const checked = validateLoadoutSelection(BALANCE, JSON.parse(raw));
    return 'selection' in checked ? checked.selection : undefined;
  } catch {
    return undefined;
  }
}

export function storeSelection(selection: LoadoutSelection): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); } catch { /* private mode: keep it for this session */ }
}

export const sameSelection = (a: LoadoutSelection, b: LoadoutSelection = STANDARD_LOADOUT): boolean =>
  (Object.keys(a) as (keyof LoadoutSelection)[]).every((key) => a[key] === b[key]);

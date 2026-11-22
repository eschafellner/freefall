import type { PlayerState } from '@freefall/shared';
import type { InputAction } from '../input/Bindings.ts';

/**
 * Local "click" on an empty trigger. Presentation only: the server never sees a dry shot. One click per trigger pull,
 * also when the magazine runs dry while the trigger is held, once the next shot would have been due.
 */
export class DryTrigger {
  private clicked = false;

  /** `pull`: fire held and firing currently allowed. `due`: the weapon's fire interval has elapsed. */
  update(pull: boolean, empty: boolean, due: boolean): boolean {
    if (!pull || !empty) {
      this.clicked = false;
      return false;
    }
    if (this.clicked || !due) return false;
    this.clicked = true;
    return true;
  }
}

/** Magazine empty (after unconfirmed predicted shots) and no reserve, so the server will not auto-reload. */
export function weaponEmpty(player: PlayerState, ammo: number): boolean {
  const gear = player.equipment;
  return !!gear && ammo <= 0 && gear.magazines[gear.slot] === 0;
}

export interface EmptyWeaponHint {
  text: string;
  /** Key to show before the text, if switching weapons helps. */
  key?: string;
}

/** HUD line for a completely empty active weapon, or undefined while it still has rounds or reserve. */
export function emptyWeaponHint(player: PlayerState, label: (action: InputAction) => string, resupply: boolean):
  EmptyWeaponHint | undefined {
  const gear = player.equipment;
  if (!gear || !weaponEmpty(player, player.ammo ?? 0)) return;
  const other = gear.slot === 'primary' ? 'secondary' : 'primary';
  if (gear.inactiveAmmo > 0 || gear.magazines[other] > 0) {
    return { key: label(other === 'primary' ? 'SWITCH_PRIMARY' : 'SWITCH_SECONDARY'), text: 'Wechseln' };
  }
  return { text: resupply ? 'Nachschub am Albatross' : 'Keine Munition übrig' };
}

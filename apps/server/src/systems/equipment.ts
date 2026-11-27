/**
 * Equipment action machine. Action priority (see docs/MELEE_SYSTEM.md):
 *   1. Death cancels every action and interrupts a reload.
 *   2. One action at a time: weapon switch, grenade, stim, melee and resupply exclude each other. A command that
 *      arrives while an action runs is dropped, except where it interrupts the running action (3 and 4).
 *   3. A stim is interrupted by fire, sprint, a reload request, a weapon switch or melee (`interruptedBy`).
 *   4. Resupply is interrupted by fire, sprint, a reload request, any equipment command, leaving the range or the
 *      container becoming unavailable. The transaction happens only on the completion tick.
 *   5. Weapon switch, grenade and melee interrupt a running reload (no ammunition change before the insertion
 *      tick). Stim and resupply cannot start during a reload. Sprint does not interrupt a reload.
 *   6. Firing is blocked while any action or reload runs (`fireWeapon`).
 */
import { BALANCE, allowsPostureAction, refillStamina } from '@freefall/shared';
import type { EquipmentAction } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';
import { cancelEquipment, reloading } from '../simulation/Player.ts';

export interface ResupplyHooks {
  /** Reason why the operator cannot start or continue using the container, or undefined. */
  blocker(player: SimPlayer, containerId: string): string | undefined;
  readonly interactionTicks: number;
  /** Applies the transaction atomically. Returns false if nothing was granted (no charge used). */
  complete(player: SimPlayer, containerId: string, tick: number): boolean;
}

export interface EquipmentHooks {
  launch(player: SimPlayer): void;
  /** Melee impact frame. */
  strike(player: SimPlayer): void;
  interruptReload(player: SimPlayer): void;
  switched(player: SimPlayer): void;
  resupply?: ResupplyHooks;
}

export function updateEquipment(p: SimPlayer, tick: number, hooks: EquipmentHooks, balance = BALANCE.movement): void {
  const allowed = (action: EquipmentAction) =>
    allowsPostureAction(p.posture, action === 'primary' || action === 'secondary' ? 'switch' : action, balance);
  const sprint = p.input.sprint && allowsPostureAction(p.posture, 'sprint', balance);
  const gear = p.equipment;
  const { grenade, medical, melee, maxHealth } = p.loadout;
  const interrupt = medical.interruptedBy;
  const command = p.pendingEquipment && allowed(p.pendingEquipment) ? p.pendingEquipment : undefined;
  const supply = p.pendingResupply;
  p.pendingEquipment = undefined;
  p.pendingResupply = undefined;
  if (p.hp <= 0) {
    cancelEquipment(p, tick);
    return;
  }
  if (gear.action && !allowed(gear.action)) cancelEquipment(p, tick);
  if (gear.action) {
    if (gear.action === 'stim' && p.activeInput && ((interrupt.fire && p.input.fire) || (interrupt.sprint && sprint) ||
      (interrupt.reload && p.reloadRequested) || (interrupt.weaponSwitch && (command === 'primary' || command === 'secondary')) ||
      (interrupt.melee && command === 'melee'))) {
      cancelEquipment(p, tick);
      return;
    }
    if (gear.action === 'resupply' && (!p.activeInput || p.input.fire || sprint || p.reloadRequested || command ||
        !hooks.resupply || !gear.supplyId || hooks.resupply.blocker(p, gear.supplyId))) {
      cancelEquipment(p, tick);
      return;
    }
    if (gear.action === 'grenade' && tick === gear.started + grenade.releaseTicks) {
      gear.grenades--;
      hooks.launch(p);
    }
    if (gear.action === 'melee' && tick === gear.started + melee.windupTicks) hooks.strike(p);
    if (tick < gear.until) return;
    if (gear.action === 'stim') {
      const heal = Math.min(maxHealth - p.hp, medical.healAmount);
      if (heal <= 0 || !gear.stims) {
        cancelEquipment(p, tick);
        return;
      }
      p.hp += heal;
      gear.stims--;
      // The stim also clears exhaustion: a full stamina pool.
      refillStamina(p.staminaState, p.loadout.mobility.stamina);
      gear.stimResult = 'completed';
      gear.stimResultAt = tick;
    } else if (gear.action === 'resupply') {
      hooks.resupply!.complete(p, gear.supplyId!, tick);
      delete gear.supplyId;
    } else if (gear.action === 'primary' || gear.action === 'secondary') {
      const nextAmmo = gear.inactiveAmmo;
      gear.inactiveAmmo = p.ammo;
      p.ammo = nextAmmo;
      gear.slot = gear.action;
      hooks.switched(p);
    }
    delete gear.action;
    gear.until = 0;
    return;
  }
  if (!p.activeInput) return;
  if (!command) {
    if (!supply || !allowed('resupply') || !hooks.resupply || reloading(p) || p.input.fire || hooks.resupply.blocker(p, supply)) return;
    gear.action = 'resupply';
    gear.supplyId = supply;
    gear.started = tick;
    gear.until = tick + hooks.resupply.interactionTicks;
    return;
  }
  let duration: number;
  if (command === 'primary' || command === 'secondary') {
    if (command === gear.slot) return;
    hooks.interruptReload(p);
    duration = p.loadout.switchTicks;
  } else if (command === 'grenade') {
    if (!gear.grenades) return;
    hooks.interruptReload(p);
    duration = grenade.throwTicks;
  } else if (command === 'melee') {
    if (tick < gear.meleeReadyAt) return;
    hooks.interruptReload(p);
    gear.meleeReadyAt = tick + melee.cooldownTicks;
    duration = melee.actionTicks;
  } else {
    if (!gear.stims || p.hp >= maxHealth || reloading(p) || p.reloadRequested || sprint || p.input.fire) return;
    duration = medical.applicationTicks;
  }
  gear.action = command;
  gear.started = tick;
  gear.until = tick + duration;
}

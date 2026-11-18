import { FRAG, NET, PLAYER, STIM, SWITCH_SECONDS } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';
import { cancelEquipment } from '../simulation/Player.ts';

export function updateEquipment(p: SimPlayer, tick: number, launch: (player: SimPlayer) => void): void {
  const gear = p.equipment;
  const command = p.pendingEquipment;
  p.pendingEquipment = undefined;
  if (p.hp <= 0) {
    cancelEquipment(p, tick);
    return;
  }
  if (gear.action) {
    if (gear.action === 'stim' && p.activeInput && (p.input.fire || p.input.sprint || p.reloadRequested ||
      command === 'primary' || command === 'secondary')) {
      cancelEquipment(p, tick);
      return;
    }
    if (gear.action === 'grenade' && tick === gear.started + Math.ceil(FRAG.releaseSeconds * NET.tickHz)) {
      gear.grenades--;
      launch(p);
    }
    if (tick < gear.until) return;
    if (gear.action === 'stim') {
      const heal = Math.min(PLAYER.health - p.hp, PLAYER.health * STIM.fraction);
      if (heal <= 0 || !gear.stims) {
        cancelEquipment(p, tick);
        return;
      }
      p.hp += heal;
      gear.stims--;
      gear.stimResult = 'completed';
      gear.stimResultAt = tick;
    } else if (gear.action === 'primary' || gear.action === 'secondary') {
      const nextAmmo = gear.inactiveAmmo;
      gear.inactiveAmmo = p.ammo;
      p.ammo = nextAmmo;
      gear.slot = gear.action;
    }
    delete gear.action;
    gear.until = 0;
    return;
  }
  if (!command || !p.activeInput) return;
  let seconds: number;
  if (command === 'primary' || command === 'secondary') {
    if (command === gear.slot) return;
    p.reloadUntil = 0;
    seconds = SWITCH_SECONDS;
  } else if (command === 'grenade') {
    if (!gear.grenades || p.reloadUntil) return;
    seconds = FRAG.throwSeconds;
  } else {
    if (!gear.stims || p.hp >= PLAYER.health || p.reloadUntil || p.reloadRequested || p.input.sprint || p.input.fire) return;
    seconds = STIM.seconds;
  }
  gear.action = command;
  gear.started = tick;
  gear.until = tick + Math.ceil(seconds * NET.tickHz);
}

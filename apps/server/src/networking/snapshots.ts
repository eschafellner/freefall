import { BASE_LOADOUT, ENEMY_BYTES, canSprint, staminaSnapshot, HORDE_ATTACK_BYTES, HORDE_COMBAT_HEADER, HORDE_HEADER, NET, hordeAttackFlag, PLAYER_MOTION, POSITION_SCALE,
  allowsPostureAction, copyPosture } from '@freefall/shared';
import type { EffectiveLoadout, PlayersSnapshot } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { EnemyCombat } from '../ecs/EnemyCombat.ts';
import type { Battlefield } from '../simulation/Battlefield.ts';

const STANDARD_LOOK = BASE_LOADOUT.look;
const standardLook = (look: EffectiveLoadout['look']) =>
  look.armor === STANDARD_LOOK.armor && look.helmet === STANDARD_LOOK.helmet && look.pack === STANDARD_LOOK.pack;

export function encodeHorde(h: HordeManager, tick: number, positionScale: number = POSITION_SCALE, combat?: EnemyCombat): Uint8Array {
  const recordsEnd = HORDE_HEADER + h.count * ENEMY_BYTES;
  const capacity = combat?.snapshotCapacity ?? 0;
  const bytes = new Uint8Array(recordsEnd + (capacity ? HORDE_COMBAT_HEADER + capacity * HORDE_ATTACK_BYTES : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, tick, true);
  view.setUint16(4, h.count, true);
  let tail = recordsEnd + HORDE_COMBAT_HEADER;
  for (let index = 0, offset = HORDE_HEADER; index < h.count; index++, offset += ENEMY_BYTES) {
    const i = h.active[index];
    view.setUint32(offset, h.id[i], true);
    view.setInt16(offset + 4, Math.round(h.x[i] * positionScale), true);
    view.setInt16(offset + 6, Math.round(h.z[i] * positionScale), true);
    view.setUint8(offset + 8, Math.round(h.yaw[i] * (256 / (2 * Math.PI))) & 255);
    view.setUint8(offset + 9, h.type[i]);
    const start = capacity ? combat!.snapshotStart(h, i, tick) : undefined;
    if (start === undefined) continue;
    view.setUint16(tail, index, true);
    view.setUint16(tail + 2, (tick - start) | hordeAttackFlag(combat!.snapshotKind(h, i)), true);
    tail += HORDE_ATTACK_BYTES;
  }
  if (tail === recordsEnd + HORDE_COMBAT_HEADER || !combat) return capacity ? bytes.subarray(0, recordsEnd) : bytes;
  view.setUint16(recordsEnd, combat.timing.windupTicks, true);
  view.setUint16(recordsEnd + 2, combat.timing.activeTicks, true);
  view.setUint16(recordsEnd + 4, combat.timing.recoveryTicks, true);
  return tail === bytes.byteLength ? bytes : bytes.subarray(0, tail);
}

export function playerSnapshot(arena: Battlefield, host: string): PlayersSnapshot {
  const players: PlayersSnapshot['players'] = [];
  for (const p of arena.players) {
    if (!p) continue;
    const { id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, ammo, reloadUntil, reload } = p;
    const stamina = staminaSnapshot(p.staminaState, p.loadout.mobility.stamina);
    const stance = p.posture;
    const balance = arena.movementBalance;
    const motion = p.activeInput && hp > 0
      ? (p.input.aim && allowsPostureAction(stance, 'aim', balance) ? PLAYER_MOTION.aim : 0) |
        (p.input.sprint && allowsPostureAction(stance, 'sprint', balance) && canSprint(p.staminaState) ? PLAYER_MOTION.sprint : 0)
      : 0;
    // The reload state travels only while it matters (running, or interrupted within the last second).
    const recent = reload.phase !== 'READY' && (reload.phase !== 'RELOAD_INTERRUPTED' || arena.tick - reload.at < NET.tickHz);
    const sendPosture = stance.current !== 'STANDING' || stance.until > arena.tick || !!stance.landedDive ||
      (stance.started > 0 && arena.tick - stance.started < Math.ceil(NET.tickHz / NET.playerHz) + 1) ||
      (stance.lastDive !== undefined && arena.tick < stance.lastDive + Math.ceil(balance.diveCooldownSeconds * NET.tickHz)) ||
      stance.slideRunUp !== undefined ||
      (stance.slideCooldownUntil !== undefined && arena.tick < stance.slideCooldownUntil) ||
      (stance.standBlockedAt !== undefined && arena.tick - stance.standBlockedAt < NET.tickHz);
    players.push({ id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, motion, ammo, reloadUntil,
      weapons: { primary: p.loadout.weapons.primary.id, secondary: p.loadout.weapons.secondary.id },
      // Armour and pack only travel when they differ from the standard issue the clients show without them.
      ...(!standardLook(p.loadout.look) && { look: p.loadout.look }),
      ...(stamina && { stamina }),
      ...(p.loadout.maxHealth !== BASE_LOADOUT.maxHealth && { maxHp: p.loadout.maxHealth }),
      ...(p.y !== 0 && { y: p.y }),
      ...(sendPosture ? { posture: copyPosture(stance) } : stance.yaw !== yaw ? { bodyYaw: stance.yaw } : {}),
      ...(recent && { reload: { ...reload } }), equipment: { ...p.equipment, magazines: { ...p.equipment.magazines },
        ...(p.equipment.action === 'grenade' && { actionAt: p.equipment.started + p.loadout.grenade.releaseTicks }),
        ...(p.equipment.action === 'melee' && { actionAt: p.equipment.started + p.loadout.melee.windupTicks }) } });
  }
  const grenades = arena.grenades.snapshot(arena.tick);
  return { tick: arena.tick, host, players, ...(grenades && { grenades }) };
}

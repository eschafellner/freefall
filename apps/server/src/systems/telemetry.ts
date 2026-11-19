import type { CombatTelemetry, DamageSource, ResupplyGrant, WeaponSlot } from '@freefall/shared';

const slots = (): Record<WeaponSlot, number> => ({ primary: 0, secondary: 0 });
const grant = (): ResupplyGrant => ({ primaryMagazines: 0, secondaryMagazines: 0, grenades: 0, stims: 0 });

export const emptyTelemetry = (): CombatTelemetry => ({
  shots: slots(), hits: slots(), damage: slots(), magazinesUsed: slots(), roundsDiscarded: slots(),
  reloadsInterrupted: 0, grenadesThrown: 0, grenadeDamageEnemies: 0, grenadeDamageNests: 0, grenadeKills: 0,
  meleeAttacks: 0, meleeHits: 0, meleeKills: 0, staggers: 0,
  friendlyFireDamage: { bullet: 0, explosion: 0, melee: 0 } satisfies Record<DamageSource, number>,
  selfDamage: 0, convictFriendlyDamage: 0, resupplyUses: 0, refilled: grant(),
  blasts: 0, blastQueryMsTotal: 0, blastQueryMsMax: 0,
});

/** Plain counters, incremented inline. No allocation per tick, no per-player data. */
export class CombatStats {
  data: CombatTelemetry = emptyTelemetry();

  reset(): void { this.data = emptyTelemetry(); }

  /** Deep copy for snapshots and mission results. */
  snapshot(): CombatTelemetry {
    const round = (value: number) => Math.round(value * 100) / 100;
    const d = this.data;
    const map = <T extends Record<string, number>>(record: T): T =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key, round(value)])) as T;
    return {
      ...d, shots: { ...d.shots }, hits: { ...d.hits }, damage: map(d.damage), magazinesUsed: { ...d.magazinesUsed },
      roundsDiscarded: { ...d.roundsDiscarded }, friendlyFireDamage: map(d.friendlyFireDamage), refilled: { ...d.refilled },
      grenadeDamageEnemies: round(d.grenadeDamageEnemies), grenadeDamageNests: round(d.grenadeDamageNests),
      blastQueryMsTotal: round(d.blastQueryMsTotal), blastQueryMsMax: Math.round(d.blastQueryMsMax * 1000) / 1000,
    };
  }
}

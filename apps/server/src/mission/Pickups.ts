/**
 * Aufnehmbare Gegenstände an den Points of Interest: Proben, Artefakte, Einsatzmarken und Vorräte. Proben trägt der
 * Operator; fällt er, liegen sie als einzelne Proben an seiner Position. Der Trupp darf je Probenart höchstens
 * `limits` tragen. Einsatzmarken werden sofort für den ganzen Trupp gezählt.
 */
import { POI_LOOT, SAMPLE_IDS } from '@freefall/shared';
import type { PickupKind, PickupSnapshot, PositionXZ, SampleAmounts, SampleId, WorldDefinition } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';

export type PickupFeedback = `pickup-${PickupKind}` | 'pickup-full' | 'pickup-limit';

const isSample = (kind: PickupKind): kind is SampleId => (SAMPLE_IDS as readonly string[]).includes(kind);

export class PickupSystem {
  private readonly items = new Map<string, PickupSnapshot>();
  private readonly carried = new Map<string, Record<SampleId, number>>();
  private readonly world: WorldDefinition;
  readonly limits: Required<SampleAmounts>;
  marksFound = 0;
  /** Steigt bei jeder Änderung, damit der Raum einen neuen Zustand sendet. */
  revision = 0;
  private dropped = 0;

  constructor(world: WorldDefinition, pickups: readonly PickupSnapshot[], limits: Required<SampleAmounts>) {
    this.world = world;
    this.limits = limits;
    for (const pickup of pickups) this.items.set(pickup.id, { ...pickup });
  }

  get size(): number { return this.items.size; }

  /** Nächster Gegenstand in Reichweite. */
  nearest(position: PositionXZ): PickupSnapshot | undefined {
    let best: PickupSnapshot | undefined, range = POI_LOOT.range ** 2;
    for (const item of this.items.values()) {
      const distance = (item.x - position.x) ** 2 + (item.z - position.z) ** 2;
      if (distance <= range) { range = distance; best = item; }
    }
    return best;
  }

  /** Proben, die der ganze Trupp trägt. */
  teamCarried(): Required<SampleAmounts> {
    const total = { tissue: 0, rock: 0, artifact: 0 };
    for (const samples of this.carried.values()) for (const id of SAMPLE_IDS) total[id] += samples[id];
    return total;
  }

  carriedBy(operatorId: string): SampleAmounts {
    return { ...this.carried.get(operatorId) };
  }

  /** Probe direkt in den Rucksack (Debug, Tests). Achtet auf das Truppenlimit. */
  carry(operatorId: string, amounts: SampleAmounts): boolean {
    const team = this.teamCarried();
    const samples = this.carried.get(operatorId) ?? { tissue: 0, rock: 0, artifact: 0 };
    let changed = false;
    for (const id of SAMPLE_IDS) {
      const amount = Math.max(0, Math.min(Math.floor(amounts[id] ?? 0), this.limits[id] - team[id]));
      if (!amount) continue;
      samples[id] += amount;
      changed = true;
    }
    if (changed) { this.carried.set(operatorId, samples); this.revision++; }
    return changed;
  }

  /** Was eine Vorratskiste dem Operator jetzt geben würde (gekappt an jeder Tragekapazität). */
  grant(player: SimPlayer, kind: 'ammo' | 'stims' | 'grenades'): { primary: number; stims: number; grenades: number } {
    const gear = player.equipment;
    const primary = player.loadout.weapons.primary;
    if (kind === 'ammo') {
      // Einzelpatronen-Waffen (Flinten) erhalten den Gegenwert der Magazine in Patronen.
      const units = POI_LOOT.grant.primaryMagazines * (primary.feed.type === 'single' ? primary.magazineSize : 1);
      return { primary: Math.max(0, Math.min(units, primary.maxReserve - gear.magazines.primary)), stims: 0, grenades: 0 };
    }
    if (kind === 'stims') return { primary: 0, stims: Math.max(0, Math.min(POI_LOOT.grant.stims, player.loadout.medical.maxCharges - gear.stims)), grenades: 0 };
    return { primary: 0, stims: 0, grenades: Math.max(0, Math.min(POI_LOOT.grant.grenades, player.loadout.grenade.capacity - gear.grenades)) };
  }

  /** Nimmt den nächsten Gegenstand auf. Liefert die Rückmeldung oder `undefined`, wenn nichts in Reichweite ist. */
  take(player: SimPlayer): PickupFeedback | undefined {
    const item = this.nearest(player);
    if (!item) return undefined;
    const kind = item.kind;
    if (isSample(kind)) {
      if (this.teamCarried()[kind] >= this.limits[kind]) return 'pickup-limit';
      const samples = this.carried.get(player.id) ?? { tissue: 0, rock: 0, artifact: 0 };
      samples[kind]++;
      this.carried.set(player.id, samples);
    } else if (kind === 'mark') {
      this.marksFound++;
    } else {
      const granted = this.grant(player, kind);
      if (!granted.primary && !granted.stims && !granted.grenades) return 'pickup-full';
      player.equipment.magazines.primary += granted.primary;
      player.equipment.stims += granted.stims;
      // Überschüssige Granaten der Kiste gehen verloren.
      player.equipment.grenades += granted.grenades;
    }
    this.items.delete(item.id);
    this.revision++;
    return `pickup-${kind}`;
  }

  /** Ein gefallener Operator lässt seine Proben einzeln um seine Position fallen. */
  drop(operatorId: string, position: PositionXZ): number {
    const samples = this.carried.get(operatorId);
    if (!samples) return 0;
    this.carried.delete(operatorId);
    let count = 0;
    for (const id of SAMPLE_IDS) for (let k = 0; k < samples[id]; k++) {
      const n = this.dropped++;
      const angle = n * 2.399963, distance = .5 + (count % 6) * .25;
      let x = position.x + Math.cos(angle) * distance, z = position.z + Math.sin(angle) * distance;
      if (this.world.obstacles.some((o) => Math.abs(o.x - x) < o.halfX + .3 && Math.abs(o.z - z) < o.halfZ + .3)) ({ x, z } = position);
      this.items.set('drop/' + n, { id: 'drop/' + n, kind: id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
      count++;
    }
    if (count) this.revision++;
    return count;
  }

  /** Summe der Proben der extrahierten Operator, gekappt am Truppenlimit. */
  extracted(operatorIds: readonly string[]): SampleAmounts {
    const total: SampleAmounts = {};
    for (const operatorId of operatorIds) {
      const samples = this.carried.get(operatorId);
      if (samples) for (const id of SAMPLE_IDS) if (samples[id]) total[id] = (total[id] ?? 0) + samples[id];
    }
    for (const id of SAMPLE_IDS) if (total[id]) total[id] = Math.min(total[id]!, this.limits[id]);
    return total;
  }

  snapshot(): PickupSnapshot[] { return [...this.items.values()]; }

  carriedSnapshot(): Record<string, SampleAmounts> {
    return Object.fromEntries([...this.carried].map(([id, samples]) => [id, { ...samples }]));
  }
}

import type { StatModifier } from '../balance/resolver.ts';
import type { ResourceAmounts } from './resources.ts';

/**
 * Forschung (Carrier › Raum FORSCHUNG). Ein Forschungsgebiet ist eine Kette von Stufen: Jede Stufe setzt die vorige
 * voraus. Jede Stufe ist eine Freischaltung der Art `research` im Register (`unlocks.ts`); ihre ID steht dauerhaft in
 * der Account-Datenbank (nie umbenennen). Gekauft wird wie im Arsenal über `POST /account/unlocks`.
 *
 * Wirkungen sind Modifikatoren der Ebene `research` auf Operatorwerte und gelten für den Operator selbst in jedem Raum
 * (Carrier, Einsatz, Arena). Gastoperatoren ohne Account forschen nicht.
 */
export interface ResearchEffect {
  /** Zusätzliche Lebenspunkte. */
  readonly maxHealth?: number;
  /** Zusätzlicher Ausdauervorrat als Anteil des Grundwerts der Rüstung (0,1 = +10 %), additiv über alle Stufen. */
  readonly stamina?: number;
  /** Zusätzliche Hechtsprungweite als Anteil (0,35 = +35 %), additiv über alle Stufen. */
  readonly dive?: number;
}

export interface ResearchStage {
  /** Freischaltungs-ID (`research.*`), dauerhaft. */
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  /** Wirkung in einem Satz, wie sie im Terminal steht. */
  readonly effectText: string;
  readonly effect: ResearchEffect;
  readonly cost: ResourceAmounts;
}

export interface ResearchField {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  /** Stufen in Forschungsreihenfolge. */
  readonly stages: readonly ResearchStage[];
}

export const RESEARCH_FIELDS: readonly ResearchField[] = [
  {
    id: 'metabolism', displayName: 'Taktische Stoffwechselmodulation',
    description: 'Gezielte Eingriffe in Erbgut, Ausbildung und Versorgung machen die Operator robuster, ausdauernder und sprungkräftiger.',
    stages: [
      { id: 'research.genetik-1', displayName: 'Genetische Überlegenheit I',
        description: 'Durch Verbesserungen an den Genen verbessert sich die körperliche Robustheit unserer Operator, ohne deren Lebensfähigkeit einzuschränken.',
        effectText: 'Operator erhalten 30 zusätzliche Lebenspunkte.', effect: { maxHealth: 30 },
        cost: { tissue: 50, credits: 2_000 } },
      { id: 'research.training-1', displayName: 'Erweitertes Training I',
        description: 'Durch zusätzliches Training während der Grundausbildung sind unsere Operator leistungsfähiger.',
        effectText: 'Die Ausdauer erhöht sich um 10 %.', effect: { stamina: .1 },
        cost: { tissue: 60, rock: 10, credits: 3_000 } },
      { id: 'research.genetik-2', displayName: 'Genetische Überlegenheit II',
        description: 'Weitere genetische Anpassungen der Operator im Embryonalalter erhöhen die körperliche Robustheit unserer Operator weiter.',
        effectText: 'Operator erhalten 20 zusätzliche Lebenspunkte.', effect: { maxHealth: 20 },
        cost: { tissue: 70, rock: 25, credits: 4_000 } },
      { id: 'research.training-2', displayName: 'Erweitertes Training II',
        description: 'Durch Maximierung des Trainings während der Einsatzpausen sind unsere Operator leistungsfähiger.',
        effectText: 'Die Ausdauer erhöht sich um weitere 10 %.', effect: { stamina: .1 },
        cost: { tissue: 70, rock: 35, artifact: 5, credits: 5_000 } },
      { id: 'research.einsatzversorgung-1', displayName: 'Leistungssteigernde Einsatzversorgung I',
        description: 'Durch den Zusatz von Anabolin-17 in den Einsatzrationen erhöht sich die Sprungkraft der Operator erheblich.',
        effectText: 'Die Sprungreichweite (Hechtsprung) erhöht sich um 35 %.', effect: { dive: .35 },
        cost: { tissue: 70, rock: 45, artifact: 15, credits: 6_000 } },
    ],
  },
];

export const RESEARCH_STAGES: ReadonlyMap<string, ResearchStage & { readonly field: ResearchField; readonly index: number }> = new Map(
  RESEARCH_FIELDS.flatMap((field) => field.stages.map((stage, index) => [stage.id, { ...stage, field, index }] as const)));

/** Summe der Wirkungen aller abgeschlossenen Stufen. Unbekannte IDs werden ignoriert. */
export function researchBonus(completed: Iterable<string>): Required<ResearchEffect> {
  const total = { maxHealth: 0, stamina: 0, dive: 0 };
  for (const id of new Set(completed)) {
    const effect = RESEARCH_STAGES.get(id)?.effect;
    if (!effect) continue;
    total.maxHealth += effect.maxHealth ?? 0;
    total.stamina += effect.stamina ?? 0;
    total.dive += effect.dive ?? 0;
  }
  return total;
}

/**
 * Abgeschlossene Forschung als Modifikatoren der Ebene `research` für `resolveSelection`:
 * `operator.maxHealth` (+ Lebenspunkte), `operator.staminaFactor` und `operator.diveFactor` (Grundwert 1, + Anteil).
 */
export function researchModifiers(completed: Iterable<string>): StatModifier[] {
  const modifiers: StatModifier[] = [];
  for (const id of [...new Set(completed)].sort()) {
    const effect = RESEARCH_STAGES.get(id)?.effect;
    if (!effect) continue;
    const add = (stat: string, value: number | undefined) => {
      if (value) modifiers.push({ source: `research:${id}`, layer: 'research', stat, operation: 'add', value });
    };
    add('operator.maxHealth', effect.maxHealth);
    add('operator.staminaFactor', effect.stamina);
    add('operator.diveFactor', effect.dive);
  }
  return modifiers;
}

/** Nur die Forschungs-IDs aus einer Liste von Freischaltungen, sortiert (stabil für Vergleiche und Nachrichten). */
export function completedResearch(owned: Iterable<string>): string[] {
  return [...new Set(owned)].filter((id) => RESEARCH_STAGES.has(id)).sort();
}

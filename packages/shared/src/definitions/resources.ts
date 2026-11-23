/**
 * Ressourcen der Operator: Sektor-Kredits und Einsatzmarken aus Missionsabschlüssen, Proben und Artefakte aus
 * Einsätzen. Jede Ressource hat einen Startwert und eine Obergrenze. Was über der Obergrenze liegt, verfällt.
 *
 * IDs sind dauerhaft: Sie stehen im Ressourcenbuch der Account-Datenbank. Nie umbenennen.
 */
export type ResourceId = 'credits' | 'marks' | 'tissue' | 'rock' | 'artifact';
/** Ressourcen, die in Einsätzen gefunden und extrahiert werden. */
export type SampleId = 'tissue' | 'rock' | 'artifact';

export type ResourceAmounts = Partial<Record<ResourceId, number>>;
export type SampleAmounts = Partial<Record<SampleId, number>>;
export type ResourceBalance = Record<ResourceId, number>;

export interface ResourceDefinition {
  id: ResourceId;
  displayName: string;
  /** Kurzform für Preise und knappe Anzeigen, z. B. "SKR". */
  shortName: string;
  description: string;
  /** Guthaben eines neuen Accounts. */
  start: number;
  max: number;
}

export const RESOURCES: readonly ResourceDefinition[] = [
  { id: 'credits', displayName: 'Sektor-Kredits', shortName: 'SKR', start: 5_000, max: 50_000,
    description: 'Lohn für Missionsabschlüsse. Damit werden Waffen und Waffenaufsätze freigekauft.' },
  { id: 'marks', displayName: 'Einsatzmarken', shortName: 'Marken', start: 0, max: 250,
    description: 'Auszeichnung für Missionsabschlüsse. Damit werden neue Ausrüstungsgegenstände freigeschaltet.' },
  { id: 'tissue', displayName: 'Gewebeproben', shortName: 'Gewebe', start: 0, max: 300,
    description: 'Biologische Proben aus Einsätzen. Für Ausrüstung und Forschung.' },
  { id: 'rock', displayName: 'Gesteinsproben', shortName: 'Gestein', start: 0, max: 150,
    description: 'Geologische Proben aus Einsätzen. Für Ausrüstung und Forschung.' },
  { id: 'artifact', displayName: 'Artefakte', shortName: 'Artefakte', start: 0, max: 100,
    description: 'Seltene Fundstücke aus Einsätzen. Für Ausrüstung und Forschung.' },
];

export const RESOURCE_IDS: readonly ResourceId[] = RESOURCES.map(({ id }) => id);
export const SAMPLE_IDS: readonly SampleId[] = ['tissue', 'rock', 'artifact'];
export const RESOURCE_BY_ID: ReadonlyMap<ResourceId, ResourceDefinition> = new Map(RESOURCES.map((resource) => [resource.id, resource]));

export function isResourceId(value: unknown): value is ResourceId {
  return typeof value === 'string' && RESOURCE_BY_ID.has(value as ResourceId);
}

/**
 * Gutschrift je erfolgreicher Mission (Hauptziele erfüllt, Extraktion egal), Index = Schwierigkeitsstufe − 1.
 * Jedes erfüllte optionale Ziel bringt zusätzlich `optionalCreditRate` der Basis-SKR und `optionalMarks` Marken.
 * Einsatzmarken sind je Mission auf `maxMarksPerMission` begrenzt.
 */
export const MISSION_RESOURCE_REWARDS = {
  credits: [250, 500, 800, 1_200, 1_600, 2_000, 2_500],
  marks: [2, 3, 4, 6, 7, 9, 11],
  optionalCreditRate: .2,
  optionalMarks: 1,
  maxMarksPerMission: 11,
} as const;

export interface MissionResourceInput {
  /** Schwierigkeitsstufe 1–7. */
  difficultyLevel: number;
  primaryObjectivesCompleted: boolean;
  optionalObjectivesCompleted: number;
  /** Vom Trupp extrahierte Proben; sie gelten für jeden Teilnehmer. */
  samples?: SampleAmounts;
}

/** Ressourcen, die jeder Teilnehmer für den Einsatz erhält (vor Anwendung der Obergrenzen). */
export function missionResourceReward({ difficultyLevel, primaryObjectivesCompleted, optionalObjectivesCompleted, samples = {} }: MissionResourceInput): ResourceAmounts {
  const reward: ResourceAmounts = {};
  const table = MISSION_RESOURCE_REWARDS;
  if (primaryObjectivesCompleted) {
    const index = Math.max(0, Math.min(table.credits.length - 1, Math.round(difficultyLevel) - 1));
    const optional = Math.max(0, Math.floor(optionalObjectivesCompleted));
    reward.credits = Math.round(table.credits[index] * (1 + table.optionalCreditRate * optional));
    reward.marks = Math.min(table.maxMarksPerMission, table.marks[index] + table.optionalMarks * optional);
  }
  for (const id of SAMPLE_IDS) {
    const amount = Math.max(0, Math.floor(samples[id] ?? 0));
    if (amount) reward[id] = amount;
  }
  return reward;
}

export function emptyBalance(): ResourceBalance {
  return { credits: 0, marks: 0, tissue: 0, rock: 0, artifact: 0 };
}

export function startingBalance(): ResourceBalance {
  const balance = emptyBalance();
  for (const { id, start } of RESOURCES) balance[id] = start;
  return balance;
}

/** Teilt eine Gutschrift in den gutgeschriebenen Teil und den Teil, der an der Obergrenze verfällt. */
export function creditResources(balance: Readonly<ResourceBalance>, gain: ResourceAmounts): { credited: ResourceAmounts; forfeited: ResourceAmounts } {
  const credited: ResourceAmounts = {};
  const forfeited: ResourceAmounts = {};
  for (const { id, max } of RESOURCES) {
    const amount = Math.max(0, Math.floor(gain[id] ?? 0));
    if (!amount) continue;
    const room = Math.max(0, max - (balance[id] ?? 0));
    const kept = Math.min(room, amount);
    if (kept) credited[id] = kept;
    if (amount > kept) forfeited[id] = amount - kept;
  }
  return { credited, forfeited };
}

/** Was zum Bezahlen von `cost` fehlt. Leer: bezahlbar. */
export function missingResources(balance: Readonly<ResourceBalance>, cost: ResourceAmounts): ResourceAmounts {
  const missing: ResourceAmounts = {};
  for (const id of RESOURCE_IDS) {
    const need = cost[id] ?? 0;
    if (need > (balance[id] ?? 0)) missing[id] = need - (balance[id] ?? 0);
  }
  return missing;
}

export function hasResources(amounts: ResourceAmounts | undefined): boolean {
  return !!amounts && RESOURCE_IDS.some((id) => (amounts[id] ?? 0) > 0);
}

const number = new Intl.NumberFormat('de-DE');

/** "2.500 SKR · 3 Marken"; leere Beträge werden ausgelassen. */
export function formatResourceAmounts(amounts: ResourceAmounts | undefined, separator = ' · '): string {
  return RESOURCES.filter(({ id }) => (amounts?.[id] ?? 0) > 0)
    .map(({ id, shortName }) => `${number.format(amounts![id]!)} ${shortName}`).join(separator);
}

import { BALANCE } from '../balance/defaults.ts';
import type { LoadoutSelection } from '../balance/definitions.ts';
import { presetSelection } from '../balance/resolver.ts';

export type { LoadoutSelection } from '../balance/definitions.ts';

const standard = presetSelection(BALANCE);

/**
 * Freischaltungen für Forschung, Verbesserungen, Waffen und Attachments.
 *
 * IDs sind dauerhaft: Sie stehen in den Account-Datenbanken. Einträge nie umbenennen und IDs nie neu vergeben.
 * Entfernte Einträge bleiben in der Datenbank erhalten und werden ignoriert. Format: `<art>.<name>`.
 *
 * - `starter`: Grundausstattung, jeder Account besitzt sie.
 * - `level`: wird automatisch vergeben, sobald Level und Voraussetzungen erfüllt sind.
 * - `choice`: der Spieler schaltet sie selbst frei, sobald Level und Voraussetzungen erfüllt sind. Kosten kommen mit
 *   einer eigenen Währung (offen, siehe docs/ACCOUNTS.md).
 */
export type UnlockKind = 'research' | 'upgrade' | 'weapon' | 'attachment';
export type UnlockAcquisition = 'starter' | 'level' | 'choice';

export interface UnlockDefinition {
  id: string;
  kind: UnlockKind;
  displayName: string;
  description: string;
  acquisition: UnlockAcquisition;
  /** Mindestlevel; Grundausstattung: 1. */
  level: number;
  /** IDs, die vorher freigeschaltet sein müssen. Sie müssen im Register weiter oben stehen (keine Zyklen). */
  requires: readonly string[];
  /** Spielwirkung: Waffe aus der Balance-Registry. */
  weaponId?: string;
  /** Spielwirkung: Granate, Medizin oder Nahkampf aus der Balance-Registry. */
  equipmentId?: string;
  /** Spielwirkung: Attachment für einen Slot einer Waffe (`attachmentSlots` in weapons.json). */
  attachment?: { weaponId: string; slot: string };
}

export const UNLOCK_KINDS: readonly { kind: UnlockKind; label: string }[] = [
  { kind: 'weapon', label: 'Waffen' },
  { kind: 'attachment', label: 'Attachments' },
  { kind: 'upgrade', label: 'Verbesserungen' },
  { kind: 'research', label: 'Forschung' },
];

export interface UnlockRegistry {
  readonly list: readonly UnlockDefinition[];
  readonly byId: ReadonlyMap<string, UnlockDefinition>;
}

const ID = /^(research|upgrade|weapon|attachment)\.[a-z0-9][a-z0-9-]*$/;

/** Prüft und indiziert ein Register. Wirft bei doppelten IDs, falscher Form oder unbekannten Voraussetzungen. */
export function createUnlockRegistry(list: readonly UnlockDefinition[]): UnlockRegistry {
  const byId = new Map<string, UnlockDefinition>();
  for (const unlock of list) {
    if (!ID.test(unlock.id) || !unlock.id.startsWith(unlock.kind + '.')) throw new Error(`Freischaltung ${unlock.id}: ungültige ID`);
    if (byId.has(unlock.id)) throw new Error(`Freischaltung ${unlock.id}: doppelte ID`);
    for (const required of unlock.requires) {
      if (!byId.has(required)) throw new Error(`Freischaltung ${unlock.id}: Voraussetzung ${required} fehlt oder steht weiter unten`);
    }
    if (unlock.acquisition === 'starter' && (unlock.level !== 1 || unlock.requires.length)) throw new Error(`Freischaltung ${unlock.id}: Grundausstattung ohne Bedingungen`);
    byId.set(unlock.id, unlock);
  }
  return { list, byId };
}

/** Grund, warum eine Freischaltung noch nicht möglich ist, oder `undefined`. */
export function unlockBlocker(unlock: UnlockDefinition, level: number, owned: ReadonlySet<string>, registry: UnlockRegistry): string | undefined {
  if (level < unlock.level) return `ab Level ${unlock.level}`;
  const missing = unlock.requires.filter((id) => !owned.has(id));
  if (missing.length) return 'benötigt ' + missing.map((id) => registry.byId.get(id)?.displayName ?? id).join(', ');
  return undefined;
}

/** Alles, was ein Account mit diesem Level und Bestand automatisch erhält (Grundausstattung und Levelstufen). */
export function automaticUnlocks(registry: UnlockRegistry, level: number, owned: ReadonlySet<string>): UnlockDefinition[] {
  const have = new Set(owned);
  const granted: UnlockDefinition[] = [];
  // Voraussetzungen stehen immer weiter oben, ein Durchlauf genügt.
  for (const unlock of registry.list) {
    if (have.has(unlock.id) || unlock.acquisition === 'choice') continue;
    if (unlock.acquisition === 'level' && unlockBlocker(unlock, level, have, registry)) continue;
    have.add(unlock.id);
    granted.push(unlock);
  }
  return granted;
}

/** Freischaltungen, die für ein Loadout nötig sind, aber fehlen. Leer: Loadout erlaubt. */
export function missingLoadoutUnlocks(registry: UnlockRegistry, owned: ReadonlySet<string>, loadout: LoadoutSelection): string[] {
  const missing: string[] = [];
  const need = (match: (unlock: UnlockDefinition) => boolean, label: string) => {
    const unlock = registry.list.find(match);
    if (!unlock) missing.push(label);
    else if (!owned.has(unlock.id)) missing.push(unlock.id);
  };
  need((unlock) => unlock.kind === 'weapon' && unlock.weaponId === loadout.primaryWeaponId, loadout.primaryWeaponId);
  need((unlock) => unlock.kind === 'weapon' && unlock.weaponId === loadout.secondaryWeaponId, loadout.secondaryWeaponId);
  need((unlock) => unlock.equipmentId === loadout.grenadeId, loadout.grenadeId);
  need((unlock) => unlock.equipmentId === loadout.medicalId, loadout.medicalId);
  need((unlock) => unlock.equipmentId === loadout.meleeId, loadout.meleeId);
  need((unlock) => unlock.equipmentId === loadout.backpackId, loadout.backpackId);
  need((unlock) => unlock.equipmentId === loadout.armorId, loadout.armorId);
  return missing;
}

/** Ausrüstung, mit der jeder Operator heute einsetzt. Weitere Einträge kommen mit neuen Inhalten dazu. */
export const UNLOCKS: UnlockRegistry = createUnlockRegistry([
  { id: 'weapon.kestrel-ar-01', kind: 'weapon', displayName: 'Kestrel AR-01', description: 'Standard-Sturmgewehr der Operator.',
    acquisition: 'starter', level: 1, requires: [], weaponId: standard.primaryWeaponId },
  { id: 'weapon.p-01', kind: 'weapon', displayName: 'P-01 Dienstpistole', description: 'Sekundärwaffe für Nachladepausen.',
    acquisition: 'starter', level: 1, requires: [], weaponId: standard.secondaryWeaponId },
  { id: 'upgrade.frag-grenade', kind: 'upgrade', displayName: 'Sprenggranate', description: 'Zwei Granaten je Einsatz, Nachschub am Albatross.',
    acquisition: 'starter', level: 1, requires: [], equipmentId: standard.grenadeId },
  { id: 'upgrade.medical-stim', kind: 'upgrade', displayName: 'Heilstim', description: 'Persönlicher Heilstim mit fünf Ladungen.',
    acquisition: 'starter', level: 1, requires: [], equipmentId: standard.medicalId },
  { id: 'weapon.vx-13', kind: 'weapon', displayName: 'VX-13 Cerberus', description: 'Vorderschaftrepetierflinte, Kaliber 13, Einzelpatronen-Nachladen.',
    acquisition: 'starter', level: 1, requires: [], weaponId: 'vx-13' },
  { id: 'upgrade.weapon-strike', kind: 'upgrade', displayName: 'Kolbenstoß', description: 'Nahkampfangriff mit der Waffe.',
    acquisition: 'starter', level: 1, requires: [], equipmentId: standard.meleeId },
  { id: 'upgrade.standard-frame', kind: 'upgrade', displayName: 'Standard-Tragegestell', description: 'Rucksack der Grundausstattung.',
    acquisition: 'starter', level: 1, requires: [], equipmentId: standard.backpackId },
  { id: 'upgrade.standard-carrier', kind: 'upgrade', displayName: 'Standard-Plattenträger', description: 'Rüstung der Grundausstattung.',
    acquisition: 'starter', level: 1, requires: [], equipmentId: standard.armorId },
]);

export const STANDARD_LOADOUT: LoadoutSelection = standard;

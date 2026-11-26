/**
 * Draft handling of the balance editor: reads the data folder, checks a draft against the files on disk and turns it
 * into format-preserving text edits.
 *
 * Rules for a draft:
 *   - Scalar values may change, keeping their type. `id`, `wireType` and `protected` stay read-only, entries with
 *     `protected: true` (the Schabe) stay read-only, the manifest only accepts a new `release`.
 *   - Lists may grow or shrink only where the editor offers it (`EDITABLE_LISTS`): magazine variants and their
 *     modifiers. Everything else structural (new keys, new weapons) is done in the files themselves.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { SOURCE_FILES } from '@freefall/shared';
import { applyJsonEdits, diffJson, getAt, setAt } from './jsonEdit.ts';
import type { JsonChange, JsonPath } from './jsonEdit.ts';

export type SourceKey = keyof typeof SOURCE_FILES;
export const SOURCE_KEYS = Object.keys(SOURCE_FILES) as SourceKey[];

/** Fields that identify an entry or its network type. Changing them breaks references; edit them in the file. */
const READ_ONLY_FIELDS = new Set(['id', 'wireType', 'protected']);

/** Lists whose entries the editor may add or remove. `#` stands for any index. */
const EDITABLE_LISTS: Partial<Record<SourceKey, readonly (readonly (string | '#')[])[]>> = {
  weapons: [['weapons', '#', 'magazineVariants'], ['weapons', '#', 'magazineVariants', '#', 'modifiers']],
};

export interface Disk {
  readonly dir: string;
  readonly texts: Record<SourceKey, string>;
  readonly data: Record<SourceKey, unknown>;
  /** Hash over all file texts. A save is refused if the files changed since the page loaded them. */
  readonly revision: string;
}

export interface FileChange extends JsonChange {
  readonly file: SourceKey;
  readonly fileName: string;
}

export interface DraftResult {
  /** The disk data with every accepted change applied. */
  readonly data: Record<SourceKey, unknown>;
  readonly changes: readonly FileChange[];
  /** Refused changes, as `file › path: reason`. */
  readonly errors: readonly string[];
}

export function readDisk(dir: string): Disk {
  const texts = {} as Record<SourceKey, string>;
  const data = {} as Record<SourceKey, unknown>;
  const hash = createHash('sha256');
  for (const key of SOURCE_KEYS) {
    texts[key] = readFileSync(dir + SOURCE_FILES[key], 'utf8');
    data[key] = JSON.parse(texts[key]);
    hash.update(key).update('\0').update(texts[key]).update('\0');
  }
  return { dir, texts, data, revision: hash.digest('hex').slice(0, 16) };
}

const where = (file: SourceKey, path: JsonPath) =>
  `${SOURCE_FILES[file]} › ${path.map((key) => typeof key === 'number' ? `[${key}]` : `.${key}`).join('').replace(/^\./, '')}`;

function readOnlyReason(data: Record<SourceKey, unknown>, file: SourceKey, path: JsonPath): string | undefined {
  if (READ_ONLY_FIELDS.has(String(path[path.length - 1]))) return 'schreibgeschützt (ID, Wire-Typ oder Schutz-Flag nur in der Datei ändern)';
  if (file === 'manifest' && path[0] !== 'release') return 'schreibgeschützt';
  if (file === 'enemies' && path[0] === 'archetypes') {
    const archetype = getAt(data.enemies, path.slice(0, 2)) as { protected?: boolean; displayName?: string } | undefined;
    if (archetype?.protected) return `${archetype.displayName ?? 'Gegner'} ist geschützt (protected: true)`;
  }
  return undefined;
}

function editableList(file: SourceKey, path: JsonPath): boolean {
  return (EDITABLE_LISTS[file] ?? []).some((pattern) => pattern.length === path.length &&
    pattern.every((part, i) => part === '#' ? typeof path[i] === 'number' : part === path[i]));
}

function refusal(disk: Disk, file: SourceKey, change: JsonChange): string | undefined {
  if (change.kind === 'structure') return 'Felder hinzufügen, entfernen oder umbauen geht nur direkt in der Datei';
  if (change.kind === 'list') {
    if (!editableList(file, change.path)) return 'Einträge hinzufügen oder entfernen geht hier nur direkt in der Datei';
    return readOnlyReason(disk.data, file, change.path);
  }
  const { before, after } = change;
  if (before === null) return 'schreibgeschützt (leerer Wert)';
  if (typeof after !== typeof before || (typeof after === 'number' && !Number.isFinite(after))) {
    return `${typeof before === 'number' ? 'Zahl' : typeof before === 'boolean' ? 'Ja/Nein' : 'Text'} erwartet`;
  }
  return readOnlyReason(disk.data, file, change.path);
}

/**
 * Compares the drafts (whole file contents, only the files the page changed) with the disk and applies every
 * allowed change to a copy of the disk data. A non-empty `release` sets `manifest.json › release`.
 */
export function applyDrafts(disk: Disk, drafts: unknown, release?: unknown): DraftResult {
  const data = structuredClone(disk.data);
  const changes: FileChange[] = [];
  const errors: string[] = [];
  const input = typeof drafts === 'object' && drafts !== null ? { ...(drafts as Record<string, unknown>) } : {};
  if (typeof release === 'string' && release.trim()) {
    const manifest = (input.manifest ?? structuredClone(disk.data.manifest)) as Record<string, unknown>;
    input.manifest = { ...manifest, release: release.trim() };
  }
  for (const [key, draft] of Object.entries(input)) {
    if (!SOURCE_KEYS.includes(key as SourceKey)) { errors.push(`${key}: unbekannte Balance-Datei`); continue; }
    const file = key as SourceKey;
    for (const change of diffJson(disk.data[file], draft)) {
      const reason = refusal(disk, file, change);
      if (reason) { errors.push(`${where(file, change.path)}: ${reason}`); continue; }
      setAt(data[file], change.path, structuredClone(change.after));
      changes.push({ ...change, file, fileName: SOURCE_FILES[file] });
    }
  }
  return { data, changes, errors };
}

/** Change list for the page: lists are reported by their entry count. */
export function describeChanges(changes: readonly FileChange[]) {
  return changes.map(({ file, fileName, path, kind, before, after }) => ({
    file, fileName, path, kind,
    before: kind === 'list' ? (before as unknown[]).length : before,
    after: kind === 'list' ? (after as unknown[]).length : after,
  }));
}

/**
 * Writes the accepted changes. Every patched file must parse to exactly the validated data, otherwise nothing is
 * written. Returns the names of the written files.
 */
export function writeChanges(disk: Disk, result: DraftResult): string[] {
  const patched = new Map<SourceKey, string>();
  for (const file of new Set(result.changes.map((change) => change.file))) {
    const edits = result.changes.filter((change) => change.file === file).map(({ path, after }) => ({ path, value: after }));
    const text = applyJsonEdits(disk.texts[file], edits);
    if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(result.data[file])) {
      throw new Error(`${SOURCE_FILES[file]}: Formatierung konnte nicht erhalten werden, nichts gespeichert`);
    }
    patched.set(file, text);
  }
  for (const [file, text] of patched) {
    const target = disk.dir + SOURCE_FILES[file];
    writeFileSync(`${target}.tmp`, text);
    renameSync(`${target}.tmp`, target);
  }
  return [...patched.keys()].map((file) => SOURCE_FILES[file]);
}


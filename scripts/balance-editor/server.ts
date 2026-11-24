/**
 * Local balance editor: `npm run balance:edit`, then open http://localhost:5180.
 *
 * Reads the JSON files in packages/shared/src/balance/data, validates every draft with the same code as server and
 * client build, and writes only changed scalar values back (formatting and key order stay as they are). Listens on
 * 127.0.0.1 only. Not part of the game build or deployment.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { SOURCE_FILES } from '@freefall/shared';
import { evaluateBalance } from './analysis.ts';
import type { AnalysisOptions } from './analysis.ts';
import { applyLeafEdits, getAt, isScalar, pathKey, setAt } from './jsonEdit.ts';
import type { JsonPath, JsonScalar } from './jsonEdit.ts';

type SourceKey = keyof typeof SOURCE_FILES;

/** `BALANCE_EDITOR_DATA` points the editor at a copy of the data folder (tests, experiments). */
const DATA_DIR = process.env.BALANCE_EDITOR_DATA
  ? `${process.env.BALANCE_EDITOR_DATA.replace(/\/+$/, '')}/`
  : fileURLToPath(new URL('../../packages/shared/src/balance/data/', import.meta.url));
const PAGE = fileURLToPath(new URL('./index.html', import.meta.url));
const PORT = Number(process.env.BALANCE_EDITOR_PORT ?? 5180);
const KEYS = Object.keys(SOURCE_FILES) as SourceKey[];

/** Fields that identify an entry or its network type. Changing them breaks references; edit them in the file. */
const READ_ONLY_FIELDS = new Set(['id', 'wireType', 'protected']);

interface Edit {
  readonly file: SourceKey;
  readonly path: JsonPath;
  readonly value: JsonScalar;
}

interface Disk {
  readonly texts: Record<SourceKey, string>;
  readonly data: Record<SourceKey, unknown>;
  /** Hash over all file texts. A save is refused if the files changed since the page loaded them. */
  readonly revision: string;
}

function readDisk(): Disk {
  const texts = {} as Record<SourceKey, string>;
  const data = {} as Record<SourceKey, unknown>;
  const hash = createHash('sha256');
  for (const key of KEYS) {
    texts[key] = readFileSync(DATA_DIR + SOURCE_FILES[key], 'utf8');
    data[key] = JSON.parse(texts[key]);
    hash.update(key).update('\0').update(texts[key]).update('\0');
  }
  return { texts, data, revision: hash.digest('hex').slice(0, 16) };
}

/** Checks the edits against the files on disk and applies them to a copy of the data. */
function applyEdits(disk: Disk, raw: unknown): { data: Record<SourceKey, unknown>; edits: Edit[]; errors: string[] } {
  const data = structuredClone(disk.data);
  const edits: Edit[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { data, edits, errors: ['Änderungsliste erwartet'] };
  for (const entry of raw as Partial<Edit>[]) {
    const { file, path, value } = entry ?? {};
    const where = `${typeof file === 'string' ? SOURCE_FILES[file as SourceKey] ?? file : '?'} ${pathKey(path ?? [])}`;
    if (!KEYS.includes(file as SourceKey) || !Array.isArray(path) || !path.length) { errors.push(`${where}: ungültige Änderung`); continue; }
    const original = getAt(disk.data[file as SourceKey], path);
    if (original === undefined || !isScalar(original)) { errors.push(`${where}: kein vorhandener Einzelwert`); continue; }
    if (!isScalar(value) || typeof value !== typeof original || (typeof value === 'number' && !Number.isFinite(value))) {
      errors.push(`${where}: ${typeof original === 'number' ? 'Zahl' : typeof original === 'boolean' ? 'Ja/Nein' : 'Text'} erwartet`);
      continue;
    }
    const reason = readOnlyReason(disk.data, file as SourceKey, path);
    if (reason) { errors.push(`${where}: ${reason}`); continue; }
    setAt(data[file as SourceKey], path, value);
    if (value !== original) edits.push({ file: file as SourceKey, path, value });
  }
  return { data, edits, errors };
}

function readOnlyReason(data: Record<SourceKey, unknown>, file: SourceKey, path: JsonPath): string | undefined {
  if (READ_ONLY_FIELDS.has(String(path[path.length - 1]))) return 'schreibgeschützt (ID, Wire-Typ oder Schutz-Flag nur in der Datei ändern)';
  if (file === 'manifest' && path[0] !== 'release') return 'schreibgeschützt';
  if (file === 'enemies' && path[0] === 'archetypes') {
    const archetype = getAt(data.enemies, path.slice(0, 2)) as { protected?: boolean; displayName?: string } | undefined;
    if (archetype?.protected) return `${archetype.displayName ?? 'Gegner'} ist geschützt (protected: true)`;
  }
  return undefined;
}

function changeList(disk: Disk, edits: readonly Edit[]) {
  return edits.map(({ file, path, value }) => ({ file, fileName: SOURCE_FILES[file], path, before: getAt(disk.data[file], path), after: value }));
}

function options(body: Record<string, unknown>): AnalysisOptions {
  return { difficultyId: typeof body.difficultyId === 'string' ? body.difficultyId : undefined,
    distance: typeof body.distance === 'number' ? body.distance : undefined };
}

function state(disk: Disk, body: Record<string, unknown>) {
  return { revision: disk.revision, files: disk.data, fileNames: SOURCE_FILES, evaluation: evaluateBalance(disk.data, options(body)) };
}

function evaluate(body: Record<string, unknown>) {
  const disk = readDisk();
  const { data, edits, errors } = applyEdits(disk, body.edits);
  const evaluation = evaluateBalance(data, options(body));
  return {
    revision: disk.revision, stale: body.revision !== disk.revision, editErrors: errors,
    changes: changeList(disk, edits), evaluation,
  };
}

function save(body: Record<string, unknown>): { status: number; payload: unknown } {
  const disk = readDisk();
  if (body.revision !== disk.revision) {
    return { status: 409, payload: { error: 'Die Dateien wurden seit dem Laden außerhalb des Editors geändert. Bitte neu laden.' } };
  }
  const rawEdits = Array.isArray(body.edits) ? [...body.edits] : [];
  if (typeof body.release === 'string' && body.release.trim()) rawEdits.push({ file: 'manifest', path: ['release'], value: body.release.trim() });
  const { data, edits, errors } = applyEdits(disk, rawEdits);
  if (errors.length) return { status: 422, payload: { error: 'Ungültige Änderungen', issues: errors } };
  if (!edits.length) return { status: 422, payload: { error: 'Keine Änderungen zum Speichern' } };
  const evaluation = evaluateBalance(data);
  if (!evaluation.ok) return { status: 422, payload: { error: 'Die Konfiguration ist ungültig und wurde nicht gespeichert', issues: evaluation.issues } };

  // Patch every file first, then check that the patched text parses to exactly the validated data. Only then write.
  const patched = new Map<SourceKey, string>();
  for (const key of new Set(edits.map((edit) => edit.file))) {
    const text = applyLeafEdits(disk.texts[key], edits.filter((edit) => edit.file === key));
    if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(data[key])) throw new Error(`${SOURCE_FILES[key]}: Formatierung konnte nicht erhalten werden`);
    patched.set(key, text);
  }
  for (const [key, text] of patched) {
    const target = DATA_DIR + SOURCE_FILES[key];
    writeFileSync(`${target}.tmp`, text);
    renameSync(`${target}.tmp`, target);
  }
  console.log(`Gespeichert: ${edits.length} Werte in ${[...patched.keys()].map((key) => SOURCE_FILES[key]).join(', ')} · Hash ${evaluation.version?.hash}`);
  return { status: 200, payload: { saved: changeList(disk, edits), ...state(readDisk(), body) } };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1_000_000) throw new Error('Anfrage zu groß');
  }
  const body = text ? JSON.parse(text) as unknown : {};
  return typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(readFileSync(PAGE));
      return;
    }
    // JSON API only from the editor page itself: a foreign site in the browser cannot write the files.
    if (request.method === 'POST' && request.headers['content-type'] !== 'application/json') {
      send(response, 415, { error: 'application/json erwartet' });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/state') { send(response, 200, state(readDisk(), await readBody(request))); return; }
    if (request.method === 'POST' && url.pathname === '/api/evaluate') { send(response, 200, evaluate(await readBody(request))); return; }
    if (request.method === 'POST' && url.pathname === '/api/save') {
      const { status, payload } = save(await readBody(request));
      send(response, status, payload);
      return;
    }
    send(response, 404, { error: 'Nicht gefunden' });
  } catch (error) {
    console.error(error);
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Balance-Editor: http://localhost:${PORT}  (Daten: ${DATA_DIR})`);
  console.log('Beenden mit Strg+C.');
});

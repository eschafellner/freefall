/**
 * Local balance editor: `npm run balance:edit`, then open http://localhost:5180.
 *
 * Reads the JSON files in packages/shared/src/balance/data, validates every draft with the same code as server and
 * client build, and writes only the changed values back (formatting and key order stay as they are). Rules for
 * drafts: `drafts.ts`. Listens on 127.0.0.1 only. Not part of the game build or deployment.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { SOURCE_FILES } from '@freefall/shared';
import { evaluateBalance } from './analysis.ts';
import type { AnalysisOptions } from './analysis.ts';
import { applyDrafts, describeChanges, readDisk, writeChanges } from './drafts.ts';
import type { Disk } from './drafts.ts';

/** `BALANCE_EDITOR_DATA` points the editor at a copy of the data folder (tests, experiments). */
const DATA_DIR = process.env.BALANCE_EDITOR_DATA
  ? `${process.env.BALANCE_EDITOR_DATA.replace(/\/+$/, '')}/`
  : fileURLToPath(new URL('../../packages/shared/src/balance/data/', import.meta.url));
const PAGE = fileURLToPath(new URL('./index.html', import.meta.url));
const PORT = Number(process.env.BALANCE_EDITOR_PORT ?? 5180);

function options(body: Record<string, unknown>): AnalysisOptions {
  return { difficultyId: typeof body.difficultyId === 'string' ? body.difficultyId : undefined,
    distance: typeof body.distance === 'number' ? body.distance : undefined };
}

function state(disk: Disk, body: Record<string, unknown>) {
  return { revision: disk.revision, files: disk.data, fileNames: SOURCE_FILES, evaluation: evaluateBalance(disk.data, options(body)) };
}

function evaluate(body: Record<string, unknown>) {
  const disk = readDisk(DATA_DIR);
  const result = applyDrafts(disk, body.drafts);
  return {
    revision: disk.revision, stale: body.revision !== disk.revision, editErrors: result.errors,
    changes: describeChanges(result.changes), evaluation: evaluateBalance(result.data, options(body)),
  };
}

function save(body: Record<string, unknown>): { status: number; payload: unknown } {
  const disk = readDisk(DATA_DIR);
  if (body.revision !== disk.revision) {
    return { status: 409, payload: { error: 'Die Dateien wurden seit dem Laden außerhalb des Editors geändert. Bitte neu laden.' } };
  }
  const result = applyDrafts(disk, body.drafts, body.release);
  if (result.errors.length) return { status: 422, payload: { error: 'Ungültige Änderungen', issues: result.errors } };
  if (!result.changes.length) return { status: 422, payload: { error: 'Keine Änderungen zum Speichern' } };
  const evaluation = evaluateBalance(result.data);
  if (!evaluation.ok) return { status: 422, payload: { error: 'Die Konfiguration ist ungültig und wurde nicht gespeichert', issues: evaluation.issues } };
  const written = writeChanges(disk, result);
  console.log(`Gespeichert: ${result.changes.length} Änderungen in ${written.join(', ')} · Hash ${evaluation.version?.hash}`);
  return { status: 200, payload: { saved: describeChanges(result.changes), ...state(readDisk(DATA_DIR), body) } };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 5_000_000) throw new Error('Anfrage zu groß');
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
    if (request.method === 'POST' && url.pathname === '/api/state') { send(response, 200, state(readDisk(DATA_DIR), await readBody(request))); return; }
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

// Browser-Aufnahmen der Ballon-Extraktion: Ballon am Sammelpunkt, Anflug des Rettungsjägers, Platzen beim Einhaken
// und das Nachziehen des Operators am Seil.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-extraction.mjs [outputDir] [planet]
// Vorher: npm run build -w @freefall/shared
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM, NET, PROCEDURAL_CONTRACT_ID, groundHeight } from '@freefall/shared';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-extraction-'));
const planetId = process.argv[3] ?? 'green-plains';
const outDir = await mkdtemp(join(tmpdir(), 'freefall-extraction-dist-'));
console.log('Aufnahmen', output);
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(new AccountStore(':memory:')) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
let web, browser, page;
const errors = [];

async function until(predicate, label, ms = 15000) {
  const deadline = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('Zeitlimit: ' + label);
    await delay(15);
  }
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => localStorage.setItem('freefall.graphicsQuality', 'high'));
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const shot = async (name) => { await page.screenshot({ path: join(output, name + '.png') }); console.log('shot', name, mission.tick, mission.extraction.current?.phase); };
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await page.getByLabel('Operatorname').fill('Bergung');
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  var mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  Object.assign(operator, { x: 0, z: 3 });
  if (!mission.select(operator.id, { planetId, missionId: PROCEDURAL_CONTRACT_ID, difficultyId: 'normal', seed: 11, worldSeed: 4242, timeOfDay: 'day' }, true)) throw new Error('Auswahl');
  mission.debug(operator.id, 'land');
  await until(() => mission.state === 'ACTIVE_MISSION', 'Landung', 30000);
  await delay(3000);
  mission.director.halt?.(mission.tick);
  const clear = () => { while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]); };
  clear();
  if (!mission.debug(operator.id, 'objectives')) throw new Error('Ziele');
  await until(() => mission.state === 'EXTRACTION_AVAILABLE', 'Extraktion verfügbar');
  const pickup = mission.plan.extraction.balloon;
  const visit = async (x, z, wait = 600) => {
    Object.assign(operator, { x, z, y: groundHeight(mission.surface, x, z), protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(wait);
  };
  await visit(pickup.x, pickup.z, 1500);
  if (!mission.debug(operator.id, 'balloon')) {
    throw new Error('Ballon ' + JSON.stringify({ state: mission.state, feedback: mission.drainFeedback(), pickup,
      operator: { x: operator.x, z: operator.z, posture: operator.posture.current, hp: operator.hp } }));
  }
  const anchor = { x: mission.extraction.current.x, z: mission.extraction.current.z };
  await delay(400);
  await shot('01-kanister');
  await delay(4200);
  // Die Kamera schaut in Blickrichtung des Operators: von hinten-unten auf den Ballon.
  const forward = () => ({ x: -Math.sin(operator.yaw), z: -Math.cos(operator.yaw) });
  for (const [name, distance] of [['02-ballon-fern', 48], ['03-ballon-nah', 24]]) {
    const f = forward();
    await visit(anchor.x - f.x * distance, anchor.z - f.z * distance, 1400);
    clear();
    await shot(name);
  }
  // Zurück an den Ballon, sichern und den Jäger rufen.
  const f = forward();
  await visit(anchor.x - f.x * 9, anchor.z - f.z * 9, 800);
  mission.action(operator.id, 'secure');
  await delay(500);
  await shot('04-gesichert');
  // SwiftShader rendert langsam: die Simulation hält für jede Aufnahme an, der Client zeigt den angehaltenen Tick.
  const step = mission.step.bind(mission);
  let stopAt = Infinity;
  mission.step = () => { if (mission.tick < stopAt) step(); };
  const frozen = async (name, tick) => {
    stopAt = tick;
    await until(() => mission.tick >= tick, name, 15000);
    await delay(1500);
    await shot(name);
  };
  if (!mission.debug(operator.id, 'fighter')) throw new Error('Jäger');
  await until(() => mission.extraction.current?.phase === 'APPROACH', 'Anflug');
  const approachAt = mission.tick;
  await frozen('05-anflug', approachAt + Math.round(2.4 * NET.tickHz));
  const liftAt = approachAt + mission.extraction.current.endsAt - mission.extraction.current.phaseAt;
  for (const [name, seconds] of [['06-einhaken', .1], ['07-platzen', .4], ['08-ruck', 1], ['09-schlepp', 2], ['10-schlepp', 3.3], ['11-schlepp', 4.6]]) {
    await frozen(name, liftAt + Math.round(seconds * NET.tickHz));
  }
  stopAt = Infinity;
  console.log(JSON.stringify({ errors: errors.slice(0, 10), result: mission.result?.extractionSucceeded }));
} catch (error) {
  console.error('Abbruch:', error);
  await page?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
  console.log(JSON.stringify({ errors: errors.slice(0, 10) }));
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

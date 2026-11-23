// Browser check of points of interest: structures per PoI and pickups on a generated planet.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-pois.mjs [outputDir] [planetId] [difficultyId]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM, PROCEDURAL_CONTRACT_ID, groundHeight } from '@freefall/shared';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-pois-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-pois-dist-'));
console.log('Aufnahmen', output);
const store = new AccountStore(':memory:');
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(store) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const report = {};
let web, browser, current;

async function until(predicate, label, ms = 15000) {
  const deadline = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('Zeitlimit: ' + label);
    await delay(30);
  }
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist',
      ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const page = await context.newPage();
  current = page;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const shot = async (name) => { await page.screenshot({ path: join(output, name + '.png') }); console.log('shot', name); };
  const site = 'http://127.0.0.1:' + web.httpServer.address().port;

  const planetId = process.argv[3] ?? 'desert';
  const difficultyId = process.argv[4] ?? 'nightmare';
  await page.goto(site);
  await page.getByLabel('Operatorname').fill('Testoperator');
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  Object.assign(operator, { x: 0, z: 3 });
  if (!mission.select(operator.id, { planetId, missionId: PROCEDURAL_CONTRACT_ID, difficultyId, seed: 11, worldSeed: 4242 }, true)) throw new Error('Auswahl');
  mission.debug(operator.id, 'land');
  await until(() => mission.state === 'ACTIVE_MISSION', 'Landung', 30000);
  await delay(3000);
  const world = mission.surface;
  const points = world.pointsOfInterest;
  report.points = points.map(({ kind, x, z, prominent }) => kind + (prominent ? '*' : '') + '@' + Math.round(x) + ',' + Math.round(z));
  const visit = async (x, z, yaw, wait = 1500) => {
    Object.assign(operator, { x, z, yaw, protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(wait);
  };
  // Die Blickrichtung kommt vom Client (Maus); der Operator wird so vor den PoI gestellt, dass er in Blickrichtung liegt.
  const forward = () => ({ x: -Math.sin(operator.yaw), z: -Math.cos(operator.yaw) });
  for (const [i, poi] of points.entries()) {
    const distance = poi.radius + 7;
    const f = forward();
    await visit(poi.x - f.x * distance, poi.z - f.z * distance, operator.yaw, 2200);
    await shot(String(i + 1).padStart(2, '0') + '-' + poi.kind);
  }
  // Nahaufnahme der Gegenstände und Aufnahme-Hinweis.
  const pickups = mission.pickupSystem.snapshot();
  report.pickups = pickups.reduce((all, { kind }) => ({ ...all, [kind]: (all[kind] ?? 0) + 1 }), {});
  for (const kind of ['tissue', 'rock', 'artifact', 'mark', 'ammo', 'stims', 'grenades']) {
    const item = pickups.find((pickup) => pickup.kind === kind);
    if (!item) continue;
    const f = forward();
    await visit(item.x - f.x * 1.6, item.z - f.z * 1.6, operator.yaw, 1200);
    report['prompt-' + kind] = await page.locator('.interact-hint').innerText().catch(() => '');
    await shot('20-' + kind);
  }
  report.errors = errors.slice(0, 20);
  console.log(JSON.stringify(report, null, 1));
} catch (error) {
  console.error('Abbruch:', error);
  await current?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

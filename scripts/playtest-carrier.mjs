// Browser-Aufnahmen des Skyfall Carriers im echten Spiel: Messe, Galerie, alle Räume, Schleuse, Hangar und Alarmstufen.
// PLAYWRIGHT_MODULE=… [FREEFALL_QUALITY=low|medium|high] node --conditions=development scripts/playtest-carrier.mjs [outputDir]
// Vorher: npm run build -w @freefall/shared
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH, BODENBRUCH_ROOM, CARRIER_SHIP } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const quality = process.env.FREEFALL_QUALITY ?? 'high';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-carrier-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-carrier-dist-'));
console.log('Aufnahmen', output, 'Qualität', quality);
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(new AccountStore(':memory:')) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
let web, browser, page;
const errors = [];

async function until(predicate, label, ms = 15000) {
  const deadline = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('Zeitlimit: ' + label);
    await delay(30);
  }
}

// Blickrichtung (sin yaw, -cos yaw): 0 schaut zum Bug (Konsole, Schleuse), π zum Heck (Panoramafenster), π/2 nach Steuerbord.
const HUB = [
  ['01-messe', 0, 12, 0], ['02-panorama', 1.5, 6, Math.PI], ['03-messe-diagonal', 6.8, 11, .75],
  ['04-ausruestung', -14.5, 9, -Math.PI / 2], ['05-waffenkammer', 14.5, 9, Math.PI / 2],
  ['06-ruestung', -14.5, -9, -Math.PI / 2], ['07-forschung', 14.5, -9, Math.PI / 2],
  ['08-krankenstation', -13.6, 0, -Math.PI / 2], ['09-quartier', 13.6, 0, Math.PI / 2],
  ['10-schleuse', 0, -13.5, 0], ['11-hangar', 6.6, -24.8, .1], ['12-hangar-tor', -4.5, -41, 0],
  ['13-hangar-leitstand', 5, -44, Math.PI], ['14-wartung', 6.2, -42, 2.55],
];

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript((value) => localStorage.setItem('freefall.graphicsQuality', value), quality);
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const shot = async (name) => { await page.screenshot({ path: join(output, name + '.png') }); console.log('shot', name); };
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await page.getByLabel('Operatorname').fill('Testoperator');
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  const place = async (x, z, yaw, wait = 1300) => {
    Object.assign(operator, { x, z, yaw, protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(wait);
  };
  await delay(2500);
  for (const [name, x, z, yaw] of HUB) {
    await place(x, z, yaw);
    await shot(name);
  }
  // Bordruf (Amber): Auftrag an der Konsole wählen und starten.
  await place(0, 3, 0, 300);
  if (!mission.select(operator.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'normal' })) throw new Error('Auswahl');
  if (!mission.start(operator.id)) throw new Error('Start');
  await place(0, 9, 0, 1800);
  await shot('15-bordruf-messe');
  await place(-6.5, -27, -.15, 1500);
  await shot('16-bordruf-hangar');
  // Rotalarm: an Bord gehen und bereit melden (Countdown), dann klemmen die Klammern.
  await place(CARRIER_SHIP.x - 1, CARRIER_SHIP.z + 2, Math.PI, 900);
  if (!mission.action(operator.id, 'ready')) throw new Error('Bereit');
  await delay(450);
  await shot('17-rotalarm');
  console.log('errors', JSON.stringify(errors.slice(0, 10)));
} catch (error) {
  console.error('Abbruch:', error);
  await page?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

// Browser-Prüfung des Arsenals im Carrier: Station öffnen, Rubriken, Waffe kaufen (zweistufig) und ausrüsten,
// Rüstung kaufen und anlegen, gesperrte Einträge, Titelbildschirm ohne Arsenal.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-arsenal.mjs [outputDir]
// Vorher: npm run build -w @freefall/shared
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM, CARRIER_ROOMS, levelForExperience } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-arsenal-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-arsenal-dist-'));
console.log('Aufnahmen', output);
const store = new AccountStore(':memory:');
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(store) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const report = {};
let web, browser, page;

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
  browser = await chromium.launch({ chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const shot = async (name) => { await page.screenshot({ path: join(output, name + '.png') }); console.log('shot', name); };
  const site = 'http://127.0.0.1:' + web.httpServer.address().port;
  await page.goto(site);
  await page.getByLabel('Operatorname').fill('Testoperator');
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).waitFor();
  // Level 6 und 10.000 SKR: MP-99 (Level 5, 4.500) ist kaufbar, Viktor 55 (Level 7) gesperrt.
  const [{ id }] = store.db.prepare('SELECT id FROM accounts').all();
  let experience = 0;
  while (levelForExperience(experience) < 6) experience += 50;
  store.db.prepare('UPDATE accounts SET experience = ? WHERE id = ?').run(experience, id);
  store.grantResources(id, { credits: 10000 }, 'playtest');
  const startCredits = store.resources(id).credits;
  await page.reload();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).waitFor();
  report.titleNav = await page.locator('.title-account-nav').getByRole('button').allInnerTexts();
  assert.ok(!report.titleNav.includes('Arsenal'), 'Arsenal nicht mehr im Startbildschirm');
  await shot('00-titel');
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  const room = CARRIER_ROOMS.find(({ label }) => label === 'ARSENAL');
  // Tür mit Schild "ARSENAL" von der Messe aus, dann der Raum selbst.
  Object.assign(operator, { x: 5, z: 9, yaw: Math.PI / 2, protectedUntil: Infinity, life: operator.life + 1 });
  clearMoves(operator);
  await delay(5000);
  await shot('01a-tuer');
  Object.assign(operator, { x: 13.5, z: 9, yaw: Math.PI / 2, life: operator.life + 1 });
  clearMoves(operator);
  await delay(2500);
  await shot('01b-raum');
  Object.assign(operator, { x: room.x - 4, z: room.z, yaw: Math.PI / 2, protectedUntil: Infinity, life: operator.life + 1 });
  clearMoves(operator);
  await page.getByText('Arsenal öffnen').waitFor();
  await shot('01-prompt');
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Arsenal' }).waitFor();
  await page.getByRole('option', { name: /MP-99/ }).waitFor();
  await delay(1500);
  await shot('02-waffen');
  await page.getByRole('option', { name: /Viktor 55/ }).click();
  await shot('03-viktor-gesperrt');
  await page.getByRole('option', { name: /MP-99/ }).click();
  await page.getByRole('button', { name: /Freischalten · 4\.500/ }).click();
  await page.getByRole('button', { name: /Kauf bestätigen/ }).waitFor();
  await shot('04-mp99-bestaetigen');
  await page.getByRole('button', { name: /Kauf bestätigen/ }).click();
  await page.getByRole('button', { name: 'Ausrüsten' }).waitFor();
  await shot('05-mp99-gekauft');
  await page.getByRole('button', { name: 'Ausrüsten' }).click();
  await until(() => operator.loadout.selection.primaryWeaponId === 'mp-99', 'MP-99 im Loadout');
  await page.getByRole('button', { name: 'Ausgerüstet' }).waitFor();
  await shot('06-mp99-ausgeruestet');
  await page.getByRole('tab', { name: /Rüstungen/ }).click();
  await page.getByRole('option', { name: /BW-9/ }).click();
  await delay(1500);
  await shot('07-ruestung-bw9');
  await page.getByRole('button', { name: /Freischalten · 4\.000/ }).click();
  await page.getByRole('button', { name: /Kauf bestätigen/ }).click();
  await page.getByRole('button', { name: 'Ausrüsten' }).click();
  await until(() => operator.loadout.selection.armorId === 'armor.bw9_bulwark', 'BW-9 im Loadout');
  await page.getByRole('option', { name: /SR-4/ }).click();
  await delay(1200);
  await shot('08-sr4-zu-teuer');
  await page.getByRole('tab', { name: /Ausstattung/ }).click();
  await delay(300);
  await shot('09-ausstattung');
  report.credits = store.resources(id).credits;
  report.unlocks = store.unlocks(id).map((entry) => entry.id);
  report.loadout = operator.loadout.selection;
  assert.equal(report.credits, startCredits - 4500 - 4000);
  report.errors = errors.slice(0, 10);
  console.log(JSON.stringify(report, null, 1));
} catch (error) {
  console.error('Abbruch:', error);
  await page?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
  console.error('buttons', await page?.getByRole('button').allInnerTexts().catch(() => []));
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

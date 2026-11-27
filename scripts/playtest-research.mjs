// Browser-Prüfung der Forschung im Carrier: Station öffnen, Stufen in Reihenfolge erforschen (zweistufig), Wirkung auf
// Lebenspunkte und Ausdauer am Server und im HUD, gesperrte und zu teure Stufen.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-research.mjs [outputDir]
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
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-research-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-research-dist-'));
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
  // Proben und SKR für genau drei Stufen (180 Gewebe, 35 Gestein, 9.000 SKR).
  const [{ id }] = store.db.prepare('SELECT id FROM accounts').all();
  store.grantResources(id, { tissue: 180, rock: 35, credits: 4000 }, 'playtest');
  await page.reload();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  const room = CARRIER_ROOMS.find(({ label }) => label === 'FORSCHUNG');
  Object.assign(operator, { x: room.x - 4, z: room.z, yaw: Math.PI / 2, protectedUntil: Infinity, life: operator.life + 1 });
  clearMoves(operator);
  await page.getByText('Forschung öffnen').waitFor();
  await delay(3000);
  await shot('01-prompt');
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Forschung' }).waitFor();
  await page.getByRole('button', { name: /Erforschen · / }).waitFor();
  await delay(1500);
  await shot('02-start');
  await page.getByRole('button', { name: /Erforschen · / }).click();
  await page.getByRole('button', { name: /Forschung bestätigen/ }).waitFor();
  await shot('03-bestaetigen');
  await page.getByRole('button', { name: /Forschung bestätigen/ }).click();
  await until(() => operator.loadout.maxHealth === 130, 'Lebenspunkte 130 am Server');
  report.afterFirst = { maxHealth: operator.loadout.maxHealth, hp: operator.hp };
  await page.getByRole('button', { name: /Erforschen · / }).waitFor();
  await shot('04-stufe1-fertig');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Erforschen · / }).click();
    await page.getByRole('button', { name: /Forschung bestätigen/ }).click();
    await page.getByText(/abgeschlossen/).waitFor();
    await until(async () => (await page.getByText(/abgeschlossen/).count()) === 1, 'Hinweis');
  }
  await until(() => operator.loadout.maxHealth === 150, 'Lebenspunkte 150 am Server');
  report.afterThird = { maxHealth: operator.loadout.maxHealth, hp: operator.hp, stamina: operator.loadout.mobility.stamina.max };
  await delay(500);
  await shot('05-stufe3-fertig');
  await page.getByRole('button', { name: /Leistungssteigernde/ }).click();
  await shot('06-stufe5-gesperrt');
  await page.keyboard.press('KeyE');
  await delay(1500);
  await shot('07-hud');
  report.hudHp = await page.locator('.member.own .hp').innerText();
  assert.equal(report.hudHp, '150');
  report.resources = store.resources(id);
  report.research = store.unlocks(id).filter((entry) => entry.id.startsWith('research.')).map((entry) => entry.id);
  assert.equal(report.research.length, 3);
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

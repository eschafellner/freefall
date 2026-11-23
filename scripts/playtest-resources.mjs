// Browser check of resources: title bar (SKR, Marken), result screen after a mission, Arsenal and Dienstakte.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-resources.mjs [outputDir]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-resources-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-resources-dist-'));
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

  await page.goto(site);
  await page.getByLabel('Operatorname').fill('Testoperator');
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).waitFor();
  report.header = await page.locator('.title-account .resource-bar').innerText();
  await shot('01-lobby-header');

  // Einsatz über die Serverobjekte durchspielen: Landung, Hauptziele, Proben, Extraktion.
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const id = mission.players[0].id;
  mission.debug(id, 'land');
  await until(() => mission.state === 'ACTIVE_MISSION', 'Landung');
  mission.debug(id, 'objectives');
  await until(() => mission.primaryCompleted, 'Hauptziele', 30000);
  mission.collectSamples(id, { tissue: 3, rock: 2, artifact: 1 });
  mission.finish([id]);
  await page.locator('.operations.results').waitFor({ timeout: 20000 }).catch(async () => {
    await page.keyboard.press('Escape');
    await page.locator('.operations.results').waitFor({ timeout: 10000 });
  });
  await page.locator('.result-progress .resource-gain').waitFor();
  report.result = await page.locator('.operations.results').innerText();
  await shot('02-result');

  await page.getByRole('button', { name: /Rückkehr bestätigen/ }).click();
  await page.keyboard.press('Escape').catch(() => {});
  const leave = page.getByRole('button', { name: /Raum verlassen|Verlassen/ }).first();
  await leave.click({ timeout: 10000 });
  await page.getByRole('button', { name: 'Arsenal' }).click();
  await page.locator('.arsenal .resource-bar').waitFor();
  report.arsenal = await page.locator('.arsenal .resource-bar').innerText();
  await shot('03-arsenal');
  await page.getByRole('button', { name: 'Dienstakte' }).click();
  await page.locator('.record .resource-gain').waitFor();
  report.record = await page.locator('.record').first().innerText();
  await shot('04-record');
  report.errors = errors.slice(0, 20);
  console.log(JSON.stringify(report, null, 1));
} catch (error) {
  console.error('Abbruch:', error);
  await current?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
  console.error('buttons', await current?.getByRole('button').allInnerTexts().catch(() => []));
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

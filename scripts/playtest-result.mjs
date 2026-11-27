// Browser-Prüfung des Missionsabschlusses: Ergebnismusik (Sieg/Niederlage) und Rückkehr an Bord ohne Raummenü,
// einmal mit „Rückkehr bestätigen“, einmal nach Ablauf des Ergebnistimers ohne Klick.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-result.mjs [outputDir]
// Vorher: npm run build -w @freefall/shared
import assert from 'node:assert/strict';
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
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-result-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-result-dist-'));
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
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const music = [];
  page.on('request', (request) => { const match = request.url().match(/music\/([a-z-]+)\./); if (match) music.push(match[1]); });
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
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  let found;
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Raum');
  const mission = matchMaker.getLocalRoomById(found.roomId).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  const locked = () => page.evaluate(() => !!document.pointerLockElement);
  const run = async (name, success, vote) => {
    assert.ok(mission.debug(operator.id, 'land'), 'landen');
    await until(() => mission.state === 'ACTIVE_MISSION', 'Einsatz läuft');
    await delay(1500);
    mission.primaryCompleted = success;
    mission.finish(success ? [operator.id] : []);
    await page.getByRole('heading', { name: success ? 'Einsatz erfolgreich' : 'Einsatz gescheitert' }).waitFor();
    await delay(2500);
    await shot(name + '-ergebnis');
    report[name] = { music: [...music], lockedDuringResult: await locked() };
    if (vote) await page.getByRole('button', { name: /Rückkehr bestätigen/ }).click();
    await until(() => mission.state === 'CARRIER_HUB', 'zurück im Hub', 20000);
    await until(async () => (await locked()) || (await page.locator('.return-prompt').count()) > 0, 'Einstieg oder Hinweis', 5000);
    await delay(800);
    report[name].lockedAfterReturn = await locked();
    report[name].pauseMenu = await page.getByRole('button', { name: 'Carrier betreten' }).count();
    report[name].prompt = await page.locator('.return-prompt').count();
    await shot(name + '-zurueck');
    if (!report[name].lockedAfterReturn && report[name].prompt) {
      await page.locator('.return-prompt').click();
      await until(locked, 'Klick auf den Hinweis');
    }
  };
  await run('1-sieg', true, true);
  await run('2-niederlage', false, false);
  // Ausweichfall: Der Browser verweigert die Mauserfassung ohne Geste → nur der Klickhinweis, kein Raummenü.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.requestPointerLock;
    window.__restoreLock = () => { HTMLCanvasElement.prototype.requestPointerLock = original; };
    HTMLCanvasElement.prototype.requestPointerLock = function () { setTimeout(() => document.dispatchEvent(new Event('pointerlockerror'))); return Promise.reject(new Error('denied')); };
  });
  assert.ok(mission.debug(operator.id, 'land'));
  await until(() => mission.state === 'ACTIVE_MISSION', 'Einsatz läuft');
  mission.primaryCompleted = true;
  mission.finish([]);
  await page.getByRole('heading', { name: 'Einsatz erfolgreich' }).waitFor();
  await page.getByRole('button', { name: /Rückkehr bestätigen/ }).click();
  await page.locator('.return-prompt').waitFor({ timeout: 15000 });
  report.fallback = { pauseMenu: await page.getByRole('button', { name: 'Carrier betreten' }).count() };
  await shot('3-hinweis');
  await page.evaluate(() => window.__restoreLock());
  await page.locator('.return-prompt').click();
  await until(locked, 'Klick auf den Hinweis');
  report.fallback.lockedAfterClick = true;
  assert.equal(report.fallback.pauseMenu, 0);
  report.music = music;
  assert.ok(music.includes('result-victory-at-the-edge') && music.includes('result-the-final-march'));
  for (const name of ['1-sieg', '2-niederlage']) assert.equal(report[name].pauseMenu, 0, name + ': kein Raummenü');
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

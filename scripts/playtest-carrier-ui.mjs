// Browser-Aufnahmen der Carrier-UI: Deck-HUD, Missionskonsole, Ausrüstung, Pausenmenü.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-carrier-ui.mjs [outputDir]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM, CARRIER_ROOMS } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-carrier-ui-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-carrier-ui-dist-'));
console.log('Aufnahmen', output);
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

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
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
  const place = async (x, z, yaw) => {
    Object.assign(operator, { x, z, yaw, protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(900);
  };
  await place(0, 10, Math.PI);
  await delay(1200);
  await shot('01-deck-hud');
  await page.keyboard.down('Tab');
  await delay(400);
  await shot('01b-deck-tab');
  await page.keyboard.up('Tab');
  await place(0, 3.5, Math.PI);
  await page.getByText('Missionskonsole öffnen').waitFor();
  await shot('02-console-prompt');
  await page.keyboard.press('KeyE');
  await delay(800);
  await shot('03-console');
  const select = page.getByRole('button', { name: /Auftrag erzeugen|Auftrag auswählen/ });
  if (await select.count()) { await select.first().click(); await delay(1500); await shot('04-console-plan'); }
  const relock = page.getByRole('button', { name: /Carrier betreten|Zurück an Deck|Schließen/ }).first();
  await relock.click();
  await delay(600);
  const locker = CARRIER_ROOMS.find(({ label }) => label === 'AUSRÜSTUNG');
  await place(locker.x, locker.z, -Math.PI / 2);
  await page.getByText('Ausrüstung öffnen').waitFor();
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Ausrüstung' }).waitFor();
  await delay(500);
  await shot('05-loadout');
  await page.keyboard.press('KeyE'); // INTERACT schließt die Station wieder
  await page.locator('.terminal').waitFor({ state: 'detached' });
  await page.locator('.in-game').waitFor();
  console.log('station closed with E');
  await place(0, 12, Math.PI);
  await page.keyboard.press('Escape');
  await delay(800);
  await shot('06-pause');
  console.log('errors', JSON.stringify(errors.slice(0, 10)));
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

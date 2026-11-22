// Visual check of the field HUD: team panel, own kit, TAB intel overlay and the ESC pause menu.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-field-hud.mjs [outputDir]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-hud-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-hud-dist-'));
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
let web, browser;
const until = async (predicate, label) => {
  const deadline = performance.now() + 20000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error('Timed out: ' + label); await delay(30); }
};
try {
  process.env.VITE_FREEFALL_SERVER = 'http://127.0.0.1:' + server.transport.server.address().port;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await page.getByLabel('Grafikqualität').selectOption('low');
  await page.getByRole('button', { name: 'Raum erstellen' }).click();
  await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
  const room = matchMaker.getLocalRoomById(await page.locator('.room strong').innerText());
  const { arena: mission } = room;
  const operator = mission.players[0];
  const enter = async (name) => { await page.getByRole('button', { name }).focus(); await page.keyboard.press('Enter'); await page.locator('.in-game').waitFor(); };
  await enter('Carrier betreten');
  Object.assign(operator, { x: 0, z: 3, life: operator.life + 1 });
  await page.getByText('Missionskonsole öffnen').waitFor();
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Einsatzplanung' }).waitFor();
  await page.locator('.carrier-console button.secondary').first().click();
  await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
  await until(() => mission.state === 'BOARDING', 'Boarding');
  mission.debug(operator.id, 'land');
  await until(() => mission.state === 'ACTIVE_MISSION', 'Landung');
  await enter('Einsatz betreten');
  await delay(1500);
  await page.screenshot({ path: join(output, 'hud.png') });
  await page.keyboard.down('Tab');
  await delay(400);
  await page.screenshot({ path: join(output, 'hud-tab.png') });
  await page.keyboard.up('Tab');
  await delay(300);
  await page.screenshot({ path: join(output, 'hud-after-tab.png') });
  console.log(JSON.stringify({ lockedAfterTab: await page.locator('.in-game').count(), errors }));
} catch (error) {
  console.error('Abbruch:', error);
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

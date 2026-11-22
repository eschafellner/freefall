// Visual check of the Skyfall Carrier: rooms, windows, mission hologram and the boarding/drop alarm lamps.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-carrier.mjs [outputDir]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const quality = process.env.FREEFALL_QUALITY ?? 'medium';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-carrier-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-carrier-dist-'));
console.log('Aufnahmen', output);
const server = await startServer(0, '127.0.0.1', false);
let web, browser;

async function until(predicate, label) {
  const deadline = performance.now() + 15000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Timed out: ' + label);
    await delay(30);
  }
}

try {
  process.env.VITE_FREEFALL_SERVER = 'http://127.0.0.1:' + server.transport.server.address().port;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist',
      ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error' || entry.type() === 'warning') errors.push(entry.text()); });
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await page.getByLabel('Grafikqualität').selectOption(quality);
  await page.getByRole('button', { name: 'Raum erstellen' }).click();
  await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
  const room = matchMaker.getLocalRoomById(await page.locator('.room strong').innerText());
  const { arena: mission } = room;
  const operator = mission.players[0];
  await page.getByRole('button', { name: 'Carrier betreten' }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  const place = async (x, z, yaw, wait = 900) => {
    Object.assign(operator, { x, z, yaw, protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(wait);
  };
  const shot = async (name) => { await page.screenshot({ path: join(output, quality + '-' + name + '.png') }); console.log('shot', name); };
  // Yaw 0 looks towards -z (the airlock); +PI/2 turns to +x.
  await place(0, 12, 0); await shot('mess');
  await place(0, 5.5, 0); await shot('hologram');
  await place(16, 9.8, Math.PI / 2); await shot('room-starboard');
  await place(-16, -9.8, -Math.PI / 2); await shot('room-port');
  await place(0, 9, Math.PI); await shot('rear-window');
  await place(-3.5, -16, .35); await shot('hangar');

  // Boarding call: amber lamps.
  Object.assign(operator, { x: 0, z: 3, life: operator.life + 1 });
  await delay(500);
  await page.getByText('Missionskonsole öffnen').waitFor();
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Einsatzplanung' }).waitFor();
  await page.locator('.carrier-console button.secondary').first().click();
  await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
  await until(() => mission.state === 'BOARDING', 'Boarding');
  await page.keyboard.press('Escape');
  await place(0, -7, 0, 1400); await shot('boarding-amber');
  // Drop countdown: hold the countdown so the red alarm can be captured.
  mission.finishTick = () => {};
  mission.boardingUntil = mission.tick + 99999;
  await place(0, -7, 0, 1400); await shot('alarm-red');
  await delay(260); await shot('alarm-red-2');
  await place(-2, -22, -.3, 900); await shot('alarm-hangar');
  console.log(JSON.stringify({ errors: errors.slice(0, 20) }));
} catch (error) {
  console.error('Abbruch:', error);
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

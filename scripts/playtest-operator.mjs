// Browser-Aufnahmen des Operators im echten Spiel: Ruhe, Lauf, Sprint, Seitwärtslauf im Anschlag, Hocke, Hechtsprung,
// Bauchlage und alle drei Rüstungssätze auf dem Carrier-Deck (Arena: Tageslicht, Carrier: Innenlicht).
// PLAYWRIGHT_MODULE=… [FREEFALL_QUALITY=low|medium|high] node --conditions=development scripts/playtest-operator.mjs [outputDir]
// Vorher: npm run build -w @freefall/shared
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { ARENA_ROOM, BODENBRUCH_ROOM } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const quality = process.env.FREEFALL_QUALITY ?? 'high';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-operator-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-operator-dist-'));
console.log('Aufnahmen', output, 'Qualität', quality);
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(new AccountStore(':memory:')) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
let web, browser;
const errors = [];

async function until(predicate, label, ms = 15000) {
  const deadline = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('Zeitlimit: ' + label);
    await delay(30);
  }
}

async function login(page, name) {
  await page.getByLabel('Operatorname').fill(name);
  await page.getByLabel('Passwort').fill('geheimes-passwort-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Operator anlegen' }).click();
  await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({ chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript((value) => localStorage.setItem('freefall.graphicsQuality', value), quality);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const shot = async (name) => { await page.screenshot({ path: join(output, name + '.png') }); console.log('shot', name); };
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await login(page, 'Testoperator');

  // Arena in daylight: movement from the shoulder camera (skip with ONLY_DECK=1).
  let found;
  if (!process.env.ONLY_DECK) {
  await page.getByRole('button', { name: 'Boreal Relay', exact: true }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  await until(async () => (found = (await matchMaker.query({ name: ARENA_ROOM }))[0]), 'Arena');
  const arena = matchMaker.getLocalRoomById(found.roomId).arena;
  arena.setHordeSize(0);
  await until(() => arena.players[0], 'Operator');
  const own = arena.players[0];
  own.protectedUntil = Infinity;
  await page.mouse.click(640, 360);
  await delay(2500);
  await shot('01-ruhe');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 3; i++) { await delay(260); await shot('02-lauf-' + i); }
  await page.keyboard.down('Shift');
  for (let i = 0; i < 2; i++) { await delay(420); await shot('03-sprint-' + i); }
  // Keep sprinting until the stamina pool is empty (about 9 s in the standard armour).
  await until(() => own.staminaState.exhausted, 'Erschöpfung', 20000);
  await delay(300);
  await shot('03-erschoepft');
  console.log('erschöpft nach Sprint', own.staminaState);
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await delay(600);
  await shot('04-stopp');
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 2; i++) { await delay(300); await shot('05-seitwaerts-anschlag-' + i); }
  await page.keyboard.up('KeyD');
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('KeyC');
  await delay(900);
  await shot('06-hocke');
  await page.keyboard.press('KeyC');
  await delay(700);
  await page.keyboard.down('KeyW');
  await delay(400);
  await page.keyboard.press('KeyX');
  await delay(200);
  await shot('07-hechtsprung');
  await page.keyboard.up('KeyW');
  await delay(1200);
  await shot('08-bauchlage');
  await page.keyboard.press('Space');
  await delay(1500);
  }

  // Carrier deck: the three armour sets side by side (presentation field only, set on the server snapshot).
  await page.keyboard.press('Escape');
  await page.close();
  const deckContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await deckContext.addInitScript((value) => localStorage.setItem('freefall.graphicsQuality', value), quality);
  const deck = await deckContext.newPage();
  deck.on('pageerror', (error) => errors.push(error.message));
  await deck.goto('http://127.0.0.1:' + web.httpServer.address().port);
  await login(deck, 'Deckoperator');
  await deck.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await deck.locator('.in-game').waitFor();
  await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM }))[0]), 'Carrier');
  const room = matchMaker.getLocalRoomById(found.roomId);
  const mission = room.arena;
  await until(() => mission.players[0], 'Deckoperator');
  const operator = mission.players[0];
  // Rüstkammer (RÜSTUNG room): pick each armour, put it on, and look at the operator on deck.
  const station = async (x, z, yaw) => {
    Object.assign(operator, { x, z, yaw, protectedUntil: Infinity, life: operator.life + 1 });
    clearMoves(operator);
    await delay(900);
    await deck.mouse.click(640, 360);
    await delay(300);
    await deck.keyboard.press('KeyE');
    await delay(1200);
  };
  await station(-22, -9, -Math.PI / 2);
  await deck.screenshot({ path: join(output, '09-ruestkammer.png') });
  // A new account holds 5,000 SKR: SR-4 (6,000) is out of reach, BW-9 (4,000) can be bought and put on.
  await deck.getByRole('radio', { name: /KR-12 Koloss/ }).click();
  await delay(900);
  await deck.screenshot({ path: join(output, '10-ruestkammer-ueberschwer.png') });
  await deck.getByRole('radio', { name: /SR-4 Späher/ }).click();
  await delay(900);
  await deck.screenshot({ path: join(output, '10-ruestkammer-leicht-gesperrt.png') });
  if (!(await deck.getByRole('button', { name: /Es fehlen 1\.000 SKR/ }).isDisabled())) throw new Error('SR-4 sollte zu teuer sein');
  await deck.getByRole('radio', { name: /BW-9 Bollwerk/ }).click();
  await delay(900);
  await deck.getByRole('button', { name: /Freischalten · 4\.000 SKR/ }).click();
  await deck.getByRole('button', { name: 'Rüstung anlegen' }).waitFor();
  await deck.screenshot({ path: join(output, '11-ruestkammer-schwer-gekauft.png') });
  await deck.getByRole('button', { name: 'Rüstung anlegen' }).click();
  await until(() => operator.loadout.selection.armorId === 'armor.bw9_bulwark', 'Rüstung am Server');
  console.log('angelegt schwer', operator.loadout.protection);
  await delay(600);
  await deck.screenshot({ path: join(output, '12-ruestkammer-schwer-aktiv.png') });
  await deck.keyboard.press('KeyE');
  await delay(400);
  Object.assign(operator, { x: 0, z: 9.5, yaw: Math.PI * .8, life: operator.life + 1 });
  clearMoves(operator);
  await delay(1600);
  await deck.screenshot({ path: join(output, '13-deck-schwer.png') });
  // Ausrüstung terminal with the armour section.
  await station(-22, 9, -Math.PI / 2);
  await deck.screenshot({ path: join(output, '14-ausruestung.png') });
  console.log('errors', JSON.stringify(errors.slice(0, 10)));
} catch (error) {
  console.error('Abbruch:', error);
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

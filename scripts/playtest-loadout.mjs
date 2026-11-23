// Browser check of milestone 8.1A: Carrier station "Ausrüstung", VX-13 Cerberus in the carrier and in the arena
// (pellet shot, single-round reload). PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-loadout.mjs [outputDir]
import assert from 'node:assert/strict';
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
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-loadout-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-loadout-dist-'));
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
  const watch = (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  };
  const page = await context.newPage();
  current = page;
  watch(page);
  const shot = async (target, name) => { await target.screenshot({ path: join(output, name + '.png') }); console.log('shot', name); };
  const site = 'http://127.0.0.1:' + web.httpServer.address().port;

  // 1) Carrier: open the station, pick the VX-13, apply.
  const login = async (target) => {
    await target.goto(site);
    const quality = target.getByRole('button', { name: 'Raum erstellen', exact: true });
    const form = target.getByLabel('Operatorname');
    await Promise.race([quality.waitFor(), form.waitFor()]);
    if (await form.isVisible()) {
      await form.fill('Testoperator');
      await target.getByLabel('Passwort').fill('geheimes-passwort-1');
      await target.getByRole('button', { name: 'Anmelden' }).click();
      const create = target.getByRole('button', { name: 'Operator anlegen' });
      await Promise.race([quality.waitFor(), create.waitFor()]);
      if (await create.isVisible()) {
        await create.click();
        await target.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
      }
    }
    await target.getByRole('button', { name: 'Raum erstellen', exact: true }).waitFor();
    console.log('lobby', JSON.stringify(await target.getByRole('button').allInnerTexts()));
  };
  await login(page);
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await page.locator('.in-game').waitFor();
  const roomOf = async (name) => {
    let found;
    await until(async () => (found = (await matchMaker.query({ name }))[0]), 'Raum ' + name);
    return matchMaker.getLocalRoomById(found.roomId);
  };
  const mission = (await roomOf(BODENBRUCH_ROOM)).arena;
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  Object.assign(operator, { x: -16.5, z: 9, yaw: -Math.PI / 2, protectedUntil: Infinity, life: operator.life + 1 });
  clearMoves(operator);
  await page.getByText('Ausrüstung öffnen').waitFor();
  await shot(page, '01-station-prompt');
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Ausrüstung' }).waitFor();
  await shot(page, '02-loadout-standard');
  const primary = page.locator('.loadout-field', { hasText: 'Primärwaffe' }).locator('select');
  await primary.selectOption('vx-13');
  await page.getByText('Nicht übernommen').waitFor();
  await shot(page, '03-loadout-cerberus-draft');
  await page.getByRole('button', { name: 'Ausrüstung übernehmen' }).click();
  await until(() => operator.loadout.weapons.primary.id === 'vx-13', 'Loadout am Server');
  await page.locator('.field-heading span', { hasText: 'Aktiv' }).waitFor();
  report.carrier = { primary: operator.loadout.weapons.primary.id, ammo: operator.ammo, reserve: operator.equipment.magazines.primary };
  await shot(page, '04-loadout-applied');
  const stored = await page.evaluate(() => localStorage.getItem('freefall.loadout.v1'));
  assert.match(stored ?? '', /vx-13/);
  await page.getByRole('button', { name: 'Carrier betreten' }).click();
  await delay(600);
  Object.assign(operator, { x: 0, z: 10, yaw: Math.PI * .85, life: operator.life + 1 });
  clearMoves(operator);
  await delay(1500);
  await shot(page, '05-carrier-cerberus');

  // 2) Arena (same browser storage): the stored loadout is restored on join. Fire and reload the shotgun.
  await page.close();
  await delay(500);
  const arenaPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2,
    storageState: await context.storageState() })).newPage();
  current = arenaPage;
  watch(arenaPage);
  await login(arenaPage);
  await arenaPage.getByRole('button', { name: 'Boreal Relay', exact: true }).click();
  await arenaPage.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  await arenaPage.locator('.in-game').waitFor();
  const arenaRoom = await roomOf(ARENA_ROOM);
  const arena = arenaRoom.arena;
  arena.setHordeSize(0);
  const own = arena.players[0];
  await until(() => own.loadout.weapons.primary.id === 'vx-13', 'gespeichertes Loadout in der Arena');
  own.protectedUntil = Infinity;
  const packets = [];
  const broadcast = arenaRoom.broadcast.bind(arenaRoom);
  arenaRoom.broadcast = (type, message, ...rest) => {
    if (type === 'shot') packets.push(message);
    return broadcast(type, message, ...rest);
  };
  await delay(1500);
  await shot(arenaPage, '06-arena-hud');
  await arenaPage.mouse.down();
  await until(() => packets.some((packet) => packet.shooter === own.id), 'Schrotschuss');
  await arenaPage.mouse.up();
  await delay(60);
  await shot(arenaPage, '07-arena-pellets');
  const fired = packets.find((packet) => packet.shooter === own.id);
  report.shot = { pellets: 1 + (fired.pellets?.length ?? 0), impacts: [fired, ...(fired.pellets ?? [])].filter((ray) => ray.impact).length,
    ammo: own.ammo, sound: own.loadout.weapons.primary.sounds.fire };
  await delay(800);
  await arenaPage.keyboard.press('KeyR');
  await until(() => own.reload.phase === 'SHELL_LOADING' || own.reload.phase === 'SHELL_INSERTION', 'Einzelpatronen-Nachladen');
  await delay(200);
  await shot(arenaPage, '08-arena-shell-reload');
  await until(() => own.reload.phase === 'READY', 'Nachladen beendet', 8000);
  report.reload = { ammo: own.ammo, reserve: own.equipment.magazines.primary };
  await shot(arenaPage, '09-arena-reloaded');
  // Aimed close-up: model, then a shot with its pellet tracers and the pump.
  await arenaPage.mouse.down({ button: 'right' });
  await delay(700);
  await shot(arenaPage, '10-aim-cerberus');
  const before = packets.length;
  await arenaPage.mouse.down();
  await until(() => packets.length > before, 'gezielter Schuss');
  await arenaPage.mouse.up();
  await shot(arenaPage, '11-aim-fire');
  await delay(250);
  await shot(arenaPage, '12-aim-pump');
  await arenaPage.mouse.up({ button: 'right' });
  // Close crops of the held weapon: VX-13, then the standard rifle for comparison.
  const crop = { x: 380, y: 400, width: 260, height: 200 };
  await delay(900);
  await arenaPage.screenshot({ path: join(output, '13-crop-cerberus.png'), clip: crop });
  arena.setLoadout(own.id, { ...own.loadout.selection, primaryWeaponId: 'kestrel-ar-01' });
  await delay(900);
  await arenaPage.screenshot({ path: join(output, '14-crop-kestrel.png'), clip: crop });
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

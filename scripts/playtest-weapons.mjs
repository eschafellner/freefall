// Browser check of releases 8.2A/8.2B: MP-99, Viktor 55 and Kaibal 50 in the Carrier loadout menu and in the arena
// (fire, reload incl. charging-handle rack and break action, close-up crops). PLAYWRIGHT_MODULE=… node
// --conditions=development scripts/playtest-weapons.mjs [outputDir]
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { ARENA_ROOM, BODENBRUCH_ROOM, UNLOCKS } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-weapons-'));
const outDir = await mkdtemp(join(tmpdir(), 'freefall-weapons-dist-'));
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
  const missionRoom = await roomOf(BODENBRUCH_ROOM);
  const mission = missionRoom.arena;
  // All three are bought in the Arsenal (level 5 / 7 / 8). Grant them like `admin.js grant` would.
  await until(() => missionRoom.operators.size > 0, 'Account im Raum');
  const [account] = missionRoom.operators.values();
  const smgs = ['weapon.mp-99', 'weapon.viktor-55', 'weapon.kaibal-50'];
  assert.deepEqual(store.grantUnlocks(account.id, smgs.map((id) => UNLOCKS.byId.get(id)), 'admin'), smgs);
  await until(() => mission.players[0], 'Operator');
  const operator = mission.players[0];
  Object.assign(operator, { x: -16.5, z: 9, yaw: -Math.PI / 2, protectedUntil: Infinity, life: operator.life + 1 });
  clearMoves(operator);
  await page.getByText('Ausrüstung öffnen').waitFor();
  await page.keyboard.press('KeyE');
  await page.getByRole('heading', { name: 'Ausrüstung' }).waitFor();
  const primary = page.locator('.loadout-weapon', { hasText: 'Primärwaffe' }).locator('select');
  report.options = await primary.locator('option').allInnerTexts();
  await primary.selectOption('viktor-55');
  await page.getByText('Nicht übernommen').waitFor();
  await shot(page, '01-loadout-viktor-draft');
  await primary.selectOption('mp-99');
  await shot(page, '02-loadout-mp99-draft');
  await page.getByRole('button', { name: 'Ausrüstung übernehmen' }).click();
  await until(() => operator.loadout.weapons.primary.id === 'mp-99', 'Loadout am Server');
  await page.getByRole('button', { name: 'Zurück an Deck' }).click();
  await delay(600);
  Object.assign(operator, { x: 0, z: 10, yaw: Math.PI * .85, life: operator.life + 1 });
  clearMoves(operator);
  await delay(1500);
  await shot(page, '03-carrier-mp99');

  // Arena: the stored loadout is restored on join.
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
  await until(() => own.loadout.weapons.primary.id === 'mp-99', 'gespeichertes Loadout in der Arena');
  own.protectedUntil = Infinity;
  const packets = [];
  const broadcast = arenaRoom.broadcast.bind(arenaRoom);
  arenaRoom.broadcast = (type, message, ...rest) => {
    if (type === 'shot') packets.push(message);
    return broadcast(type, message, ...rest);
  };
  const crop = { x: 380, y: 400, width: 260, height: 200 };
  for (const id of ['mp-99', 'viktor-55', 'kaibal-50']) {
    if (own.loadout.weapons.primary.id !== id) arena.setLoadout(own.id, { ...own.loadout.selection, primaryWeaponId: id });
    await delay(1200);
    await shot(arenaPage, id + '-1-hud');
    await arenaPage.mouse.down({ button: 'right' });
    await delay(700);
    await arenaPage.screenshot({ path: join(output, id + '-2-crop-aim.png'), clip: crop });
    // One second of sustained fire.
    const before = packets.filter((packet) => packet.shooter === own.id).length;
    const ammo = own.ammo;
    await arenaPage.mouse.down();
    await delay(1000);
    await shot(arenaPage, id + '-3-burst');
    await arenaPage.mouse.up();
    await arenaPage.mouse.up({ button: 'right' });
    const shots = packets.filter((packet) => packet.shooter === own.id).length - before;
    await delay(600);
    // At 1100 rounds/min the screenshot can outlast the magazine; the automatic reload then already ran.
    await until(() => own.reload.phase === 'READY', 'automatisches Nachladen', 8000);
    if (own.ammo >= own.loadout.weapons.primary.capacity) own.ammo = Math.max(0, own.ammo - 5);
    await arenaPage.keyboard.press('KeyR');
    await until(() => own.reload.phase !== 'READY', 'Nachladen');
    const started = performance.now();
    const weapon = own.loadout.weapons.primary;
    // Mid-reload crops: magazine out (Kaibal: barrels open, rounds in hand), then the MP-99 rack / closing barrels.
    for (const [name, at] of [['4-magazine-out', weapon.reloadTimeline.removalAt + .1], ['5-rack', .72]]) {
      const wait = at * weapon.reloadSeconds * 1000 - (performance.now() - started);
      if (wait > 0) await delay(wait);
      await arenaPage.screenshot({ path: join(output, id + '-' + name + '.png'), clip: crop });
    }
    await until(() => own.reload.phase === 'READY', 'Nachladen beendet', 8000);
    // Cadence and reload timing are exact in apps/server/test/smg-loadout.test.ts; SwiftShader screenshots stall the
    // browser, so the burst here only proves that the weapon fires, reloads and plays its own sound profile.
    report[id] = { fired: shots > 0, ammoBefore: ammo, ammo: own.ammo, reserve: own.equipment.magazines.primary, sound: weapon.sounds.fire };
  }
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

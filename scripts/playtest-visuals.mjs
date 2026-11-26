// Visual check of the environment and the swarm: ground, props, Schaben, warrior castes and the assault breaker on each
// generated planet (quality High).
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-visuals.mjs [outputDir] [planets,comma,separated]
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { build, preview } from 'vite';
import { BODENBRUCH_ROOM, PROCEDURAL_CONTRACT_ID } from '@freefall/shared';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';
import { startServer } from '../apps/server/src/server.ts';
import { AccountService } from '../apps/server/src/accounts/AccountService.ts';
import { AccountStore } from '../apps/server/src/accounts/AccountStore.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-visuals-'));
const planets = (process.argv[3] ?? 'green-plains,desert,ice,forest').split(',');
const outDir = await mkdtemp(join(tmpdir(), 'freefall-visuals-dist-'));
console.log('Aufnahmen', output);
const store = new AccountStore(':memory:');
const server = await startServer(0, '127.0.0.1', false, { accounts: new AccountService(store) });
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const report = { planets: {} };
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
  const site = 'http://127.0.0.1:' + web.httpServer.address().port;
  for (const [n, planetId] of planets.entries()) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => localStorage.setItem('freefall.graphicsQuality', 'high'));
    const errors = [];
    const page = await context.newPage();
    current = page;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
    const shot = async (name) => { await page.screenshot({ path: join(output, planetId + '-' + name + '.png') }); console.log('shot', planetId, name); };
    await page.goto(site);
    await page.getByLabel('Operatorname').fill('Visual' + n);
    await page.getByLabel('Passwort').fill('geheimes-passwort-1');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.getByRole('button', { name: 'Operator anlegen' }).click();
    await page.getByRole('button', { name: 'Weiter zur Einsatzleitstelle' }).click();
    const known = new Set((await matchMaker.query({ name: BODENBRUCH_ROOM })).map(({ roomId }) => roomId));
    await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
    let found;
    await until(async () => (found = (await matchMaker.query({ name: BODENBRUCH_ROOM })).find(({ roomId }) => !known.has(roomId))), 'Raum');
    const mission = matchMaker.getLocalRoomById(found.roomId).arena;
    await until(() => mission.players[0], 'Operator');
    const operator = mission.players[0];
    Object.assign(operator, { x: 0, z: 3 });
    if (!mission.select(operator.id, { planetId, missionId: PROCEDURAL_CONTRACT_ID, difficultyId: 'normal', seed: 11, worldSeed: 4242, timeOfDay: 'day' }, true)) throw new Error('Auswahl');
    mission.debug(operator.id, 'land');
    await until(() => mission.state === 'ACTIVE_MISSION', 'Landung', 30000);
    await delay(4000);
    // Keep the squad clear of the director so only our test Schaben show up.
    mission.director.halt?.(mission.tick);
    const horde = mission.horde;
    while (horde.count) horde.despawn(horde.active[horde.count - 1]);
    const forward = () => ({ x: -Math.sin(operator.yaw), z: -Math.cos(operator.yaw) });
    const visit = async (x, z, wait = 2500) => {
      Object.assign(operator, { x, z, protectedUntil: Infinity, life: operator.life + 1 });
      clearMoves(operator);
      await delay(wait);
    };
    const spots = [[0, 3], [30, -40], [-45, 25]];
    for (const [i, [x, z]] of spots.entries()) {
      await visit(x, z, 3000);
      await shot('view' + (i + 1));
    }
    // Swarm nest in front of the operator.
    const nest = [...(mission.director.nests?.active?.values() ?? [])][0];
    if (nest) {
      const f = forward();
      await visit(nest.x - f.x * 13, nest.z - f.z * 13, 3000);
      await shot('nest');
    }
    // Close-up of a few Schaben in front of the operator.
    await visit(0, 3, 1000);
    const f = forward();
    for (const [side, ahead] of [[1.1, 1.6], [-1.6, 5], [1.8, 6.5], [-.5, 10]]) {
      horde.spawn(operator.x + f.x * ahead - f.z * side, operator.z + f.z * ahead + f.x * side, 0);
    }
    await delay(900);
    await shot('schaben');
    await page.screenshot({ path: join(output, planetId + '-schaben-nah.png'), clip: { x: 400, y: 330, width: 480, height: 200 } });
    await delay(1500);
    await shot('schaben2');
    // Warrior castes: a Jäger (type 1) and a Durchbruchskäfer (type 2) facing the operator.
    while (horde.count) horde.despawn(horde.active[horde.count - 1]);
    for (const [side, ahead, type] of [[-2.2, 5.5, 1], [2.4, 8, 2], [-.4, 12, 1]]) {
      const x = operator.x + f.x * ahead - f.z * side, z = operator.z + f.z * ahead + f.x * side;
      const slot = horde.spawn(x, z, type);
      horde.yaw[slot] = Math.atan2(operator.x - x, -(operator.z - z));
    }
    await delay(900);
    await shot('krieger');
    await delay(1600);
    await shot('krieger2');
    // The assault breaker (type 3) facing the operator, then turned side-on.
    while (horde.count) horde.despawn(horde.active[horde.count - 1]);
    {
      const x = operator.x + f.x * 13, z = operator.z + f.z * 13;
      const slot = horde.spawn(x, z, 3);
      horde.yaw[slot] = Math.atan2(operator.x - x, -(operator.z - z));
      await delay(1200);
      await shot('assaultbreaker');
      horde.yaw[slot] += Math.PI / 2;
      await delay(1200);
      await shot('assaultbreaker-seite');
    }
    report.planets[planetId] = { errors: errors.slice(0, 10), enemies: horde.count };
    await context.close();
  }
  console.log(JSON.stringify(report, null, 1));
} catch (error) {
  console.error('Abbruch:', error);
  await current?.screenshot({ path: join(output, 'zz-abort.png') }).catch(() => {});
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(0);
}

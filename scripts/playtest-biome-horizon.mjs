// Phase A biome review: horizon backdrop and macro ground colour on all four planets.
// PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-biome-horizon.mjs [outDir]
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { WORLD_GENERATOR_VERSION, generateWorld, groundHeight, openGround } from '@freefall/shared';
import { detailClearances } from '../apps/client/src/rendering/environment/EnvironmentDetailPlacement.ts';
import { placeWarTraces } from '../apps/client/src/rendering/environment/WarTracePlacement.ts';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const quality = process.env.FREEFALL_QUALITY ?? 'medium';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'freefall-biome-'));
await mkdir(output, { recursive: true });
const outDir = await mkdtemp(join(tmpdir(), 'freefall-biome-dist-'));
console.log('Aufnahmen', output);
process.env.FREEFALL_MISSION_DEBUG = '1';
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
  for (const [planet, seed] of [['green-plains', 17], ['desert', 31], ['ice', 48], ['forest', 63]]) {
    if (process.env.FREEFALL_VISUAL_PLANET && process.env.FREEFALL_VISUAL_PLANET !== planet) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
    await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
    await page.getByLabel('Grafikqualität').selectOption(quality);
    await page.getByRole('button', { name: 'Raum erstellen' }).click();
    const enter = async (name) => {
      await page.getByRole('button', { name }).focus();
      await page.keyboard.press('Enter');
      await page.locator('.in-game').waitFor();
    };
    await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
    const room = matchMaker.getLocalRoomById(await page.locator('.room strong').innerText());
    const { arena: mission } = room;
    const operator = mission.players[0];
    await enter('Carrier betreten');
    Object.assign(operator, { x: 0, z: 3, life: operator.life + 1 });
    await page.getByText('Missionskonsole öffnen').waitFor();
    await page.keyboard.press('KeyE');
    await page.getByRole('heading', { name: 'Einsatzplanung' }).waitFor();
    await page.getByRole('combobox').filter({ has: page.locator(`option[value="${planet}"]`) }).selectOption(planet);
    await page.getByLabel('Welt-Seed', { exact: true }).fill(String(seed));
    await page.getByLabel('Vorlage').selectOption('relay-defense');
    await page.getByLabel('Missions-Seed', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Neuen Auftrag erzeugen' }).click();
    await page.getByText(`Welt-Seed ${seed} · Weltgenerator v${WORLD_GENERATOR_VERSION}`, { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
    await until(() => mission.state === 'BOARDING', 'Boarding');
    mission.debug(operator.id, 'land');
    const { world } = mission.definition;
    const free = (x, z) => {
      for (let r = 0; r < 60; r += 2) for (let a = 0; a < 8; a++) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (Math.abs(px) < world.half - 3 && Math.abs(pz) < world.half - 3 && openGround(world, px, pz, 2)) return [px, pz];
      }
      return [x, z];
    };
    // Facing (dirX, dirZ) in world XZ.
    const place = async (name, x, z, dirX, dirZ, target) => {
      [x, z] = free(x, z);
      if (target) [dirX, dirZ] = [target.x - x, target.z - z];
      Object.assign(operator, { x, z, yaw: Math.atan2(dirX, -dirZ), y: groundHeight(world, x, z), protectedUntil: Infinity,
        life: operator.life + 1 });
      if (!(await page.locator('.in-game').count())) await enter('Einsatz betreten');
      await delay(900);
      await page.screenshot({ path: join(output, planet + '-' + name + '.png') });
      if (process.env.FREEFALL_VISUAL_DEBUG) console.log(name, Math.round(x), Math.round(z), target && JSON.stringify(target));
    };
    const h = world.half;
    await place('edge', -h + 30, 0, -1, 0);
    await place('corner', h - 40, h - 40, 1, 1);
    await place('inward', h - 20, 10, -1, 0);
    await place('center', 0, 0, .3, -1);
    // Phase D: battle site, outpost and swarm nest.
    const { relays, balloonSites } = generateWorld(planet, seed);
    // Same reservations as the client: Game.setMission plus GeneratedTerrain's interaction zones.
    const { plan } = mission;
    const zones = plan.objectives.map(({ definition }) => definition).filter(({ kind }) => kind === 'activate');
    const traces = placeWarTraces(world, detailClearances(world, [...relays, ...balloonSites, plan.extraction.albatross,
      plan.extraction.balloon, ...zones]));
    // The client keeps the view yaw of the first placement (facing -X), so stand east of the target.
    const look = async (name, target, distance) => {
      const x = Math.min(world.half - 4, target.x + distance), z = target.z;
      await place(name, x, z, -1, 0);
    };
    if (traces.sites[0]) await look('outpost', traces.sites[0], 10);
    const wreck = [...traces.solids.keys()].map((index) => world.obstacles[index])[0];
    if (wreck) await look('wreck', wreck, Math.max(wreck.halfX, wreck.halfZ) + 14);
    if (traces.sites[1]) await look('battle', traces.sites[1], 18);
    if (world.initialNests[0]) await look('nest', world.initialNests[0], 30);
    // Phase C: the named landmark formations are appended after the scattered solids.
    const formation = world.obstacles.slice(-4);
    if (formation.length) {
      const centre = { x: formation.reduce((s, o) => s + o.x, 0) / formation.length, z: formation.reduce((s, o) => s + o.z, 0) / formation.length };
      await look('landmark', centre, 26);
    }
    console.log(planet, 'Spuren', traces.props.length, 'Decals', traces.decals.length, 'Wracks', traces.solids.size);
    if (errors.length) console.log(planet, 'Fehler', errors);
    await page.close();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false).catch(() => {});
  process.exit(process.exitCode ?? 0);
}

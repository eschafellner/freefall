import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { BALLOON, NET, SCHABE_TYPE, groundHeight, missionGround, openGround, terrainVertex } from '@freefall/shared';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const weatherPlaytest = process.env.FREEFALL_WEATHER_PLAYTEST === '1';
const finalQA = process.env.FREEFALL_FINAL_QA === '1';
const cyclePlanet = process.env.FREEFALL_CYCLE_PLANET;
const width = Number(process.env.FREEFALL_BROWSER_WIDTH ?? 1280);
const height = Number(process.env.FREEFALL_BROWSER_HEIGHT ?? 720);
const output = await mkdtemp(join(tmpdir(), 'freefall-atmosphere-'));
const outDir = join(output, 'dist');
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
  console.log('Chromium', browser.version(), angle);

  for (const [planet, seed, landmark, time, initial, effect, alternate] of [
    ['green-plains', 17, 'rock', 'overcast-day', 'clear', 'windy', 'light-mist'],
    ['desert', 31, 'arch-span', 'day', 'dry-clear', 'light-dust-gusts', 'dust-haze'],
    ['ice', 48, 'ice', 'dusk', 'clear-cold', 'windy-snow', 'light-snow'],
    ['forest', 63, 'tree', 'dawn', 'forest-calm', 'ground-mist', 'windy-forest'],
  ]) {
    if (process.env.FREEFALL_VISUAL_PLANET && process.env.FREEFALL_VISUAL_PLANET !== planet) continue;
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    let quality = 'medium';
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
    if (weatherPlaytest) await page.getByLabel('Tageszeit', { exact: true }).selectOption(time);
    await page.getByLabel('Welt-Seed', { exact: true }).fill(String(seed));
    await page.getByLabel('Vorlage').selectOption('relay-defense');
    await page.getByLabel('Missions-Seed', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Neuen Auftrag erzeugen' }).click();
    await page.getByText(`Welt-Seed ${seed} · Weltgenerator v1`, { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
    await until(() => mission.state === 'BOARDING', 'Boarding');
    const started = performance.now();
    if (planet === 'forest' || finalQA) {
      await enter('Carrier betreten');
      assert.ok(mission.debug(operator.id, 'deploy'));
      await until(() => mission.state === 'ACTIVE_MISSION', 'Deployment bis zur Landung');
    } else assert.ok(mission.debug(operator.id, 'land'));
    const { world } = mission.definition;
    const placeOperator = (x, z, yaw) => {
      const y = groundHeight(world, x, z);
      console.log(JSON.stringify({ planet, x, y, z, yaw }));
      Object.assign(operator, { x, z, yaw, y, protectedUntil: Infinity, life: operator.life + 1 });
      if (finalQA) clearMoves(operator);
    };
    const screenshot = async (suffix = '') => {
      const file = planet + suffix + '.png';
      if (finalQA) {
        const camera = JSON.parse(await page.locator('canvas[data-camera]').getAttribute('data-camera'));
        const { id, world, seed: missionSeed, generatorVersion } = mission.plan;
        console.log(JSON.stringify({ capture: file, camera, planet, world, missionSeed, generatorVersion, planId: id, quality,
          timeOfDay: time, tick: mission.tick, atmosphere: mission.atmosphere, enemies: mission.horde.count }));
      }
      await page.screenshot({ path: join(output, file) });
    };
    const objects = world.obstacles.filter(({ kind }) => kind === landmark);
    const nearbyTrees = ({ x, z }) => objects.filter((tree) => Math.hypot(tree.x - x, tree.z - z) < 34).length;
    const look = objects.filter(({ x, z }) => openGround(world, x + 12, z + 16, 2)).sort((a, b) => planet === 'forest'
      ? nearbyTrees(b) - nearbyTrees(a) : Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    assert.ok(look, planet);
    placeOperator(look.x + 12, look.z + 16, Math.atan2(-12, 16));
    if (!(await page.locator('.in-game').count())) await enter('Einsatz betreten');
    await page.locator('.field-objectives').getByText(mission.plan.objectives[0].definition.label).waitFor({ state: 'attached' });
    await delay(450);
    if (weatherPlaytest) {
      assert.equal(mission.atmosphere.timeOfDay, time);
      const set = async (id) => {
        assert.ok(mission.debug(operator.id, `weather:${id}`));
        await until(() => mission.atmosphere?.current.weather === id && !mission.atmosphere.target, id + ' settled');
        await delay(330);
      };
      await set(initial);
      await screenshot('-clear');
      // The transition itself is observed before waiting for its stable endpoint.
      assert.ok(mission.debug(operator.id, `weather:${effect}:::6`));
      assert.equal(mission.atmosphere.target.weather, effect);
      await until(() => mission.tick >= mission.atmosphere.startTick + 90, 'weather midpoint');
      await screenshot('-transition');
      await until(() => mission.atmosphere.current.weather === effect && !mission.atmosphere.target, effect);
      await screenshot();
      await delay(420);
      await screenshot('-motion');
      await set(alternate);
      await screenshot('-' + alternate);
      await set(effect);
      console.log(JSON.stringify({ planet, weather: [initial, effect, alternate], time }));
      if (finalQA) {
        await page.keyboard.press('F2');
        await page.waitForFunction((planet) => {
          const data = document.querySelector('[data-audio]')?.dataset.audio;
          if (!data) return false;
          const audio = JSON.parse(data);
          return audio.planet === planet && audio.ambience === 2;
        }, planet);
        const audio = JSON.parse(await page.locator('[data-audio]').getAttribute('data-audio'));
        assert.equal(audio.context, 'running');
        assert.equal(audio.errors, 0);
        console.log(JSON.stringify({ planet, audio }));
        await page.keyboard.press('F2');
        await page.locator('.telemetry').waitFor({ state: 'hidden' });
      }
    } else await screenshot();
    console.log(planet, 'Gelände', world.id);

    const { cells, half, step } = world.terrain;
    let ridge = { x: 0, z: 0, y: -Infinity };
    for (let j = 8; j < cells - 8; j += 4) for (let i = 8; i < cells - 8; i += 4) {
      const x = i * step - half, z = j * step - half;
      const y = terrainVertex(world.terrain, i, j);
      if (y > ridge.y && openGround(world, x, z, 2)) ridge = { x, y, z };
    }
    placeOperator(ridge.x, ridge.z, Math.atan2(-ridge.x, ridge.z));
    await delay(650);
    await screenshot('-wide');
    const relay = mission.plan.objectives[0].definition;
    placeOperator(relay.x + 3, relay.z + 6, Math.atan2(-3, 6));
    await delay(650);
    await screenshot('-relay');

    const surface = missionGround(world);
    const close = { x: look.x + 12, z: look.z + 16 };
    placeOperator(close.x, close.z, Math.atan2(-12, 16));
    await delay(650);
    await page.keyboard.press('KeyC');
    await until(() => operator.posture.current === 'CROUCHING', 'crouch');
    const pitch = (dy) => page.locator('.in-game canvas').evaluate((canvas, movementY) => {
      for (let i = 0; i < 2; i++) canvas.dispatchEvent(new MouseEvent('mousemove', { movementY }));
    }, dy);
    await pitch(120);
    await delay(600);
    await screenshot('-close-crouch');
    await page.keyboard.press('Space');
    await until(() => operator.posture.current === 'STANDING', 'crouch get-up');
    if (finalQA) {
      await delay(450);
      await screenshot('-terrain');
    }
    await pitch(-120);

    const x = world.deployment.x + 17, z = world.deployment.z;
    assert.ok(openGround(surface, x, z, 2) && openGround(surface, x + 1, z - 14, .5));
    placeOperator(x, z, 0);
    if (weatherPlaytest) {
      for (const convict of mission.convicts.members) convict.fireAt = Infinity;
    }
    const stageSchabe = () => {
      const slot = mission.horde.spawn(x + 1, z - 14, SCHABE_TYPE);
      assert.ok(slot >= 0);
      return { slot, id: mission.horde.id[slot] };
    };
    let staged = stageSchabe();
    if (finalQA) for (const dx of [-3, 4]) {
      const combatZ = [12, 13, 14, 15, 16].map((distance) => z - distance)
        .find((point) => openGround(surface, x + dx, point, .5));
      assert.ok(combatZ !== undefined && mission.horde.spawn(x + dx, combatZ, SCHABE_TYPE) >= 0);
    }
    await page.locator('.reticle').waitFor();
    await delay(420);
    await screenshot('-combat');
    for (const [key, posture] of [['KeyW', 'PRONE'], ['KeyS', 'SUPINE']]) {
      await page.keyboard.down(key);
      await page.keyboard.press('KeyX');
      await page.keyboard.up(key);
      await until(() => operator.posture.current === posture, posture);
      if (weatherPlaytest) {
        if (mission.horde.id[staged.slot] === staged.id) mission.horde.despawn(staged.slot);
        staged = stageSchabe();
      }
      await page.mouse.down({ button: 'right' });
      await delay(240);
      await page.locator('.reticle').waitFor();
      await screenshot('-' + posture.toLowerCase());
      const ammo = operator.ammo;
      await page.mouse.down();
      await until(() => operator.ammo < ammo, posture + ' firing');
      await page.mouse.up();
      await page.mouse.up({ button: 'right' });
      if (finalQA) {
        await page.keyboard.press('KeyR');
        await until(() => operator.reloadUntil > mission.tick, posture + ' reload starts');
        await until(() => !operator.reloadUntil, posture + ' reload ends');
      }
      await page.keyboard.press('Space');
      await until(() => operator.posture.current === 'STANDING', posture + ' get-up');
    }
    await page.locator('.vitals').waitFor();
    await page.locator('.readout').waitFor();
    console.log(planet, 'HUD, PRONE, SUPINE, Schussabgabe und Aufstehen geprüft');
    if (planet === 'forest' || planet === 'ice') {
      placeOperator(look.x + 12, look.z + 16, Math.atan2(-12, 16));
      for (quality of ['low', 'high']) {
        await page.evaluate(() => document.exitPointerLock());
        await page.getByLabel('Grafikqualität').selectOption(quality);
        await page.getByRole('button', { name: 'Einsatz betreten' }).click();
        await page.locator('.in-game').waitFor();
        await delay(1350);
        await screenshot('-' + quality);
      }
      console.log(planet, 'Low und High im laufenden Einsatz geprüft');
    }
    if (weatherPlaytest) {
      for (const convict of mission.convicts.members) {
        if (convict.fireAt === Infinity) convict.fireAt = mission.tick;
      }
      if (finalQA) {
        const containers = () => mission.snapshot().albatross?.supply ?? [];
        const crate = containers().find(({ state, x, z }) => state === 'READY' && openGround(surface, x, z, .45));
        assert.ok(crate, planet + ' resupply container');
        placeOperator(crate.x, crate.z, 0);
        await page.locator('.interact-hint').getByText('Nachschub aufnehmen', { exact: false }).waitFor();
        await page.keyboard.press('KeyE');
        await until(() => containers().find(({ id }) => id === crate.id)?.charges === crate.charges - 1, 'resupply completed');
        console.log(JSON.stringify({ planet, resupply: crate.id, remainingCharges: crate.charges - 1 }));
      }
      // Accelerated browser playthrough. Keep real objectives and extraction, with fixed fixture positions.
      placeOperator(relay.x, relay.z - 1, 0);
      await page.locator('.interact-hint').getByText(relay.label.replace('Kommunikationsanlage ', '')).waitFor();
      await page.keyboard.press('KeyE');
      await until(() => mission.snapshot().objectives[0].state === 'defending', 'relay activated');
      await until(() => mission.state === 'EXTRACTION_AVAILABLE', 'relay defended');
      const ship = mission.snapshot().albatross;
      const method = (planet === 'ice' || planet === 'forest' || !ship.extractionAvailable) ? 'balloon' : 'albatross';
      if (method === 'albatross') {
        placeOperator(ship.x, ship.z + 1, 0);
        await page.getByText('Albatross-Start anfordern').waitFor();
        await page.keyboard.press('KeyE');
      } else {
        const pickup = mission.plan.extraction.balloon;
        placeOperator(pickup.x, pickup.z, 0);
        await delay(400);
        await page.keyboard.press('KeyB');
      }
      await until(() => mission.snapshot().extraction?.method === method, 'extraction started');
      const extractionMs = (BALLOON.countdownTicks + BALLOON.approachTicks + BALLOON.liftTicks) * 1000 / NET.tickHz;
      await page.getByRole('heading', { name: 'Einsatz erfolgreich' }).waitFor({ timeout: extractionMs + 20_000 });
      assert.equal(mission.snapshot().result.extractionMethod, method);
      assert.ok(mission.snapshot().result.extractedOperatorIds.includes(operator.id));
      assert.equal(mission.atmosphere, undefined);
      await screenshot('-result');
      console.log(JSON.stringify({ planet, result: mission.snapshot().result.outcome, method,
        durationTicks: mission.snapshot().result.durationTicks, wallSeconds: (performance.now() - started) / 1000 }));
      if (finalQA) {
        await page.keyboard.press('F2');
        const resources = () => page.locator('.telemetry dt').filter({ hasText: 'Geometrien / Texturen' })
          .evaluate((label) => label.nextElementSibling.textContent.match(/\d+/g).map(Number));
        await page.waitForFunction(() => {
          const data = document.querySelector('[data-audio]')?.dataset.audio;
          return data && JSON.parse(data).voices === 0 && !document.querySelector('[data-atmosphere]');
        });
        const before = await resources();
        if (cyclePlanet) {
          assert.ok(cyclePlanet !== planet);
          await page.getByRole('button', { name: 'Rückkehr bestätigen' }).click();
          await until(() => mission.state === 'CARRIER_HUB', 'return to carrier');
          await enter('Carrier betreten');
          Object.assign(operator, { x: 0, y: 0, z: 3, yaw: 0, life: operator.life + 1 });
          clearMoves(operator);
          await page.getByText('Missionskonsole öffnen').waitFor();
          await page.keyboard.press('KeyE');
          await page.getByRole('heading', { name: 'Einsatzplanung' }).waitFor();
          await page.getByRole('combobox').filter({ has: page.locator(`option[value="${cyclePlanet}"]`) }).selectOption(cyclePlanet);
          await page.getByLabel('Welt-Seed', { exact: true }).fill('48');
          await page.getByLabel('Vorlage').selectOption('relay-defense');
          await page.getByLabel('Missions-Seed', { exact: true }).fill('0');
          await page.getByRole('button', { name: 'Neuen Auftrag erzeugen' }).click();
          await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
          await until(() => mission.state === 'BOARDING', 'second boarding');
          assert.ok(mission.debug(operator.id, 'land'));
          const newWorld = mission.definition.world.id;
          const { instanceId } = mission.snapshot();
          const client = room.clients.find(({ sessionId }) => sessionId === operator.id);
          client.ref.terminate();
          const connected = () => mission.snapshot().operators.find(({ id }) => id === operator.id)?.connected;
          await until(() => !connected(), 'drop at soundscape change');
          await until(() => connected(), 'reconnect at soundscape change');
          if (!(await page.locator('.in-game').count())) await enter('Einsatz betreten');
          await page.waitForFunction((planet) => {
            const data = document.querySelector('[data-audio]')?.dataset.audio;
            const atmosphere = document.querySelector('[data-atmosphere]')?.dataset.atmosphere;
            if (!data || !atmosphere) return false;
            const audio = JSON.parse(data), weather = JSON.parse(atmosphere);
            return audio.ambience === 2 && audio.planet === planet && !audio.errors && weather.planet === planet;
          }, cyclePlanet);
          assert.equal(mission.snapshot().instanceId, instanceId);
          assert.equal(mission.definition.world.id, newWorld);
          console.log(JSON.stringify({ planet, reconnectCheckpoint: 'planet-soundscape', nextPlanet: cyclePlanet, newWorld }));
          await page.evaluate(() => document.exitPointerLock());
        }
        await page.getByRole('button', { name: 'Raum verlassen' }).click();
        await page.getByRole('button', { name: 'Raum erstellen' }).waitFor();
        await page.waitForFunction((limit) => {
          const label = [...document.querySelectorAll('.telemetry dt')].find((term) => term.textContent === 'Geometrien / Texturen');
          const count = Number.parseInt(label?.nextElementSibling?.textContent ?? '', 10);
          return count > 0 && count < limit;
        }, before[0]);
        console.log(JSON.stringify({ planet, resourceExit: { before, after: await resources(), voices: 0 } }));
      }
    }
    assert.deepEqual(errors, [], planet);
    await page.close();
  }
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(outDir, { recursive: true, force: true });
}

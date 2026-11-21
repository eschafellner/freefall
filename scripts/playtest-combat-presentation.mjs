/** Reproducible browser and four-peer load probe. Local fixtures only. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { preview, build } from 'vite';
import { CAMERA_BACK, CAMERA_LIFT, CAMERA_SHOULDER, CARRIER_CONSOLE, ENEMY_TYPES, LOOK_HEIGHT, MAX_PITCH,
  NET, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE, clearGroundLine, groundHeight, impactSurface, missionGround, openGround,
  wrapAngle } from '@freefall/shared';
import { HordeManager } from '../apps/server/src/ecs/HordeManager.ts';
import { startServer } from '../apps/server/src/server.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import { UniformGrid } from '../apps/server/src/ecs/UniformGrid.ts';
import { clearMoves, createPlayer } from '../apps/server/src/simulation/Player.ts';
import { Grenades } from '../apps/server/src/systems/grenades.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'freefall-78c-'));
const output = process.argv[2] ?? directory + '-evidence';
const baseline = process.env.FREEFALL_COMBAT_BASELINE === '1';
const solo = process.env.FREEFALL_COMBAT_SOLO === '1';
const delayMs = Number(process.env.FREEFALL_COMBAT_DELAY_MS ?? 0);
const probeLoss = process.env.FREEFALL_COMBAT_DROP === '1';
const tacticalStress = process.env.FREEFALL_TACTICAL_STRESS === '1';
const liveMax = process.env.FREEFALL_COMBAT_LIVE_MAX === '1';
const steadyPopulation = process.env.FREEFALL_COMBAT_STEADY_POPULATION === '1';
const quality = process.env.FREEFALL_COMBAT_QUALITY ?? 'medium';
const sampleMs = Number(process.env.FREEFALL_COMBAT_SAMPLE_MS ?? 4500);
const matrix = (process.env.FREEFALL_COMBAT_LOAD ?? '0,100,250,500,750,1000').split(',').filter(Boolean).map(Number);
assert.ok(!steadyPopulation || (liveMax && matrix.includes(1000)), 'population replenishment requires the live 1,000-enemy probe');
const viewport = { width: Number(process.env.FREEFALL_BROWSER_WIDTH ?? 800), height: Number(process.env.FREEFALL_BROWSER_HEIGHT ?? 450) };
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const worlds = [
  ['ice', 'windy-snow', ['snow', 'ice']],
  ['desert', 'light-dust-gusts', ['sand', 'rock']],
  ['green-plains', 'clear', ['grass', 'dirt']],
  ['forest', 'ground-mist', ['forest-floor', 'wood', 'metal']],
];
await mkdir(output, { recursive: true });
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const sdk = new Client(url);
const report = { angle, viewport, quality, sampleMs, baseline, solo, delayMs, probeLoss, tacticalStress, liveMax, steadyPopulation,
  renderedClients: 1, worlds: {}, forest: [] };
const idle = { forward: 0, strafe: 0, aim: false, fire: false, sprint: false };
let web, browser;
const peers = [];
const probe = createPlayer('fixture', 0, 0);
const empty = new HordeManager();
const grid = new UniformGrid();

async function until(test, label, timeout = 20000) {
  const end = performance.now() + timeout;
  for (;;) {
    const result = await test();
    if (result) return result;
    if (performance.now() >= end) throw new Error(label + ' timed out');
    await delay(32);
  }
}

const hud = (page) => page.locator('.telemetry dt').evaluateAll((items) =>
  Object.fromEntries(items.map((label) => [label.textContent, label.nextElementSibling?.textContent])));
const combat = (stats) => (stats['Nahkampf / Treffer / Echos'] ?? '0 / 0 / 0').split(' / ').map(Number);
const visuals = (stats) => Number(stats['Granaten / Explosionen']?.match(/· (\d+) bestätigt/)?.[1] ?? 0);
const activeBlasts = (stats) => Number(stats['Granaten / Explosionen']?.match(/\/ (\d+)\//)?.[1] ?? 0);
const send = (source, extra) => source.peer.send('input', { ...idle, seq: ++source.seq, life: source.player.life,
  yaw: source.player.yaw, pitch: source.player.pitch, ...extra });

function place(player, world, point, newLife = false) {
  Object.assign(player, { x: point.x, y: groundHeight(world, point.x, point.z), z: point.z,
    yaw: point.yaw, pitch: point.pitch, protectedUntil: Infinity });
  if (newLife) player.life++;
  clearMoves(player);
}

function trial(world, x, z, yaw, pitch) {
  const vx = x - Math.sin(yaw) * 4 - Math.cos(yaw) * 1.1;
  const vz = z + Math.cos(yaw) * 4 - Math.sin(yaw) * 1.1;
  if (!openGround(world, x, z, .7) || !openGround(world, vx, vz, .7)) return;
  place(probe, world, { x, z, yaw, pitch });
  const grenades = new Grenades(), events = [];
  grenades.launch(probe, 0);
  for (let tick = 1; tick <= probe.loadout.grenade.fuseTicks; tick++) {
    grenades.update(tick, empty, grid, world, [], () => {}, { events });
  }
  const blast = events.find((event) => event.type === 'blast');
  if (!blast || Math.hypot(blast.x - x, blast.z - z) < 2) return;
  return { x, z, yaw, pitch, vx, vz, blast };
}

function range(world, material) {
  const matches = (entry) => entry && (entry.blast.contact?.surface ??
    (baseline ? impactSurface(world, entry.blast.x, entry.blast.z) : undefined)) === material;
  const props = ['metal', 'wood', 'rock', 'ice'];
  if (props.includes(material) && !baseline) {
    const kind = { metal: 'container', wood: 'tree', rock: 'rock', ice: 'ice' }[material];
    for (const obstacle of world.obstacles.filter((entry) => entry.kind === kind || entry.surface === material)) {
      for (let i = 0; i < 8; i++) {
        const yaw = wrapAngle(i * Math.PI / 4);
        const distance = 4 + Math.max(obstacle.halfX, obstacle.halfZ);
        const pos = trial(world, obstacle.x - Math.sin(yaw) * distance, obstacle.z + Math.cos(yaw) * distance, yaw, -.54);
        if (matches(pos)) return pos;
      }
    }
  }
  for (let radius = 8; radius < 190; radius += 8) {
    for (let i = 0; i < 38; i++) {
      const angle = i * 2.39996;
      const pos = trial(world, Math.sin(angle) * radius, Math.cos(angle) * radius, wrapAngle(i * .71), -.54);
      if (matches(pos)) return pos;
    }
  }
  throw new Error('No verified throw range for ' + world.planetId + '/' + material);
}

function vantage(world, point) {
  const { blast } = point;
  for (let i = 0; i < 12; i++) {
    const yaw = wrapAngle(point.yaw + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * .26);
    const x = blast.x - Math.sin(yaw) * 6;
    const z = blast.z + Math.cos(yaw) * 6;
    if (openGround(world, x, z, .8) && openGround(world, x - Math.sin(yaw) * 4, z + Math.cos(yaw) * 4, 1)) {
      return { x, z, yaw, pitch: -.25 };
    }
  }
  return { x: point.vx, z: point.vz, yaw: point.yaw, pitch: -.25 };
}

function aimAtHorde(mission, player, world, forward) {
  const horde = mission.horde;
  let target = -1, distance = 26 ** 2;
  for (let index = 0; index < horde.count; index++) {
    const slot = horde.active[index];
    const x = horde.x[slot], z = horde.z[slot];
    if (forward !== undefined && Math.abs(wrapAngle(Math.atan2(x - player.x, player.z - z) - forward)) > .68) continue;
    const squared = (x - player.x) ** 2 + (z - player.z) ** 2;
    if (squared < distance && squared > 3 ** 2 && clearGroundLine(world, player.x, player.z, x, z)) {
      target = slot;
      distance = squared;
    }
  }
  if (target < 0) return { aim: true, yaw: player.yaw, pitch: player.pitch };
  const range = Math.sqrt(distance);
  const x = horde.x[target], z = horde.z[target];
  const y = groundHeight(world, x, z) + ENEMY_TYPES[horde.type[target]].hitHeight;
  const yaw = Math.atan2(x - player.x, player.z - z) - Math.asin(CAMERA_SHOULDER / range);
  const pitch = Math.atan2(y - player.y - LOOK_HEIGHT - CAMERA_LIFT, range + CAMERA_BACK);
  return { aim: true, yaw: wrapAngle(yaw - player.recoil.yaw), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - player.recoil.pitch)) };
}

async function aimBrowser(page, own, aim) {
  const dx = Math.round(wrapAngle(aim.yaw - own.input.yaw) / .00235);
  const dy = Math.round((own.input.pitch - aim.pitch) / .00235);
  await page.locator('canvas').evaluate((canvas, { dx, dy }) => {
    const segments = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 100);
    for (let i = 0; i < segments; i++) {
      canvas.dispatchEvent(new MouseEvent('mousemove', { movementX: dx / segments, movementY: dy / segments }));
    }
  }, { dx, dy });
}

function populationFixture(mission, world, target) {
  const { spawns, patrols } = mission.director;
  const regions = world.patrolRegions;
  let candidate = 0;
  let replenished = 0;
  return {
    get replenished() { return replenished; },
    topUp() {
      // Keep engine load steady after real kills using the normal placement and per-tick spawn budget.
      for (let check = 0; check < 48 && mission.horde.count < target && spawns.canCheckAuthored; check++) {
        const index = candidate++;
        const region = regions[index % regions.length];
        const a = index * 2.39996;
        const r = region.radius * (.4 + (index % 13) / 24);
        const position = { x: region.x + Math.cos(a) * r, z: region.z + Math.sin(a) * r };
        const slot = spawns.spawnAuthored('patrol', position, region, region.id);
        if (slot < 0) continue;
        const group = [...patrols.groups.values()].find(({ region: source }) => source.id === region.id);
        if (group) patrols.attach(group, slot);
        replenished++;
      }
    },
  };
}

async function observe(page) {
  if (!await page.locator('.in-game').count()) {
    const enter = page.getByRole('button', { name: /^(Carrier|Einsatz) betreten$/ });
    await enter.focus();
    await page.keyboard.press('Enter');
    await page.locator('.in-game').waitFor();
  }
  if (!await page.locator('.telemetry').count()) await page.keyboard.press('F2');
}

async function measure(page, room, mission, target, sources, point, world, own, traffic) {
  const targeters = target > 100 ? sources : sources.slice(0, 1);
  for (const [i, source] of targeters.entries()) {
    place(source.player, world, { ...point, x: point.x + i * 1.02 });
    source.player.ammo = source.player.loadout.weapons.primary.magazineSize;
    source.player.equipment.grenades = source.player.loadout.grenade.capacity;
  }
  place(own, world, { x: point.vx, z: point.vz, yaw: point.yaw, pitch: -.23 }, true);
  await delay(600);
  const directed = liveMax && target === 1000;
  if (directed) await aimBrowser(page, own, aimAtHorde(mission, own, world, point.yaw));
  const start = traffic.events.length, shotStart = traffic.shots;
  const hitsStart = new Map(traffic.confirmedHits);
  const shooterStart = new Map(traffic.shotsByShooter);
  const enemiesStart = mission.horde.count;
  const memoryBefore = process.memoryUsage();
  const startTicks = mission.tick, drops = room.loop.dropped;
  const cdp = await page.context().newCDPSession(page);
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  const withMissionCue = tacticalStress && target === 1000;
  let nestDestroyed = false;
  let localInputUpdate;
  let localInputError;
  const stepTimes = [];
  const population = new Map();
  const fixture = directed && steadyPopulation ? populationFixture(mission, world, target) : undefined;
  let ticksStartingAtTarget = 0;
  const step = mission.step;
  mission.step = function () {
    const start = performance.now();
    if (this.horde.count === target) ticksStartingAtTarget++;
    step.call(this);
    fixture?.topUp();
    stepTimes.push(performance.now() - start);
    const active = this.horde.count;
    population.set(active, (population.get(active) ?? 0) + 1);
  };
  let frames = 0;
  const pump = setInterval(() => {
    frames++;
    if (directed && frames % 15 === 0 && !localInputUpdate) {
      localInputUpdate = aimBrowser(page, own, aimAtHorde(mission, own, world, point.yaw))
        .catch((error) => { localInputError = error; })
        .finally(() => { localInputUpdate = undefined; });
    }
    if (withMissionCue && frames === 18) {
      own.protectedUntil = 0;
      nestDestroyed = mission.debug(own.id, 'destroy-nest');
    }
    for (const [i, source] of targeters.entries()) {
      const equipment = frames === 10 || frames === 85 ? 'grenade' : frames === 41 && i === 0 ? 'melee' : undefined;
      const aim = directed ? aimAtHorde(mission, source.player, world) : {};
      send(source, { ...aim, fire: !equipment, equipment, reload: source.player.ammo === 0 });
    }
  }, 1000 / NET.tickHz);
  const localFires = !targeters.length || target > 100;
  let sample;
  try {
    if (directed) await page.mouse.down({ button: 'right' });
    if (localFires) await page.mouse.down();
    if (!targeters.length) {
      own.equipment.grenades = own.loadout.grenade.capacity;
      await page.keyboard.press('KeyG');
    }
    sample = await page.evaluate((duration) => new Promise((resolve) => {
      const frames = [];
      const peak = { blasts: 0, smoke: 0, dust: 0, debris: 0, lights: 0, vfxMs: 0 };
      const notices = new Set();
      let damageDirections = 0;
      let confirmedMarker = false;
      function update(time) {
        frames.push(time);
        const notice = document.querySelector('.combat-notice')?.textContent;
        if (notice) notices.add(notice);
        damageDirections = Math.max(damageDirections, document.querySelectorAll('.damage-directions span:not([hidden])').length);
        confirmedMarker ||= !!document.querySelector('.reticle.hit, .reticle.kill');
        const labels = [...document.querySelectorAll('.telemetry dt')];
        const active = labels.find((term) => term.textContent === 'Granaten / Explosionen')?.nextElementSibling.textContent;
        const counts = labels.find((term) => term.textContent === 'Rauch / Staub / Splitter / Licht')?.nextElementSibling.textContent;
        const match = counts?.match(/^(\d+) \/ (\d+) \/ (\d+) \/ (\d+) · ([\d.]+)/);
        if (match) {
          peak.blasts = Math.max(peak.blasts, Number(active?.match(/\/ (\d+)\//)?.[1]));
          for (const [i, name] of ['smoke', 'dust', 'debris', 'lights', 'vfxMs'].entries()) peak[name] = Math.max(peak[name], Number(match[i + 1]));
        }
        if (time - frames[0] < duration) requestAnimationFrame(update);
        else resolve({ frames: frames.slice(1).map((time, i) => time - frames[i]), peak, notices: [...notices], damageDirections, confirmedMarker });
      }
      requestAnimationFrame(update);
    }), sampleMs);
  } finally {
    mission.step = step;
    clearInterval(pump);
    await localInputUpdate;
    if (localFires) await page.mouse.up();
    if (directed) await page.mouse.up({ button: 'right' });
    for (const source of targeters) send(source, {});
  }
  if (localInputError) throw localInputError;
  const events = traffic.events.slice(start);
  const blasts = events.filter((event) => event.type === 'blast');
  assert.ok(blasts.length >= Math.max(1, targeters.length), 'the measured interval contains the confirmed blasts');
  if (withMissionCue) {
    assert.ok(nestDestroyed, 'the server confirmed a nest destruction during the 1,000-enemy interval');
    assert.ok(sample.notices.includes('Schwarmnest zerstört'), 'the mission cue reached the active combat HUD');
  }
  const counts = [...population.keys()];
  const hits = [...traffic.confirmedHits].map(([id, count]) => [id, count - (hitsStart.get(id) ?? 0)]);
  const firingOperators = [own.id, ...sources.map(({ player }) => player.id)]
    .map((id) => (traffic.shotsByShooter.get(id) ?? 0) - (shooterStart.get(id) ?? 0));
  const result = { requestedEnemies: target, enemiesStart, enemiesEnd: mission.horde.count,
    enemiesMin: Math.min(...counts), enemiesMax: Math.max(...counts),
    ticksAtTarget: population.get(target) ?? 0, ticksStartingAtTarget, replenished: fixture?.replenished ?? 0,
    population: Object.fromEntries(population), operators: sources.length + 1,
    firingOperators, renderedOperatorHp: own.hp,
    samples: sample.frames.length, frameMs: { ...timingStats(sample.frames), median: sample.frames.slice().sort((a, b) => a - b)[Math.floor(sample.frames.length / 2)] },
    fps: sample.frames.length * 1000 / sample.frames.reduce((a, b) => a + b, 0),
    peak: sample.peak, serverStepMs: timingStats(stepTimes), measuredServerTicks: stepTimes.length,
    serverTicks: mission.tick - startTicks, droppedSteps: room.loop.dropped - drops,
    shots: traffic.shots - shotStart, blasts: blasts.length, melee: events.filter((event) => event.type === 'melee').length,
    confirmedEnemyHits: Object.fromEntries(hits), renderedOperatorHits: hits.find(([id]) => id === own.id)?.[1] ?? 0,
    enemyHits: events.filter((event) => event.type === 'enemy-hit').length, memoryBefore, memoryAfter: process.memoryUsage(), heapBefore,
    heapAfter: await cdp.send('Runtime.getHeapUsage'), hud: await hud(page),
    notices: sample.notices, damageDirections: sample.damageDirections, confirmedMarker: sample.confirmedMarker };
  await cdp.detach();
  return result;
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)),
    build: { outDir: join(directory, 'dist') }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  const address = 'http://127.0.0.1:' + web.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  report.chromium = browser.version();
  for (const [planet, weather, materials] of worlds) {
    if (process.env.FREEFALL_COMBAT_PLANET && process.env.FREEFALL_COMBAT_PLANET !== planet) continue;
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (line) => { if (line.type() === 'error') errors.push(line.text()); });
    await page.goto(address);
    report.renderer ??= await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    });
    await page.getByLabel('Grafikqualität').selectOption(quality);
    await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
    await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
    const id = await page.locator('.room strong').innerText();
    const room = matchMaker.getLocalRoomById(id);
    const mission = room.arena, own = mission.players[0];
    const traffic = { events: [], shots: 0, shotsByShooter: new Map(), confirmedHits: new Map() };
    let omitBlast = false;
    const broadcast = room.broadcast.bind(room);
    room.broadcast = (type, payload, options) => {
      if (type === 'combat') {
        traffic.events.push(...payload);
        if (omitBlast && payload.some((event) => event.type === 'blast')) {
          omitBlast = false;
          broadcast(type, payload.filter((event) => event.type !== 'blast'), options);
          return;
        }
        if (delayMs && payload.some((event) => event.type === 'blast')) {
          const delayed = payload.slice();
          setTimeout(() => broadcast(type, delayed, options), delayMs);
          return;
        }
      }
      if (type === 'shot') {
        traffic.shots++;
        traffic.shotsByShooter.set(payload.shooter, (traffic.shotsByShooter.get(payload.shooter) ?? 0) + 1);
        if (payload.impact?.kind === 'enemy') traffic.confirmedHits.set(payload.shooter, (traffic.confirmedHits.get(payload.shooter) ?? 0) + 1);
      }
      broadcast(type, payload, options);
    };
    const sources = [];
    for (let i = 0; i < (solo ? 0 : 3); i++) {
      const peer = await sdk.joinById(id);
      peers.push(peer);
      peer.onMessage('*', () => {});
      sources.push({ peer, player: mission.players.find((player) => player?.id === peer.sessionId), seq: 0, combat: [] });
      peer.onMessage('combat', (events) => sources[i].combat.push(...events));
    }
    await observe(page);
    Object.assign(own, CARRIER_CONSOLE);
    assert.ok(mission.select(own.id, { planetId: planet, missionId: PROCEDURAL_CONTRACT_ID, seed: 0, worldSeed: 76,
      templateId: 'relay-defense', difficultyId: 'freefall', timeOfDay: planet === 'forest' ? 'dawn' : 'overcast-day' }, true));
    assert.ok(mission.debug(own.id, 'land'));
    assert.ok(mission.debug(own.id, 'weather:' + weather));
    await until(() => mission.atmosphere?.current.weather === weather && !mission.atmosphere.target, planet + ' weather');
    await observe(page);
    await page.locator('.field-objectives').getByText(mission.plan.objectives[0].definition.label).waitFor();
    const world = missionGround(mission.definition.world);
    const spawn = mission.horde.spawn.bind(mission.horde);
    mission.horde.spawn = () => -1;
    while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]);
    for (const convict of mission.convicts.members) convict.fireAt = Infinity;
    const source = sources[0];
    const results = report.worlds[planet] = { weather, worldId: world.id, worldSeed: mission.plan.world.seed,
      missionSeed: mission.plan.seed, planId: mission.plan.id, surfaces: [], errors };
    if (!baseline && !solo) for (const material of materials) {
      const point = range(world, material);
      place(source.player, world, point);
      for (let i = 1; i < sources.length; i++) place(sources[i].player, world, { ...point, x: point.vx - 8 - i, z: point.vz + 8 });
      place(own, world, vantage(world, point), true);
      await delay(430);
      const old = traffic.events.length;
      const before = visuals(await hud(page));
      source.player.equipment.grenades = source.player.loadout.grenade.capacity;
      send(source, { equipment: 'grenade' });
      const released = await until(() => traffic.events.slice(old).find((event) => event.type === 'grenade-release'), 'release');
      const event = await until(() => traffic.events.slice(old).find((event) => event.type === 'blast'), 'blast');
      assert.equal(event.id, released.id);
      assert.equal(event.tick - released.tick, source.player.loadout.grenade.fuseTicks);
      assert.equal(event.contact?.surface, material, JSON.stringify({ point, event }));
      const stats = await until(async () => {
        const stats = await hud(page);
        return visuals(stats) === before + 1 && activeBlasts(stats) > 0 && stats;
      }, 'rendered ' + material);
      const file = planet + '-' + material + '.jpg';
      await page.screenshot({ path: join(output, file), quality: 86, type: 'jpeg', style: '.telemetry { visibility: hidden !important; }' });
      for (const source of sources) await until(() => source.combat.some((packet) => packet.type === 'blast' && packet.id === event.id),
        'remote detonation');
      const echoes = combat(stats)[2];
      room.broadcast('combat', [event, event]);
      await until(async () => combat(await hud(page))[2] >= echoes + 2, 'duplicate detonation');
      assert.equal(visuals(await hud(page)), before + 1);
      await until(async () => activeBlasts(await hud(page)) === 0, 'explosion cleanup');
      results.surfaces.push({ event, release: released, screenshot: file, hud: stats });
      console.log(planet, material, '#' + event.id, JSON.stringify(event.contact.normal));
    }
    if (planet === 'forest') {
      const point = range(world, 'forest-floor');
      if (!baseline && !solo) {
        place(own, world, point, true);
        for (let i = 0; i < sources.length; i++) place(sources[i].player, world, { ...point, x: point.x + 12 + i * 2, z: point.z + 12 });
        await delay(800);
        const index = traffic.events.length;
        await page.keyboard.press('KeyV');
        const miss = await until(() => traffic.events.slice(index).find((event) => event.type === 'melee' && event.attacker === own.id), 'local melee miss');
        assert.equal(miss.damage, 0);
        assert.equal(miss.contact, undefined);
        await until(async () => combat(await hud(page))[0] >= 1, 'local swing');
        assert.equal(combat(await hud(page))[1], 0);
        await delay(900);
        const dx = Math.sin(own.yaw), dz = -Math.cos(own.yaw);
        const enemy = spawn(own.x + dx, own.z + dz, SCHABE_TYPE);
        assert.ok(enemy >= 0);
        mission.horde.hp[enemy] = 1000;
        await page.keyboard.press('KeyV');
        const hit = await until(() => traffic.events.slice(index + 1).find((event) => event.type === 'melee' && event.attacker === own.id && event.damage > 0), 'local melee hit');
        assert.ok(hit.contact);
        await until(async () => combat(await hud(page))[1] === 1, 'client melee confirmation');
        room.broadcast('combat', [hit, hit]);
        await delay(320);
        assert.equal(combat(await hud(page))[1], 1);
        if (mission.horde.hp[enemy]) mission.horde.despawn(enemy);
        const last = results.surfaces.at(-1).event;
        const old = room.clients.find((client) => client.sessionId === own.id);
        old.ref.terminate();
        await until(() => room.clients.some((client) => client.sessionId === own.id && client !== old), 'browser reconnect');
        await observe(page);
        await delay(500);
        const seen = visuals(await hud(page));
        room.broadcast('combat', [last, hit]);
        await delay(400);
        assert.equal(visuals(await hud(page)), seen);
        assert.equal(combat(await hud(page))[1], 1);
        results.melee = { miss, hit, reconnected: true };

        if (probeLoss) {
          place(source.player, world, point);
          place(own, world, vantage(world, point), true);
          source.player.equipment.grenades = source.player.loadout.grenade.capacity;
          await delay(450);
          const offset = traffic.events.length;
          const confirmed = visuals(await hud(page));
          omitBlast = true;
          send(source, { equipment: 'grenade' });
          const event = await until(() => traffic.events.slice(offset).find((packet) => packet.type === 'blast'), 'omitted blast');
          await until(() => mission.tick >= event.tick + NET.tickHz, 'snapshot after omitted blast');
          assert.equal(visuals(await hud(page)), confirmed);
          assert.ok(sources.every((peer) => !peer.combat.some((packet) => packet.type === 'blast' && packet.id === event.id)));
          results.loss = { id: event.id, tick: event.tick, followingTick: mission.tick, visualsBefore: confirmed, visualsAfter: visuals(await hud(page)) };
        }
      }
      const seeds = world.patrolRegions.flatMap((region) => region.route.waypoints);
      for (const target of matrix) {
        await until(() => !mission.grenades.snapshot(), 'grenades from the previous load stage have detonated');
        let attempts = 0;
        if (liveMax && target === 1000) {
          for (const distance of [5, 8, 12, 16]) {
            const x = point.vx + Math.sin(point.yaw) * distance, z = point.vz - Math.cos(point.yaw) * distance;
            if (openGround(world, x, z, .55)) spawn(x, z, SCHABE_TYPE);
          }
        }
        while (mission.horde.count < target && attempts < target * 40) {
          const i = attempts++;
          const seed = seeds[i % seeds.length], a = i * 2.39996, radius = (i % 29) * .85;
          const local = i < Math.min(130, target);
          const x = (local ? point.x : seed.x) + Math.cos(a) * (radius + (local ? 8 : 0));
          const z = (local ? point.z : seed.z) + Math.sin(a) * (radius + (local ? 8 : 0));
          if (openGround(world, x, z, .55)) spawn(x, z, SCHABE_TYPE);
        }
        assert.equal(mission.horde.count, target);
        if (liveMax && target === 1000) {
          // Away from the deterministic impact fixture, allow Director spawns and Convict fire normally.
          mission.horde.spawn = spawn;
          for (const convict of mission.convicts.members) convict.fireAt = mission.tick;
        }
        const result = await measure(page, room, mission, target, sources, point, world, own, traffic);
        report.forest.push(result);
        console.log('forest', target, result.fps.toFixed(1), 'FPS;', result.serverStepMs.p95?.toFixed(3), 'ms server p95;', result.blasts, 'blasts');
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
    await Promise.allSettled(peers.splice(0).map((peer) => peer.leave()));
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  if (browser) await browser.close();
  await Promise.allSettled(peers.map((peer) => peer.leave()));
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(directory, { recursive: true, force: true });
}

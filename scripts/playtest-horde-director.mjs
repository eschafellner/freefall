import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { BALLOON, BODENBRUCH, MAX_ENEMIES, NET, SCHABE_TYPE, groundHeight, missionGround, openGround, weatherProgress } from '@freefall/shared';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';
import { seededRandom } from '../apps/server/src/simulation/Battlefield.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserCount = Number(process.env.FREEFALL_BROWSER_PEERS ?? 1);
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const generatedSeed = process.env.FREEFALL_GENERATED_SEED;
const planet = process.env.FREEFALL_WORLD_PLANET;
const worldSeed = process.env.FREEFALL_WORLD_SEED ?? '76';
const sampleMs = Number(process.env.FREEFALL_BROWSER_SAMPLE_MS ?? 12_000);
const operators = Number(process.env.FREEFALL_OPERATORS ?? 4);
const targets = (process.env.FREEFALL_BROWSER_ENEMIES ?? String(MAX_ENEMIES)).split(',').map(Number);
const weather = process.env.FREEFALL_WEATHER;
const timeOfDay = process.env.FREEFALL_TIME_OF_DAY;
const width = Number(process.env.FREEFALL_BROWSER_WIDTH ?? 1280);
const height = Number(process.env.FREEFALL_BROWSER_HEIGHT ?? 720);
const reducedMotion = process.env.FREEFALL_BROWSER_REDUCED_MOTION === '1';
const weatherPair = process.env.FREEFALL_BROWSER_WEATHER_PAIR === '1';
const restoreContext = process.env.FREEFALL_BROWSER_WEATHER_CONTEXT === '1';
const verifyCoop = process.env.FREEFALL_BROWSER_COOP_ACCEPTANCE === '1';
const reconnectLifecycle = process.env.FREEFALL_BROWSER_RECONNECT_LIFECYCLE === '1';
const verifyAudio = process.env.FREEFALL_BROWSER_AUDIO === '1';
const meterAudio = process.env.FREEFALL_BROWSER_AUDIO_METER === '1';
const threat = process.env.FREEFALL_BROWSER_THREAT === '1';
const soak = process.env.FREEFALL_BROWSER_SOAK === '1';
const quality = process.env.FREEFALL_BROWSER_QUALITY ?? 'medium';
const loadOnly = process.env.FREEFALL_BROWSER_LOAD_ONLY === '1';
const requireWave = process.env.FREEFALL_BROWSER_REQUIRE_WAVE !== '0';
assert.ok(Number.isInteger(browserCount) && browserCount >= 1 && browserCount <= 4);
assert.ok(Number.isInteger(operators) && operators >= browserCount && operators <= 4);
assert.ok(targets.every((count) => Number.isInteger(count) && count >= 0 && count <= MAX_ENEMIES));
assert.deepEqual([...targets].sort((a, b) => a - b), targets);
assert.ok(['low', 'medium', 'high'].includes(quality));
assert.ok(Number.isSafeInteger(sampleMs) && sampleMs >= 1000);
assert.ok(!threat || verifyAudio, 'Threat sampling requires browser audio');
assert.ok(!meterAudio || verifyAudio, 'Output metering requires browser audio');
assert.ok(!soak || (verifyAudio && browserCount === 1 && sampleMs >= 60_000), 'Soak sampling requires one audio client');
assert.ok(!reconnectLifecycle || (verifyCoop && threat && !loadOnly), 'Lifecycle sampling requires the full cooperative combat flow');
const outDir = await mkdtemp(join(tmpdir(), 'freefall-horde-browser-'));
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
const url = `http://127.0.0.1:${server.transport.server.address().port}`;
const peers = [];
const errors = [];
let web, browser;

async function until(predicate, label, timeout = 6000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Timed out: ' + label);
    await delay(40);
  }
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist',
      ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const views = [];
  const renderStats = [];
  const missionTraffic = new Map();
  async function openView() {
    const view = await browser.newPage({ viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    views.push(view);
    if (views.length === 1) view.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
      if (!Buffer.isBuffer(payload)) return;
      for (const name of ['mission-plan', 'mission-state', 'mission-events', 'atmosphere-state']) {
        if (payload[1] !== 0xa0 + name.length || payload.toString('utf8', 2, 2 + name.length) !== name) continue;
        const counter = missionTraffic.get(name) ?? { packets: 0, bytes: 0 };
        counter.packets++;
        counter.bytes += payload.byteLength;
        missionTraffic.set(name, counter);
      }
    }));
    if (meterAudio) await view.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      const counters = () => ({ windows: 0, peak: 0, sumSquares: 0, samples: 0, fullScale: 0 });
      let totals = counters();
      window.freefallMeter = (reset) => {
        const { windows, peak, samples, fullScale, sumSquares } = totals;
        if (reset) totals = counters();
        return { windows, peak, rms: Math.sqrt(sumSquares / Math.max(1, samples)), fullScale };
      };
      AudioNode.prototype.connect = function (destination, ...args) {
        const result = connect.call(this, destination, ...args);
        if (destination !== this.context.destination) return result;
        const splitter = this.context.createChannelSplitter(2);
        connect.call(this, splitter);
        const analyzers = [0, 1].map((channel) => {
          const analyzer = this.context.createAnalyser();
          analyzer.fftSize = 4096;
          connect.call(splitter, analyzer, channel);
          return analyzer;
        });
        const buffer = new Float32Array(analyzers[0].fftSize);
        window.setInterval(() => {
          if (this.context.state !== 'running') return;
          totals.windows++;
          for (const analyzer of analyzers) {
            analyzer.getFloatTimeDomainData(buffer);
            for (const value of buffer) {
              totals.peak = Math.max(totals.peak, Math.abs(value));
              totals.sumSquares += value ** 2;
              if (Math.abs(value) >= 1) totals.fullScale++;
            }
            totals.samples += buffer.length;
          }
        }, 50);
        return result;
      };
    });
    view.on('pageerror', (error) => errors.push(error.message));
    view.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
    await view.goto(`http://127.0.0.1:${web.httpServer.address().port}/${weather === 'off' ? '?weather=off' : ''}`);
    await view.getByLabel('Grafikqualität').selectOption(quality).catch(async (error) => {
      throw new Error(`Browser ${views.length} could not initialize. ${JSON.stringify(errors)}`, { cause: error });
    });
    return view;
  }
  const page = await openView();
  await page.getByRole('button', { name: 'Raum erstellen' }).click();
  const launch = page.getByRole('button', { name: 'Carrier betreten' });
  await launch.waitFor();
  const roomId = await page.locator('.room strong').innerText();
  const room = matchMaker.getLocalRoomById(roomId);
  const mission = room.arena;
  const host = mission.players[0];
  const sdk = new Client(url);
  let packets = 0, bytes = 0, minFrameCount = MAX_ENEMIES;
  const recordHorde = (packet) => {
    packets++;
    bytes += packet.byteLength;
    const frame = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    minFrameCount = Math.min(minFrameCount, frame.getUint16(4, true));
  };
  for (let i = 1; i < browserCount; i++) {
    const view = await openView();
    await view.getByLabel('Raumcode').fill(roomId);
    await view.getByRole('button', { name: 'Beitreten' }).click();
    await view.getByRole('button', { name: 'Carrier betreten' }).waitFor();
  }
  if (browserCount === operators) {
    const broadcast = room.broadcastBytes.bind(room);
    room.broadcastBytes = (name, packet, options) => {
      if (name === 'horde-wide') recordHorde(packet);
      broadcast(name, packet, options);
    };
  }
  for (let i = browserCount; i < operators; i++) {
    const guest = await sdk.joinById(roomId);
    guest.onMessage('*', () => {});
    if (i === browserCount) guest.onMessage('horde-wide', recordHorde);
    peers.push(guest);
  }
  await launch.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  if (verifyAudio) for (const view of views.slice(1)) {
    const toggle = view.getByRole('checkbox', { name: 'Audio aktiv' });
    await toggle.uncheck();
    await toggle.check();
  }
  Object.assign(host, { x: 0, z: 3 });
  if (generatedSeed === undefined) {
    assert.ok(mission.select(host.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'freefall' }));
  } else {
    host.life++;
    await page.waitForFunction(() => document.querySelector('.interact-hint')?.textContent.includes('Missionskonsole öffnen'));
    await page.keyboard.press('KeyE');
    await page.getByRole('heading', { name: 'Einsatzplanung' }).waitFor();
    if (planet) {
      await page.getByRole('combobox').filter({ has: page.locator(`option[value="${planet}"]`) }).selectOption(planet);
      await page.getByLabel('Welt-Seed', { exact: true }).fill(worldSeed);
      if (timeOfDay) await page.getByLabel('Tageszeit', { exact: true }).selectOption(timeOfDay);
    }
    await page.getByLabel('Schwierigkeit').selectOption('freefall');
    await page.getByLabel('Vorlage').selectOption('relay-defense');
    await page.getByLabel('Missions-Seed', { exact: true }).fill(generatedSeed);
    await page.getByRole('button', { name: 'Neuen Auftrag erzeugen' }).click();
    await page.getByText(`Seed ${generatedSeed} · Generator v1`, { exact: false }).waitFor();
    assert.equal(mission.plan.seed, Number(generatedSeed));
    if (planet) assert.equal(mission.plan.world.seed, Number(worldSeed));
    await page.getByRole('button', { name: 'Boarding für diesen Auftrag freigeben' }).click();
    await until(() => mission.state === 'BOARDING', 'generated boarding');
    await page.getByText(mission.plan.briefing, { exact: true }).first().waitFor();
    for (const peer of views.slice(1)) await peer.getByText(mission.plan.briefing, { exact: true }).first().waitFor();
    await launch.focus();
    await page.keyboard.press('Enter');
    await page.locator('.in-game').waitFor();
  }
  assert.ok(mission.debug(host.id, 'land'));
  if (weather && weather !== 'off') {
    assert.ok(mission.debug(host.id, `weather:${weather}`));
    await until(() => mission.atmosphere?.current.weather === weather && !mission.atmosphere.target, 'weather settled', 16000);
  }
  const world = mission.definition.world;
  const surface = missionGround(world);
  for (const player of mission.players) if (player) {
    const spawn = world.terrain ? world.patrolRegions[player.slot] : { x: -155, z: -45 };
    const x = spawn.x + (player.slot % 2) * 2, z = spawn.z + (player.slot >> 1) * 2;
    assert.ok(openGround(surface, x, z, .5));
    Object.assign(player, { x, y: groundHeight(world, x, z), z, protectedUntil: Infinity, yaw: world.terrain ? Math.atan2(x, -z) : -Math.PI / 2 });
  }
  if (!(await page.locator('.in-game').count())) {
    await page.getByRole('button', { name: 'Einsatz betreten' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('.in-game').waitFor();
  }
  if (mission.plan) await page.locator('.field-objectives').getByText(mission.plan.objectives[0].definition.label).waitFor();
  await until(() => mission.snapshot().encounter?.state === 'CALM', 'CALM');
  let wave;
  if (targets[0] > 0 && requireWave) {
    try {
      await until(() => mission.director.spawns.totals.waveSpawned > 0 || mission.debug(host.id, 'horde-wave'),
        'wave eligibility', 8000);
      await until(() => mission.director.spawns.totals.waveSpawned > 0, 'first authentic wave spawn', 12000);
      wave = { ...mission.snapshot().encounter, created: mission.director.spawns.totals.waveSpawned,
        region: mission.director.spawns.lastRegion };
    } catch (error) {
      if (!loadOnly) throw error;
      // The fixed-count render sample can run independently of the Director's live pacing gates.
      const { state, hold, pressure } = mission.director.pacing.metrics();
      wave = { skipped: error.message, state, hold, pressure };
    }
  } else if (targets[0] > 0) wave = { skipped: 'fixed-population sample selected' };
  if (world.terrain) for (const player of mission.players) if (player) {
    const candidates = world.obstacles.filter(({ kind }) => kind === 'tree');
    const tree = candidates.filter(({ x, z }) => openGround(surface, x + 8, z + 8, 1))
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    if (tree) {
      const x = tree.x + 8, z = tree.z + 8;
      Object.assign(player, { x, y: groundHeight(world, x, z), z, yaw: Math.atan2(tree.x - x, z - tree.z) });
    } else player.yaw = Math.atan2(-player.x, player.z);
    player.life++;
    clearMoves(player);
  }

  // Load fixture only. Runtime spawn caps and binary snapshots are checked independently on the server.
  // Hold the sample population steady while keeping enemy simulation active.
  for (const convict of mission.convicts.members) convict.fireAt = Infinity;
  while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]);
  const random = seededRandom(421337);
  const groups = world.patrolRegions.filter((region) => !world.terrain ||
    Math.hypot(region.x - world.deployment.x, region.z - world.deployment.z) > 107)
    .map((region) => mission.director.patrols.create(region, 0, 0));
  const fixture = new Map();
  // Prevent incidental reinforcements during each fixed-population benchmark. The AI still ticks.
  const spawn = mission.horde.spawn.bind(mission.horde);
  async function readAudio(view) {
    await view.waitForFunction(({ planet }) => {
      const payload = document.querySelector('[data-audio]')?.dataset.audio;
      if (!payload) return false;
      const audio = JSON.parse(payload);
      return audio.context === 'running' && audio.ambience === 2 && audio.planet === planet;
    }, { planet: world.planetId ?? 'green-plains' }).catch(async (error) => {
      const diagnostic = await view.evaluate(() => ({
        audio: document.querySelector('[data-audio]')?.getAttribute('data-audio'),
        weather: document.querySelector('[data-atmosphere]')?.getAttribute('data-atmosphere'),
        fault: document.querySelector('.fault')?.textContent,
      }));
      throw new Error('Audio did not settle on ' + world.planetId + ': ' + JSON.stringify(diagnostic), { cause: error });
    });
    const audio = JSON.parse(await view.locator('[data-audio]').getAttribute('data-audio'));
    assert.ok(audio.voices <= audio.budget && audio.peak <= audio.budget, JSON.stringify(audio));
    assert.ok(audio.pcmMiB <= 80 && !audio.errors, JSON.stringify(audio));
    return audio;
  }
  const telemetryWeather = (view) => view.locator('[data-atmosphere]').getAttribute('data-atmosphere').then(JSON.parse);
  async function reconnectGuest() {
    const guest = mission.players[1];
    const oldClient = room.clients.find(({ sessionId }) => sessionId === guest.id);
    const connected = () => mission.snapshot().operators.find(({ id }) => id === guest.id)?.connected;
    const { instanceId, planId } = mission.snapshot();
    assert.equal(connected(), true);
    oldClient.ref.terminate();
    await until(() => !connected(), 'guest drop');
    await until(() => connected() && room.clients.some((client) => client.sessionId === guest.id && client !== oldClient), 'guest reconnect', 15000);
    assert.equal(mission.snapshot().instanceId, instanceId);
    assert.equal(mission.snapshot().planId, planId);
    assert.equal(mission.definition.world.id, world.id);
  }
  for (const target of targets) {
    renderStats.length = 0;
    if (threat && target && !fixture.size) {
      for (const player of mission.players.filter(Boolean)) {
        for (let i = 0; i < 12 && mission.horde.count < target; i++) {
          const angle = i * Math.PI / 6;
          const x = player.x + Math.cos(angle) * 5;
          const z = player.z + Math.sin(angle) * 5;
          if (!openGround(surface, x, z, .5)) continue;
          const slot = spawn(x, z, SCHABE_TYPE);
          assert.ok(slot >= 0);
          fixture.set(slot, mission.horde.id[slot]);
        }
      }
    }
    for (let i = 0; i < MAX_ENEMIES * 20 && mission.horde.count < target; i++) {
      const group = groups[i % groups.length];
      const x = group.region.x + (random() * 2 - 1) * group.region.radius;
      const z = group.region.z + (random() * 2 - 1) * group.region.radius;
      if (!openGround(surface, x, z, .5)) continue;
      const slot = spawn(x, z, SCHABE_TYPE);
      mission.director.patrols.attach(group, slot);
      fixture.set(slot, mission.horde.id[slot]);
    }
    mission.horde.spawn = () => -1;
    assert.equal(mission.horde.count, target);
    await delay(900);
    for (const view of views) {
      await view.keyboard.press('F2');
      await view.waitForFunction((expected) => [...document.querySelectorAll('.telemetry dt')].some((label) =>
        label.textContent === 'Gegner sichtbar / aktiv' &&
        Number(label.nextElementSibling?.querySelector('span')?.textContent.replace(/[^0-9]/g, '')) === expected), target);
      renderStats.push(await view.locator('.telemetry').first().evaluate((panel) => Object.fromEntries(
        [...panel.querySelectorAll('dt')]
          .filter((term) => ['CPU / GPU', 'Draw Calls / Dreiecke', 'Meshes / Instanzen', 'Geometrien / Texturen', 'Gegner sichtbar / aktiv'].includes(term.textContent))
          .map((term) => [term.textContent, term.nextElementSibling.textContent.trim()]),
      )));
      if (verifyAudio) renderStats.at(-1).audio = await readAudio(view);
      if (weather && weather !== 'off') {
        const state = await telemetryWeather(view);
        assert.equal(state.current, weather);
        if (reducedMotion) assert.equal(state.particles, 0);
        renderStats.at(-1).weather = state;
      }
      await view.keyboard.press('F2');
      if (view === page && process.env.FREEFALL_SCREENSHOT) await page.screenshot({ path: process.env.FREEFALL_SCREENSHOT });
    }
    assert.ok(await page.locator('.in-game').count());
    if (meterAudio) await Promise.all(views.map((view) => view.evaluate(() => window.freefallMeter(true))));
    bytes = packets = 0;
    minFrameCount = target;
    const startTick = mission.tick;
    const droppedBefore = room.loop.dropped;
    const before = performance.now();
    const missionTrafficBefore = structuredClone(missionTraffic);
    const memoryBefore = process.memoryUsage();
    const objectiveTimes = [], navigationTimes = [], collisionTimes = [], weatherTimes = [], directorTimes = [];
    const beforePositions = new Map([...fixture].map(([slot]) => [slot, [mission.horde.x[slot], mission.horde.z[slot]]]));
    const attacksBefore = mission.enemyCombat.totals.operatorStarts;
    const health = new Map(mission.players.filter(Boolean).map((player) => [player, [player.hp, player.protectedUntil]]));
    mission.profileEnemyAI = true;
    const step = mission.step.bind(mission);
    mission.step = () => {
      if (threat && target) for (const [player, [hp]] of health) {
        player.hp = hp;
        player.protectedUntil = 0;
      }
      step();
      objectiveTimes.push(mission.objectiveUpdateMs);
      weatherTimes.push(mission.atmosphereUpdateMs);
      navigationTimes.push(mission.enemyAITime.navigationMs);
      collisionTimes.push(mission.enemyAITime.collisionMs);
      directorTimes.push(mission.director.pacing.updateMs);
    };
    const sampleFrames = (view, interval = sampleMs) => view.evaluate((duration) => new Promise((resolve, reject) => {
      const timestamps = [];
      const deadline = setTimeout(() => reject(new Error('Frame sampling did not finish')), duration + 15_000);
      function frame(now) {
        timestamps.push(now);
        if (now - timestamps[0] >= duration) {
          clearTimeout(deadline);
          resolve(timestamps.slice(1).map((time, i) => time - timestamps[i]));
        }
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }), interval);
    const soakSamples = [];
    let frames;
    if (soak) {
      const devtools = await page.context().newCDPSession(page);
      frames = [[]];
      await page.keyboard.press('F2');
      for (let elapsed = 0; elapsed < sampleMs;) {
        const duration = Math.min(60_000, sampleMs - elapsed);
        frames[0].push(...await sampleFrames(page, duration));
        elapsed += duration;
        const audio = await readAudio(page);
        const weather = await telemetryWeather(page);
        const memory = await devtools.send('Runtime.getHeapUsage');
        const sample = { elapsed, audio, weather, memory };
        soakSamples.push(sample);
        console.log(JSON.stringify({ soakSample: sample }));
      }
      await page.keyboard.press('F2');
      await devtools.detach();
    } else frames = await Promise.all(views.map((view) => sampleFrames(view)));
    const wallSeconds = (performance.now() - before) / 1000;
    mission.step = step;
    mission.profileEnemyAI = false;
    const audioOutput = meterAudio ? await Promise.all(views.map((view) => view.evaluate(() => window.freefallMeter(false)))) : undefined;
    if (audioOutput) assert.ok(audioOutput.every(({ windows, peak, fullScale }) => windows > 0 && peak > 0 && !fullScale), JSON.stringify(audioOutput));
    const operatorAttacks = mission.enemyCombat.totals.operatorStarts - attacksBefore;
    const movedEnemies = [...beforePositions].filter(([slot, [x, z]]) =>
      Math.hypot(mission.horde.x[slot] - x, mission.horde.z[slot] - z) > .1).length;
    if (threat && target) for (const [player, [hp, protectedUntil]] of health) Object.assign(player, { hp, protectedUntil });
    const memoryAfter = process.memoryUsage();
    const missionNetwork = Object.fromEntries([...missionTraffic].map(([name, counter]) => {
      const baseline = missionTrafficBefore.get(name) ?? { packets: 0, bytes: 0 };
      return [name, { totalPackets: counter.packets, totalBytes: counter.bytes,
        samplePackets: counter.packets - baseline.packets, sampleBytesPerSecond: (counter.bytes - baseline.bytes) / wallSeconds }];
    }));
    if (mission.plan) {
      assert.equal(missionNetwork['mission-plan']?.totalPackets, 1);
      assert.equal(missionNetwork['mission-plan'].samplePackets, 0);
      assert.ok(missionNetwork['mission-state'].samplePackets > 0);
    }
    assert.equal(mission.horde.count, target);
    assert.ok(packets > 0 && frames.every((sample) => sample.length > 1));
    assert.equal(minFrameCount, target);
    assert.deepEqual(errors, []);
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return renderer;
    });
    assert.ok(renderer, 'WebGL renderer could not be identified');
    const serverRecentTickMs = timingStats(room.times);
    const droppedSteps = room.loop.dropped - droppedBefore;
    const observedTickHz = (mission.tick - startTick) / wallSeconds;
    const measuredEnemies = mission.horde.count;
    const hordeNetwork = { packetsPerSecond: packets / wallSeconds, payloadBytesPerSecond: bytes / wallSeconds, minFrameCount };
    const loadPhase = mission.state;
    const sample = {
      chromium: browser.version(), angle, renderer, quality, viewport: page.viewportSize(),
      balanceHash: mission.balance.configHash, phase: loadPhase, wave,
      plan: mission.plan && { id: mission.plan.id, seed: mission.plan.seed, templateId: mission.plan.templateId, world: mission.plan.world },
      objectiveUpdateMs: timingStats(objectiveTimes), navigationMs: timingStats(navigationTimes),
      weatherServerMs: timingStats(weatherTimes), collisionMs: timingStats(collisionTimes), directorMs: timingStats(directorTimes),
      operatorAttacks, movedEnemies, missionNetwork, memoryBefore, memoryAfter,
      enemies: measuredEnemies, ...hordeNetwork, operators: mission.players.filter(Boolean).length, tickHz: NET.tickHz,
      renderedClients: views.length, fps: 1000 / timingStats(frames[0]).mean, frameMs: timingStats(frames[0]),
      clientFrames: frames.map((frames) => ({ frames: frames.length, fps: 1000 / timingStats(frames).mean, ...timingStats(frames) })),
      renderStats: [...renderStats], serverRecentTickMs, droppedSteps, observedTickHz,
      payloadSource: browserCount === operators ? 'Horde broadcasts per recipient' : 'Horde payload received by an SDK client',
      wallSeconds, audioOutput, errors,
    };
    if (soak) sample.soakSamples = soakSamples;
    if (threat && target) {
      assert.ok(movedEnemies > 0 && operatorAttacks > 0, JSON.stringify({ movedEnemies, operatorAttacks }));
      for (const view of views) {
        await view.keyboard.press('F2');
        await view.waitForFunction(() => Boolean(document.querySelector('[data-audio]')));
      }
      sample.combatAudio = await Promise.all(views.map(readAudio));
      assert.ok(sample.combatAudio.some((audio) => audio.windups > 0), JSON.stringify(sample.combatAudio));
      for (const view of views) await view.keyboard.press('F2');
    }
    console.log(JSON.stringify(sample, null, 2));
  }
  mission.horde.spawn = spawn;
  if (weatherPair) {
    assert.ok(weather && weather !== 'off');
    const fields = ['FPS / Frame', 'CPU / GPU', 'Draw Calls / Dreiecke', 'Geometrien / Texturen',
      'Kamera / Kollisionsrückzug', 'Kameraziel', 'Serverposition', 'Gegner sichtbar / aktiv'];
    await page.keyboard.press('F2');
    const checks = [];
    for (const active of [true, false, true]) {
      await page.waitForFunction((enabled) => Boolean(document.querySelector('[data-atmosphere]')) === enabled, active);
      const reports = [];
      for (let i = 0; i < 6; i++) {
        await delay(350);
        reports.push(await page.locator('.telemetry').evaluateAll((panels, names) => Object.fromEntries(
          panels.flatMap((panel) => [...panel.querySelectorAll('dt')])
            .filter((term) => names.includes(term.textContent))
            .map((term) => [term.textContent, term.nextElementSibling.textContent.trim()]),
        ), fields));
      }
      checks.push({ active, reports });
      if (checks.length < 3) await page.keyboard.press('F4');
    }
    await page.keyboard.press('F2');
    console.log(JSON.stringify({ pairedWeather: checks }));
  }
  if (restoreContext) {
    await page.keyboard.press('F2');
    const before = await telemetryWeather(page);
    assert.ok(before.particles > 0);
    const canvas = page.locator('.in-game canvas');
    await canvas.evaluate(async (element) => {
      const gl = element.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) throw new Error('WEBGL_lose_context is unavailable');
      const receive = (name) => new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error(`Timed out: ${name}`)), 6000);
        element.addEventListener(name, () => {
          clearTimeout(deadline);
          resolve();
        }, { once: true });
      });
      const lost = receive('webglcontextlost');
      ext.loseContext();
      await lost;
      await new Promise((resolve) => setTimeout(resolve, 350));
      const restored = receive('webglcontextrestored');
      ext.restoreContext();
      await restored;
    });
    await page.waitForFunction(() => {
      const stats = [...document.querySelectorAll('.telemetry dt')].find((label) => label.textContent === 'Draw Calls / Dreiecke');
      return Number.parseInt(stats?.nextElementSibling?.textContent ?? '0', 10) > 0;
    });
    const after = await telemetryWeather(page);
    assert.equal(after.current, before.current);
    assert.equal(after.particles, before.particles);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ contextRestored: true, weather: after.current, particles: after.particles }));
    await page.keyboard.press('F2');
  }
  if (verifyCoop) {
    assert.equal(views.length, 4);
    assert.ok(mission.plan && world.terrain);
    const guest = mission.players[1];
    await views[1].getByLabel('Grafikqualität').selectOption('low');
    await views[2].getByLabel('Grafikqualität').selectOption('high');
    if (weather && weather !== 'off') {
      const next = process.env.FREEFALL_RECONNECT_WEATHER ?? (mission.atmosphere.planetId === 'forest' ? 'windy-forest' : weather);
      const oldRevision = mission.atmosphere.revision;
      assert.ok(mission.debug(host.id, `weather:${next}:::22`));
      assert.ok(mission.atmosphere.target);
      await until(() => mission.atmosphere.revision > oldRevision, 'transition start');
    }
    const during = mission.atmosphere;
    if (reconnectLifecycle) {
      guest.protectedUntil = 0;
      await until(() => [...fixture.keys()].some((slot) => {
        const attack = mission.enemyCombat.get(mission.horde, slot);
        return attack?.player === guest && mission.tick < attack.start + mission.enemyCombat.timing.windupTicks;
      }), 'attack windup against reconnecting operator');
    }
    await reconnectGuest();
    if (reconnectLifecycle) {
      guest.protectedUntil = Infinity;
      console.log(JSON.stringify({ reconnectCheckpoint: 'enemy-windup' }));
    }
    await Promise.all(views.map((view) => view.getByLabel(mission.definition.displayName, { exact: true }).waitFor()));
    assert.equal(mission.definition.world.id, world.id);
    if (verifyAudio || weather && weather !== 'off') {
      for (const view of views) {
        if (!await view.locator('.telemetry').count()) {
          await view.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' })));
        }
      }
    }
    if (verifyAudio) {
      const audio = await Promise.all(views.map(readAudio));
      assert.ok(audio.every((client) => client.wind === (planet === 'green-plains' ? 'plains' : planet) + '-wind'));
      console.log(JSON.stringify({ reconnectAudio: audio }));
    }
    if (weather && weather !== 'off') {
      const minimum = Math.max(0, weatherProgress(during, mission.tick) - .08);
      await Promise.all(views.map((view) => view.waitForFunction(({ revision, minimum }) => {
        const payload = document.querySelector('[data-atmosphere]')?.dataset.atmosphere;
        if (!payload) return false;
        const weather = JSON.parse(payload);
        return weather.revision > revision || (weather.revision === revision && weather.progress >= minimum);
      }, { revision: during.revision, minimum })));
      const shared = await Promise.all(views.map(telemetryWeather));
      const serverProgress = weatherProgress(during, mission.tick);
      for (const state of shared) {
        assert.equal(state.seed, during.seed);
        assert.equal(state.timeOfDay, during.timeOfDay);
        assert.ok(state.revision >= during.revision);
        assert.equal(state.target ?? state.current, during.target.weather);
        assert.ok(Math.abs((state.target ? state.progress : 1) - serverProgress) < .16);
      }
      console.log(JSON.stringify({ during, serverProgress, shared }));
    }
    if (verifyAudio || weather && weather !== 'off') {
      for (const view of views) await view.keyboard.press('F2');
    }
    console.log(JSON.stringify({ reconnect: true, players: 4, world: world.id, guestQualities: ['low', 'high', 'medium'] }));
  }
  let generatedCompletion;
  if (mission.plan && !loadOnly) {
    // The artificial capacity fixture is complete. Continue on the live mission population.
    if (world.terrain) for (const [slot, id] of fixture) {
      if (mission.horde.id[slot] === id) mission.horde.despawn(slot);
    }
    if (reconnectLifecycle) {
      const guest = mission.players[1];
      const guestView = views[1];
      const container = () => mission.snapshot().albatross.supply.find(({ side }) => side === 'left');
      const { x, z, charges } = container();
      guest.equipment.magazines.primary--;
      Object.assign(guest, { x, z, y: groundHeight(world, x, z), life: guest.life + 1 });
      clearMoves(guest);
      await guestView.bringToFront();
      const enter = guestView.getByRole('button', { name: 'Einsatz betreten' });
      if (await enter.isVisible()) await enter.click();
      await guestView.locator('.interact-hint').getByText('Nachschub aufnehmen', { exact: false }).waitFor();
      await guestView.keyboard.press('KeyE');
      await until(() => guest.equipment.action === 'resupply', 'resupply starts');
      await reconnectGuest();
      assert.equal(guest.equipment.action, undefined);
      assert.equal(container().charges, charges);
      console.log(JSON.stringify({ reconnectCheckpoint: 'resupply', charges }));
      await page.bringToFront();
      if (await page.getByRole('button', { name: 'Einsatz betreten' }).isVisible()) {
        await page.getByRole('button', { name: 'Einsatz betreten' }).click();
      }
    }
    const relay = mission.plan.objectives[0].definition;
    Object.assign(host, { x: relay.x, y: groundHeight(world, relay.x, relay.z - 1), z: relay.z - 1, life: host.life + 1 });
    await page.waitForFunction((label) => document.querySelector('.interact-hint')?.textContent.includes(label),
      relay.label.replace('Kommunikationsanlage ', ''));
    await page.keyboard.press('KeyE');
    await until(() => mission.snapshot().objectives[0].state === 'defending', 'relay interaction');
    await until(() => mission.state === 'EXTRACTION_AVAILABLE', 'generated objectives complete', 14000);
    const ship = mission.snapshot().albatross;
    if (ship.extractionAvailable && !world.terrain) {
      Object.assign(host, { x: ship.x, y: 0, z: ship.z + 1, life: host.life + 1 });
      await page.waitForFunction(() => document.querySelector('.interact-hint')?.textContent.includes('Albatross-Start anfordern'));
      await page.keyboard.press('KeyE');
      await until(() => mission.snapshot().extraction?.method === 'albatross', 'Albatross countdown');
    } else {
      const pickup = mission.plan.extraction.balloon;
      for (const player of verifyCoop ? mission.players.filter(Boolean) : [host]) {
        const x = pickup.x + (player.slot % 2) * .85, z = pickup.z + (player.slot >> 1) * .85;
        Object.assign(player, { x, z, y: groundHeight(world, x, z), life: player.life + 1, protectedUntil: Infinity });
      }
      await delay(350);
      await page.keyboard.press('KeyB');
      await until(() => mission.snapshot().extraction?.method === 'balloon', 'balloon countdown');
      if (reconnectLifecycle) {
        const countdown = mission.snapshot().extraction;
        await reconnectGuest();
        assert.equal(mission.snapshot().extraction.phase, countdown.phase);
        assert.equal(mission.snapshot().extraction.endsAt, countdown.endsAt);
        console.log(JSON.stringify({ reconnectCheckpoint: 'balloon-countdown', endsAt: countdown.endsAt }));
      }
      if (verifyCoop) for (const view of views.slice(1)) {
        await view.bringToFront();
        const enter = view.getByRole('button', { name: 'Einsatz betreten' });
        if (await enter.isVisible()) await enter.click();
        await view.locator('.in-game').waitFor();
        await view.keyboard.press('KeyE');
      }
    }
    const releaseMs = (BALLOON.countdownTicks + BALLOON.approachTicks + BALLOON.liftTicks) * 1000 / NET.tickHz;
    await Promise.all(views.map((view) =>
      view.getByRole('heading', { name: 'Einsatz erfolgreich' }).waitFor({ timeout: releaseMs + 18000 })));
    const result = mission.snapshot().result;
    assert.equal(result.procedural.planId, mission.plan.id);
    if (verifyCoop) assert.equal(result.extractedOperatorIds.length, 4);
    assert.deepEqual(errors, []);
    generatedCompletion = { outcome: result.outcome, method: result.extractionMethod, extracted: result.extractedOperatorIds.length,
      durationTicks: result.durationTicks };
  }
  if (generatedCompletion) console.log(JSON.stringify({ generatedCompletion }));
} finally {
  await Promise.allSettled(peers.map((peer) => peer.leave()));
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(outDir, { recursive: true, force: true });
}

/** Local four-world impact playtest. Fixtures use the real room, hitscan, client, audio graph and renderer. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { build, preview } from 'vite';
import { CARRIER_CONSOLE, NET, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE, groundHeight, missionGround,
  openGround, resetRecoil, wrapAngle } from '@freefall/shared';
import { HordeManager } from '../apps/server/src/ecs/HordeManager.ts';
import { startServer } from '../apps/server/src/server.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import { clearMoves, createPlayer } from '../apps/server/src/simulation/Player.ts';
import { fireWeapon } from '../apps/server/src/systems/combat.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = await mkdtemp(join(tmpdir(), 'freefall-78b-'));
const output = process.argv[2] ?? temp + '-evidence';
await mkdir(output, { recursive: true });
const quality = process.env.FREEFALL_IMPACT_QUALITY ?? 'medium';
const width = Number(process.env.FREEFALL_BROWSER_WIDTH ?? 860);
const height = Number(process.env.FREEFALL_BROWSER_HEIGHT ?? 500);
const loadMatrix = (process.env.FREEFALL_IMPACT_LOAD ?? '0,100,250,500,1000').split(',').map(Number);
const sampleMs = Number(process.env.FREEFALL_IMPACT_SAMPLE_MS ?? '5500');
const planets = [
  ['ice', 'windy-snow', ['snow', 'ice', 'frozen-rock']],
  ['desert', 'light-dust-gusts', ['sand', 'dirt', 'rock']],
  ['green-plains', 'clear', ['grass', 'dirt', 'rock']],
  ['forest', 'ground-mist', ['forest-floor', 'rock', 'wood', 'metal']],
];
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const sdk = new Client(url);
let web, browser;
const peers = [];
const idle = { forward: 0, strafe: 0, aim: true, fire: false, sprint: false };
const base = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };
const empty = new HordeManager();
const probe = createPlayer('probe', 0, 0);

async function until(predicate, label, ms = 15000) {
  const end = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > end) throw new Error('Zeitlimit: ' + label);
    await delay(33);
  }
}

const hud = (page) => page.locator('.telemetry dt').evaluateAll((items) =>
  Object.fromEntries(items.map((item) => [item.textContent, item.nextElementSibling?.textContent ?? ''])));
const count = (stats, name) => parseInt(stats[name], 10) || 0;

function place(player, point, world, resetView = false) {
  const { x, z, yaw } = point;
  Object.assign(player, { x, y: groundHeight(world, x, z), z, yaw, protectedUntil: Infinity });
  if (resetView) player.life++;
  clearMoves(player);
}

function trial(surface, x, z, yaw, pitch) {
  yaw = wrapAngle(yaw);
  const vx = x - Math.sin(yaw) * 5 - Math.cos(yaw) * 1.3;
  const vz = z + Math.cos(yaw) * 5 - Math.sin(yaw) * 1.3;
  if (!openGround(surface, x, z, .6) || !openGround(surface, vx, vz, .6)) return;
  Object.assign(probe, { x, z, y: groundHeight(surface, x, z), yaw, ammo: 1, fireAt: 0, activeInput: true });
  Object.assign(probe.input, idle, { yaw, pitch, fire: true });
  resetRecoil(probe.recoil);
  const shot = fireWeapon(empty, probe, { ...base }, 1, surface);
  if (shot?.impact?.kind === 'world') return { x, z, yaw, pitch, vx, vz, shot };
}

function range(world, material) {
  const wanted = (candidate) => candidate?.shot.impact.surface === material &&
    Math.hypot(candidate.shot.toX - candidate.x, candidate.shot.toZ - candidate.z) > 2.5;
  if (material === 'metal' || material === 'wood' || material === 'rock' || material === 'ice' || material === 'frozen-rock') {
    const kind = material === 'wood' ? 'tree' : material === 'ice' ? 'ice' : 'rock';
    const props = world.obstacles.filter((prop) => material === 'metal' ? prop.surface === 'metal' : prop.kind === kind);
    for (const o of props) for (let i = 0; i < 8; i++) {
      const yaw = i * Math.PI / 4;
      const distance = 7 + Math.max(o.halfX, o.halfZ);
      const x = o.x - Math.sin(yaw) * distance - Math.cos(yaw) * .72;
      const z = o.z + Math.cos(yaw) * distance - Math.sin(yaw) * .72;
      for (const pitch of [-.13, -.06, .02, .10, -.22]) {
        const hit = trial(world, x, z, yaw, pitch);
        if (wanted(hit)) return hit;
      }
    }
  }
  for (let radius = 10; radius < 210; radius += 10) {
    for (let i = 0; i < 48; i++) {
      const a = i * 2.39996;
      const hit = trial(world, Math.sin(a) * radius, Math.cos(a) * radius, i * .71, -.41);
      if (wanted(hit)) return hit;
    }
  }
  throw new Error('No open firing position for ' + world.planetId + '/' + material);
}

async function observe(page) {
  const play = page.getByRole('button', { name: /^(Carrier|Einsatz) betreten$/ });
  if (!await page.locator('.in-game').count()) {
    await play.focus();
    await page.keyboard.press('Enter');
    await page.locator('.in-game').waitFor();
  }
  if (!await page.locator('.telemetry').count()) await page.keyboard.press('F2');
}

function input(source, point, fire) {
  source.peer.send('input', { ...idle, seq: ++source.seq, life: source.operator.life, yaw: point.yaw, pitch: point.pitch, fire });
}

function loop(sources, point) {
  for (const source of sources) input(source, point, true);
  const timer = setInterval(() => {
    for (const source of sources) input(source, point, true);
  }, 1000 / NET.tickHz);
  return () => {
    clearInterval(timer);
    for (const source of sources) input(source, point, false);
  };
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir: join(temp, 'dist') }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  const address = 'http://127.0.0.1:' + web.httpServer.address().port;
  const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const report = { chromium: browser.version(), angle, quality, sampleMs, viewport: [width, height], worlds: {}, forest: [] };
  for (const [planet, weather, materials] of planets) {
    if (process.env.FREEFALL_IMPACT_PLANET && process.env.FREEFALL_IMPACT_PLANET !== planet) continue;
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (line) => { if (line.type() === 'error') errors.push(line.text()); });
    await page.goto(address);
    report.renderer ??= await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    await page.getByLabel('Grafikqualität').selectOption(quality);
    await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
    await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
    const id = await page.locator('.room strong').innerText();
    const room = matchMaker.getLocalRoomById(id);
    const mission = room.arena;
    const own = mission.players[0];
    const packets = [];
    const sources = [];
    const watch = (name, payload) => { if (name === 'shot') packets.push(payload); };
    for (let i = 0; i < 3; i++) {
      const peer = await sdk.joinById(id);
      peers.push(peer);
      peer.onMessage('*', i === 0 ? watch : () => {});
      sources.push({ peer, operator: mission.players.find((player) => player?.id === peer.sessionId), seq: 0 });
    }
    await observe(page);
    Object.assign(own, CARRIER_CONSOLE);
    assert.ok(mission.select(own.id, { planetId: planet, missionId: PROCEDURAL_CONTRACT_ID, seed: 0, worldSeed: 76,
      templateId: 'relay-defense', difficultyId: 'freefall', timeOfDay: planet === 'forest' ? 'dawn' : 'overcast-day' }, true));
    assert.ok(mission.debug(own.id, 'land'));
    assert.ok(mission.debug(own.id, 'weather:' + weather));
    await until(() => mission.atmosphere?.current.weather === weather && !mission.atmosphere.target, planet + ' weather', 18000);
    await observe(page);
    await page.locator('.field-objectives').getByText(mission.plan.objectives[0].definition.label).waitFor();
    const world = missionGround(mission.definition.world);
    const spawn = mission.horde.spawn.bind(mission.horde);
    mission.horde.spawn = () => -1;
    while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]);
    for (const convict of mission.convicts.members) convict.fireAt = Infinity;
    const source = sources[0];
    const shots = [];
    for (const material of materials) {
      const point = range(world, material);
      const stored = { ...point, shot: undefined };
      place(source.operator, point, world);
      place(own, { x: point.vx, z: point.vz, yaw: point.yaw }, world, true);
      for (const [i, peer] of sources.slice(1).entries()) {
        place(peer.operator, { x: point.vx + 4 + i, z: point.vz + 5, yaw: point.yaw }, world);
      }
      await delay(650);
      source.operator.ammo = source.operator.loadout.weapons.primary.magazineSize;
      const before = count(await hud(page), 'Impact-Audio');
      const start = packets.length;
      const stop = loop([source], point);
      try {
        await until(async () => {
          const stats = await hud(page);
          return stats['Letzter bestätigter Impact']?.endsWith('world · ' + material) &&
            count(stats, 'Impact-Audio') > before && count(stats, 'Impact-VFX') > 0;
        }, planet + ': ' + material + ' rendered and heard');
        assert.equal(await page.locator('.reticle.hit, .reticle.kill, .reticle.ally').count(), 0);
        const packet = packets.slice(start).findLast((shot) => shot.impact?.surface === material);
        assert.ok(packet?.impact?.normal?.every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...packet.impact.normal) - 1) < 1e-7);
        const file = planet + '-' + material + '.jpg';
        await page.screenshot({ path: join(output, file), type: 'jpeg', quality: 87, style: '.telemetry { visibility: hidden !important; }' });
        shots.push({ material, point: stored, packet, screenshot: file, hud: await hud(page) });
        console.log(planet, material, JSON.stringify(packet.impact));
      } catch (error) {
        console.error(planet, material, { point, fired: packets.slice(start, start + 8), hud: await hud(page),
          state: mission.state, shooter: source.operator.hp, errors });
        throw error;
      } finally { stop(); }
      await until(async () => count(await hud(page), 'Impact-VFX') === 0, planet + ' impact cleanup');
    }
    const sample = report.worlds[planet] = { weather, worldId: world.id, shots, errors };
    await delay(450);
    const old = shots.at(-1).packet;
    const beforeReplay = await hud(page);
    room.broadcast('shot', old);
    room.broadcast('shot', old);
    await until(async () => count(await hud(page), 'Verworfene Schuss-Echos') >=
      count(beforeReplay, 'Verworfene Schuss-Echos') + 2, planet + ' replay rejected');
    const afterReplay = await hud(page);
    assert.equal(afterReplay['Impact-Audio'], beforeReplay['Impact-Audio']);
    assert.equal(afterReplay['Impact-Pool'], beforeReplay['Impact-Pool']);
    sample.replay = { before: beforeReplay, after: afterReplay };

    if (planet === 'forest') {
      if (process.env.FREEFALL_IMPACT_RECONNECT !== '0') {
        const prior = room.clients.find(({ sessionId }) => sessionId === own.id);
        prior.ref.terminate();
        await until(() => room.clients.some((client) => client.sessionId === own.id && client !== prior), 'host reconnect');
        await observe(page);
        await delay(750);
        const audio = (await hud(page))['Impact-Audio'];
        room.broadcast('shot', old);
        await delay(500);
        assert.equal((await hud(page))['Impact-Audio'], audio);
        assert.equal(count(await hud(page), 'Impact-VFX'), 0);
        sample.reconnected = true;
      }
      const point = range(world, 'forest-floor');
      const cdp = await page.context().newCDPSession(page);
      const root = world.patrolRegions.flatMap((region) => region.route.waypoints);
      for (const target of loadMatrix) {
        let enemyAttempts = 0;
        while (mission.horde.count < target && enemyAttempts < target * 50) {
          const i = enemyAttempts++;
          const seed = root[i % root.length];
          const a = i * 2.39996;
          const radius = (i % 27) * .79;
          const local = i < Math.min(140, target);
          const bearing = point.yaw + Math.sin(a) * 1.1;
          const reach = 9 + (i % 27) * 1.25;
          const x = local ? point.x + Math.sin(bearing) * reach : seed.x + Math.cos(a) * radius;
          const z = local ? point.z - Math.cos(bearing) * reach : seed.z + Math.sin(a) * radius;
          if (openGround(world, x, z, .5)) spawn(x, z, SCHABE_TYPE);
        }
        assert.equal(mission.horde.count, target);
        for (const [i, source] of sources.entries()) place(source.operator, { ...point, x: point.x + (i - 1) * 1.15 }, world);
        place(own, { x: point.vx, z: point.vz, yaw: point.yaw }, world, true);
        await delay(700);
        const statsBefore = await hud(page);
        const heapBefore = await cdp.send('Runtime.getHeapUsage');
        const packetsBefore = packets.length;
        const ticks = mission.tick;
        const dropped = room.loop.dropped;
        const active = target <= 100 ? sources.slice(0, 1) : sources;
        for (const source of active) source.operator.ammo = source.operator.loadout.weapons.primary.magazineSize;
        own.ammo = own.loadout.weapons.primary.magazineSize;
        const stop = loop(active, point);
        if (target > 100) await page.mouse.down();
        const memory = [];
        const soakStart = performance.now();
        const soak = sampleMs >= 60_000 ? setInterval(() => {
          // Replenish reserve in the local fixture so the normal reload and fire cadence continue.
          for (const operator of [own, ...active.map((source) => source.operator)]) {
            if (!operator.equipment.magazines.primary) {
              operator.equipment.magazines.primary = operator.loadout.weapons.primary.reserveMagazines;
            }
          }
          void cdp.send('Runtime.getHeapUsage').then((heap) =>
            memory.push({ ms: Math.round(performance.now() - soakStart), ...heap })).catch(() => {});
        }, 10_000) : undefined;
        try {
          const startTime = performance.now();
          const { frames, peak } = await page.evaluate((duration) => new Promise((resolve) => {
            const frames = [];
            const peak = { impacts: 0, particles: 0, cpuMs: 0 };
            const terms = [...document.querySelectorAll('.telemetry dt')];
            const row = terms.find((label) => label.textContent === 'Impact-VFX')?.nextElementSibling;
            const observer = new MutationObserver(() => {
              const values = row?.textContent.match(/^(\d+)\/\d+ · (\d+)\/\d+ Partikel · ([\d.]+) ms$/);
              if (!values) return;
              peak.impacts = Math.max(peak.impacts, Number(values[1]));
              peak.particles = Math.max(peak.particles, Number(values[2]));
              peak.cpuMs = Math.max(peak.cpuMs, Number(values[3]));
            });
            if (row) observer.observe(row, { childList: true, subtree: true, characterData: true });
            function collect(time) {
              frames.push(time);
              if (time - frames[0] >= duration) {
                observer.disconnect();
                resolve({ frames: frames.slice(1).map((value, i) => value - frames[i]), peak });
              } else requestAnimationFrame(collect);
            }
            requestAnimationFrame(collect);
          }), sampleMs);
          const impactPackets = packets.slice(packetsBefore);
          const after = await hud(page);
          assert.ok(impactPackets.some((shot) => shot.impact?.kind === 'world'), 'active impact traffic');
          assert.equal(new Set(impactPackets.map((shot) => shot.shooter)).size, target > 100 ? 4 : 1);
          report.forest.push({ enemiesStart: target, enemiesEnd: mission.horde.count, operators: target > 100 ? 4 : 1,
            samples: frames.length, peak, frameMs: timingStats(frames), fps: frames.length * 1000 / frames.reduce((sum, n) => sum + n, 0),
            serverStepMs: timingStats(room.times), serverTicks: mission.tick - ticks, droppedSteps: room.loop.dropped - dropped,
            elapsedMs: Math.round(performance.now() - startTime), shots: impactPackets.length,
            worldImpacts: impactPackets.filter((shot) => shot.impact?.kind === 'world').length,
            enemyHits: impactPackets.filter((shot) => shot.impact?.kind === 'enemy').length,
            audio: count(after, 'Impact-Audio') - count(statsBefore, 'Impact-Audio'), heapBefore,
            heapAfter: await cdp.send('Runtime.getHeapUsage'), memory, hud: after });
          console.log('forest load', JSON.stringify(report.forest.at(-1)));
          if (target === 1000) await page.screenshot({ path: join(output, 'forest-1000.jpg'), type: 'jpeg', quality: 87, style: '.telemetry { visibility: hidden !important; }' });
        } finally {
          clearInterval(soak);
          stop();
          if (target > 100) await page.mouse.up();
        }
        await until(async () => count(await hud(page), 'Impact-VFX') === 0, 'load cleanup');
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
    await Promise.all(sources.map(({ peer }) => peer.leave()));
    await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  await Promise.allSettled(peers.map((peer) => peer.leave()));
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(temp, { recursive: true, force: true });
}

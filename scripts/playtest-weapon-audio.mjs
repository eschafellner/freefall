/** Local browser/WebSocket coverage for 7.9A.1 using the regular game client. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { BALANCE, CARRIER_CONSOLE, NET, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE, groundHeight, missionGround, openGround } from '@freefall/shared';
import { build, preview } from 'vite';
import { WEAPON_ASSET_IDS } from '../apps/client/src/audio/WeaponAudioCatalog.ts';
import { startServer } from '../apps/server/src/server.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import { clearMoves } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const angle = process.env.FREEFALL_BROWSER_ANGLE ?? 'swiftshader';
const directory = await mkdtemp(join(tmpdir(), 'freefall-79a1-'));
const cases = [
  ['green-plains', 76, 'windy', 1],
  ['desert', 31, 'light-dust-gusts', 2],
  ['ice', 48, 'windy-snow', 3],
  ['forest', 63, 'ground-mist', 4],
];
const idle = { forward: 0, strafe: 0, yaw: 0, pitch: 0, aim: true, sprint: false, fire: false };
const report = { node: process.version, cpu: cpus()[0].model, angle, balance: BALANCE.version.hash, worlds: [] };
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
const serverUrl = 'http://127.0.0.1:' + server.transport.server.address().port;
let browser, web;

async function until(check, detail, timeout = 12_000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (performance.now() >= deadline) throw new Error('Timed out: ' + detail);
    await delay(35);
  }
}

function send(peer, extra) {
  peer.room.send('input', { ...idle, ...extra, life: peer.player.life, seq: ++peer.seq });
}

function trigger(page, fire) {
  return page.evaluate((pressed) => window.dispatchEvent(new MouseEvent(pressed ? 'mousedown' : 'mouseup', { button: 0 })), fire);
}

async function enter(page) {
  if (await page.locator('.in-game').count()) return;
  const entry = page.getByRole('button', { name: /Carrier betreten|Einsatz betreten/ });
  await entry.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
}

async function audio(page) {
  return page.evaluate(() => JSON.parse(document.querySelector('[data-audio]')?.dataset.audio || 'null'));
}

async function measure(page, milliseconds) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const first = performance.now();
    const frames = [];
    let previous;
    function sample(at) {
      if (previous !== undefined) frames.push(at - previous);
      previous = at;
      if (at - first < duration) requestAnimationFrame(sample);
      else resolve({ frames, ...window.weaponMeter(false) });
    }
    window.weaponMeter(true);
    requestAnimationFrame(sample);
  }), milliseconds);
}

try {
  process.env.VITE_FREEFALL_SERVER = serverUrl;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)),
    build: { outDir: join(directory, 'dist') }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  report.chromium = browser.version();
  const sdk = new Client(serverUrl);
  for (const [planet, worldSeed, weather, operators] of cases) {
    if (process.env.FREEFALL_WEAPON_AUDIO_PLANET && process.env.FREEFALL_WEAPON_AUDIO_PLANET !== planet) continue;
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    const peers = [];
    const downloads = new Set();
    let inputs;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()); });
    page.on('response', (response) => {
      if (response.ok()) downloads.add(new URL(response.url()).pathname.split('/').at(-1));
    });
    await page.addInitScript(() => {
      const create = AudioContext.prototype.createBufferSource;
      const connect = AudioNode.prototype.connect;
      const empty = () => ({ sources: 0, windows: 0, peak: 0, fullScale: 0 });
      let measurements = empty();
      window.weaponMeter = (reset) => {
        const current = measurements;
        if (reset) measurements = empty();
        return current;
      };
      AudioContext.prototype.createBufferSource = function () {
        measurements.sources++;
        return create.call(this);
      };
      AudioNode.prototype.connect = function (destination, ...args) {
        const result = connect.call(this, destination, ...args);
        if (destination !== this.context.destination) return result;
        const analyzer = this.context.createAnalyser();
        analyzer.fftSize = 2048;
        connect.call(this, analyzer);
        const buffer = new Float32Array(analyzer.fftSize);
        window.setInterval(() => {
          if (this.context.state !== 'running') return;
          analyzer.getFloatTimeDomainData(buffer);
          measurements.windows++;
          for (const sample of buffer) {
            const level = Math.abs(sample);
            measurements.peak = Math.max(measurements.peak, level);
            if (level >= 1) measurements.fullScale++;
          }
        }, 32);
        return result;
      };
    });
    try {
      await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
      report.renderer ??= await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      await page.getByLabel('Grafikqualität').selectOption('medium');
      await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
      await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
      const roomId = await page.locator('.room strong').innerText();
      const room = matchMaker.getLocalRoomById(roomId);
      const mission = room.arena;
      const own = mission.players[0];
      for (let i = 1; i < operators; i++) {
        const guest = await sdk.joinById(roomId);
        guest.onMessage('*', () => {});
        peers.push({ room: guest, player: mission.players.find((player) => player?.id === guest.sessionId), seq: 0 });
      }
      const shots = [];
      const broadcast = room.broadcast.bind(room);
      let delayOwnEcho = false;
      let reorderShooter;
      const queued = [];
      room.broadcast = (kind, event, options) => {
        if (kind === 'shot') {
          shots.push(event);
          if (delayOwnEcho && event.shooter === own.id) {
            setTimeout(() => broadcast(kind, event, options), 160);
            return;
          }
          if (event.shooter === reorderShooter) { queued.push(event); return; }
        }
        broadcast(kind, event, options);
      };
      await enter(page);
      Object.assign(own, CARRIER_CONSOLE);
      assert.ok(mission.select(own.id, { planetId: planet, missionId: PROCEDURAL_CONTRACT_ID, seed: 0, worldSeed,
        templateId: 'relay-defense', difficultyId: 'freefall' }, true));
      assert.ok(mission.debug(own.id, 'land'));
      assert.ok(mission.debug(own.id, 'weather:' + weather));
      await enter(page);
      await page.locator('.field-objectives').getByText(mission.plan.objectives[0].definition.label).waitFor({ state: 'attached' });
      if (!(await page.locator('[data-audio]').count())) await page.keyboard.press('F2');
      const world = missionGround(mission.definition.world);
      const center = mission.definition.world.patrolRegions[0];
      const spot = (serial, min, spread) => {
        for (let i = serial; i < serial + 150; i++) {
          const radius = min + i * 3.13 % spread;
          const x = center.x + Math.cos(i * 2.39996) * radius;
          const z = center.z + Math.sin(i * 2.39996) * radius;
          if (openGround(world, x, z, .9)) return { x, y: groundHeight(world, x, z), z };
        }
        throw new Error('Fixture lacks open ground at ' + planet);
      };
      for (const player of mission.players.filter(Boolean)) {
        Object.assign(player, spot(player.slot * 12, 1 + player.slot * 3, 3), { protectedUntil: Infinity });
        clearMoves(player);
      }
      for (const convict of mission.convicts.members) convict.fireAt = Infinity;
      const initial = await until(async () => {
        const state = await audio(page);
        return state?.context === 'running' && state.planet === planet && state.weather === weather && !state.loading &&
          WEAPON_ASSET_IDS.every((id) => downloads.has(id + '.ogg') || downloads.has(id + '.mp3')) && state;
      }, planet + ' decoded weapon bank and weather', 22_000);

      // First exercise the regular local fire path, then replay echoes behind its snapshots.
      const originalShots = shots.length;
      await trigger(page, true);
      await until(() => shots.slice(originalShots).some((shot) => shot.shooter === own.id), 'predicted shot');
      await trigger(page, false);
      await delay(300);
      const ownShots = shots.slice(originalShots).filter((shot) => shot.shooter === own.id);
      const beforeReplay = await until(async () => {
        const state = await audio(page);
        return state?.weapon.own > initial.weapon.own && state;
      }, planet + ' local recorded fire').catch(async (error) => {
        throw new Error(JSON.stringify({ planet, ownShots: ownShots.length, initial, after: await audio(page), errors }), { cause: error });
      });
      delayOwnEcho = true;
      const delayedAt = shots.length;
      await trigger(page, true);
      await until(() => shots.slice(delayedAt).some((shot) => shot.shooter === own.id), 'shot with delayed echo');
      await trigger(page, false);
      const withDelay = await until(async () => {
        const state = await audio(page);
        return state?.weapon.own > beforeReplay.weapon.own && state;
      }, planet + ' predicted shot under delayed confirmation');
      delayOwnEcho = false;
      await delay(400);
      const beforeDuplicates = await audio(page);
      assert.ok(beforeDuplicates.weapon.own >= withDelay.weapon.own);
      for (const shot of ownShots.slice().reverse()) { broadcast('shot', shot); broadcast('shot', shot); }
      await delay(450);
      const local = await audio(page);
      assert.equal(local.weapon.own, beforeDuplicates.weapon.own, JSON.stringify({ planet, ownShots: ownShots.length, local }));
      assert.equal(local.weapon.unavailable, 0);

      if (peers.length) {
        // Two genuinely fired remote shots delivered in reverse order, with repeated echoes.
        const source = peers[0];
        reorderShooter = source.player.id;
        send(source, { fire: true });
        await until(() => queued.length >= 2, 'remote fire');
        send(source, {});
        await delay(80);
        reorderShooter = undefined;
        const expected = queued.length;
        for (const shot of queued.reverse()) { broadcast('shot', shot); broadcast('shot', shot); }
        queued.length = 0;
        const remote = await until(async () => {
          const state = await audio(page);
          return state?.weapon.remote >= local.weapon.remote + expected && state;
        }, 'remote recorded fire and echoes');
        assert.equal(remote.weapon.remote - local.weapon.remote, expected);
      }

      const beforeReload = await audio(page);
      await page.keyboard.press('KeyR');
      await until(() => own.reload.phase === 'RELOAD_COMPLETE', 'authoritative reload insertion');
      const afterReload = await until(async () => {
        const state = await audio(page);
        return state?.weapon.finish > beforeReload.weapon.finish && state;
      }, 'recorded reload completion');
      assert.equal(afterReload.weapon.remove, beforeReload.weapon.remove + 1);
      assert.equal(afterReload.weapon.insert, beforeReload.weapon.insert + 1);
      if (operators === 1) {
        await page.keyboard.press('KeyR'); // Full-magazine rejection.
        await delay(520);
        assert.equal(own.reload.phase, 'READY');
        const previousShots = shots.length;
        own.ammo = 0;
        const reserve = own.equipment.magazines.primary;
        own.equipment.magazines.primary = 0;
        await delay(180);
        await trigger(page, true);
        await delay(250);
        await trigger(page, false);
        await delay(450);
        assert.equal(shots.length, previousShots);
        assert.deepEqual((await audio(page)).weapon, afterReload.weapon);
        own.equipment.magazines.primary = reserve;
        await delay(150);
        await trigger(page, true);
        await until(() => own.reload.phase === 'RELOAD_START', 'empty automatic reload');
        await trigger(page, false);
        await until(async () => (await audio(page))?.weapon.finish === afterReload.weapon.finish + 1, 'empty reload audio');
      }

      let stress, reconnect, interrupted, lifecycle;
      if (operators === 4) {
        own.ammo -= 2; // Arrange a tactical reload without spending more time on the firing range.
        await page.keyboard.press('KeyR');
        await until(() => own.reload.phase === 'RELOAD_START', 'reload to interrupt');
        await page.keyboard.press('Digit2');
        await until(() => own.equipment.slot === 'secondary' && !own.equipment.action, 'switch during reload');
        interrupted = await until(async () => {
          const state = await audio(page);
          return state?.weapon.switch > afterReload.weapon.switch && state;
        }, 'confirmed weapon switch');
        assert.equal(interrupted.weapon.insert, afterReload.weapon.insert);
        assert.equal(interrupted.weapon.finish, afterReload.weapon.finish);
        assert.equal(own.equipment.inactiveAmmo, own.loadout.weapons.primary.magazineSize - 2);
        await page.keyboard.press('Digit1');
        await until(() => own.equipment.slot === 'primary' && !own.equipment.action, 'rifle for loading test');
        for (let i = mission.horde.count; i < 250; i++) {
          const { x, z } = spot(i * 4 + 100, 4, 23);
          assert.ok(mission.horde.spawn(x, z, SCHABE_TYPE) >= 0);
        }
        const enemiesBefore = mission.horde.count;
        const idleAudio = await measure(page, 1000);
        const begin = await audio(page);
        const start = shots.length;
        const tickBefore = mission.tick;
        const step = mission.step.bind(mission);
        const tickTimes = [];
        let minEnemies = mission.horde.count;
        mission.step = () => {
          for (const player of mission.players.filter(Boolean)) {
            player.hp = player.loadout.maxHealth;
            player.protectedUntil = 0;
          }
          const now = performance.now();
          step();
          tickTimes.push(performance.now() - now);
          minEnemies = Math.min(minEnemies, mission.horde.count);
        };
        let combat;
        try {
          inputs = setInterval(() => peers.forEach((peer) => send(peer, { fire: true })), 32);
          await trigger(page, true);
          combat = await measure(page, 2600);
        } finally {
          clearInterval(inputs);
          peers.forEach((peer) => send(peer, {}));
          await trigger(page, false);
          mission.step = step;
          for (const player of mission.players.filter(Boolean)) player.protectedUntil = Infinity;
        }
        await delay(550);
        const end = await audio(page);
        assert.ok(end.weapon.own > begin.weapon.own && end.weapon.remote > begin.weapon.remote);
        assert.ok(combat.peak > 0 && combat.fullScale === 0);
        const stressShots = shots.length - start;
        assert.ok(stressShots > 20);
        const summarize = ({ frames, ...sample }) => ({ ...sample, frames: frames.length, frameMs: timingStats(frames) });
        stress = { enemiesBefore, minEnemies, enemiesAfter: mission.horde.count, ticks: mission.tick - tickBefore, shots: stressShots,
          tickMs: timingStats(tickTimes),
          idle: summarize(idleAudio), combat: summarize(combat), begin, end };

        const old = room.clients.find((client) => client.sessionId === own.id);
        old.ref.terminate();
        await until(() => room.clients.some((client) => client.sessionId === own.id && client !== old), 'browser reconnect');
        await enter(page);
        const after = await until(async () => (await audio(page))?.context === 'running' && await audio(page), 'audio resumes after reconnect');
        broadcast('shot', ownShots.at(-1));
        await delay(650);
        const recovered = await audio(page);
        assert.equal(recovered.weapon.own, after.weapon.own);
        assert.equal(recovered.weapon.remote, after.weapon.remote);
        assert.ok(recovered.pcmMiB <= 80 && recovered.voices <= recovered.budget);
        reconnect = recovered;

        await page.evaluate(() => document.exitPointerLock());
        const toggle = page.getByRole('checkbox', { name: 'Audio aktiv' });
        await toggle.uncheck();
        const suspended = await until(async () => {
          const state = await audio(page);
          return state?.context === 'suspended' && state.voices === 0 && state;
        }, 'AudioContext suspends and drops its voices');
        await toggle.check();
        await enter(page);
        const resumed = await until(async () => {
          const state = await audio(page);
          return state?.context === 'running' && state.planet === planet && state.ambience === 2 && !state.loading && state;
        }, 'AudioContext resumes the soundscape');
        assert.deepEqual(resumed.weapon, suspended.weapon);
        lifecycle = { suspended, resumed };
      }
      assert.deepEqual(errors, []);
      report.worlds.push({ planet, worldSeed, weather, operators, initial, local, afterReload, interrupted, stress, reconnect, lifecycle });
      console.log(JSON.stringify(report.worlds.at(-1)));
    } finally {
      clearInterval(inputs);
      await page.close();
      await Promise.allSettled(peers.map((peer) => peer.room.leave()));
    }
  }
  console.log(JSON.stringify({ completed: report.worlds.length, ...report }));
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(directory, { recursive: true, force: true });
}

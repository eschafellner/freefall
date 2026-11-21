/** Local 7.8A browser smoke and combat load sample. Uses Playwright supplied by PLAYWRIGHT_MODULE. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { CAMERA_SHOULDER, NET, SCHABE_TYPE, newPosture, resetRecoil } from '@freefall/shared';
import { build, preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';
import { clearMoves, respawnPlayer } from '../apps/server/src/simulation/Player.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const outDir = await mkdtemp(join(tmpdir(), 'freefall-78a-'));
const server = await startServer(0, '127.0.0.1', false);
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const peers = [];
const errors = [];
const cases = [];
let web, browser, remoteFire;

async function until(predicate, label, ms = 8000) {
  const end = performance.now() + ms;
  while (!(await predicate())) {
    if (performance.now() > end) throw new Error('Zeitlimit: ' + label);
    await delay(30);
  }
}

try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)), build: { outDir }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  const angle = process.env.ANGLE || 'swiftshader';
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    window.frameSamples = [];
    window.requestAnimationFrame = (callback) => native((timestamp) => {
      const start = performance.now();
      callback(timestamp);
      if (window.captureFrames) window.frameSamples.push([timestamp, performance.now() - start]);
    });
  });
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await page.getByLabel('Grafikqualität').selectOption('medium');
  await page.getByRole('button', { name: 'Boreal Relay', exact: true }).click();
  await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
  const launch = page.getByRole('button', { name: 'Arena betreten' });
  await launch.waitFor();
  const id = await page.locator('.room strong').innerText();
  const room = matchMaker.getLocalRoomById(id);
  const arena = room.arena;
  arena.setHordeSize(0);
  await until(() => arena.horde.count === 0, 'freie Waffen- und Haltungsprüfung');
  const own = arena.players[0];
  own.protectedUntil = Infinity;
  const observer = new Client(url);
  const packets = [];
  const join = async () => {
    const peer = await observer.joinById(id);
    peers.push(peer);
    peer.onMessage('*', (type, packet) => { if (type === 'shot' && peer === peers[0]) packets.push(packet); });
    arena.players.find((player) => player?.id === peer.sessionId).protectedUntil = Infinity;
    return peer;
  };
  const guest = await join();
  const enter = async () => {
    await launch.focus();
    await page.keyboard.press('Enter');
    await page.locator('.in-game').waitFor();
  };
  const exit = async () => {
    await page.evaluate(() => document.exitPointerLock());
    await launch.waitFor();
  };
  await enter();
  await page.keyboard.press('F2');
  const hud = () => page.locator('.telemetry .metrics dt').evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [item.textContent, item.nextElementSibling?.textContent ?? ''])));
  const casingCount = (metrics) => Number.parseInt(metrics['Hülsen / Lauflicht'], 10);
  const flashCount = (metrics) => Number.parseInt(metrics['Waffen-VFX'], 10);
  const posture = (state) => until(() => own.posture.current === state, state);

  const burst = async (state, slot, effects = false) => {
    await posture(state);
    const start = packets.length;
    await page.mouse.down();
    try {
      await until(() => packets.slice(start).filter((packet) => packet.shooter === own.id && packet.slot === slot).length >= 2, state + ' ' + slot);
      if (effects) await until(async () => {
        const metrics = await hud();
        return casingCount(metrics) > 0 && flashCount(metrics) > 0;
      }, 'Hülsen und Mündungsfeuer', 3200);
    } finally { await page.mouse.up(); }
    const ownPackets = packets.slice(start).filter((packet) => packet.shooter === own.id);
    assert.ok(ownPackets.every((packet) => packet.slot === slot && Number.isInteger(packet.tick) && packet.life === own.life));
    cases.push({ state, slot, shots: ownPackets.length, hud: await hud() });
  };
  await burst('STANDING', 'primary', true);
  await page.keyboard.press('KeyC');
  await burst('CROUCHING', 'primary');
  await page.keyboard.press('KeyC');
  await posture('STANDING');
  await page.keyboard.press('Digit2');
  await until(() => own.equipment.slot === 'secondary' && !own.equipment.action, 'Sekundärwaffe ausgerüstet');
  await burst('STANDING', 'secondary');
  for (const [key, landing] of [['KeyW', 'PRONE'], ['KeyS', 'SUPINE']]) {
    const cooldown = Math.ceil(arena.movementBalance.diveCooldownSeconds * NET.tickHz);
    await until(() => arena.tick >= (own.posture.lastDive ?? -cooldown) + cooldown, 'Dive-Cooldown');
    Object.assign(own, { x: 0, y: 0, z: 5, yaw: 0, life: own.life + 1, posture: newPosture() });
    clearMoves(own);
    await until(() => own.activeInput && own.input.life === own.life, 'Input nach Dive-Platzierung');
    await page.keyboard.down(key);
    try {
      await page.keyboard.press('KeyX');
      await until(() => own.posture.current === 'DIVING' || own.posture.current === landing,
        `Dive zu ${landing} ab x=${own.x.toFixed(1)}, z=${own.z.toFixed(1)}`);
    } finally { await page.keyboard.up(key); }
    await burst(landing, 'secondary');
    await page.keyboard.press('Space');
    await posture('STANDING');
  }
  own.protectedUntil = Infinity;

  const miss = packets.findLast((packet) => packet.shooter === own.id && !packet.enemy && !packet.ally && !packet.nest);
  assert.ok(miss);
  room.broadcast('shot', miss);
  room.broadcast('shot', miss);
  await until(async () => Number((await hud())['Verworfene Schuss-Echos']) >= 2, 'doppelte Schüsse verworfen');
  const duplicates = Number((await hud())['Verworfene Schuss-Echos']);
  await until(async () => casingCount(await hud()) === 0, 'eigene Hülsen abgelaufen');

  const held = { forward: 0, strafe: 0, yaw: .25, pitch: -.055, aim: true, sprint: false, fire: true };
  let seq = 0;
  remoteFire = setInterval(() => guest.send('input', { ...held, seq: ++seq }), 34);
  await until(() => packets.some((packet) => packet.shooter === guest.sessionId), 'Remote-Schuss');
  await until(async () => casingCount(await hud()) > 0, 'Remote-Hülsen');
  clearInterval(remoteFire);
  guest.send('input', { ...held, seq: ++seq, fire: false });
  await until(async () => casingCount(await hud()) === 0, 'Remote-Hülsen abgelaufen');

  await exit();
  await page.getByLabel('Grafikqualität').selectOption('high');
  const settings = page.getByText('Steuerung und Kamera', { exact: true });
  const flashSetting = page.getByRole('slider', { name: 'Mündungs- und Explosionsblitze' });
  await settings.click();
  await flashSetting.press('Home');
  assert.equal(await flashSetting.inputValue(), '0');
  await settings.click();
  await enter();
  await page.keyboard.press('Digit1');
  await until(() => own.equipment.slot === 'primary' && !own.equipment.action, 'Primärwaffe für Blitztest');
  await page.mouse.down();
  await until(async () => casingCount(await hud()) > 0, 'Schuss mit deaktiviertem Blitz');
  const reduced = await hud();
  await page.mouse.up();
  assert.equal(flashCount(reduced), 0);
  assert.ok(reduced['Hülsen / Lauflicht'].endsWith('/ 0'));
  await exit();
  await settings.click();
  await flashSetting.press('End');
  assert.equal(await flashSetting.inputValue(), '100');
  await settings.click();
  await enter();
  await page.mouse.down();
  let high;
  await until(async () => {
    high = await hud();
    return flashCount(high) > 0 && high['Hülsen / Lauflicht'].endsWith('/ 1');
  }, 'Lauflicht auf hoher Grafikqualität');
  await page.mouse.up();
  await exit();
  await page.getByLabel('Grafikqualität').selectOption('medium');
  await enter();
  await page.keyboard.press('KeyR');
  await until(() => own.ammo === own.loadout.weapons.primary.magazineSize, 'volles Magazin für Lastprobe');

  await join();
  await join();
  arena.setHordeSize(1000);
  await until(() => arena.horde.count === 1000, '1.000 Gegner', 15000);
  await page.keyboard.press('Digit1');
  await until(() => own.equipment.slot === 'primary' && !own.equipment.action, 'Primärwaffe ausgerüstet');
  const live = peers.map((peer) => ({ peer, seq: peer === guest ? seq : 0 }));
  const before = packets.length;
  const hordeBefore = arena.horde.count;
  remoteFire = setInterval(() => {
    for (const source of live) source.peer.send('input', { ...held, seq: ++source.seq });
  }, 34);
  await page.evaluate(() => { window.frameSamples.length = 0; window.captureFrames = true; });
  await page.mouse.down();
  await delay(2300);
  await page.mouse.up();
  clearInterval(remoteFire);
  for (const source of live) source.peer.send('input', { ...held, seq: ++source.seq, fire: false });
  const frames = await page.evaluate(() => { window.captureFrames = false; return window.frameSamples; });
  const hordeAfter = arena.horde.count;
  const stress = { players: arena.players.filter(Boolean).length, hordeBefore, hordeAfter, frames: frames.length,
    shots: packets.length - before, hud: await hud() };
  const summary = (values) => {
    const sorted = values.toSorted((a, b) => a - b);
    return Object.fromEntries([.5, .95, .99].map((q) => [q, sorted[Math.ceil(sorted.length * q) - 1]]));
  };
  const performanceSample = { ...stress, frameMs: summary(frames.slice(1).map(([at], i) => at - frames[i][0])),
    cpuMs: summary(frames.map(([, cpu]) => cpu)) };
  assert.equal(stress.players, 4);
  assert.ok(stress.shots > 20);
  await until(async () => {
    const metrics = await hud();
    return flashCount(metrics) === 0 && casingCount(metrics) === 0 && metrics['Waffen-VFX']?.includes('0/36 Tracer');
  }, 'Waffen-VFX vollständig abgelaufen');
  const feedback = [];
  let packetOrder;
  if (process.env.FREEFALL_HIT_ACCEPTANCE === '1') {
    arena.setHordeSize(0);
    while (arena.horde.count) arena.horde.despawn(arena.horde.active[arena.horde.count - 1]);
    const { horde } = arena;
    const spawn = horde.spawn.bind(horde);
    horde.spawn = () => -1; // Retain only the fixture enemy in this local Arena process.
    arena.setHordeSize(100);
    const other = arena.players.find((operator) => operator?.id === guest.sessionId);
    for (const player of arena.players.filter(Boolean)) {
      Object.assign(player, { x: 22, z: 20 + player.slot * 2, y: 0, protectedUntil: Infinity });
      clearMoves(player);
    }
    respawnPlayer(own, arena.tick);
    Object.assign(own, { x: 0, y: 0, z: 0, yaw: 0, protectedUntil: Infinity, posture: newPosture(0) });
    clearMoves(own);
    const angle = async (pitch) => {
      await delay(600);
      const movementX = Math.round(-own.input.yaw / .00235);
      const movementY = Math.round((own.input.pitch - pitch) / .00235);
      await page.locator('canvas').evaluate((canvas, { movementX, movementY }) => {
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(movementX), Math.abs(movementY)) / 120));
        for (let i = 0; i < steps; i++) {
          canvas.dispatchEvent(new MouseEvent('mousemove', { movementX: movementX / steps, movementY: movementY / steps }));
        }
      }, { movementX, movementY });
      await until(() => Math.abs(own.input.pitch - pitch) < .004 && Math.abs(own.input.yaw) < .03, 'controlled aim ' + pitch);
    };
    // Keep the measured aim constant when pressing the trigger in the deterministic contact fixture.
    const trigger = (pressed) => page.evaluate((pressed) => {
      window.dispatchEvent(new MouseEvent(pressed ? 'mousedown' : 'mouseup', { button: 0 }));
    }, pressed);
    await angle(-.12);
    let classes = [];
    await page.evaluate(() => {
      window.markerClasses = [];
      new MutationObserver(() => {
        const reticle = document.querySelector('.reticle');
        if (reticle) window.markerClasses.push(reticle.className);
      }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    const send = room.broadcast.bind(room);
    const confirmed = async (label, expected, check, marker, defer = false) => {
      const start = packets.length;
      const ammo = own.loadout.weapons.primary.magazineSize;
      own.ammo = ammo;
      resetRecoil(own.recoil);
      const audio = parseInt((await hud())['Impact-Audio'], 10);
      await page.evaluate(() => { window.markerClasses.length = 0; });
      const withheld = [];
      if (defer) room.broadcast = (type, packet, options) => {
        if (type === 'shot' && packet.shooter === own.id) withheld.push(packet);
        else send(type, packet, options);
      };
      await trigger(true);
      let shot;
      try {
        if (defer) {
          await until(() => withheld.length > 0, label + ' authoritative shot');
          await trigger(false);
          await delay(175);
          assert.equal(await page.locator('.reticle.hit, .reticle.kill, .reticle.ally').count(), 0);
          assert.equal(parseInt((await hud())['Impact-Audio'], 10), audio);
          send('shot', withheld[0]);
        }
        await until(() => (shot = packets.slice(start).find((packet) => packet.shooter === own.id)),
          label + ' shot');
        assert.equal(shot.impact?.kind, expected, JSON.stringify(shot));
        check?.(shot);
      } finally {
        if (defer) room.broadcast = send;
        await trigger(false);
      }
      if (marker) await until(() => page.evaluate((name) => window.markerClasses.some((value) => value.split(' ').includes(name)), marker),
        label + ' marker');
      await delay(600);
      classes = await page.evaluate(() => window.markerClasses);
      if (!marker) assert.ok(classes.every((value) => value === 'reticle'), JSON.stringify(classes));
      if (marker === 'ally') assert.ok(classes.every((value) => !value.includes(' kill')));
      if (expected) await until(async () => parseInt((await hud())['Impact-Audio'], 10) > audio, label + ' impact sound');
      feedback.push({ label, shot, classes: [...new Set(classes)], deferredMs: defer ? 175 : 0, stats: await hud() });
      return shot;
    };
    await confirmed('ground', 'world');
    const enemy = spawn(own.x + CAMERA_SHOULDER, own.z - 8, SCHABE_TYPE);
    const step = arena.step.bind(arena);
    let staged = enemy;
    arena.step = () => {
      if (horde.count) {
        horde.x[staged] = own.x + CAMERA_SHOULDER;
        horde.z[staged] = own.z - 8;
        horde.vx[staged] = horde.vz[staged] = 0;
      }
      step();
    };
    await confirmed('enemy hit', 'enemy', (shot) => {
      assert.equal(shot.enemy, horde.id[enemy]);
      assert.equal(shot.eliminated, false);
    }, 'hit', true);
    staged = horde.count ? enemy : spawn(own.x + CAMERA_SHOULDER, own.z - 8, SCHABE_TYPE);
    horde.hp[staged] = 1;
    const killed = await confirmed('enemy death', 'enemy', (shot) => assert.equal(shot.eliminated, true), 'kill');
    const before = Number((await hud())['Verworfene Schuss-Echos']);
    room.broadcast('shot', killed);
    await until(async () => Number((await hud())['Verworfene Schuss-Echos']) > before, 'duplicate kill rejected');
    assert.equal(await page.locator('.reticle.kill').count(), 0);

    respawnPlayer(other, arena.tick);
    Object.assign(other, { x: own.x + CAMERA_SHOULDER, z: own.z - 7, y: 0, protectedUntil: Infinity });
    await angle(-.18);
    await confirmed('protected ally', undefined, (shot) => assert.equal(shot.ally, other.id, JSON.stringify(shot)));
    other.protectedUntil = 0;
    const hp = other.hp;
    await confirmed('friendly fire', 'operator', (shot) => {
      assert.equal(shot.ally, other.id);
      assert.equal(shot.impact.life, other.life);
      assert.ok(other.hp < hp);
    }, 'ally');
    other.x = 15;
    await angle(.15);
    await confirmed('miss', undefined);
    Object.assign(other, { x: -4, z: -7, y: 0, protectedUntil: Infinity });
    const deferred = [];
    const newer = [];
    room.broadcast = (type, packet, options) => {
      if (type === 'shot' && packet.shooter === guest.sessionId && packet.impact?.kind === 'world') {
        if (!deferred.length) { deferred.push(packet); return; }
        newer.push(packet);
      }
      send(type, packet, options);
    };
    const beforeOrder = (await hud())['Impact-Pool'];
    other.ammo = other.loadout.weapons.primary.magazineSize;
    seq = Math.max(seq, other.lastInputSeq);
    const remote = { ...held, yaw: 0, pitch: -.42 };
    const recordStart = packets.length;
    remoteFire = setInterval(() => guest.send('input', { ...remote, seq: ++seq }), 28);
    try {
      await until(() => newer.length > 0, 'newer packet delivered before the deferred shot');
      send('shot', deferred[0]);
      await until(() => packets.slice(recordStart).some((packet) => packet.tick === deferred[0].tick &&
        packet.shooter === guest.sessionId), 'deferred packet delivered');
    } finally {
      clearInterval(remoteFire);
      guest.send('input', { ...remote, fire: false, seq: ++seq });
      room.broadcast = send;
    }
    const delivered = packets.slice(recordStart).filter((packet) => packet.shooter === guest.sessionId && packet.impact?.kind === 'world');
    assert.ok(delivered[0].tick > deferred[0].tick);
    await until(async () => parseInt((await hud())['Impact-Pool'], 10) >= parseInt(beforeOrder, 10) + delivered.length,
      'reordered contacts rendered');
    packetOrder = { deferredTick: deferred[0].tick, arrivalTicks: delivered.map(({ tick }) => tick), before: beforeOrder, after: (await hud())['Impact-Pool'] };

  }
  assert.deepEqual(errors, []);
  const report = { chromium: browser.version(), angle, renderer, cases, duplicates, remoteCasings: true,
    reducedFlash: reduced['Waffen-VFX'], highFlash: high['Waffen-VFX'], highMuzzleLight: high['Hülsen / Lauflicht'],
    performance: performanceSample, feedback, packetOrder, errors };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
} finally {
  clearInterval(remoteFire);
  await Promise.allSettled(peers.map((peer) => peer.leave()));
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(outDir, { recursive: true, force: true });
}

/**
 * Browser frame-time benchmark for Milestone 7.1.
 *
 *   npm run build
 *   PLAYWRIGHT_MODULE=/path/to/playwright node --conditions=development scripts/perf-browser.mjs [out.json]
 *
 * Starts the game server in-process and the built client via `vite preview`, drives one rendering Chromium
 * with fixed keyboard and mouse sequences and records every requestAnimationFrame timestamp plus the
 * synchronous callback duration. Scenarios: Skyfall Carrier, Dev' Ault surface (no enemies), Boreal Relay
 * with 100 / 500 / 1.000 enemies and 1.000 enemies with four connected operators.
 * Snapshot intervals are recorded by an additional SDK observer on the same loopback server.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
process.env.FREEFALL_MISSION_DEBUG = '1';
const PORT = 2567;
const server = await startServer(PORT, '127.0.0.1', false);
const web = await preview({ root: join(root, 'apps/client'), preview: { host: '127.0.0.1', port: 4186, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  channel: process.env.CHANNEL || 'chromium',
  args: ['--use-angle=' + (process.env.ANGLE || 'gl'), '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--disable-frame-rate-limit=false'],
  chromiumSandbox: false,
});
const peers = [];
const results = [];
const errors = [];

function stats(values) {
  if (!values.length) return {};
  const s = values.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, median: q(.5), p95: q(.95), p99: q(.99), max: s.at(-1) };
}

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.addInitScript((hz) => {
    const frames = [];
    const work = [];
    let recording = false;
    const native = window.requestAnimationFrame.bind(window);
    // Headless Chromium has no vsync. With VSYNC=<hz>, callbacks are released on emulated display
    // refresh boundaries (timestamp = boundary), like a fixed-refresh monitor.
    let pending = [];
    let next = 0;
    const pump = (ts) => {
      native(pump);
      if (!next) next = ts;
      if (ts < next) return;
      const vsync = next;
      next += 1000 / hz * Math.max(1, Math.ceil((ts - next + 1e-6) / (1000 / hz)));
      const batch = pending;
      pending = [];
      for (const callback of batch) callback(vsync);
    };
    if (hz) native(pump);
    const raf = hz ? (callback) => { pending.push(callback); return 0; } : native;
    window.requestAnimationFrame = (callback) => raf((ts) => {
      const start = performance.now();
      callback(ts);
      if (recording) { frames.push(ts); work.push(performance.now() - start); }
    });
    window.__perf = {
      start() { frames.length = work.length = 0; recording = true; },
      stop() { recording = false; return { frames: frames.slice(), work: work.slice() }; },
    };
    // Deterministic mouse look: constant yaw rate or oscillation, dispatched once per frame.
    let look;
    window.__look = (mode) => { look = mode ? { mode, t0: performance.now(), last: performance.now(), acc: 0 } : undefined; };
    const tick = () => {
      raf(tick);
      if (!look) return;
      const now = performance.now();
      const canvas = document.querySelector('canvas');
      const t = (now - look.t0) / 1000;
      const rate = look.mode === 'circle' ? 1.1 : .7 * 2 * Math.PI * .45 * Math.cos(2 * Math.PI * .45 * t);
      look.acc += rate * (now - look.last) / 1000 / .00235;
      look.last = now;
      const dx = Math.trunc(look.acc);
      look.acc -= dx;
      if (dx && canvas) canvas.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, bubbles: true }));
    };
    raf(tick);
  }, Number(process.env.VSYNC || 0));
  await page.goto('http://127.0.0.1:4186/');
  await page.getByLabel('Grafikqualität').selectOption('medium');
  return page;
}

async function enter(page, name) {
  const launch = page.getByRole('button', { name });
  await launch.waitFor();
  await page.mouse.move(640, 360);
  await launch.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  await delay(900);
}

/** Fixed movement sequence, 2 s per segment. */
async function sequence(page) {
  const hold = async (keys, ms = 2000, mouse) => {
    for (const key of keys) {
      if (key === 'Aim') await page.mouse.down({ button: 'right' });
      else await page.keyboard.down(key);
    }
    if (mouse) await page.evaluate((m) => window.__look(m), mouse);
    await delay(ms);
    if (mouse) await page.evaluate(() => window.__look());
    for (const key of keys) {
      if (key === 'Aim') await page.mouse.up({ button: 'right' });
      else await page.keyboard.up(key);
    }
  };
  await hold(['KeyW']);
  await hold(['ShiftLeft', 'KeyW']);
  await hold(['KeyD']);
  await hold(['KeyS']);
  await hold(['KeyW'], 2000, 'circle');
  for (let i = 0; i < 5; i++) await hold([i % 2 ? 'KeyA' : 'KeyD'], 400);
  await hold(['Aim', 'KeyW']);
  await hold(['KeyW'], 2000, 'sway');
}

async function hud(page) {
  return page.locator('.telemetry .metrics dt').evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [item.textContent, item.nextElementSibling.textContent])));
}

const observers = new Map();
async function observe(roomId) {
  if (observers.has(roomId)) {
    const entry = observers.get(roomId);
    entry.arrivals.players.length = entry.arrivals.horde.length = 0;
    return entry;
  }
  const observer = await new Client(`http://127.0.0.1:${PORT}`).joinById(roomId);
  const arrivals = { players: [], horde: [] };
  observers.set(roomId, { observer, arrivals });
  observer.onMessage('*', () => {});
  observer.onMessage('players', () => arrivals.players.push(performance.now()));
  observer.onMessage('horde', () => arrivals.horde.push(performance.now()));
  observer.onMessage('horde-wide', () => arrivals.horde.push(performance.now()));
  return { observer, arrivals };
}


async function measure(page, name, room, extra = {}) {
  await page.keyboard.press('F2');
  await delay(400);
  const ticks = [];
  const sampler = setInterval(() => {
    const times = room.times ?? [];
    if (times.length) ticks.push(...times.slice(-15));
  }, 500);
  const { arrivals } = await observe(room.roomId);
  await page.evaluate(() => window.__perf.start());
  const hudSamples = [];
  const hudTimer = setInterval(() => { void hud(page).then((h) => hudSamples.push(h)).catch(() => {}); }, 700);
  await sequence(page);
  const { frames, work } = await page.evaluate(() => window.__perf.stop());
  clearInterval(hudTimer);
  clearInterval(sampler);
  await page.keyboard.press('F2');
  const intervals = frames.slice(1).map((t, i) => t - frames[i]);
  const duration = (frames.at(-1) - frames[0]) / 1000;
  const number = (key) => stats(hudSamples.map((h) => Number.parseFloat(String(h[key] ?? ''))).filter(Number.isFinite));
  const second = (key) => stats(hudSamples.map((h) => Number.parseFloat(String(h[key] ?? '').split('/')[1] ?? '')).filter(Number.isFinite));
  const gaps = (list) => stats(list.slice(1).map((t, i) => t - list[i]));
  const row = {
    scenario: name, frames: frames.length, fps: (frames.length - 1) / duration,
    frame: stats(intervals), cpu: stats(work), over20: intervals.filter((v) => v > 20).length, over34: intervals.filter((v) => v > 34).length,
    drawCalls: number('Draw Calls / Dreiecke').median, hud: hudSamples.at(-1),
    motion: hudSamples.some((h) => h['Prediction Error']) ? {
      predictionErrorCm: number('Prediction Error'), correctionsPerSecond: number('Korrekturen/s / letzte'),
      interpolationMs: number('Interp. / Puffer'), snapshotJitterMs: second('Snapshots / Jitter'),
      extrapolatedPct: number('Extrapol. / gehalten'), heldPct: second('Extrapol. / gehalten'),
      moveSpeed: number('Tempo Lauf / Anim.'), animSpeed: second('Tempo Lauf / Anim.'),
      frameP95: number('Frame P95 / P99'),
    } : undefined,
    serverTick: stats(ticks), playersInterval: gaps(arrivals.players), hordeInterval: gaps(arrivals.horde),
    ...extra,
  };
  results.push(row);
  const f = row.frame;
  if (row.motion) console.log('  motion', JSON.stringify(Object.fromEntries(Object.entries(row.motion).map(([k, v]) => [k, [v.median, v.max].map((n) => n?.toFixed(2))]))));
  console.log(`${name}: ${row.fps.toFixed(1)} FPS · Frame median/P95/P99/max ${f.median?.toFixed(2)}/${f.p95?.toFixed(2)}/${f.p99?.toFixed(2)}/${f.max?.toFixed(2)} ms · CPU Ø/P95 ${row.cpu.mean?.toFixed(2)}/${row.cpu.p95?.toFixed(2)} ms · >20ms ${row.over20} · Draw ${row.drawCalls} · Server P95 ${row.serverTick.p95?.toFixed(3)} ms · Players Δ ${row.playersInterval.mean?.toFixed(1)}±P95 ${row.playersInterval.p95?.toFixed(1)} ms`);
  return row;
}

try {
  const page = await openPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('Chromium', browser.version(), '·', renderer);

  // Mission room: Carrier, then Dev' Ault surface without enemies.
  await page.getByRole('button', { name: 'Raum erstellen' }).click();
  await page.getByRole('button', { name: 'Carrier betreten' }).waitFor();
  const missionRoom = matchMaker.getLocalRoomById(await page.locator('.room strong').innerText());
  await enter(page, 'Carrier betreten');
  const mission = missionRoom.arena;
  for (const p of mission.players) if (p) p.protectedUntil = Infinity;
  await observe(missionRoom.roomId);
  await measure(page, 'Skyfall Carrier, ohne Gegner', missionRoom);
  const host = mission.players.find((p) => p && p.id !== observers.get(missionRoom.roomId).observer.sessionId);
  mission.debug(host.id, 'land');
  const clear = setInterval(() => {
    while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]);
    for (const p of mission.players) if (p) p.protectedUntil = Infinity;
  }, 50);
  await delay(2500);
  if (!(await page.locator('.in-game').count())) await enter(page, 'Einsatz betreten');
  await delay(1000);
  await measure(page, "Dev' Ault, ohne Gegner", missionRoom, { state: mission.state });
  clearInterval(clear);
  await page.evaluate(() => document.exitPointerLock());
  await page.getByRole('button', { name: 'Raum verlassen' }).click().catch(() => {});
  await page.close();

  // Arena: 100 / 500 / 1.000 enemies, then four operators.
  const arenaPage = await openPage();
  await arenaPage.getByRole('button', { name: 'Boreal Relay' }).click();
  const arenaRoomRef = await (async () => {
    const before = new Set((await matchMaker.query({})).map((r) => r.roomId));
    await arenaPage.getByRole('button', { name: 'Raum erstellen' }).click();
    for (;;) {
      const rooms = await matchMaker.query({});
      const room = rooms.find((r) => !before.has(r.roomId));
      if (room) return matchMaker.getLocalRoomById(room.roomId);
      await delay(50);
    }
  })();
  const isArena = !!arenaRoomRef.arena.setHordeSize;
  console.log('second room is arena:', isArena);
  await enter(arenaPage, isArena ? 'Arena betreten' : 'Carrier betreten');
  const arena = arenaRoomRef.arena;
  const protect = setInterval(() => { for (const p of arena.players) if (p) p.protectedUntil = Infinity; }, 50);
  for (const size of [100, 500, 1000]) {
    arena.setHordeSize(size);
    for (let i = 0; i < 80 && arena.horde.count < size; i++) await delay(100);
    await delay(800);
    await measure(arenaPage, `Boreal Relay, ${size} Gegner, 1 Operator + idle Beobachter`, arenaRoomRef, { enemies: arena.horde.count });
  }
  const sdk = new Client(`http://127.0.0.1:${PORT}`);
  const botTimers = [];
  // The SDK observer already occupies one operator slot; it moves like the two additional bots.
  for (let i = 0; i < 3; i++) {
    const guest = i === 0 ? observers.get(arenaRoomRef.roomId).observer : await sdk.joinById(arenaRoomRef.roomId);
    if (i) { guest.onMessage('*', () => {}); peers.push(guest); }
    let seq = 0;
    const t0 = performance.now();
    botTimers.push(setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      guest.send('input', { seq: ++seq, forward: 1, strafe: 0, yaw: Math.atan2(Math.sin(t * (.8 + i * .2)), Math.cos(t * (.8 + i * .2))),
        pitch: -.12, sprint: i === 1, fire: i === 2 && Math.floor(t) % 3 === 0, aim: i === 2 });
    }, 1000 / 30));
  }
  await delay(1500);
  await measure(arenaPage, 'Boreal Relay, 1.000 Gegner, 4 Operator', arenaRoomRef, { enemies: arena.horde.count, operators: arena.players.filter(Boolean).length });
  for (const timer of botTimers) clearInterval(timer);
  clearInterval(protect);
  console.log('errors', errors);
  if (out) writeFileSync(out, JSON.stringify({ chromium: browser.version(), renderer, results, errors }, null, 2));
} finally {
  await Promise.allSettled([...peers, ...[...observers.values()].map((o) => o.observer)].map((r) => r.leave()));
  await browser.close();
  await web.close();
  await server.gracefullyShutdown(false);
}

/**
 * Reproducible movement smoothness benchmark (Milestone 7.1).
 *
 * Runs the real server simulation (Arena + FixedLoop), the real client prediction, snapshot timeline,
 * remote interpolation, third-person camera and character animation against simulated clocks:
 * a jittered display (rAF), a jittered server timer and an ordered (WebSocket-like) network link with
 * latency and jitter. Everything is seeded, so two runs of the same code produce the same numbers.
 *
 *   node --conditions=development scripts/motion-bench.ts [hz=60,144] [net=lan,wan,jitter] [--json out.json]
 */
const clock = { now: 0 };
Object.defineProperty(performance, 'now', { value: () => clock.now, configurable: true });

const { writeFileSync } = await import('node:fs');
const { NET, PLAYER, lerpAngle } = await import('@freefall/shared');
type PlayersSnapshot = import('@freefall/shared').PlayersSnapshot;
type PlayerInput = import('@freefall/shared').PlayerInput;
const { Arena } = await import('../apps/server/src/simulation/Arena.ts');
const { FixedLoop } = await import('../apps/server/src/simulation/FixedLoop.ts');
const { playerSnapshot } = await import('../apps/server/src/networking/snapshots.ts');
const client = await import('./motion-bench-client.ts');

function rng(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

interface NetProfile { name: string; latency: number; jitter: number; spikeChance: number; spike: number }
const NETWORKS: Record<string, NetProfile> = {
  lan: { name: 'lan', latency: 1, jitter: 1, spikeChance: 0, spike: 0 },
  wan: { name: 'wan', latency: 35, jitter: 15, spikeChance: .005, spike: 60 },
  jitter: { name: 'jitter', latency: 60, jitter: 40, spikeChance: .02, spike: 120 },
};

/** Ordered delivery with jitter, like a single TCP/WebSocket stream. */
class Link<T> {
  private last = 0;
  private readonly random: () => number;
  private readonly profile: NetProfile;
  private readonly schedule: (at: number, fn: () => void) => void;
  constructor(profile: NetProfile, seed: number, schedule: (at: number, fn: () => void) => void) {
    this.profile = profile;
    this.random = rng(seed);
    this.schedule = schedule;
  }
  send(payload: T, deliver: (payload: T) => void): void {
    const { latency, jitter, spikeChance, spike } = this.profile;
    let delay = latency + this.random() * jitter;
    if (this.random() < spikeChance) delay += spike;
    const at = Math.max(this.last, clock.now + delay);
    this.last = at;
    this.schedule(at, () => deliver(payload));
  }
}

interface Script { forward: number; strafe: number; sprint: boolean; aim: boolean; yaw: (t: number, yaw: number, dt: number) => number }
interface Scenario { name: string; start: { x: number; z: number; yaw: number }; script: (t: number) => Script; steady: boolean }
const keep = (_t: number, yaw: number) => yaw;
const SCENARIOS: Scenario[] = [
  { name: 'Geradeaus laufen', start: { x: 0, z: 40, yaw: 0 }, steady: true,
    script: () => ({ forward: 1, strafe: 0, sprint: false, aim: false, yaw: keep }) },
  { name: 'Sprinten', start: { x: 0, z: 50, yaw: 0 }, steady: true,
    script: () => ({ forward: 1, strafe: 0, sprint: true, aim: false, yaw: keep }) },
  { name: 'Seitwärts', start: { x: -40, z: 0, yaw: 0 }, steady: true,
    script: () => ({ forward: 0, strafe: 1, sprint: false, aim: false, yaw: keep }) },
  { name: 'Rückwärts', start: { x: 0, z: -40, yaw: 0 }, steady: true,
    script: () => ({ forward: -1, strafe: 0, sprint: false, aim: false, yaw: keep }) },
  { name: 'Kreis', start: { x: 0, z: 0, yaw: 0 }, steady: true,
    script: () => ({ forward: 1, strafe: 0, sprint: false, aim: false, yaw: (_t, yaw, dt) => yaw + 1.1 * dt }) },
  { name: 'Richtungswechsel', start: { x: 0, z: 0, yaw: 0 }, steady: false,
    script: (t) => ({ forward: 0, strafe: Math.floor(t / .4) % 2 ? -1 : 1, sprint: false, aim: false, yaw: keep }) },
  { name: 'Anlaufen / Stoppen', start: { x: 0, z: 30, yaw: 0 }, steady: false,
    script: (t) => ({ forward: Math.floor(t / .5) % 2 ? 0 : 1, strafe: 0, sprint: false, aim: false, yaw: keep }) },
  { name: 'Laufen + Zielen', start: { x: 0, z: 40, yaw: 0 }, steady: true,
    script: () => ({ forward: 1, strafe: 0, sprint: false, aim: true, yaw: keep }) },
  { name: 'Laufen + Kamera drehen', start: { x: 0, z: 40, yaw: 0 }, steady: true,
    script: (t) => ({ forward: 1, strafe: 0, sprint: false, aim: false,
      yaw: () => .7 * Math.sin(2 * Math.PI * .45 * t) }) },
];
const SCENARIO_MS = 6500;
const WARMUP_MS = 1000;

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
const positional = args.filter((arg, i) => !arg.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1));
const rates = (positional[0] ?? '60,144').split(',').map(Number);
const nets = (positional[1] ?? 'lan,wan,jitter').split(',');

interface Sample { t: number; x: number; z: number; cx: number; cy: number; cz: number; rx: number; rz: number;
  anim: number; remoteAnim: number; loco: string; held: boolean; moving: boolean }

function stats(values: number[]) {
  if (!values.length) return { mean: 0, cv: 0, p95: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const sorted = values.slice().sort((a, b) => a - b);
  return { mean, cv: mean ? sd / mean : 0, p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1)! };
}

function run(hz: number, profile: NetProfile) {
  clock.now = 0;
  const queue: { at: number; order: number; fn: () => void }[] = [];
  let order = 0;
  const schedule = (at: number, fn: () => void) => {
    const entry = { at, order: order++, fn };
    let i = queue.length;
    while (i > 0 && (queue[i - 1].at > at || (queue[i - 1].at === at && queue[i - 1].order > entry.order))) i--;
    queue.splice(i, 0, entry);
  };

  const arena = new Arena(421337, 0);
  const loop = new FixedLoop();
  const ids = ['local', 'remote', 'bot-a', 'bot-b'];
  for (const id of ids) arena.addPlayer(id);
  for (const p of arena.players) if (p) p.protectedUntil = Infinity;

  const random = rng(7 * hz + profile.latency);
  const total = SCENARIOS.length * SCENARIO_MS;
  let scenarioIndex = -1;
  let scenarioAt = 0;
  const current = () => SCENARIOS[Math.max(0, scenarioIndex)];

  // Server callback cadence: setInterval-like with small lateness and occasional stalls.
  let previous = 0;
  let playerClock = 0;
  const up = ids.map((id, i) => new Link<PlayerInput>(profile, 11 + i * 17 + hz, schedule));
  const down = ids.map((id, i) => new Link<PlayersSnapshot>(profile, 101 + i * 31 + hz, schedule));
  const clients = ids.map((id, i) => new client.SimClient(id, i === 0 ? hz : 60, (input) =>
    up[i].send(input, (payload) => arena.receiveInput(id, payload))));
  const serverTimes: number[] = [];
  const tickFn = () => {
    arena.step();
    playerClock += NET.playerHz;
    if (playerClock >= NET.tickHz) {
      playerClock -= NET.tickHz;
      const snapshot = playerSnapshot(arena, 'local');
      clients.forEach((c, i) => down[i].send(structuredClone(snapshot), (s) => c.receive(s)));
    }
  };
  const serverCallback = (k: number) => () => {
    const now = clock.now;
    loop.advance(now - previous, tickFn);
    serverTimes.push(now - previous);
    previous = now;
    const late = random() * 3 + (random() < .01 ? 20 : 0);
    schedule((k + 1) * (1000 / NET.tickHz) + late, serverCallback(k + 1));
  };
  schedule(1000 / NET.tickHz, serverCallback(1));

  // Scenario switches: teleport every operator to a defined start (a real discontinuity, new life).
  const startScenario = (index: number) => () => {
    scenarioIndex = index;
    scenarioAt = clock.now;
    const s = SCENARIOS[index];
    arena.players.forEach((p, i) => {
      if (!p) return;
      p.x = s.start.x + (i === 1 ? 2.5 : i * 4 - 6) * (i ? 1 : 0);
      p.z = s.start.z + (i > 1 ? 4 : 0);
      p.yaw = s.start.yaw;
      p.life++;
    });
    if (index + 1 < SCENARIOS.length) schedule((index + 1) * SCENARIO_MS + 1, startScenario(index + 1));
  };
  schedule(1, startScenario(0));

  // Display frames: vsync-aligned timestamps with small callback jitter and rare dropped frames.
  clients.forEach((c, i) => {
    const frameRandom = rng(997 + i * 13 + hz);
    const interval = 1000 / c.hz;
    let vsync = i * .37;
    const frame = () => {
      const s = current();
      const t = (clock.now - scenarioAt) / 1000;
      c.frame(clock.now, s.script(Math.max(0, t)), s.start.yaw);
      vsync += interval * (frameRandom() < .004 ? 2 : 1);
      schedule(vsync + (frameRandom() - .5) * .6, frame);
    };
    schedule(vsync + interval, frame);
  });

  // Observation of client 0.
  const observer = clients[0];
  const perScenario = SCENARIOS.map(() => ({ samples: [] as Sample[], all: [] as Sample[], corrections: [] as number[], lococh: 0, lastLoco: '', at: 0 }));
  observer.onCorrection = (size) => {
    if (scenarioIndex < 0 || clock.now - scenarioAt < WARMUP_MS) return;
    perScenario[scenarioIndex].corrections.push(size);
  };
  observer.onFrame = (sample) => {
    if (scenarioIndex < 0) return;
    perScenario[scenarioIndex].all.push(sample);
    perScenario[scenarioIndex].at = scenarioAt;
    if (clock.now - scenarioAt < WARMUP_MS) return;
    const bucket = perScenario[scenarioIndex];
    bucket.samples.push(sample);
    if (bucket.lastLoco && bucket.lastLoco !== sample.loco) bucket.lococh++;
    bucket.lastLoco = sample.loco;
  };

  while (queue.length && queue[0].at <= total) {
    const event = queue.shift()!;
    clock.now = event.at;
    event.fn();
  }

  return SCENARIOS.map((scenario, i) => {
    const { samples, corrections, lococh } = perScenario[i];
    const speeds: number[] = [], cam: number[] = [], remote: number[] = [], slide: number[] = [], anim: number[] = [], remoteSlide: number[] = [];
    let stalls = 0, camStalls = 0, remoteStalls = 0, held = 0, frames = 0;
    for (let k = 1; k < samples.length; k++) {
      const a = samples[k - 1], b = samples[k];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) continue;
      frames++;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const dc = Math.hypot(b.cx - a.cx, b.cy - a.cy, b.cz - a.cz);
      const dr = Math.hypot(b.rx - a.rx, b.rz - a.rz);
      if (d < 1e-5) stalls++;
      if (dc < 1e-5) camStalls++;
      if (dr < 1e-5) remoteStalls++;
      if (b.held) held++;
      speeds.push(d / dt);
      cam.push(dc / dt);
      remote.push(dr / dt);
      anim.push(b.anim);
      slide.push(Math.abs(b.anim - d / dt));
      remoteSlide.push(Math.abs(b.remoteAnim - dr / dt));
    }
    const s = stats(speeds), c = stats(cam), r = stats(remote), a = stats(anim), corr = stats(corrections);
    const seconds = (SCENARIO_MS - WARMUP_MS) / 1000;
    return {
      scenario: scenario.name, steady: scenario.steady, frames,
      localSpeedMean: s.mean, localSpeedCV: s.cv, localStallPct: frames ? stalls / frames : 0,
      cameraSpeedCV: c.cv, cameraStallPct: frames ? camStalls / frames : 0,
      remoteSpeedCV: r.cv, remoteStallPct: frames ? remoteStalls / frames : 0, remoteHeldPct: frames ? held / frames : 0,
      animSpeedCV: a.cv, footSlideMean: stats(slide).mean, remoteFootSlideMean: stats(remoteSlide).mean,
      locomotionChanges: lococh,
      correctionsPerSecond: corrections.filter((v) => v > .005).length / seconds,
      correctionMean: corr.mean, correctionMax: corr.max,
      inputLatencyMs: scenario.name === 'Richtungswechsel' ? flipLatency(perScenario[i].all, perScenario[i].at) : undefined,
      ...(scenario.name === 'Anlaufen / Stoppen' ? startStopLatency(perScenario[i].all, perScenario[i].at) : {}),
    };
  });
}

/** Time from a strafe key flip (every 400 ms) to the first frame whose rendered motion follows the new direction. */
function flipLatency(samples: Sample[], at: number): number {
  const delays: number[] = [];
  for (let flip = at + 400; flip < at + SCENARIO_MS - 400; flip += 400) {
    const direction = Math.floor((flip - at + 1) / 400) % 2 ? -1 : 1;
    for (let k = 1; k < samples.length; k++) {
      if (samples[k].t < flip) continue;
      if ((samples[k].x - samples[k - 1].x) * direction > 1e-4) { delays.push(samples[k].t - flip); break; }
    }
  }
  return median(delays);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Key press → first visible motion, key release → first frame without motion (W every 500 ms). */
function startStopLatency(samples: Sample[], at: number) {
  const start: number[] = [], stop: number[] = [];
  for (let edge = at + 500; edge < at + SCENARIO_MS - 500; edge += 500) {
    const pressing = Math.floor((edge - at + 1) / 500) % 2 === 0;
    for (let k = 1; k < samples.length; k++) {
      if (samples[k].t < edge) continue;
      const moved = Math.hypot(samples[k].x - samples[k - 1].x, samples[k].z - samples[k - 1].z) > 1e-4;
      if (pressing && moved) { start.push(samples[k].t - edge); break; }
      if (!pressing && !moved) { stop.push(samples[k].t - edge); break; }
    }
  }
  return { startLatencyMs: median(start), stopLatencyMs: median(stop) };
}

const results: Record<string, ReturnType<typeof run>> = {};
const pct = (v: number) => (v * 100).toFixed(1) + '%';
for (const net of nets) for (const hz of rates) {
  const key = `${hz}Hz/${net}`;
  const rows = results[key] = run(hz, NETWORKS[net]);
  console.log(`\n## ${key}  (Anzeige ${hz} Hz, Netz ${net}: ${NETWORKS[net].latency}+${NETWORKS[net].jitter} ms, vier Clients)`);
  console.log('| Szenario | lokal v̄ (m/s) | lokal v-CV | lokal Stillstand | Kamera v-CV | Kamera Stillstand | Remote v-CV | Remote Stillstand | Remote gehalten | Anim v-CV | Foot slide lokal / remote (m/s) | Loco-Wechsel | Korrekturen/s | Korrektur Ø / max (cm) |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    console.log(`| ${r.scenario} | ${r.localSpeedMean.toFixed(2)} | ${r.steady ? pct(r.localSpeedCV) : '–'} | ${pct(r.localStallPct)} | ${r.steady ? pct(r.cameraSpeedCV) : '–'} | ${pct(r.cameraStallPct)} | ${r.steady ? pct(r.remoteSpeedCV) : '–'} | ${pct(r.remoteStallPct)} | ${pct(r.remoteHeldPct)} | ${r.steady ? pct(r.animSpeedCV) : '–'} | ${r.footSlideMean.toFixed(2)} / ${r.remoteFootSlideMean.toFixed(2)} | ${r.locomotionChanges} | ${r.correctionsPerSecond.toFixed(1)} | ${(r.correctionMean * 100).toFixed(1)} / ${(r.correctionMax * 100).toFixed(1)} |`);
  }
  const latency = rows.find((r) => r.scenario === 'Richtungswechsel')?.inputLatencyMs;
  if (latency !== undefined) console.log(`\nEingabe → sichtbare Richtungsumkehr (Richtungswechsel): Median ${latency.toFixed(1)} ms`);
  const startStop = rows.find((r) => r.scenario === 'Anlaufen / Stoppen') as { startLatencyMs?: number; stopLatencyMs?: number } | undefined;
  if (startStop?.startLatencyMs !== undefined) console.log(`Taste gedrückt → erste sichtbare Bewegung: Median ${startStop.startLatencyMs.toFixed(1)} ms · losgelassen → Stillstand: Median ${startStop.stopLatencyMs!.toFixed(1)} ms`);
}
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(results, null, 2));
void PLAYER; void lerpAngle;

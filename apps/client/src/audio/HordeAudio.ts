import { BREACHER_TYPE, JAEGER_TYPE, NET, attackStrikeAt, groundHeight, replicatedAttackTiming } from '@freefall/shared';
import type { HordeFrame, WorldDefinition } from '@freefall/shared';
import type { AudioEngine, AudioPosition, SampleVoice } from './AudioEngine.ts';
import { takeIds, Takes } from './Soundscape.ts';
import { PRIORITY } from './VoiceBudget.ts';

const ATTACK_RANGE = 27;
const MOVEMENT_RANGE = 17;
const CLUSTER_RANGE = 105;
const CLUSTER_CELL_METRES = 36;
const FRAME_TICKS = 2;
const MAX_ATTACK_CANDIDATES = 4;
/** Pitch and level of the swarm attack voice per wire type. */
const CASTE_VOICE: Readonly<Record<number, { pitch: number; level: number }>> = {
  0: { pitch: 1, level: 1 },
  [JAEGER_TYPE]: { pitch: 1.28, level: .9 },
  [BREACHER_TYPE]: { pitch: .6, level: 1.25 },
};

interface AttackCue {
  id: number;
  type: number;
  start: number;
  phase: 'windup' | 'active';
  x: number;
  z: number;
  distance: number;
}

export function attackPhase(frame: HordeFrame, index: number, tick: number) {
  const age = frame.attackAge[index];
  if (!age) return;
  const start = frame.tick - age + 1;
  const elapsed = tick - start;
  // Each archetype has its own timing; a leap strikes after its flight.
  const timing = replicatedAttackTiming(frame, index);
  const strike = attackStrikeAt(timing);
  if (elapsed < 0 || elapsed >= strike + timing.activeTicks) return;
  if (elapsed >= timing.windupTicks && elapsed < strike) return;
  const phase = elapsed < timing.windupTicks ? 'windup' : 'active';
  const ageInPhase = elapsed - (phase === 'active' ? strike : 0);
  return { start, phase, ageInPhase } as const;
}

export class HordeAudio {
  private readonly engine: AudioEngine;
  private readonly takes = new Takes();
  private readonly attacks = new Map<number, { start: number; mask: number }>();
  private readonly tracked = new Map<SampleVoice, number>();
  private readonly recentMovement = new Map<number, number>();
  private readonly nearby: AttackCue[] = [];
  private readonly clusters = new Map<number, { x: number; z: number; count: number }>();
  private lastScan = -Infinity;
  private nextMove = 0;
  private nextCluster = 0;
  private world?: WorldDefinition;
  scans = 0;
  windups = 0;
  impacts = 0;
  updateMs = 0;
  peakMs = 0;

  constructor(engine: AudioEngine) { this.engine = engine; }

  warm(): void {
    this.engine.preload([...takeIds('schabe-hiss', 3), ...takeIds('schabe-chitter', 3), ...takeIds('schabe-impact', 2)]);
  }

  update(a: HordeFrame, b: HordeFrame, alpha: number, listener: AudioPosition, world: WorldDefinition): void {
    const tick = a.tick + (b.tick - a.tick) * alpha;
    this.world = world;
    // Only active attack/short movement voices require per-frame transforms.
    for (const [voice, id] of this.tracked) {
      const index = a.byId.get(id), next = b.byId.get(id);
      if (!voice.active || index === undefined || next === undefined) {
        if (voice.active) voice.fadeOut(.13);
        this.tracked.delete(voice);
        continue;
      }
      const x = a.x[index] + (b.x[next] - a.x[index]) * alpha;
      const z = a.z[index] + (b.z[next] - a.z[index]) * alpha;
      voice.position(this.position(x, z));
    }
    if (tick - this.lastScan < FRAME_TICKS) return;
    const started = performance.now();
    const priming = this.lastScan === -Infinity;
    this.lastScan = tick;
    for (const [id, recent] of this.attacks) if (tick - recent.start > 5 * NET.tickHz) this.attacks.delete(id);
    for (const [id, until] of this.recentMovement) if (tick >= until) this.recentMovement.delete(id);

    this.nearby.length = 0;
    this.clusters.clear();
    const checkCluster = tick >= this.nextCluster;
    const checkMovement = tick >= this.nextMove;
    let runner = -1, runnerDistance = MOVEMENT_RANGE ** 2;
    for (let i = 0; i < a.count; i++) {
      const id = a.id[i];
      const dx = a.x[i] - listener.x, dz = a.z[i] - listener.z;
      const distance = dx * dx + dz * dz;
      if (distance > CLUSTER_RANGE ** 2) continue;
      if (checkCluster && distance > ATTACK_RANGE ** 2) {
        const gx = Math.floor(dx / CLUSTER_CELL_METRES), gz = Math.floor(dz / CLUSTER_CELL_METRES);
        const key = (gx + 8) * 16 + gz + 8;
        const cluster = this.clusters.get(key) ?? { x: 0, z: 0, count: 0 };
        cluster.x += a.x[i]; cluster.z += a.z[i]; cluster.count++;
        this.clusters.set(key, cluster);
        continue;
      }
      if (distance > ATTACK_RANGE ** 2) continue;
      const next = b.byId.get(id);
      if (next === undefined) continue;
      // The newer snapshot can invalidate an attack after a stagger or death.
      const attack = attackPhase(b, next, tick);
      if (attack) {
        const mask = attack.phase === 'windup' ? 1 : 2;
        const previous = this.attacks.get(id);
        if (previous?.start === attack.start && (previous.mask & mask)) continue;
        this.attacks.set(id, { start: attack.start, mask: mask | (previous?.start === attack.start ? previous.mask : 0) });
        if (priming || attack.ageInPhase >= (attack.phase === 'windup' ? 6 : 4)) continue;
        if (this.nearby.length === MAX_ATTACK_CANDIDATES && distance >= this.nearby.at(-1)!.distance) continue;
        this.nearby.push({ id, type: b.type[next], start: attack.start, phase: attack.phase,
          x: a.x[i] + (b.x[next] - a.x[i]) * alpha,
          z: a.z[i] + (b.z[next] - a.z[i]) * alpha, distance });
        this.nearby.sort((left, right) => left.distance - right.distance);
        if (this.nearby.length > MAX_ATTACK_CANDIDATES) this.nearby.pop();
      } else if (checkMovement && distance < runnerDistance && !this.recentMovement.has(id) &&
          Math.abs(a.x[i] - b.x[next]) + Math.abs(a.z[i] - b.z[next]) > .13) {
        runner = i;
        runnerDistance = distance;
      }
    }

    let dangerous = false;
    for (const cue of this.nearby.slice(0, 2)) {
      const windup = cue.phase === 'windup';
      const close = cue.distance < 12 ** 2;
      // Warriors reuse the swarm voice: the hunter higher and sharper, the breacher deep and loud.
      const voice = CASTE_VOICE[cue.type] ?? CASTE_VOICE[0];
      const played = this.follow(cue.id, this.takes.pick(cue.phase, windup ? 'schabe-hiss' : 'schabe-impact', windup ? 3 : 2),
        cue.x, cue.z, (windup ? .95 : .66) * voice.level, (close ? PRIORITY.threat + 12 : PRIORITY.combat) - Math.sqrt(cue.distance) / 7,
        [4, ATTACK_RANGE], voice.pitch);
      if (played) {
        if (windup) this.windups++;
        else this.impacts++;
      }
      dangerous ||= !!played && close;
    }
    if (dangerous) this.engine.duck(.58);
    if (runner >= 0 && !this.nearby.length && !priming) {
      const id = a.id[runner];
      this.nextMove = tick + NET.tickHz * .38;
      this.recentMovement.set(id, tick + NET.tickHz * 1.15);
      this.follow(id, this.takes.pick('movement', 'schabe-chitter', 3), a.x[runner], a.z[runner], .30, PRIORITY.combat - 9,
        [3, MOVEMENT_RANGE]);
    }
    if (checkCluster) {
      this.nextCluster = tick + NET.tickHz * (1.2 + Math.random() * 1.9);
      let strength = 0, x = 0, z = 0;
      for (const cell of this.clusters.values()) {
        if (cell.count < 8) continue;
        const cx = cell.x / cell.count, cz = cell.z / cell.count;
        const score = Math.min(60, cell.count) / Math.max(32, Math.hypot(cx - listener.x, cz - listener.z));
        if (score <= strength) continue;
        strength = score; x = cx; z = cz;
      }
      if (strength && !priming) this.engine.play(this.takes.pick('swarm', 'schabe-chitter', 3), {
        bus: 'weapons', owner: 'swarm', position: this.position(x, z), range: [22, CLUSTER_RANGE],
        priority: PRIORITY.detail, level: Math.min(.39, .19 + strength * .11), pitch: .57 + Math.random() * .21,
      });
    }
    this.updateMs = performance.now() - started;
    this.peakMs = Math.max(this.peakMs, this.updateMs);
    this.scans++;
  }

  private position(x: number, z: number): AudioPosition { return { x, y: groundHeight(this.world, x, z) + .7, z }; }

  private follow(id: number, sample: string, x: number, z: number, level: number, priority: number,
    range: readonly [number, number], pitch = 1): SampleVoice | undefined {
    const voice = this.engine.play(sample, { bus: 'weapons', owner: 'enemy:' + id, pitch: (.87 + Math.random() * .22) * pitch,
      position: this.position(x, z), range, level, priority });
    if (voice) this.tracked.set(voice, id);
    return voice;
  }

  clear(): void {
    for (const voice of this.tracked.keys()) voice.stop();
    this.tracked.clear();
    this.attacks.clear();
    this.recentMovement.clear();
    this.takes.clear();
    this.lastScan = -Infinity;
    this.nextMove = this.nextCluster = 0;
    this.world = undefined;
    this.updateMs = this.peakMs = this.scans = this.windups = this.impacts = 0;
  }
}

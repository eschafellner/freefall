import { HordeFrame, INTERPOLATION, NET, decodeHorde } from '@freefall/shared';
import type { PlayersSnapshot } from '@freefall/shared';

const TICK_MS = 1000 / NET.tickHz;
const HISTORY = 12;

interface Ticked {
  tick: number;
}

export interface TimelineOptions {
  /** Ticks the playback clock may run past the newest snapshot. 0 holds the newest snapshot. */
  extrapolationTicks?: number;
}

/**
 * Snapshot buffer keyed by authoritative server ticks.
 *
 * Arrival times give a per-packet clock offset (arrival − tick · 33.3 ms). The smallest offset in a
 * sliding window is the fastest observed path; the spread above it is network and send jitter.
 * The playback tick trails that path by the largest snapshot gap plus the 95th-percentile jitter and a
 * margin, bounded by INTERPOLATION. Playback runs at real time and is nudged by at most ±8 % toward
 * that target, so delay changes never jump or stall. Only offsets larger than `resyncTicks` re-anchor.
 */
export class Timeline<T extends Ticked> {
  private readonly frames: T[] = [];
  private readonly offsets: { at: number; offset: number; tick: number }[] = [];
  private readonly extrapolationTicks: number;
  private base: number | undefined;
  private lastSample: number | undefined;
  private renderTick = -Infinity;
  before: T | undefined;
  after: T | undefined;
  alpha = 0;
  /** Target render delay behind the fastest observed path, in ticks. */
  delayTicks: number = NET.interpolationTicks;
  /** 95th-percentile arrival jitter in ticks. */
  jitterTicks = 0;
  /** Measured snapshot arrival rate in Hz. */
  rate = 0;
  /** Largest tick gap between consecutive snapshots in the window. */
  gapTicks = 0;
  /** Frames sampled past the newest snapshot (extrapolated) or held at the cap. */
  extrapolatedFrames = 0;
  heldFrames = 0;

  constructor(options: TimelineOptions = {}) {
    this.extrapolationTicks = options.extrapolationTicks ?? 0;
  }

  get latest(): T | undefined { return this.frames.at(-1); }
  /** Playback position in server ticks (fractional). */
  get tick(): number { return this.renderTick; }
  /** Current distance between the newest snapshot and the playback position, in ticks. */
  get bufferedTicks(): number { return (this.frames.at(-1)?.tick ?? 0) - this.renderTick; }

  push(frame: T, now = performance.now()): boolean {
    const head = this.frames.at(-1);
    if (frame.tick <= (head?.tick ?? -1)) return false;
    const offset = now - frame.tick * TICK_MS;
    this.offsets.push({ at: now, offset, tick: frame.tick });
    while (this.offsets.length > 2 && now - this.offsets[0].at > INTERPOLATION.windowMs) this.offsets.shift();
    let base = Infinity;
    let gap = 0;
    for (let i = 0; i < this.offsets.length; i++) {
      base = Math.min(base, this.offsets[i].offset);
      if (i) gap = Math.max(gap, this.offsets[i].tick - this.offsets[i - 1].tick);
    }
    const spread = this.offsets.map((entry) => entry.offset - base).sort((a, b) => a - b);
    this.jitterTicks = spread[Math.max(0, Math.ceil(spread.length * .95) - 1)] / TICK_MS;
    // A single frame says nothing about the cadence. Assume the nominal player rate until there are two.
    this.gapTicks = gap || NET.tickHz / NET.playerHz;
    const span = this.offsets.length > 1 ? (now - this.offsets[0].at) / 1000 : 0;
    this.rate = span > 0 ? (this.offsets.length - 1) / span : 0;
    this.delayTicks = Math.min(INTERPOLATION.maxTicks, Math.max(INTERPOLATION.minTicks,
      this.gapTicks + this.jitterTicks + INTERPOLATION.marginTicks));
    this.base = base;
    this.frames.push(frame);
    if (this.frames.length > HISTORY) this.frames.shift();
    return true;
  }

  sample(now: number): void {
    const head = this.frames.at(-1);
    if (!head || this.base === undefined) return;
    const target = (now - this.base) / TICK_MS - this.delayTicks;
    const elapsed = this.lastSample === undefined ? 0 : Math.max(0, now - this.lastSample) / TICK_MS;
    this.lastSample = now;
    if (!Number.isFinite(this.renderTick) || Math.abs(target - this.renderTick) > INTERPOLATION.resyncTicks) {
      this.renderTick = target;
    } else {
      const adjust = Math.max(-INTERPOLATION.maxRateAdjust, Math.min(INTERPOLATION.maxRateAdjust, (target - this.renderTick) * .25));
      this.renderTick += elapsed * (1 + adjust);
    }
    const limit = head.tick + this.extrapolationTicks;
    if (this.renderTick > head.tick) {
      if (this.renderTick >= limit) this.heldFrames++;
      else this.extrapolatedFrames++;
    }
    // Never run ahead of what may be shown; the playback clock resumes from here.
    const tick = Math.min(this.renderTick, limit);
    this.renderTick = tick;

    let i = this.frames.length - 1;
    while (i > 0 && this.frames[i].tick > tick) i--;
    if (this.frames[i].tick > tick || this.frames.length === 1) {
      this.before = this.after = this.frames[i];
      this.alpha = 0;
      return;
    }
    if (i === this.frames.length - 1) {
      // Past the newest snapshot: continue the last segment linearly (bounded above), or hold.
      const previous = this.frames[i - 1];
      if (this.extrapolationTicks > 0 && previous && tick > head.tick) {
        this.before = previous;
        this.after = head;
        this.alpha = (tick - previous.tick) / (head.tick - previous.tick);
      } else {
        this.before = this.after = head;
        this.alpha = 0;
      }
      return;
    }
    this.before = this.frames[i];
    this.after = this.frames[i + 1];
    this.alpha = Math.max(0, Math.min(1, (tick - this.before.tick) / (this.after.tick - this.before.tick)));
  }
}

export class MatchTimeline {
  readonly players = new Timeline<PlayersSnapshot>({ extrapolationTicks: INTERPOLATION.extrapolationTicks });
  readonly horde = new Timeline<HordeFrame>();
  private readonly pool = Array.from({ length: HISTORY + 1 }, () => new HordeFrame());
  private writeIndex = 0;
  private lastTick = -1;

  receiveHorde(packet: Uint8Array, scale?: number, now = performance.now()): void {
    const frame = this.pool[this.writeIndex];
    if (!decodeHorde(packet, frame, scale) || frame.tick <= this.lastTick) return;
    this.lastTick = frame.tick;
    this.horde.push(frame, now);
    this.writeIndex = (this.writeIndex + 1) % this.pool.length;
  }
}

import { HordeFrame, NET, decodeHorde } from '@freefall/shared';
import type { PlayersSnapshot } from '@freefall/shared';

const TICK_MS = 1000 / NET.tickHz;
const HISTORY = 12;

interface Ticked {
  tick: number;
}

export class Timeline<T extends Ticked> {
  private readonly frames: T[] = [];
  private origin: number | undefined;
  private renderedTick = -Infinity;
  before: T | undefined;
  after: T | undefined;
  alpha = 0;

  get latest(): T | undefined { return this.frames.at(-1); }

  push(frame: T): void {
    if (frame.tick <= (this.frames.at(-1)?.tick ?? -1)) return;
    const arrivalOrigin = performance.now() - frame.tick * TICK_MS;
    if (this.origin === undefined || Math.abs(this.origin - arrivalOrigin) > 400) {
      this.origin = arrivalOrigin;
    } else {
      this.origin += (arrivalOrigin - this.origin) * 0.16;
    }
    this.frames.push(frame);
    if (this.frames.length > HISTORY) this.frames.shift();
  }

  sample(now: number): void {
    const head = this.frames.at(-1);
    if (!head || this.origin === undefined) return;

    const estimate = (now - this.origin) / TICK_MS - NET.interpolationTicks;
    const tick = Math.min(head.tick, Math.max(this.renderedTick, estimate));
    this.renderedTick = tick;
    let i = this.frames.length - 1;
    while (i > 0 && this.frames[i].tick > tick) i--;
    this.before = this.frames[i];
    this.after = this.frames[i + 1] ?? this.before;
    this.alpha = this.before === this.after ? 0
      : Math.max(0, Math.min(1, (tick - this.before.tick) / (this.after.tick - this.before.tick)));
  }
}

export class MatchTimeline {
  readonly players = new Timeline<PlayersSnapshot>();
  readonly horde = new Timeline<HordeFrame>();
  private readonly pool = Array.from({ length: HISTORY + 1 }, () => new HordeFrame());
  private writeIndex = 0;
  private lastTick = -1;

  receiveHorde(packet: Uint8Array, scale?: number): void {
    const frame = this.pool[this.writeIndex];
    if (!decodeHorde(packet, frame, scale) || frame.tick <= this.lastTick) return;
    this.lastTick = frame.tick;
    this.horde.push(frame);
    this.writeIndex = (this.writeIndex + 1) % this.pool.length;
  }
}

import { NET } from '@freefall/shared';

const STEP_MS = 1000 / NET.tickHz;

export class FixedLoop {
  private accumulator = 0;
  dropped = 0;

  advance(elapsedMs: number, step: () => void): void {
    this.accumulator += elapsedMs;
    const available = Math.floor(this.accumulator / STEP_MS);
    if (available === 0) return;
    this.accumulator -= available * STEP_MS;
    const count = Math.min(available, NET.catchUpSteps);
    this.dropped += available - count;
    for (let i = 0; i < count; i++) step();
  }
}

export function timingStats(values: number[]): { mean: number; p95: number; p99: number; max: number } {
  if (!values.length) return { mean: 0, p95: 0, p99: 0, max: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    mean: values.reduce((sum, ms) => sum + ms, 0) / values.length,
    p95: sorted[Math.ceil(values.length * 0.95) - 1],
    p99: sorted[Math.ceil(values.length * 0.99) - 1],
    max: sorted[values.length - 1],
  };
}

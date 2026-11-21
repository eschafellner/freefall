import type { HordeFrame } from '@freefall/shared';

/** Sample the existing mesh's pitch on the same server clock as its interpolated position. */
export function enemyAttackPitch(before: HordeFrame, index: number, after: HordeFrame, next: number | undefined,
  tick: number): number {
  const age = before.attackAge[index];
  let frame = before;
  let start = age ? before.tick - age + 1 : Infinity;
  if (next !== undefined && after.attackAge[next]) {
    const nextStart = after.tick - after.attackAge[next] + 1;
    if (nextStart <= tick && (age ? nextStart >= start : nextStart >= before.tick)) {
      frame = after;
      start = nextStart;
    }
  }
  const elapsed = tick - start;
  if (elapsed < 0) return 0;
  if (elapsed < frame.windupTicks) return .18 * (elapsed / frame.windupTicks);
  if (elapsed < frame.windupTicks + frame.activeTicks) return -.14;
  const recovery = (elapsed - frame.windupTicks - frame.activeTicks) / frame.recoveryTicks;
  return recovery < 1 ? -.14 * (1 - recovery) : 0;
}

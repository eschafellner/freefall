export { landscapeNoise, noise, smoothstep } from '@freefall/shared';

export function randomSource(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

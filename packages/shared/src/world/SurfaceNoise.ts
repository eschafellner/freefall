export function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 0x100000000;
}

export function noise(x: number, y: number, seed = 0, periodX?: number, periodY = periodX): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const sx = smoothstep(0, 1, x - i);
  const sy = smoothstep(0, 1, y - j);
  const ax = periodX ? ((i % periodX) + periodX) % periodX : i;
  const ay = periodY ? ((j % periodY) + periodY) % periodY : j;
  const bx = periodX ? (ax + 1) % periodX : i + 1;
  const by = periodY ? (ay + 1) % periodY : j + 1;
  const a = hash(ax, ay, seed);
  const b = hash(ax, by, seed);
  return (a + (hash(bx, ay, seed) - a) * sx) * (1 - sy) +
    (b + (hash(bx, by, seed) - b) * sx) * sy;
}

export function landscapeNoise(x: number, z: number, seed = 0): number {
  return noise(x, z, seed) * 0.57 + noise(x * 2.1, z * 2.1, seed + 1) * 0.28 +
    noise(x * 4.3, z * 4.3, seed + 2) * 0.15;
}

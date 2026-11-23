import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, terrainHeight } from '@freefall/shared';
import type { Heightfield } from '@freefall/shared';
import { landscapeNoise, smoothstep } from './noise.ts';

type Tint = readonly [r: number, g: number, b: number];
interface MacroPalette {
  /** Broad patches blend between these two multipliers. */
  readonly lush: Tint;
  readonly dry: Tint;
  /** Applied in hollows and on crests (local relief). */
  readonly hollow: Tint;
  readonly crest: Tint;
}

/**
 * Large-scale (50–150 m) colour variation on top of the four surface layers. Purely visual: the shared surface weights
 * that drive footsteps and detail placement stay untouched. Multipliers stay close to 1 so the muted art-bible palette
 * keeps its character.
 */
export const MACRO_PALETTES: Readonly<Record<string, MacroPalette>> = {
  [GREEN_PLAINS_ID]: { lush: [.88, 1.0, .86], dry: [1.16, 1.08, .80], hollow: [.80, .87, .80], crest: [1.08, 1.05, .92] },
  [DESERT_ID]: { lush: [1.07, .92, .82], dry: [1.08, 1.06, 1.03], hollow: [.86, .84, .83], crest: [1.07, 1.05, 1.0] },
  [ICE_ID]: { lush: [.90, .97, 1.07], dry: [.97, .96, .94], hollow: [.86, .93, 1.04], crest: [1.07, 1.07, 1.06] },
  [FOREST_ID]: { lush: [.88, 1.07, .86], dry: [1.10, .95, .82], hollow: [.78, .82, .78], crest: [1.05, 1.02, .94] },
};

const NEUTRAL: MacroPalette = { lush: [1, 1, 1], dry: [1, 1, 1], hollow: [1, 1, 1], crest: [1, 1, 1] };
/** Distance of the four neighbour samples used for the local relief. */
export const MACRO_RELIEF_SPAN = 12;

/** Height above the mean of the four neighbours; positive on crests, negative in hollows. */
export function localRelief(height: number, sample: (x: number, z: number) => number, x: number, z: number): number {
  const s = MACRO_RELIEF_SPAN;
  return height - (sample(x + s, z) + sample(x - s, z) + sample(x, z + s) + sample(x, z - s)) / 4;
}

/** Relief sampler for the playable heightfield, clamped to its border like the horizon seam. */
export function fieldSampler(field: Heightfield): (x: number, z: number) => number {
  const clamp = (value: number) => Math.max(-field.half, Math.min(field.half, value));
  return (x, z) => terrainHeight(field, clamp(x), clamp(z));
}

export function macroTint(planet: string, seed: number, x: number, z: number, relief: number, out: number[] = [0, 0, 0]): number[] {
  const palette = MACRO_PALETTES[planet] ?? NEUTRAL;
  const broad = landscapeNoise(x / 150, z / 150, seed + 501);
  const middle = landscapeNoise(x / 48, z / 48, seed + 517);
  const t = smoothstep(.36, .64, broad * .7 + middle * .3);
  const shape = Math.max(-1, Math.min(1, relief / 1.6));
  const hollow = Math.max(0, -shape), crest = Math.max(0, shape);
  for (let i = 0; i < 3; i++) {
    const base = palette.lush[i] + (palette.dry[i] - palette.lush[i]) * t;
    out[i] = base * (1 + (palette.hollow[i] - 1) * hollow) * (1 + (palette.crest[i] - 1) * crest);
  }
  return out;
}

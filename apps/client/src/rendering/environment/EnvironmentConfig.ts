import { ARENA_HALF, ARENA_PAD } from '@freefall/shared';

export const ENVIRONMENT = {
  half: ARENA_HALF,
  // Leave room for the agents' silhouettes and the shoulder camera at the limit.
  perimeter: ARENA_HALF + 6,
  extent: 228,
  pad: ARENA_PAD,
  roadX: 10,
  colors: {
    soil: 0x817057,
    silt: 0x514940,
    slate: 0x67685e,
    concrete: 0x7b7c70,
    olive: 0x454e3d,
    steel: 0x383e3e,
    paint: 0xc4bda2,
    amber: 0xa78348,
  },
} as const;

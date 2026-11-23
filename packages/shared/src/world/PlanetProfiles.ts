/** An extra star: lights the scene without shadows and appears as a disc in the sky. */
export interface CelestialSun {
  readonly offset: readonly [x: number, y: number, z: number];
  readonly color: number;
  readonly intensity: number;
  /** Angular radius of the disc in radians. */
  readonly size: number;
}
/** Moon or planet in the sky, lit by the main sun. */
export interface CelestialBody {
  readonly offset: readonly [x: number, y: number, z: number];
  readonly size: number;
  readonly color: number;
  /** Gas giant cloud bands (0 = none). */
  readonly bands?: number;
  /** Ring outer radius in planet radii (0 = none). */
  readonly ring?: number;
}
export interface CelestialSettings {
  /** Angular radius of the main sun's disc in radians (Earth's sun ≈ .0047). */
  readonly sunSize: number;
  readonly suns: readonly CelestialSun[];
  readonly bodies: readonly CelestialBody[];
}

export interface AtmosphereSettings {
  readonly exposure: number;
  readonly sun: {
    readonly offset: readonly [x: number, y: number, z: number];
    readonly color: number;
    readonly intensity: number;
  };
  readonly fill: { readonly sky: number; readonly ground: number; readonly intensity: number };
  readonly environmentIntensity: number;
  readonly shadow: { readonly extent: number; readonly radius: number };
  readonly fog: { readonly color: number; readonly density: number };
  readonly sky: {
    readonly zenith: number;
    readonly clouds: number;
    readonly cloudShadow: number;
    readonly belowHorizon: number;
    readonly cloudThreshold: number;
    readonly cloudScale: number;
    readonly hazeHeight: number;
    readonly sunGlow: number;
  };
  readonly celestial?: CelestialSettings;
}

export interface PlanetAtmosphereProfile extends AtmosphereSettings {
  readonly id: string;
}

export interface PlanetProfile {
  readonly id: string;
  readonly version: number;
  readonly displayName: string;
  readonly biome: string;
  readonly half: number;
  readonly step: number;
  readonly chunkCells: number;
  readonly grade: number;
  readonly relief: readonly [broad: number, middle: number, detail: number];
  readonly solidCount: number;
  readonly surface: {
    readonly base: number;
    readonly exposed: number;
    readonly rock: number;
    readonly vegetation: number;
  };
  readonly atmosphere: PlanetAtmosphereProfile;
  readonly landmarks: readonly string[];
}

const scale = { half: 240, step: 4, chunkCells: 15, grade: .46, version: 2 };
export const GREEN_PLAINS_ID = 'green-plains';
export const DESERT_ID = 'desert';
export const ICE_ID = 'ice';
export const FOREST_ID = 'forest';

export const WORLD_PROFILES: ReadonlyMap<string, PlanetProfile> = new Map(Object.entries({
  [GREEN_PLAINS_ID]: {
    ...scale, id: GREEN_PLAINS_ID, displayName: 'Grüne Ebene', biome: 'temperate-grassland',
    relief: [16, 6.5, 1.25], solidCount: 60,
    surface: { base: 0x626d3e, exposed: 0x514834, rock: 0x74746b, vegetation: 0x7d8348 },
    atmosphere: {
      id: 'green-plains.daylight.v2', exposure: 1.07,
      sun: { offset: [-71, 73, 45], color: 0xffecd2, intensity: 1.74 },
      fill: { sky: 0xc2d8ee, ground: 0x8c8a58, intensity: 1.04 }, environmentIntensity: .36,
      shadow: { extent: 81, radius: 2.6 }, fog: { color: 0xa5b3ad, density: .0035 },
      sky: { zenith: 0x7795ac, clouds: 0xd8dad4, cloudShadow: 0x7a8791, belowHorizon: 0x666e5d,
        cloudThreshold: .42, cloudScale: .92, hazeHeight: .28, sunGlow: .75 },
      celestial: { sunSize: .0085, suns: [],
        bodies: [{ offset: [62, 21, -70], size: .085, color: 0xc9b9a0, bands: 7, ring: 2.15 }] },
    },
    landmarks: ['Hügelgruppe', 'Felsblock', 'Baumgruppe'],
  },
  [DESERT_ID]: {
    ...scale, id: DESERT_ID, displayName: 'Wüste', biome: 'arid-desert', grade: .51,
    relief: [12, 7, 1.1], solidCount: 66,
    surface: { base: 0xa08358, exposed: 0x876444, rock: 0x80614c, vegetation: 0x887650 },
    atmosphere: {
      id: 'desert.three-suns.v3', exposure: 1.01,
      sun: { offset: [76, 62, 44], color: 0xffe6c4, intensity: 1.8 },
      // Amber shadows: warm sand bounce from below, dusty warm sky.
      fill: { sky: 0xdacbb2, ground: 0xb47c4c, intensity: 1.0 }, environmentIntensity: .27,
      shadow: { extent: 85, radius: 1.45 }, fog: { color: 0xbca993, density: .0041 },
      sky: { zenith: 0x899fa7, clouds: 0xd5c8b7, cloudShadow: 0xb3aa9d, belowHorizon: 0x8d7a66,
        cloudThreshold: .69, cloudScale: .73, hazeHeight: .54, sunGlow: .7 },
      // A hot primary, a swollen orange companion low in the west and a small blue-white dwarf.
      celestial: { sunSize: .011, bodies: [], suns: [
        { offset: [-58, 30, 66], color: 0xff7f3a, intensity: .48, size: .024 },
        { offset: [20, 80, -48], color: 0xbfd6ff, intensity: .24, size: .0035 },
      ] },
    },
    landmarks: ['Canyon', 'Sandsteinbogen', 'Dünenkamm'],
  },
  [ICE_ID]: {
    ...scale, id: ICE_ID, displayName: 'Eiswelt', biome: 'glacial', grade: .49,
    relief: [18, 8, 1.5], solidCount: 70,
    surface: { base: 0xc3cbd0, exposed: 0x7b9ba7, rock: 0x606d75, vegetation: 0x91aabb },
    atmosphere: {
      id: 'ice.small-sun.v3', exposure: 1,
      sun: { offset: [-38, 60, 81], color: 0xe2ecff, intensity: 1.16 },
      // Teal shadows from the cold sky and the blue ice bounce.
      fill: { sky: 0xb6d8ea, ground: 0x74a2b6, intensity: 1.22 }, environmentIntensity: .28,
      shadow: { extent: 84, radius: 2.1 }, fog: { color: 0xabbac6, density: .0044 },
      sky: { zenith: 0x7a92ab, clouds: 0xc0cbd1, cloudShadow: 0x657586, belowHorizon: 0x85919b,
        cloudThreshold: .36, cloudScale: .86, hazeHeight: .36, sunGlow: .2 },
      // A far, small white star: point-like disc, crisp shadows, little warmth.
      celestial: { sunSize: .0032, suns: [], bodies: [] },
    },
    landmarks: ['Gletscherzunge', 'Eisformation', 'Eisplateau'],
  },
  [FOREST_ID]: {
    ...scale, id: FOREST_ID, displayName: 'Wald', biome: 'temperate-forest',
    relief: [19, 7, 1.55], solidCount: 500,
    surface: { base: 0x4c4b34, exposed: 0x594535, rock: 0x63675a, vegetation: 0x5b6f3b },
    atmosphere: {
      id: 'forest.filtered-day.v2', exposure: 1.12,
      sun: { offset: [64, 84, -40], color: 0xf6edd2, intensity: 1.5 },
      // Green-filtered fill: canopy-tinted sky light and mossy bounce.
      fill: { sky: 0xbcd7c6, ground: 0x76795a, intensity: 1.18 }, environmentIntensity: .33,
      shadow: { extent: 76, radius: 2.75 }, fog: { color: 0x85938b, density: .0052 },
      sky: { zenith: 0x7b9294, clouds: 0xc2c9be, cloudShadow: 0x73827f, belowHorizon: 0x59655b,
        cloudThreshold: .36, cloudScale: 1.07, hazeHeight: .34, sunGlow: .49 },
      celestial: { sunSize: .0085, suns: [], bodies: [
        { offset: [-70, 38, 52], size: .032, color: 0xb6c4c0 },
        { offset: [-40, 46, 75], size: .014, color: 0xc9a98a },
      ] },
    },
    landmarks: ['Waldlichtung', 'Alter Baum', 'Felsformation'],
  },
} satisfies Record<string, PlanetProfile>));

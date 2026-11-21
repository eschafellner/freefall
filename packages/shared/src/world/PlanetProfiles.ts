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

const scale = { half: 240, step: 4, chunkCells: 15, grade: .46, version: 1 };
export const GREEN_PLAINS_ID = 'green-plains';
export const DESERT_ID = 'desert';
export const ICE_ID = 'ice';
export const FOREST_ID = 'forest';

export const WORLD_PROFILES: ReadonlyMap<string, PlanetProfile> = new Map(Object.entries({
  [GREEN_PLAINS_ID]: {
    ...scale, id: GREEN_PLAINS_ID, displayName: 'Grüne Ebene', biome: 'temperate-grassland',
    relief: [16, 6.5, 1.25], solidCount: 34,
    surface: { base: 0x626d3e, exposed: 0x514834, rock: 0x74746b, vegetation: 0x7d8348 },
    atmosphere: {
      id: 'green-plains.daylight.v1', exposure: 1,
      sun: { offset: [-71, 73, 45], color: 0xffedd8, intensity: 1.62 },
      fill: { sky: 0xc8d8e7, ground: 0x8a836a, intensity: 1.18 }, environmentIntensity: .39,
      shadow: { extent: 81, radius: 2.6 }, fog: { color: 0xa5b3ad, density: .0035 },
      sky: { zenith: 0x7795ac, clouds: 0xd8dad4, cloudShadow: 0x7a8791, belowHorizon: 0x666e5d,
        cloudThreshold: .42, cloudScale: .92, hazeHeight: .28, sunGlow: .75 },
    },
    landmarks: ['Hügelgruppe', 'Felsblock', 'Baumgruppe'],
  },
  [DESERT_ID]: {
    ...scale, id: DESERT_ID, displayName: 'Wüste', biome: 'arid-desert', grade: .51,
    relief: [12, 7, 1.1], solidCount: 40,
    surface: { base: 0xa08358, exposed: 0x876444, rock: 0x80614c, vegetation: 0x887650 },
    atmosphere: {
      id: 'desert.dry-day.v1', exposure: .98,
      sun: { offset: [76, 62, 44], color: 0xffe4c5, intensity: 1.94 },
      fill: { sky: 0xc7d5db, ground: 0x9e8368, intensity: 1.08 }, environmentIntensity: .28,
      shadow: { extent: 85, radius: 1.45 }, fog: { color: 0xbca993, density: .0041 },
      sky: { zenith: 0x899fa7, clouds: 0xd5c8b7, cloudShadow: 0xb3aa9d, belowHorizon: 0x8d7a66,
        cloudThreshold: .69, cloudScale: .73, hazeHeight: .54, sunGlow: 1.08 },
    },
    landmarks: ['Canyon', 'Sandsteinbogen', 'Dünenkamm'],
  },
  [ICE_ID]: {
    ...scale, id: ICE_ID, displayName: 'Eiswelt', biome: 'glacial', grade: .49,
    relief: [18, 8, 1.5], solidCount: 42,
    surface: { base: 0xc3cbd0, exposed: 0x7b9ba7, rock: 0x606d75, vegetation: 0x91aabb },
    atmosphere: {
      id: 'ice.overcast-day.v1', exposure: .92,
      sun: { offset: [-38, 65, 81], color: 0xe0edff, intensity: 1.08 },
      fill: { sky: 0xd3e0ed, ground: 0x8699af, intensity: 1.38 }, environmentIntensity: .29,
      shadow: { extent: 84, radius: 3.45 }, fog: { color: 0xabbac6, density: .0044 },
      sky: { zenith: 0x8297ac, clouds: 0xc0cbd1, cloudShadow: 0x657586, belowHorizon: 0x85919b,
        cloudThreshold: .24, cloudScale: .86, hazeHeight: .36, sunGlow: .24 },
    },
    landmarks: ['Gletscherzunge', 'Eisformation', 'Eisplateau'],
  },
  [FOREST_ID]: {
    ...scale, id: FOREST_ID, displayName: 'Wald', biome: 'temperate-forest',
    relief: [19, 7, 1.55], solidCount: 500,
    surface: { base: 0x4c4b34, exposed: 0x594535, rock: 0x63675a, vegetation: 0x5b6f3b },
    atmosphere: {
      id: 'forest.filtered-day.v1', exposure: 1.05,
      sun: { offset: [64, 84, -40], color: 0xf2ecda, intensity: 1.36 },
      fill: { sky: 0xc6d7d4, ground: 0x8b7e6b, intensity: 1.36 }, environmentIntensity: .35,
      shadow: { extent: 76, radius: 2.75 }, fog: { color: 0x85938b, density: .0052 },
      sky: { zenith: 0x7b9294, clouds: 0xc2c9be, cloudShadow: 0x73827f, belowHorizon: 0x59655b,
        cloudThreshold: .36, cloudScale: 1.07, hazeHeight: .34, sunGlow: .49 },
    },
    landmarks: ['Waldlichtung', 'Alter Baum', 'Felsformation'],
  },
} satisfies Record<string, PlanetProfile>));

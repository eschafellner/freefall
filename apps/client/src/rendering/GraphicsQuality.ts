export const GRAPHICS_QUALITY = {
  low: {
    resolutionScale: 0.68, maxPixelRatio: 1, shadowMapSize: 0, gravelDistance: 13, brushDistance: 0,
    enemyNear: 12, enemyFar: 30, enemyShadowDistance: 10, effectSlots: 20, impactParticles: 3, fxaa: false,
    muzzleFlashes: 6, shellCasings: 4, muzzleLight: 0, muzzleDistance: 26, casingDistance: 0,
    explosionSlots: 4, explosionSmoke: 2, explosionDust: 2, explosionDebris: 4, explosionLight: 0,
    environmentDetailDensity: .30, environmentDetailDistance: 21, terrainTextureDistance: 52, environmentLodDistance: 45,
    weatherParticles: 64, vegetationMotion: .58,
  },
  medium: {
    resolutionScale: 0.9, maxPixelRatio: 1.3, shadowMapSize: 1024, gravelDistance: 23, brushDistance: 20,
    enemyNear: 21, enemyFar: 48, enemyShadowDistance: 23, effectSlots: 36, impactParticles: 6, fxaa: false,
    muzzleFlashes: 10, shellCasings: 16, muzzleLight: 0, muzzleDistance: 42, casingDistance: 13,
    explosionSlots: 8, explosionSmoke: 4, explosionDust: 4, explosionDebris: 8, explosionLight: 11,
    environmentDetailDensity: .72, environmentDetailDistance: 40, terrainTextureDistance: 100, environmentLodDistance: 69,
    weatherParticles: 176, vegetationMotion: .84,
  },
  high: {
    resolutionScale: 1, maxPixelRatio: 1.65, shadowMapSize: 2048, gravelDistance: 38, brushDistance: 44,
    enemyNear: 31, enemyFar: 67, enemyShadowDistance: 33, effectSlots: 56, impactParticles: 9, fxaa: true,
    muzzleFlashes: 16, shellCasings: 32, muzzleLight: 3.5, muzzleDistance: 58, casingDistance: 22,
    explosionSlots: 12, explosionSmoke: 6, explosionDust: 6, explosionDebris: 12, explosionLight: 20,
    environmentDetailDensity: 1, environmentDetailDistance: 57, terrainTextureDistance: 142, environmentLodDistance: 92,
    weatherParticles: 320, vegetationMotion: 1,
  },
} as const;

export type QualityName = keyof typeof GRAPHICS_QUALITY;
export type GraphicsQuality = (typeof GRAPHICS_QUALITY)[QualityName];

const storageKey = 'freefall.graphicsQuality';

export function initialQuality(): QualityName {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    // A browser may block storage in private or embedded contexts.
  }
  return matchMedia('(pointer: coarse)').matches ? 'low' : 'medium';
}

export function rememberQuality(quality: QualityName): void {
  try {
    localStorage.setItem(storageKey, quality);
  } catch {
    // The profile still applies to the current session.
  }
}

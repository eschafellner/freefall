export const GRAPHICS_QUALITY = {
  low: {
    resolutionScale: 0.68, maxPixelRatio: 1, shadowMapSize: 0, gravelDistance: 13, brushDistance: 0,
    enemyNear: 12, enemyFar: 30, enemyShadowDistance: 10, effectSlots: 20, impactParticles: 3, fxaa: false,
  },
  medium: {
    resolutionScale: 0.9, maxPixelRatio: 1.3, shadowMapSize: 1024, gravelDistance: 23, brushDistance: 20,
    enemyNear: 21, enemyFar: 48, enemyShadowDistance: 23, effectSlots: 36, impactParticles: 6, fxaa: false,
  },
  high: {
    resolutionScale: 1, maxPixelRatio: 1.65, shadowMapSize: 2048, gravelDistance: 38, brushDistance: 44,
    enemyNear: 31, enemyFar: 67, enemyShadowDistance: 33, effectSlots: 56, impactParticles: 9, fxaa: true,
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

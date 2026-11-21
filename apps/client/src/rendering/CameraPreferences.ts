const KEY = 'freefall.camera.v1';
const DEFAULTS = { shake: 1, smoothing: 1, follow: 1, sensitivity: 1, muzzleFlash: 1, reducedMotion: false };
export type CameraPreferences = typeof DEFAULTS;

export function normalizeCameraPreferences(data: unknown, systemReducedMotion = false): CameraPreferences {
  const raw = data && typeof data === 'object' ? data as Partial<CameraPreferences> : {};
  const number = (key: Exclude<keyof CameraPreferences, 'reducedMotion'>, min: number, max: number) => {
    const value = raw[key];
    return typeof value === 'number' && value >= min && value <= max ? value : DEFAULTS[key];
  };
  return {
    shake: number('shake', 0, 1), smoothing: number('smoothing', .5, 2), follow: number('follow', .5, 2),
    sensitivity: number('sensitivity', .25, 3), muzzleFlash: number('muzzleFlash', 0, 1),
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : systemReducedMotion,
  };
}

function readPreferences(): CameraPreferences {
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  try {
    return normalizeCameraPreferences(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}'), reducedMotion);
  } catch { return normalizeCameraPreferences(undefined, reducedMotion); }
}

export const cameraPreferences = readPreferences();
export function setCameraPreferences<K extends keyof CameraPreferences>(key: K, value: CameraPreferences[K]): void {
  cameraPreferences[key] = value;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cameraPreferences)); } catch { /* Browser storage is optional. */ }
}

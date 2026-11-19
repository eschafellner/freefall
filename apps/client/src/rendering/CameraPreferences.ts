const KEY = 'freefall.camera.v1';
const DEFAULTS = { shake: 1, smoothing: 1, reducedMotion: false };
export type CameraPreferences = typeof DEFAULTS;

function readPreferences(): CameraPreferences {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Partial<CameraPreferences>;
    return {
      shake: typeof raw.shake === 'number' && raw.shake >= 0 && raw.shake <= 1 ? raw.shake : DEFAULTS.shake,
      smoothing: typeof raw.smoothing === 'number' && raw.smoothing >= .5 && raw.smoothing <= 2 ? raw.smoothing : DEFAULTS.smoothing,
      reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    };
  } catch { return { ...DEFAULTS }; }
}

export const cameraPreferences = readPreferences();
export function setCameraPreferences<K extends keyof CameraPreferences>(key: K, value: CameraPreferences[K]): void {
  cameraPreferences[key] = value;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cameraPreferences)); } catch { /* Browser storage is optional. */ }
}

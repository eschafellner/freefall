export const DEFAULT_BINDINGS = {
  MOVE_FORWARD: 'KeyW', MOVE_BACKWARD: 'KeyS', MOVE_LEFT: 'KeyA', MOVE_RIGHT: 'KeyD',
  SPRINT: 'Shift', CROUCH: 'KeyC', DIVE: 'KeyX', STAND_UP: 'Space',
  AIM: 'Mouse2', FIRE: 'Mouse0', RELOAD: 'KeyR', MELEE: 'KeyV', THROW_GRENADE: 'KeyG',
  USE_STIM: 'KeyH', SWITCH_PRIMARY: 'Digit1', SWITCH_SECONDARY: 'Digit2', INTERACT: 'KeyE', BALLOON: 'KeyB',
} as const;

export type InputAction = keyof typeof DEFAULT_BINDINGS;
export const INPUT_ACTIONS = Object.keys(DEFAULT_BINDINGS) as InputAction[];
export const ACTION_LABELS: Record<InputAction, string> = {
  MOVE_FORWARD: 'Vorwärts', MOVE_BACKWARD: 'Rückwärts', MOVE_LEFT: 'Links', MOVE_RIGHT: 'Rechts',
  SPRINT: 'Sprinten', CROUCH: 'Ducken', DIVE: 'Hechtsprung', STAND_UP: 'Aufstehen',
  AIM: 'Zielen', FIRE: 'Feuern', RELOAD: 'Nachladen', MELEE: 'Nahkampf', THROW_GRENADE: 'Granate',
  USE_STIM: 'Heilstim', SWITCH_PRIMARY: 'Primärwaffe', SWITCH_SECONDARY: 'Sekundärwaffe',
  INTERACT: 'Interagieren', BALLOON: 'Rettungsballon',
};

const STORAGE_KEY = 'freefall.bindings.v1';
const reserved = new Set(['Escape', 'Tab', 'F2', 'F3', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

export const keyboardCode = (code: string): string => code.startsWith('Shift') ? 'Shift' : code;
export const bindingLabel = (code: string): string => ({
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Leertaste',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}[code] ?? code.replace(/^(Key|Digit)/, ''));

function valid(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(code) &&
    keyboardCode(code) === code && code !== 'Unidentified' && !reserved.has(code);
}

export class Bindings {
  private codes: Record<InputAction, string> = { ...DEFAULT_BINDINGS };

  private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage;
    try {
      const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as Partial<Record<InputAction, unknown>> | null;
      if (raw && INPUT_ACTIONS.every((action) => valid(raw[action])) &&
          new Set(INPUT_ACTIONS.map((action) => raw[action])).size === INPUT_ACTIONS.length) {
        for (const action of INPUT_ACTIONS) this.codes[action] = raw[action] as string;
      }
    } catch { /* Browser storage is optional. */ }
  }

  code(action: InputAction): string { return this.codes[action]; }
  label(action: InputAction): string { return bindingLabel(this.code(action)); }

  rebind(action: InputAction, code: string): string | undefined {
    if (!valid(code)) return 'Diese Taste ist reserviert.';
    const conflict = INPUT_ACTIONS.find((other) => other !== action && this.codes[other] === code);
    if (conflict) return `${bindingLabel(code)} ist bereits für „${ACTION_LABELS[conflict]}“ belegt.`;
    this.codes[action] = code;
    this.save();
  }

  reset(): void {
    this.codes = { ...DEFAULT_BINDINGS };
    this.save();
  }

  private save(): void {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.codes)); } catch { /* Browser storage is optional. */ }
  }
}

function browserStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return; }
}

export const bindings = new Bindings(browserStorage());

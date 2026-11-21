export const DEFAULT_BINDINGS = {
  MOVE_FORWARD: 'KeyW', MOVE_BACKWARD: 'KeyS', MOVE_LEFT: 'KeyA', MOVE_RIGHT: 'KeyD',
  SPRINT: 'Shift', CROUCH: 'KeyC', DIVE: 'KeyX', STAND_UP: 'Space',
  AIM: 'Mouse2', FIRE: 'Mouse0', RELOAD: 'KeyR', MELEE: 'KeyV', THROW_GRENADE: 'KeyG',
  USE_STIM: 'KeyH', SWITCH_PRIMARY: 'Digit1', SWITCH_SECONDARY: 'Digit2', INTERACT: 'KeyE', BALLOON: 'KeyB',
} as const;

export type InputAction = keyof typeof DEFAULT_BINDINGS;
export type InputContext = 'gameplay' | 'menu' | 'settings' | 'rebinding';
let menuContext: Exclude<InputContext, 'gameplay'> = 'menu';

export function setMenuInputContext(context: typeof menuContext): void { menuContext = context; }

export function inputContext(pointerLocked: boolean): InputContext {
  return pointerLocked && menuContext === 'menu' ? 'gameplay' : menuContext;
}
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
const keyboardCodes = new Set([
  'Shift', 'Space', 'Enter', 'Backspace', 'CapsLock', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
  'Backquote', 'Backslash', 'BracketLeft', 'BracketRight', 'Comma', 'Equal', 'Minus', 'Period', 'Quote', 'Semicolon',
  'Slash', 'IntlBackslash', 'IntlRo', 'IntlYen', 'KanaMode', 'Convert', 'NonConvert', 'ContextMenu', 'Pause', 'ScrollLock',
  'NumLock', 'NumpadAdd', 'NumpadComma', 'NumpadDecimal', 'NumpadDivide', 'NumpadEnter', 'NumpadEqual', 'NumpadMultiply', 'NumpadSubtract',
]);

export const keyboardCode = (code: string): string => code.startsWith('Shift') ? 'Shift' : code;
/** An action without a key. Happens when a stored binding is incomplete and the default key is already taken. */
export const UNBOUND = '';

export const bindingLabel = (code: string): string => code === UNBOUND ? 'nicht belegt' : ({
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Leertaste',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}[code] ?? code.replace(/^(Key|Digit)/, ''));

function valid(code: unknown): code is string {
  return typeof code === 'string' && !reserved.has(code) &&
    (keyboardCodes.has(code) || /^(Key[A-Z]|(?:Digit|Numpad)[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Mouse[0-4])$/.test(code));
}

export class Bindings {
  private codes: Record<InputAction, string> = { ...DEFAULT_BINDINGS };

  private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage;
    try {
      const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) this.codes = Bindings.merge(raw as Partial<Record<InputAction, unknown>>);
    } catch { /* Browser storage is optional. */ }
  }

  /**
   * Merges a stored, possibly incomplete or partly invalid binding with the defaults. Valid stored keys win (the
   * first action keeps a key that is stored twice). Missing actions, e.g. one added in a later version, get their
   * default key if it is still free, otherwise they stay unbound until the player assigns a key.
   */
  static merge(stored: Partial<Record<InputAction, unknown>>): Record<InputAction, string> {
    const codes = {} as Record<InputAction, string>;
    const used = new Set<string>();
    for (const action of INPUT_ACTIONS) {
      const code = stored[action];
      codes[action] = valid(code) && !used.has(code) ? code : UNBOUND;
      if (codes[action] !== UNBOUND) used.add(codes[action]);
    }
    for (const action of INPUT_ACTIONS) {
      if (codes[action] !== UNBOUND || used.has(DEFAULT_BINDINGS[action])) continue;
      codes[action] = DEFAULT_BINDINGS[action];
      used.add(codes[action]);
    }
    return codes;
  }

  code(action: InputAction): string { return this.codes[action]; }
  label(action: InputAction): string { return bindingLabel(this.code(action)); }
  action(code: string): InputAction | undefined {
    return code ? INPUT_ACTIONS.find((action) => this.codes[action] === code) : undefined;
  }

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

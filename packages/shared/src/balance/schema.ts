/**
 * Minimal, dependency-free schema validation for balance data.
 *
 * Every check receives the raw value and a path such as `weapons.json › weapons[1].damage`. Checks collect all
 * issues instead of stopping at the first one, so a single run reports every broken value with its location.
 */

export class BalanceValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Ungültige Balance-Konfiguration (${issues.length} Fehler):\n  - ${issues.join('\n  - ')}`);
    this.name = 'BalanceValidationError';
    this.issues = issues;
  }
}

export class Issues {
  readonly list: string[] = [];
  add(path: string, message: string): void { this.list.push(`${path}: ${message}`); }
  throwIfAny(): void { if (this.list.length) throw new BalanceValidationError(this.list); }
}

export type Check<T> = (value: unknown, path: string, issues: Issues) => T;
export type Infer<C> = C extends Check<infer T> ? T : never;

/** `weapons.json ›` + `weapons` → `weapons.json › weapons`; nested fields use dots. */
const join = (path: string, key: string): string => path.endsWith('›') ? `${path} ${key}` : `${path}.${key}`;

const describe = (value: unknown): string =>
  value === undefined ? 'fehlt' : `erhalten ${JSON.stringify(value)}`;

export interface NumberRule {
  /** Inclusive lower bound. */
  min?: number;
  /** Inclusive upper bound. */
  max?: number;
  /** Strictly greater than this value. */
  above?: number;
  integer?: boolean;
}

export function num(rule: NumberRule = {}): Check<number> {
  return (value, path, issues) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.add(path, `endliche Zahl erwartet, ${describe(value)}`);
      return Number.NaN;
    }
    if (rule.integer && !Number.isInteger(value)) issues.add(path, `ganze Zahl erwartet, erhalten ${value}`);
    if (rule.min !== undefined && value < rule.min) issues.add(path, `muss ≥ ${rule.min} sein, erhalten ${value}`);
    if (rule.max !== undefined && value > rule.max) issues.add(path, `muss ≤ ${rule.max} sein, erhalten ${value}`);
    if (rule.above !== undefined && value <= rule.above) issues.add(path, `muss > ${rule.above} sein, erhalten ${value}`);
    return value;
  };
}

export const positive = (rule: Omit<NumberRule, 'above'> = {}): Check<number> => num({ ...rule, above: 0 });
export const nonNegative = (rule: Omit<NumberRule, 'min'> = {}): Check<number> => num({ ...rule, min: 0 });
export const count = (rule: Omit<NumberRule, 'integer'> = {}): Check<number> => num({ min: 0, ...rule, integer: true });

export function str(pattern?: RegExp, hint?: string): Check<string> {
  return (value, path, issues) => {
    if (typeof value !== 'string' || !value.trim()) {
      issues.add(path, `nicht-leerer Text erwartet, ${describe(value)}`);
      return '';
    }
    if (pattern && !pattern.test(value)) issues.add(path, `${hint ?? `muss ${pattern} entsprechen`}, erhalten ${JSON.stringify(value)}`);
    return value;
  };
}

/** Stable definition IDs: lower case, digits and the separators `.`, `_` and `-`. */
export const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
export const id = (): Check<string> => str(ID_PATTERN, 'ID aus Kleinbuchstaben, Ziffern und . _ - erwartet');

export function bool(): Check<boolean> {
  return (value, path, issues) => {
    if (typeof value !== 'boolean') issues.add(path, `true oder false erwartet, ${describe(value)}`);
    return value === true;
  };
}

export function oneOf<const T extends readonly (string | number)[]>(options: T): Check<T[number]> {
  return (value, path, issues) => {
    if (!options.includes(value as T[number])) {
      issues.add(path, `einer von ${options.map((o) => JSON.stringify(o)).join(', ')} erwartet, ${describe(value)}`);
    }
    return value as T[number];
  };
}

/** Accepts the first alternative that produces no issues. */
export function either<A, B>(a: Check<A>, b: Check<B>, hint: string): Check<A | B> {
  return (value, path, issues) => {
    for (const check of [a, b] as const) {
      const local = new Issues();
      const result = check(value, path, local);
      if (!local.list.length) return result;
    }
    issues.add(path, `${hint}, ${describe(value)}`);
    return value as A | B;
  };
}

/**
 * A field that the data format already describes but the simulation does not support yet. Only the neutral value
 * is accepted, so a tuning attempt fails loudly instead of being ignored silently.
 */
export function reserved<T extends number | boolean | string>(neutral: T, reason: string): Check<T> {
  return (value, path, issues) => {
    if (value !== neutral) issues.add(path, `noch nicht unterstützt (${reason}). Nur ${JSON.stringify(neutral)} ist zulässig, ${describe(value)}`);
    return neutral;
  };
}

type Shape = Record<string, Check<unknown>>;
export type ObjectOf<S extends Shape> = { readonly [K in keyof S]: Infer<S[K]> };

/** Strict object: missing fields and unknown fields are both reported. */
export function obj<S extends Shape>(shape: S): Check<ObjectOf<S>> {
  return (value, path, issues) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.add(path, `Objekt erwartet, ${describe(value)}`);
      return {} as ObjectOf<S>;
    }
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const result = shape[key](input[key], join(path, key), issues);
      // Optional fields that are absent stay absent, so objects without them compare equal to before.
      if (result !== undefined) output[key] = result;
    }
    for (const key of Object.keys(input)) {
      if (!(key in shape)) issues.add(join(path, key), `unbekanntes Feld. Erlaubt: ${Object.keys(shape).join(', ')}`);
    }
    return output as ObjectOf<S>;
  };
}

/** A field that may be left out. Present values must satisfy `check`. */
export function optional<T>(check: Check<T>): Check<T | undefined> {
  return (value, path, issues) => value === undefined ? undefined : check(value, path, issues);
}

/** Fixed-length list of finite numbers, e.g. a model-space point [x, y, z]. */
export function tuple(length: number, rule: NumberRule = {}): Check<readonly number[]> {
  return (value, path, issues) => {
    if (!Array.isArray(value) || value.length !== length) {
      issues.add(path, `Liste mit ${length} Zahlen erwartet, ${describe(value)}`);
      return Array.from({ length }, () => 0);
    }
    return value.map((entry, index) => num(rule)(entry, `${path}[${index}]`, issues));
  };
}

export function arr<T>(item: Check<T>, rule: { min?: number } = {}): Check<readonly T[]> {
  return (value, path, issues) => {
    if (!Array.isArray(value)) {
      issues.add(path, `Liste erwartet, ${describe(value)}`);
      return [];
    }
    if (rule.min !== undefined && value.length < rule.min) issues.add(path, `mindestens ${rule.min} Einträge erwartet, erhalten ${value.length}`);
    return value.map((entry, index) => item(entry, `${path}[${index}]`, issues));
  };
}

export function record<T>(item: Check<T>, key: Check<string> = id()): Check<Readonly<Record<string, T>>> {
  return (value, path, issues) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.add(path, `Objekt erwartet, ${describe(value)}`);
      return {};
    }
    const output: Record<string, T> = {};
    for (const [name, entry] of Object.entries(value)) {
      key(name, `${path}.<Schlüssel ${JSON.stringify(name)}>`, issues);
      output[name] = item(entry, join(path, name), issues);
    }
    return output;
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

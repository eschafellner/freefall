/**
 * Format-preserving edits of JSON files.
 *
 * The balance files are hand-formatted (single-line calibers, aligned arrays). `JSON.stringify(data, null, 2)` would
 * reformat everything and bury a single value change in a large diff. Instead the editor records the source span of
 * every value and replaces only the text of the changed scalar values.
 */

export type JsonPath = readonly (string | number)[];
export type JsonScalar = string | number | boolean | null;

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Replaces the value at `path`: a scalar by a scalar, or a list by a list (formatted like the file). */
export interface JsonEdit {
  readonly path: JsonPath;
  readonly value: unknown;
}

/**
 * One difference between two JSON documents:
 *   - `value`: a scalar changed,
 *   - `list`: a list changed its length (entries added or removed); `before`/`after` are the whole lists,
 *   - `structure`: anything else (keys added or removed, a type changed). The editor refuses those.
 */
export interface JsonChange {
  readonly path: JsonPath;
  readonly kind: 'value' | 'list' | 'structure';
  readonly before: unknown;
  readonly after: unknown;
}

export const pathKey = (path: JsonPath): string => JSON.stringify(path);

/** Parses `text` as JSON and returns the source span of every value, keyed by `pathKey`. The root has path `[]`. */
export function valueSpans(text: string): Map<string, Span> {
  const spans = new Map<string, Span>();
  const literal = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  let i = 0;
  const fail = (message: string): never => { throw new SyntaxError(`${message} (Zeichen ${i})`); };
  const skip = () => { while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++; };
  const string = (): string => {
    const start = i++;
    while (text[i] !== '"') {
      if (i >= text.length) fail('Zeichenkette nicht abgeschlossen');
      i += text[i] === '\\' ? 2 : 1;
    }
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: (string | number)[]): void => {
    skip();
    const start = i;
    const char = text[i];
    if (char === '{') {
      i++;
      skip();
      if (text[i] === '}') i++;
      else for (;;) {
        skip();
        if (text[i] !== '"') fail('Schlüssel erwartet');
        const key = string();
        skip();
        if (text[i++] !== ':') fail('":" erwartet');
        value([...path, key]);
        skip();
        const next = text[i++];
        if (next === '}') break;
        if (next !== ',') fail('"," oder "}" erwartet');
      }
    } else if (char === '[') {
      i++;
      skip();
      if (text[i] === ']') i++;
      else for (let index = 0; ; index++) {
        value([...path, index]);
        skip();
        const next = text[i++];
        if (next === ']') break;
        if (next !== ',') fail('"," oder "]" erwartet');
      }
    } else if (char === '"') {
      string();
    } else {
      literal.lastIndex = i;
      const match = literal.exec(text);
      if (!match) fail('Wert erwartet');
      i += match![0].length;
    }
    spans.set(pathKey(path), { start, end: i });
  };
  value([]);
  skip();
  if (i !== text.length) fail('Unerwarteter Text nach dem JSON-Wert');
  return spans;
}

export function isScalar(value: unknown): value is JsonScalar {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function getAt(root: unknown, path: JsonPath): unknown {
  let node = root;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

export function setAt(root: unknown, path: JsonPath, value: unknown): void {
  const parent = getAt(root, path.slice(0, -1));
  if (typeof parent !== 'object' || parent === null) throw new Error(`Pfad ${pathKey(path)} existiert nicht`);
  (parent as Record<string | number, unknown>)[path[path.length - 1]!] = value;
}

export function diffJson(before: unknown, after: unknown, path: JsonPath = [], out: JsonChange[] = []): JsonChange[] {
  if (isScalar(before) || isScalar(after)) {
    if (before !== after) out.push({ path, kind: isScalar(before) && isScalar(after) ? 'value' : 'structure', before, after });
  } else if (Array.isArray(before) !== Array.isArray(after)) {
    out.push({ path, kind: 'structure', before, after });
  } else if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) out.push({ path, kind: 'list', before, after });
    else before.forEach((entry, index) => diffJson(entry, after[index], [...path, index], out));
  } else {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length || keys.some((key) => !(key in b))) out.push({ path, kind: 'structure', before, after });
    else for (const key of keys) diffJson(a[key], b[key], [...path, key], out);
  }
  return out;
}

/**
 * Serializes like the hand-written balance files: two-space indentation, lists of numbers and small flat objects on
 * one line. `indent` is the indentation of the line the value starts on.
 */
export function formatJson(value: unknown, indent = ''): string {
  if (isScalar(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(isScalar)) return `[${value.map((entry) => JSON.stringify(entry)).join(', ')}]`;
    return `[\n${value.map((entry) => inner + formatJson(entry, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return '{}';
  if (entries.every(([, entry]) => isScalar(entry))) {
    const flat = `{ ${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${JSON.stringify(entry)}`).join(', ')} }`;
    if (indent.length + flat.length <= 110) return flat;
  }
  return `{\n${entries.map(([key, entry]) => `${inner}${JSON.stringify(key)}: ${formatJson(entry, inner)}`).join(',\n')}\n${indent}}`;
}

/**
 * Replaces values in `text`. Every other byte stays unchanged. A scalar may only replace a scalar and a list only a
 * list, so keys can never be added or removed this way.
 */
export function applyJsonEdits(text: string, edits: readonly JsonEdit[]): string {
  const spans = valueSpans(text);
  const replacements = edits.map(({ path, value }) => {
    const span = spans.get(pathKey(path));
    if (!span) throw new Error(`Pfad ${pathKey(path)} existiert nicht`);
    const opening = text[span.start]!;
    if (Array.isArray(value)) {
      if (opening !== '[') throw new Error(`Pfad ${pathKey(path)} ist keine Liste`);
      const lineStart = text.lastIndexOf('\n', span.start - 1) + 1;
      const indent = /^[ \t]*/.exec(text.slice(lineStart, span.start))![0];
      return { ...span, text: formatJson(value, indent) };
    }
    if ('{['.includes(opening)) throw new Error(`Pfad ${pathKey(path)} ist kein Einzelwert`);
    if (!isScalar(value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`Pfad ${pathKey(path)}: ungültiger Wert ${String(value)}`);
    }
    return { ...span, text: JSON.stringify(value) };
  }).sort((a, b) => b.start - a.start);
  for (let i = 1; i < replacements.length; i++) {
    if (replacements[i]!.end > replacements[i - 1]!.start) throw new Error('Überlappende Änderungen');
  }
  let result = text;
  for (const { start, end, text: replacement } of replacements) result = result.slice(0, start) + replacement + result.slice(end);
  return result;
}

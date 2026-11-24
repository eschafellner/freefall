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

export interface LeafEdit {
  readonly path: JsonPath;
  readonly value: JsonScalar;
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

/**
 * Replaces the text of existing scalar values. Every other byte of `text` stays unchanged. Throws if a path does not
 * name an existing scalar, so structural changes can never slip through.
 */
export function applyLeafEdits(text: string, edits: readonly LeafEdit[]): string {
  const spans = valueSpans(text);
  const replacements = edits.map(({ path, value }) => {
    const span = spans.get(pathKey(path));
    if (!span) throw new Error(`Pfad ${pathKey(path)} existiert nicht`);
    if ('{['.includes(text[span.start]!)) throw new Error(`Pfad ${pathKey(path)} ist kein Einzelwert`);
    if (!isScalar(value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`Pfad ${pathKey(path)}: ungültiger Wert ${String(value)}`);
    }
    return { ...span, text: JSON.stringify(value) };
  }).sort((a, b) => b.start - a.start);
  let result = text;
  for (const { start, end, text: replacement } of replacements) result = result.slice(0, start) + replacement + result.slice(end);
  return result;
}

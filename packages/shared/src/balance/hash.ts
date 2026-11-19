/**
 * Reproducible configuration hash. Object keys are sorted before hashing, so formatting and key order in the JSON
 * files do not change the hash; any value change does. Runs identically in Node and the browser.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a 64 over the UTF-8 bytes of the canonical JSON. 16 hex characters. */
export function balanceHash(value: unknown): string {
  let hash = FNV_OFFSET;
  for (const byte of utf8(canonicalJson(value))) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK;
  return hash.toString(16).padStart(16, '0');
}

function* utf8(text: string): Generator<number> {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) yield code;
    else if (code < 0x800) { yield 0xc0 | code >> 6; yield 0x80 | code & 63; }
    else if (code < 0x10000) { yield 0xe0 | code >> 12; yield 0x80 | code >> 6 & 63; yield 0x80 | code & 63; }
    else { yield 0xf0 | code >> 18; yield 0x80 | code >> 12 & 63; yield 0x80 | code >> 6 & 63; yield 0x80 | code & 63; }
  }
}

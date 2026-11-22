import type { ReactNode } from 'react';

/** Silhouette icons of the carried kit, drawn on a 64 × 24 grid and filled with the current text colour. */
const PATHS: Record<string, ReactNode> = {
  // Kestrel AR-01: stock, receiver with optic rail, handguard, barrel, angled magazine and grip.
  'kestrel-ar-01': <>
    <path d="M1 8.5h9l2.5-2H36l1.5-2.2h6.5v2.2H54v1.6h9v2.2h-9v1.4H38.5l-1.2 1.6h-4.6l-2.4 7.2h-4.9l1.6-6.7h-4.2l-2.6 4.3h-4.6l1.9-4.3H10.6L7 16.6H1z"/>
    <path d="M19 3.4h11v1.8H19z" opacity=".75"/>
  </>,
  // P-01 service pistol.
  'p-01': <path d="M14 6h33.5v2.4H50v2.8H30.2l-1.8 1.4h-3.2l-2.4 8.6h-7.4l2.6-9.2-4-.8z"/>,
  grenade: <>
    <path d="M26.5 7.2h8l1.4 2.4c3.6 1.6 5.9 4.9 5.9 8.4 0 4.8-4.3 6-10.3 6s-10.3-1.2-10.3-6c0-3.5 2.3-6.8 5.9-8.4z"/>
    <path d="M34.2 4.4l7.6 3.2-1 1.7-7.8-2.6z M27.5 3.2h6v3h-6z" opacity=".8"/>
  </>,
  stim: <>
    <path d="M14 9.5h26v5H14z"/><path d="M40 10.8h6v2.4h-6z M46 11.5h12v1H46z" opacity=".8"/>
    <path d="M8 8h6v8H8z M4 11h4v2H4z"/><path d="M22 11h8v2h-8z" fill="#0c1416" opacity=".6"/>
  </>,
};

const SLOT_FALLBACK: Record<string, string> = { primary: 'kestrel-ar-01', secondary: 'p-01' };

export function KitIcon({ id, slot, className = '' }: { id: string; slot?: string; className?: string }) {
  const path = PATHS[id] ?? PATHS[SLOT_FALLBACK[slot ?? ''] ?? ''] ?? PATHS.grenade;
  return <svg className={`kit-icon ${className}`} viewBox="0 0 64 24" aria-hidden="true" fill="currentColor">{path}</svg>;
}

/** Row of charge pips, e.g. stims 3/5. */
export function Pips({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  return <span className={`pips ${className}`} aria-hidden="true">
    {Array.from({ length: max }, (_, i) => <i key={i} className={i < value ? 'on' : ''}/>)}
  </span>;
}

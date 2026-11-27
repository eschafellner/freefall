import type { ReactNode } from 'react';

/** Silhouette icons of the carried kit, drawn on a 64 × 24 grid and filled with the current text colour. */
const PATHS: Record<string, ReactNode> = {
  // Kestrel AR-01: stock, receiver with optic rail, handguard, barrel, angled magazine and grip.
  'kestrel-ar-01': <>
    <path d="M1 8.5h9l2.5-2H36l1.5-2.2h6.5v2.2H54v1.6h9v2.2h-9v1.4H38.5l-1.2 1.6h-4.6l-2.4 7.2h-4.9l1.6-6.7h-4.2l-2.6 4.3h-4.6l1.9-4.3H10.6L7 16.6H1z"/>
    <path d="M19 3.4h11v1.8H19z" opacity=".75"/>
  </>,
  // VX-13 Cerberus: stock, receiver, long barrel over the tube magazine, pump forend and pistol grip.
  'vx-13': <>
    <path d="M1 9h10l2.5-1.8H27v3.8H13.2l-3 5.2H1z"/>
    <path d="M27 7.2h36v1.9H27z M27 10.6h26v2.4H27z"/>
    <path d="M33 10.2h11v3.8H33z" opacity=".8"/>
    <path d="M17 11h4.6l-2.2 7.6h-4.4z"/>
  </>,
  // MP-99: sliding rod stock, boxy upper with rail, vented shroud, straight magazine ahead of the grip, foregrip.
  'mp-99': <>
    <path d="M3 6.6h2.2v9.4H3z M5 7.6h12v1.4H5z M5 11.6h12v1.4H5z"/>
    <path d="M17 6h27v6H17z M44 6.6h8v4.8h-8z M52 8h6v2h-6z M58 7.4h3v3.2h-3z"/>
    <path d="M20 4.6h20v1.4H20z" opacity=".75"/>
    <path d="M20 12h5l-1.6 7h-4.6z M30 12h4.2l.8 10h-4.2z M46 11.4h3l-.4 5h-2.4z"/>
  </>,
  // Viktor 55: skeletal stock, tall upper under a long rail, low barrel, sloping chin in front of the magazine.
  'viktor-55': <>
    <path d="M2 5.6h2.2v10.6H2z M4 6.4h12v1.8H4z M4 13.4l12-3.6v1.8L4 15.2z"/>
    <path d="M16 5h24v8H16z M40 5.4l5 4v3.6h-5z M40 9.6h12v3.4H40z M52 10.2h7v2.2h-7z"/>
    <path d="M17 3.4h28v1.6H17z" opacity=".75"/>
    <path d="M18.6 13h5l-.8 7.4h-5z M26 13h4.2l.2 9.6H26.2z M30.2 13H41l-6.4 6.2h-4.4z M45 13h3l-.3 5h-2.4z"/>
  </>,
  // Kaibal 50: stock with semi-pistol grip, action with two triggers, long side-by-side barrels over the forend.
  'kaibal-50': <>
    <path d="M1 9.4l13-1.6h6v6.4h-4.4l-3.4 5.6H7.6l1.4-5L1 15.6z"/>
    <path d="M20 7h7v6.4h-7z M27 7.4h35v1.6H27z M27 9.6h35v1.6H27z"/>
    <path d="M30 11.2h14v2.6H30z" opacity=".8"/>
    <path d="M21 13.4h4.4v1.6H21z M22 13.4h1.2v3.4H22z M24 13.4h1.2v3.4H24z" opacity=".75"/>
  </>,
  // Silhouettes for the Carrier loadout cards.
  'melee.weapon_strike': <path d="M6 14l26-6 2 3-26 6z M34 8.5l9-2.5 1.5 4-9 2.5z"/>,
  'backpack.standard_frame': <path d="M22 3h20l3 4v14l-3 2H22l-3-2V7z M25 8h14v5H25z" fillRule="evenodd"/>,
  'armor.standard_carrier': <path d="M20 3l6 2h12l6-2 4 6-3 14H19L16 9z M27 9h10v5H27z" fillRule="evenodd"/>,
  'armor.sr4_scout': <path d="M22 4l5 2h10l5-2 2 5-3 13H23L20 9z M26 11h12v3H26z M26 16h12v2H26z" fillRule="evenodd"/>,
  'armor.kr12_colossus': <path d="M6 9c2-5 9-6 12-3l5-2h18l5 2c3-3 10-2 12 3l-3 6-6-2-2 10H17l-2-10-6 2z M26 8h12v7H26z M30 17h4v4h-4z" fillRule="evenodd"/>,
  'armor.bw9_bulwark': <path d="M9 7c2-4 8-5 11-2l4-1h16l4 1c3-3 9-2 11 2l-2 6-6-1-2 11H19l-2-11-6 1z M27 8h10v6H27z" fillRule="evenodd"/>,
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

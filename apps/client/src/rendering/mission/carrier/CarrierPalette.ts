import * as T from 'three';
import { variant } from './ShipKit.ts';
import { plain, shipSurfaces, surface } from './ShipTextures.ts';

/**
 * Materials of the carrier interior. Colours follow the fleet scheme: olive gunmetal, dark frames, hazard yellow.
 * Each family (deck, panels, painted metal, fabric, plain, lamps) is one real material; the named entries are colour
 * variants of it, so a zone costs one draw call per family instead of one per colour.
 */
export function carrierPalette() {
  const s = shipSurfaces();
  const glass = new T.MeshStandardMaterial({ color: 0x9ec9d8, roughness: .3, metalness: .9, transparent: true, opacity: .12,
    depthWrite: false, envMapIntensity: 1.6 });
  const deck = surface(s.deck, 0xffffff, { tile: 4, metalness: .55, normal: .9 });
  const panel = surface(s.panel, 0xffffff, { tile: 2.4, metalness: .35 });
  const ceiling = surface(s.panel, 0x343a38, { tile: 3, metalness: .4 });
  const metal = surface(s.metal, 0xffffff, { tile: 1.5, metalness: .5 });
  const fabric = surface(s.fabric, 0xffffff, { tile: .8, metalness: 0 });
  const matte = plain(0xffffff, .85, .05);
  const glow = new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  const light = (color: number, intensity: number) => variant(glow, color, intensity);
  return {
    deck: variant(deck, 0x5a625e), deckDark: variant(deck, 0x3d4442), deckWarm: variant(deck, 0x5e5d55),
    grate: surface(s.grate, 0x6b726e, { tile: 1, metalness: .75, roughness: .9 }),
    wall: variant(panel, 0x67706a), wallWarm: variant(panel, 0x6f6a5d), wallDark: variant(panel, 0x3d4441),
    wallLight: variant(panel, 0x9aa19a), ceiling,
    frame: variant(metal, 0x434a46), frameDark: variant(metal, 0x252a2b),
    steel: surface(s.metal, 0x9aa09d, { tile: 1, metalness: .85, roughness: .75 }),
    olive: variant(metal, 0x5f6448), grey: variant(metal, 0x777c77), yellow: variant(metal, 0xc08f2c), red: variant(metal, 0x8e2c22),
    white: variant(metal, 0xc9ccc4), blue: variant(metal, 0x3c5670),
    hazard: surface(s.hazard, 0xffffff, { tile: 1, metalness: .3 }),
    fabric: variant(fabric, 0x3c4743), fabricRed: variant(fabric, 0x6b2a25), fabricTan: variant(fabric, 0x7a6a52),
    fabricLight: variant(fabric, 0xaebfbf),
    rubber: variant(matte, 0x171a1a), plant: variant(matte, 0x3b7a33), plantDark: variant(matte, 0x24521f),
    soil: variant(matte, 0x2b2119), paper: variant(matte, 0xd8d4c4),
    black: plain(0x0d0f10, .5, .5),
    glass,
    cool: light(0x9fdcff, 1.3), warm: light(0xffd9a8, 2.2), amber: light(0xffa53a, 2.4), green: light(0x5cff9c, 2.2),
    teal: light(0x3fe0c0, 2), blueLamp: light(0x4f9dff, 2.2), lcd: light(0x7a9c8c, .8), led: light(0xff3b2b, 2.6),
    cabinWindow: light(0xffc890, .55),
    /** Lamp in any colour (same draw call as the other lamps). */
    lamp: light,
  };
}

export type CarrierPalette = ReturnType<typeof carrierPalette>;

import * as T from 'three';
import type { KitMaterialData } from './ShipKit.ts';

/** Seeded random stream so every client draws the same wear. */
function stream(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Tileable value-noise fbm, 0..1, size × size. */
function noiseField(size: number, cells: number, octaves: number, seed: number): Float32Array {
  const random = stream(seed);
  const out = new Float32Array(size * size);
  let amplitude = .5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const lattice = new Float32Array(n * n).map(() => random());
    for (let y = 0; y < size; y++) {
      const fy = y / size * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / size * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = lattice[(y0 % n) * n + x0 % n], b = lattice[(y0 % n) * n + (x0 + 1) % n];
        const c = lattice[((y0 + 1) % n) * n + x0 % n], d = lattice[((y0 + 1) % n) * n + (x0 + 1) % n];
        out[y * size + x] += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= .5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

interface Layers {
  size: number;
  albedo: CanvasRenderingContext2D;
  rough: CanvasRenderingContext2D;
  height: CanvasRenderingContext2D;
}

function layers(size: number, albedo: string, rough: string, height = '#808080'): Layers {
  const make = (fill: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.fillStyle = fill;
    context.fillRect(0, 0, size, size);
    return context;
  };
  return { size, albedo: make(albedo), rough: make(rough), height: make(height) };
}

/** Multiplies a noise field into a layer: value = base * (1 - amount + amount * noise * 2) (clamped). */
function applyNoise(context: CanvasRenderingContext2D, field: Float32Array, amount: number, bias = 0, channelTint?: [number, number, number]): void {
  const size = context.canvas.width;
  const data = context.getImageData(0, 0, size, size);
  const fieldSize = Math.sqrt(field.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = field[(Math.floor(y / size * fieldSize)) * fieldSize + Math.floor(x / size * fieldSize)];
    const k = Math.max(0, 1 + amount * ((n - .5) * 2) + bias);
    const i = (y * size + x) * 4;
    data.data[i] = Math.min(255, data.data[i] * k * (channelTint?.[0] ?? 1));
    data.data[i + 1] = Math.min(255, data.data[i + 1] * k * (channelTint?.[1] ?? 1));
    data.data[i + 2] = Math.min(255, data.data[i + 2] * k * (channelTint?.[2] ?? 1));
  }
  context.putImageData(data, 0, 0);
}

function normalFrom(height: CanvasRenderingContext2D, strength: number): HTMLCanvasElement {
  const size = height.canvas.width;
  const source = height.getImageData(0, 0, size, size).data;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const out = context.createImageData(size, size);
  const h = (x: number, y: number) => source[(((y + size) % size) * size + (x + size) % size) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const length = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    out.data[i] = (-dx / length * .5 + .5) * 255;
    out.data[i + 1] = (dy / length * .5 + .5) * 255;
    out.data[i + 2] = (1 / length * .5 + .5) * 255;
    out.data[i + 3] = 255;
  }
  context.putImageData(out, 0, 0);
  return canvas;
}

export interface SurfaceSet { map: T.Texture; roughnessMap: T.Texture; normalMap: T.Texture }

function finish(set: Layers, normalStrength: number): SurfaceSet {
  const wrap = (canvas: HTMLCanvasElement, color: boolean) => {
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8;
    if (color) texture.colorSpace = T.SRGBColorSpace;
    return texture;
  };
  return { map: wrap(set.albedo.canvas, true), roughnessMap: wrap(set.rough.canvas, false),
    normalMap: wrap(normalFrom(set.height, normalStrength), false) };
}

const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

function rect(set: Layers, x: number, y: number, w: number, h: number, albedo?: string, rough?: string, height?: string): void {
  if (albedo) { set.albedo.fillStyle = albedo; set.albedo.fillRect(x, y, w, h); }
  if (rough) { set.rough.fillStyle = rough; set.rough.fillRect(x, y, w, h); }
  if (height) { set.height.fillStyle = height; set.height.fillRect(x, y, w, h); }
}

function bolt(set: Layers, x: number, y: number, r: number): void {
  for (const [context, fill] of [[set.albedo, grey(.95)], [set.rough, grey(.35)], [set.height, grey(.95)]] as const) {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  set.albedo.fillStyle = grey(.3, .6);
  set.albedo.beginPath();
  set.albedo.arc(x + r * .35, y + r * .35, r * .55, 0, Math.PI * 2);
  set.albedo.fill();
}

/** Deck plates, 4 m per tile: 2 × 1 m plates in staggered rows, bolts, tread patches, scuffs and grime. */
function deckPlates(): SurfaceSet {
  const size = 1024, px = size / 4;
  const set = layers(size, grey(.8), grey(.62));
  const random = stream(11);
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 ? px : 0;
    for (let col = -1; col < 2; col++) {
      const x = col * px * 2 + offset, y = row * px;
      const shade = .74 + random() * .14;
      rect(set, x + 2, y + 2, px * 2 - 4, px - 4, grey(shade), grey(.55 + random() * .14));
      if (random() < .3) {
        // Anti-slip tread: raised short dashes in a diagonal weave.
        for (let ty = y + 18; ty < y + px - 18; ty += 14) for (let tx = x + 18; tx < x + px * 2 - 18; tx += 14) {
          const flip = ((tx + ty) / 14) % 2 ? 1 : -1;
          for (const [context, fill] of [[set.height, grey(.72)], [set.albedo, grey(shade + .08)], [set.rough, grey(.45)]] as const) {
            context.strokeStyle = fill;
            context.lineWidth = 3;
            context.beginPath();
            context.moveTo(tx - 4, ty - 4 * flip);
            context.lineTo(tx + 4, ty + 4 * flip);
            context.stroke();
          }
        }
      }
      for (const [bx, by] of [[x + 12, y + 12], [x + px * 2 - 12, y + 12], [x + 12, y + px - 12], [x + px * 2 - 12, y + px - 12], [x + px, y + 12], [x + px, y + px - 12]]) {
        bolt(set, bx, by, 4.5);
      }
    }
    // Seam between rows and plates: dark, rough, recessed.
    rect(set, 0, row * px - 2, size, 5, grey(.16), grey(.95), grey(.05));
    for (let col = -1; col < 3; col++) rect(set, col * px * 2 + offset - 2, row * px, 5, px, grey(.16), grey(.95), grey(.05));
  }
  // Scuffs: light, polished arcs where boots and carts wore the paint.
  for (let i = 0; i < 260; i++) {
    const x = random() * size, y = random() * size, r = 10 + random() * 60, a = random() * Math.PI * 2;
    set.albedo.strokeStyle = grey(1, .05 + random() * .08);
    set.albedo.lineWidth = 1 + random() * 2.5;
    set.albedo.beginPath();
    set.albedo.arc(x, y, r, a, a + .3 + random() * .8);
    set.albedo.stroke();
    set.rough.strokeStyle = grey(.3, .25);
    set.rough.lineWidth = 2;
    set.rough.beginPath();
    set.rough.arc(x, y, r, a, a + .4);
    set.rough.stroke();
  }
  // Oil and grime stains.
  for (let i = 0; i < 26; i++) {
    const x = random() * size, y = random() * size, r = 20 + random() * 90;
    const gradient = set.albedo.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, grey(.05, .22 * random() + .05));
    gradient.addColorStop(1, grey(.05, 0));
    set.albedo.fillStyle = gradient;
    set.albedo.fillRect(x - r, y - r, r * 2, r * 2);
  }
  applyNoise(set.albedo, noiseField(256, 4, 5, 3), .22);
  applyNoise(set.rough, noiseField(256, 8, 4, 5), .3);
  applyNoise(set.height, noiseField(256, 32, 2, 9), .05);
  return finish(set, 3.2);
}

/** Wall panels, 2.4 m per tile: 1.2 m panels with raised borders, louvres, rivets and vertical grime streaks. */
function wallPanels(): SurfaceSet {
  const size = 512, p = size / 2;
  const set = layers(size, grey(.78), grey(.58));
  const random = stream(21);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const x = col * p, y = row * p;
    const shade = .72 + random() * .12;
    rect(set, x, y, p, p, grey(shade), grey(.5 + random() * .15), grey(.5));
    rect(set, x + 14, y + 14, p - 28, p - 28, grey(shade + .05), undefined, grey(.62));
    rect(set, x + 22, y + 22, p - 44, p - 44, grey(shade), undefined, grey(.55));
    if (row === 0 && col === 0) {
      // Louvre block.
      for (let i = 0; i < 7; i++) {
        rect(set, x + 60, y + 70 + i * 16, p - 120, 7, grey(.12), grey(.9), grey(.15));
        rect(set, x + 60, y + 77 + i * 16, p - 120, 3, grey(.9), undefined, grey(.75));
      }
    } else if (random() < .7) {
      // Small access hatch with a label strip.
      rect(set, x + 70, y + 60, 110, 70, grey(shade - .06), undefined, grey(.47));
      rect(set, x + 74, y + 64, 102, 62, grey(shade + .02), undefined, grey(.58));
      rect(set, x + 84, y + 150, 80, 12, grey(.92), grey(.4));
    }
    for (let i = 0; i < 9; i++) {
      bolt(set, x + 8 + i * (p - 16) / 8, y + 7, 3);
      bolt(set, x + 8 + i * (p - 16) / 8, y + p - 7, 3);
    }
    rect(set, x, y, p, 3, grey(.12), grey(.95), grey(.1));
    rect(set, x, y, 3, p, grey(.12), grey(.95), grey(.1));
  }
  // Vertical streaks below seams and rivets.
  for (let i = 0; i < 120; i++) {
    const x = random() * size, y = random() * size, h = 20 + random() * 160;
    const gradient = set.albedo.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, grey(.1, .16 * random()));
    gradient.addColorStop(1, grey(.1, 0));
    set.albedo.fillStyle = gradient;
    set.albedo.fillRect(x, y, 1 + random() * 3, h);
  }
  applyNoise(set.albedo, noiseField(256, 4, 5, 13), .18);
  applyNoise(set.rough, noiseField(256, 8, 4, 15), .25);
  return finish(set, 2.4);
}

/** Bare and painted metal for frames and equipment: brushed grain, scratches, worn blotches. */
function wornMetal(): SurfaceSet {
  const size = 512;
  const set = layers(size, grey(.82), grey(.55));
  const random = stream(31);
  for (let i = 0; i < 900; i++) {
    const y = random() * size, x = random() * size, w = 20 + random() * 140;
    set.albedo.fillStyle = grey(random() < .5 ? 1 : 0, .04);
    set.albedo.fillRect(x, y, w, 1);
  }
  for (let i = 0; i < 160; i++) {
    const x = random() * size, y = random() * size, a = random() * Math.PI, l = 6 + random() * 50;
    set.albedo.strokeStyle = grey(1, .12 + random() * .15);
    set.rough.strokeStyle = grey(.25, .5);
    for (const context of [set.albedo, set.rough]) {
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      context.stroke();
    }
  }
  applyNoise(set.albedo, noiseField(256, 3, 5, 33), .26);
  applyNoise(set.rough, noiseField(256, 6, 4, 35), .35);
  applyNoise(set.height, noiseField(256, 24, 3, 37), .08);
  return finish(set, 1.5);
}

/** Floor grating, 1 m per tile. */
function grating(): SurfaceSet {
  const size = 512, cell = size / 8;
  const set = layers(size, grey(.06), grey(.8), grey(.0));
  for (let i = 0; i < 8; i++) {
    rect(set, i * cell, 0, 12, size, grey(.85), grey(.5), grey(1));
    rect(set, 0, i * cell + cell / 2, size, 6, grey(.7), grey(.55), grey(.8));
  }
  applyNoise(set.albedo, noiseField(256, 4, 4, 41), .3);
  return finish(set, 4);
}

/** Hazard stripes (yellow on black), worn through to bare metal at the edges of the stripes. */
function hazard(): SurfaceSet {
  const size = 256;
  const set = layers(size, '#151515', grey(.6));
  set.albedo.fillStyle = '#d29a1c';
  for (let i = -2; i < 4; i++) {
    set.albedo.beginPath();
    set.albedo.moveTo(i * 128, 0);
    set.albedo.lineTo(i * 128 + 64, 0);
    set.albedo.lineTo(i * 128 + 64 + 256, 256);
    set.albedo.lineTo(i * 128 + 256, 256);
    set.albedo.fill();
  }
  const random = stream(51);
  for (let i = 0; i < 400; i++) {
    set.albedo.fillStyle = grey(.35 + random() * .2, .5);
    set.albedo.fillRect(random() * size, random() * size, 1 + random() * 5, 1 + random() * 2);
  }
  applyNoise(set.albedo, noiseField(128, 4, 4, 53), .3);
  return finish(set, 1);
}

/** Woven seat fabric. */
function fabric(): SurfaceSet {
  const size = 256;
  const set = layers(size, grey(.8), grey(.92));
  for (let y = 0; y < size; y += 4) rect(set, 0, y, size, 2, grey(.7), undefined, grey(.6));
  for (let x = 0; x < size; x += 4) rect(set, x, 0, 2, size, grey(.85), undefined, grey(.4));
  applyNoise(set.albedo, noiseField(128, 4, 4, 61), .2);
  return finish(set, 1.5);
}

let cache: Record<'deck' | 'panel' | 'metal' | 'grate' | 'hazard' | 'fabric', SurfaceSet> | undefined;

/** Builds the shared surface sets once per client. */
export function shipSurfaces() {
  cache ??= { deck: deckPlates(), panel: wallPanels(), metal: wornMetal(), grate: grating(), hazard: hazard(), fabric: fabric() };
  return cache;
}

export interface SurfaceOptions {
  roughness?: number;
  metalness?: number;
  tile?: number;
  normal?: number;
  emissive?: T.ColorRepresentation;
  emissiveIntensity?: number;
}

export function surface(set: SurfaceSet, color: T.ColorRepresentation, options: SurfaceOptions = {}): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color, map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, vertexColors: true,
    roughness: options.roughness ?? 1, metalness: options.metalness ?? .45,
    emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 1,
  });
  material.normalScale.setScalar(options.normal ?? 1);
  (material.userData as KitMaterialData).tile = options.tile;
  return material;
}

/** Flat material for small parts (no textures), still with per-part vertex tint. */
export function plain(color: T.ColorRepresentation, roughness = .6, metalness = .4): T.MeshStandardMaterial {
  return new T.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
}

/** Self-lit part (lamps, LEDs, light strips). */
export function lamp(color: T.ColorRepresentation, intensity = 2): T.MeshStandardMaterial {
  return new T.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: .5, vertexColors: true });
}

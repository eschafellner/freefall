import * as T from 'three';
import type { CarrierContext } from './CarrierContext.ts';
import type { KitMaterialData } from './ShipKit.ts';

export type ScreenKind = 'status' | 'radar' | 'graph' | 'map' | 'roster' | 'vitals' | 'specimen' | 'armor' | 'weapon' | 'supply' | 'fleet';

interface Screen { kind: ScreenKind; canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: T.CanvasTexture;
  material: T.MeshBasicMaterial; next: number; period: number; tint: string }

const W = 512, Hh = 288;
const FONT = 'monospace';
const TINTS: Record<ScreenKind, string> = {
  status: '#8fe8c8', radar: '#7dffa8', graph: '#ffc66b', map: '#62d8ff', roster: '#c9e6ff', vitals: '#7dffb0',
  specimen: '#5cf0d0', armor: '#8fb4ff', weapon: '#ff9a6a', supply: '#ffc46b', fleet: '#9fd0ff',
};

let seed = 0x3c6ef372;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function frame(g: CanvasRenderingContext2D, tint: string, title: string, red: number): void {
  g.fillStyle = '#040a0b';
  g.fillRect(0, 0, W, Hh);
  g.globalAlpha = .07;
  g.fillStyle = tint;
  for (let y = 0; y < Hh; y += 4) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  g.fillStyle = red > .5 ? '#ff5a3a' : tint;
  g.fillRect(0, 0, W, 34);
  g.fillStyle = '#041012';
  g.font = '700 22px ' + FONT;
  g.fillText(title, 12, 25, W - 140);
  g.fillText(red > .5 ? 'ALARM' : 'DECK 03', W - 118, 25);
  g.strokeStyle = tint;
  g.lineWidth = 2;
  g.strokeRect(3, 3, W - 6, Hh - 6);
}

const DRAW: Record<ScreenKind, (g: CanvasRenderingContext2D, t: number, tint: string, red: number) => void> = {
  status(g, t, tint, red) {
    frame(g, tint, 'SCHIFFSSTATUS', red);
    const rows = ['REAKTOR 2', 'LEBENSERHALTUNG', 'SCHILD HANGAR', 'TRÄGHEITSDÄMPFER', 'KOMM-RELAIS', 'ANDOCKKLAMMERN'];
    g.font = '600 19px ' + FONT;
    rows.forEach((row, i) => {
      const y = 66 + i * 36;
      const value = .55 + .4 * Math.abs(Math.sin(t * .3 + i * 1.7));
      g.fillStyle = tint;
      g.fillText(row, 16, y);
      g.globalAlpha = .25;
      g.fillRect(250, y - 15, 200, 16);
      g.globalAlpha = 1;
      g.fillRect(250, y - 15, 200 * value, 16);
      g.fillText(Math.round(value * 100) + '%', 458, y);
    });
  },
  radar(g, t, tint, red) {
    frame(g, tint, 'NAHBEREICH', red);
    const cx = 150, cy = 162, r = 112;
    g.strokeStyle = tint;
    g.globalAlpha = .5;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, cy, r * k / 3, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    const a = t * 1.4;
    const sweep = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    sweep.addColorStop(0, tint); sweep.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .35;
    g.fillStyle = sweep;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a - .5, a); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = tint;
    for (const [d, b] of [[.4, .6], [.75, 2.4], [.55, 4.1], [.9, 5.3]]) {
      const fade = 1 - (((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      g.globalAlpha = fade;
      g.fillRect(cx + Math.cos(b) * r * d - 3, cy + Math.sin(b) * r * d - 3, 6, 6);
    }
    g.globalAlpha = 1;
    g.font = '600 17px ' + FONT;
    ['ESKORTE 1  2.1 KM', 'ESKORTE 2  3.4 KM', 'MOND       41 MM', 'KONTAKT    KEINE'].forEach((line, i) => g.fillText(line, 290, 80 + i * 32));
  },
  graph(g, t, tint, red) {
    frame(g, tint, 'ENERGIEVERTEILUNG', red);
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = ['#ffc66b', '#7dffa8', '#62d8ff'][k];
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < W - 40; x += 6) {
        const y = 170 + k * 30 - 40 * Math.sin(x * .02 + t * (1 + k * .4) + k) * Math.sin(x * .007 + t * .3);
        if (x) g.lineTo(20 + x, y); else g.moveTo(20, y);
      }
      g.stroke();
    }
  },
  map(g, t, tint, red) {
    frame(g, tint, "DEV' AULT  /  LANDEZONE", red);
    g.strokeStyle = tint;
    g.globalAlpha = .18;
    for (let x = 16; x < W; x += 32) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, Hh - 8); g.stroke(); }
    for (let y = 48; y < Hh; y += 32) { g.beginPath(); g.moveTo(8, y); g.lineTo(W - 8, y); g.stroke(); }
    g.globalAlpha = .8;
    g.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i / 40 * Math.PI * 2, rr = 40 + k * 22 + 10 * Math.sin(a * 3 + k) + 6 * Math.sin(a * 7);
        const x = 250 + Math.cos(a) * rr * 1.5, y = 165 + Math.sin(a) * rr * .8;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    const pulse = .5 + .5 * Math.sin(t * 4);
    g.fillStyle = red > .5 ? '#ff6a3a' : '#ffb35c';
    g.globalAlpha = .4 + .6 * pulse;
    g.beginPath(); g.arc(300, 150, 7 + pulse * 6, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.font = '600 16px ' + FONT;
    g.fillStyle = tint;
    g.fillText('LZ BODENBRUCH', 316, 140);
    g.fillText('SCHWARMAKTIVITÄT  HOCH', 20, Hh - 18);
  },
  roster(g, t, tint, red) {
    frame(g, tint, 'EINSATZBEREITSCHAFT', red);
    const names = ['OP-0417  BEREIT', 'OP-1123  BEREIT', 'OP-0932  SANITÄT', 'OP-2210  BEREIT', 'CV-7781  ERSATZ', 'CV-7790  ERSATZ', 'OP-0055  VERMISST'];
    g.font = '600 18px ' + FONT;
    const offset = Math.floor(t * .5) % names.length;
    for (let i = 0; i < 6; i++) {
      const line = names[(i + offset) % names.length];
      g.fillStyle = line.includes('VERMISST') ? '#ff7a5a' : line.includes('ERSATZ') ? '#ffc66b' : tint;
      g.fillText(line, 18, 70 + i * 34);
    }
  },
  vitals(g, t, tint, red) {
    frame(g, tint, 'VITALWERTE  BETT 2', red);
    g.strokeStyle = tint;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let x = 0; x < W - 40; x += 3) {
      const phase = ((x * .012 - t * 1.6) % 1 + 1) % 1;
      const spike = phase < .04 ? -60 * Math.sin(phase / .04 * Math.PI) : phase < .08 ? 25 * Math.sin((phase - .04) / .04 * Math.PI) : 0;
      const y = 140 + spike + 3 * Math.sin(x * .1);
      if (x) g.lineTo(20 + x, y); else g.moveTo(20, y);
    }
    g.stroke();
    g.font = '700 30px ' + FONT;
    g.fillStyle = tint;
    g.fillText('HF 72', 20, 250);
    g.fillStyle = '#62d8ff';
    g.fillText('SPO2 97', 180, 250);
    g.fillStyle = '#ffc66b';
    g.fillText('T 36.9', 370, 250);
  },
  specimen(g, t, tint, red) {
    frame(g, tint, 'PROBE S-14  /  SCHABE', red);
    g.strokeStyle = tint;
    g.lineWidth = 2;
    const cx = 150, cy = 165;
    g.beginPath(); g.ellipse(cx, cy, 90, 40, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(cx + 85, cy - 8, 28, 20, 0, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx - 40 + i * 40, cy + s * 30); g.lineTo(cx - 60 + i * 50, cy + s * 80); g.lineTo(cx - 80 + i * 55, cy + s * 95); g.stroke();
    }
    const scan = (t * 60) % 220;
    g.fillStyle = tint;
    g.globalAlpha = .3;
    g.fillRect(40 + scan, 60, 4, 210);
    g.globalAlpha = 1;
    g.font = '600 16px ' + FONT;
    ['PANZERUNG  CHITIN K2', 'NERVENKNOTEN  6', 'SEKRET  ÄTZEND', 'STATUS  INAKTIV'].forEach((line, i) => g.fillText(line, 300, 80 + i * 30));
  },
  armor(g, t, tint, red) {
    frame(g, tint, 'RÜSTUNGSKALIBRIERUNG', red);
    g.strokeStyle = tint;
    g.lineWidth = 2;
    const cx = 130;
    g.strokeRect(cx - 34, 70, 68, 90);
    g.beginPath(); g.arc(cx, 55, 18, 0, Math.PI * 2); g.stroke();
    g.strokeRect(cx - 60, 72, 22, 80); g.strokeRect(cx + 38, 72, 22, 80);
    g.strokeRect(cx - 32, 165, 26, 100); g.strokeRect(cx + 6, 165, 26, 100);
    const k = Math.floor(t * 2) % 5;
    g.fillStyle = tint;
    g.globalAlpha = .4;
    g.fillRect(cx - 34, 70 + k * 18, 68, 18);
    g.globalAlpha = 1;
    g.font = '600 17px ' + FONT;
    ['TORSO     KL 4  OK', 'SCHULTER  KL 3  OK', 'BEINE     KL 3  OK', 'HELM      KL 4  PRÜF', 'SERVOS    98%'].forEach((line, i) => g.fillText(line, 240, 80 + i * 34));
  },
  weapon(g, t, tint, red) {
    frame(g, tint, 'WAFFENAUSGABE', red);
    g.font = '600 17px ' + FONT;
    ['VX-13 KARABINER   12', 'MK-4 SCHROTFLINTE  6', 'FRAG-GRANATE      40', 'MUNITION 5.55   2400', 'MUNITION 12G     380'].forEach((line, i) => {
      g.fillStyle = tint;
      g.fillText(line, 18, 76 + i * 36);
    });
    g.strokeStyle = tint;
    g.strokeRect(360, 60, 130, 200);
    g.fillStyle = tint;
    g.globalAlpha = .5;
    g.fillRect(360, 260 - 200 * (.6 + .3 * Math.sin(t * .4)), 130, 200 * (.6 + .3 * Math.sin(t * .4)));
    g.globalAlpha = 1;
  },
  supply(g, t, tint, red) {
    frame(g, tint, 'VERSORGUNG  /  AUSGABE', red);
    g.font = '600 17px ' + FONT;
    ['RATION TYP C     ×312', 'WASSER           ×980', 'MEDKIT           × 64', 'AKKU-ZELLEN      ×120', 'EXTRAKTIONSBALLON × 8'].forEach((line, i) => {
      g.fillStyle = tint;
      g.fillText(line, 18, 76 + i * 36);
    });
    const blink = Math.floor(t * 2) % 2;
    g.fillStyle = blink ? tint : '#041012';
    g.fillRect(470, 60, 20, 20);
  },
  fleet(g, t, tint, red) {
    frame(g, tint, 'FLOTTENVERBAND  SKYFALL', red);
    g.strokeStyle = tint;
    g.lineWidth = 2;
    const ships = [[250, 150, 'SKYFALL'], [140, 100, 'ESK 1'], [370, 210, 'ESK 2'], [400, 90, 'TANKER']] as const;
    for (const [x, y, name] of ships) {
      g.beginPath(); g.moveTo(x - 16, y + 8); g.lineTo(x + 18, y); g.lineTo(x - 16, y - 8); g.closePath(); g.stroke();
      g.font = '600 15px ' + FONT;
      g.fillStyle = tint;
      g.fillText(name, x - 20, y + 28);
    }
    g.setLineDash([6, 6]);
    g.beginPath(); g.ellipse(250, 150, 200, 90, -.2, t * .1, t * .1 + 5); g.stroke();
    g.setLineDash([]);
  },
};

/**
 * Animated wall and desk displays. Each kind is one canvas redrawn a few times per second; every screen of that kind is
 * merged into one mesh with that canvas as its texture.
 */
export class CarrierScreens {
  private readonly screens = new Map<ScreenKind, Screen>();
  private readonly plane = new T.PlaneGeometry(1, 1);
  private readonly c: CarrierContext;

  constructor(c: CarrierContext) { this.c = c; }

  private screen(kind: ScreenKind): Screen {
    let screen = this.screens.get(kind);
    if (!screen) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = Hh;
      const context = canvas.getContext('2d')!;
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new T.MeshBasicMaterial({ map: texture, color: new T.Color(1.35, 1.35, 1.35), toneMapped: false, fog: false });
      (material.userData as KitMaterialData).local = true;
      screen = { kind, canvas, context, texture, material, next: 0, period: .15 + random() * .2, tint: TINTS[kind] };
      DRAW[kind](context, random() * 10, screen.tint, 0);
      this.screens.set(kind, screen);
    }
    return screen;
  }

  /** Display facing +z in its local frame (rotate with yaw / pitch), centred at (x, y, z). */
  place(kind: ScreenKind, x: number, y: number, z: number, w: number, h: number, yaw = 0, pitch = 0): void {
    const matrix = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, 0, 'YXZ')),
      new T.Vector3(w, h, 1));
    this.c.kit.add(this.screen(kind).material, this.plane, matrix, { vary: 0 });
  }

  update(seconds: number, low: boolean, red: number): void {
    if (low) return;
    for (const screen of this.screens.values()) {
      if (seconds < screen.next) continue;
      screen.next = seconds + screen.period;
      DRAW[screen.kind](screen.context, seconds, screen.tint, red);
      screen.texture.needsUpdate = true;
    }
  }
}

import type { ImpactSurface, ShotEvent } from '@freefall/shared';
import type { AudioEngine, AudioPosition, SampleVoice } from './AudioEngine.ts';
import { Takes, takeIds } from './Soundscape.ts';
import { PRIORITY } from './VoiceBudget.ts';

type Material = ImpactSurface | 'body' | 'chitin';
interface SoundProfile {
  length: number;
  tone: number;
  ring: number;
  grit: number;
  level: number;
}

// Seconds, resonant frequency, resonant mix, granular mix, level. All tails are baked into short mono buffers.
const SOUNDS: Record<Material, SoundProfile> = {
  snow: { length: .105, tone: 310, ring: .05, grit: .35, level: .40 },
  ice: { length: .135, tone: 2400, ring: .44, grit: .62, level: .44 },
  sand: { length: .145, tone: 460, ring: .025, grit: .72, level: .39 },
  dirt: { length: .101, tone: 220, ring: .19, grit: .48, level: .43 },
  grass: { length: .100, tone: 390, ring: .10, grit: .44, level: .36 },
  rock: { length: .110, tone: 1160, ring: .36, grit: .58, level: .45 },
  'frozen-rock': { length: .115, tone: 1410, ring: .40, grit: .51, level: .44 },
  'forest-floor': { length: .127, tone: 260, ring: .12, grit: .52, level: .38 },
  wood: { length: .096, tone: 700, ring: .32, grit: .55, level: .46 },
  metal: { length: .165, tone: 1880, ring: .54, grit: .40, level: .46 },
  concrete: { length: .095, tone: 950, ring: .24, grit: .65, level: .44 },
  neutral: { length: .080, tone: 500, ring: .17, grit: .44, level: .36 },
  body: { length: .087, tone: 165, ring: .33, grit: .24, level: .52 },
  chitin: { length: .102, tone: 540, ring: .31, grit: .52, level: .51 },
};

function impactSamples(sound: SoundProfile, sampleRate: number, take: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.ceil(sound.length * sampleRate));
  const frequency = sound.tone * (.92 + .071 * take);
  const lowPass = 1 - Math.exp(-Math.PI * 2 * (650 + frequency * .77) / sampleRate);
  let seed = 18363119 * (take + 1), filtered = 0, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    filtered += lowPass * (noise - filtered);
    const punch = filtered * Math.exp(-t * 48);
    const grit = filtered * (noise * noise + .19) * Math.exp(-t * 19) * sound.grit;
    const phase = Math.PI * 2 * frequency * t;
    const ring = (Math.sin(phase) + Math.sin(phase * 1.57) * .42) * Math.exp(-t * (sound.ring > .39 ? 27 : 71)) * sound.ring;
    samples[i] = (punch * .55 + grit + ring) * Math.min(1, i / 20, (samples.length - i - 1) / 100);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > .85) for (let i = 0; i < samples.length; i++) samples[i] *= .85 / peak;
  return samples;
}

export class ImpactAudio {
  private readonly takes = new Takes();
  private readonly buffers = new Map<Material, AudioBuffer[]>();
  private readonly upcoming = [0, 0, 0, 0];
  private readonly voices = new Set<SampleVoice>();
  played = 0;

  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) { this.engine = engine; }

  warm(): void { this.engine.preload(takeIds('schabe-impact', 2)); }

  play(shot: ShotEvent, listener: AudioPosition, relevant: boolean, now: number): void {
    const hit = shot.impact;
    if (!hit) return;
    const material = hit.kind === 'world' ? hit.surface : hit.kind === 'enemy' || hit.kind === 'nest' ? 'chitin' : 'body';
    this.at(material, { x: shot.toX, y: shot.toY, z: shot.toZ }, listener, relevant, now, shot.eliminated);
  }

  at(material: Material, position: AudioPosition, listener: AudioPosition, relevant: boolean, now: number, killed = false,
    kind: 'shot' | 'melee' | 'blast' = 'shot'): void {
    const context = this.engine.context;
    if (!context || !this.engine.running) return;
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z);
    const reach = kind === 'blast' ? 31 : killed ? 48 : relevant ? 53 : 34;
    const lane = kind === 'blast' ? 3 : kind === 'melee' ? 2 : relevant ? 0 : 1;
    if (!Number.isFinite(distance) || distance >= reach || now < this.upcoming[lane]) return;
    this.upcoming[lane] = now + (relevant ? 46 : distance > 18 ? 132 : 78);
    if (!Object.hasOwn(SOUNDS, material)) material = 'neutral';
    const sound = SOUNDS[material];
    const options = {
      bus: 'weapons' as const, owner: 'impact:' + lane, position, range: [4.5, reach] as const,
      level: sound.level * (kind === 'blast' ? .43 : killed ? 1.12 : .93 + Math.random() * .14),
      priority: kind === 'melee' && (relevant || distance < 12) ? PRIORITY.combat + 6 :
        PRIORITY.world + (relevant ? 10 : distance < 14 ? 4 : 0),
      pitch: killed ? .79 + Math.random() * .11 : .94 + Math.random() * .12,
    };
    if (material === 'chitin') {
      const id = this.takes.pick('chitin-asset', 'schabe-impact', 2);
      if (this.engine.assets.get(id)) {
        this.track(this.engine.play(id, options));
        return;
      }
    }
    let takes = this.buffers.get(material);
    if (!takes) {
      takes = Array.from({ length: 3 }, (_, index) => {
        const samples = impactSamples(sound, context.sampleRate, index);
        const buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        return buffer;
      });
      this.buffers.set(material, takes);
    }
    this.track(this.engine.playBuffer(takes[this.takes.index(material, takes.length)], options));
  }

  private track(voice: SampleVoice | undefined): void {
    for (const current of this.voices) if (!current.active) this.voices.delete(current);
    if (!voice) return;
    this.voices.add(voice);
    this.played++;
  }

  clear(): void {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.takes.clear();
    this.upcoming.fill(0);
  }
}

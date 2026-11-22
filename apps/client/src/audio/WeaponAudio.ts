import { COMBAT, allowsPostureAction } from '@freefall/shared';
import type { AudioEnvironmentId, PlayerState, PlayersSnapshot, WeaponSlot } from '@freefall/shared';
import type { AudioEngine } from './AudioEngine.ts';
import { PRIORITY } from './VoiceBudget.ts';
import { PLANET_WEAPON_MIX, WEAPON_ASSET_IDS, WEAPON_RECORDINGS, WEAPON_SWITCH_ASSET } from './WeaponAudioCatalog.ts';

export interface Listener { x: number; y?: number; z: number; yaw: number }
export interface SoundSource { x: number; z: number; y?: number }

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

interface Voice {
  at: number;
  /** Close (0) to distant (1). */
  blend: number;
  out: AudioNode;
  sources: Set<AudioScheduledSourceNode>;
}

type HandlingCue = 'remove' | 'insert' | 'finish' | 'switch';
const HANDLING_LATE_TICKS = 3;
const RECORDED_MAX_TRAVEL_SECONDS = .115;

/** Admit only newly observed authoritative transitions. A baseline, a life change or a stale phase is silent. */
export function weaponHandlingCue(player: PlayerState, previous: PlayerState | undefined, from: number, tick: number):
  { action: HandlingCue; slot: WeaponSlot } | undefined {
  if (!previous?.hp || !player.hp || previous.life !== player.life || tick <= from) return;
  const crossed = (at: number) => from < at && at <= tick && tick - at <= HANDLING_LATE_TICKS;
  const gear = player.equipment;
  const action = gear?.action;
  if (gear && (action === 'primary' || action === 'secondary') && crossed(gear.started)) return { action: 'switch', slot: action };
  const reload = player.reload;
  if (action || (player.posture && !allowsPostureAction(player.posture, 'reload'))) return;
  if (reload) {
    const { phase, slot, removalAt, insertAt } = reload;
    if ((phase === 'MAGAZINE_INSERTION' || phase === 'RELOAD_COMPLETE') && crossed(insertAt)) return { action: 'insert', slot };
    if (phase === 'MAGAZINE_REMOVAL' && crossed(removalAt)) return { action: 'remove', slot };
  }
  const before = previous.reload;
  // On the normal wire path READY is encoded as reloadUntil=0 with no reload object.
  if (before?.phase === 'RELOAD_COMPLETE' && gear?.slot === before.slot && player.reloadUntil === 0 &&
      (!reload || (reload.phase === 'READY' && reload.at === before.until)) && crossed(before.until)) {
    return { action: 'finish', slot: before.slot };
  }
}

export class WeaponAudio {
  private readonly engine: AudioEngine;
  private curve?: Float32Array<ArrayBuffer>;
  private readonly transient = new Set<() => void>();
  private ownHandling?: PlayersSnapshot;
  private remoteHandling?: PlayersSnapshot;
  private planetMix?: { reflections: number; distantCutoff: number };
  private random = 0x51ed;
  private readonly counts = { own: 0, remote: 0, remove: 0, insert: 0, finish: 0, switch: 0, casing: 0, unavailable: 0 };

  constructor(engine: AudioEngine) {
    this.engine = engine;
    engine.assets.retain(WEAPON_ASSET_IDS);
  }

  setEnvironment(id: AudioEnvironmentId, planet?: string): void {
    if (this.engine.environment !== id) this.engine.setEnvironment(id);
    this.planetMix = id === 'open-field' && planet ? PLANET_WEAPON_MIX[planet] : undefined;
  }

  warm(): void { this.engine.preload(WEAPON_ASSET_IDS); }

  metrics() { return { ...this.counts }; }

  private rand(): number {
    this.random = (Math.imul(this.random, 1664525) + 1013904223) >>> 0;
    return this.random / 0x100000000;
  }

  /**
   * Creates the spatial output chain of one sound event, or undefined if it is inaudible or over budget.
   * The reservation covers all layers and their travel delay.
   */
  private voice(owner: string, source: SoundSource, listener: Listener, own: boolean, seconds: number,
    gain = 1, priority?: number, recorded = false): Voice | undefined {
    const context = this.engine.context;
    const bus = this.engine.bus('weapons');
    if (!context || !bus || context.state !== 'running') return;
    const { audibleDistance, distantBlendStart, distantBlendEnd, speedOfSound } = COMBAT.audio;
    const dx = source.x - listener.x, dz = source.z - listener.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = own ? 0 : priority === undefined && !recorded ? horizontal :
      Math.hypot(horizontal, (source.y ?? listener.y ?? 0) - (listener.y ?? 0));
    if (distance > audibleDistance) return;
    const blend = smooth(distantBlendStart, distantBlendEnd, distance);
    const sources = new Set<AudioScheduledSourceNode>();
    const travel = recorded ? Math.min(RECORDED_MAX_TRAVEL_SECONDS, distance / speedOfSound) : distance / speedOfSound;
    const release = this.engine.reserve(owner, seconds + travel + (recorded ? .025 : .10),
      priority ?? (own ? PRIORITY.threat : PRIORITY.combat - Math.min(14, distance / 6)), () => {
        if (release) this.transient.delete(release);
        for (const source of sources) source.stop();
        out.disconnect(); wet?.disconnect(); dry.disconnect(); filter.disconnect(); pan.disconnect();
      });
    if (!release) return;
    if (recorded || priority !== undefined) this.transient.add(release);
    const at = context.currentTime + .005 + travel;
    const pan = context.createStereoPanner();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const right = distance > .5 ? (dx * Math.cos(listener.yaw) + dz * Math.sin(listener.yaw)) / distance : 0;
    const front = distance > .5 ? (dx * Math.sin(listener.yaw) - dz * Math.cos(listener.yaw)) / distance : 1;
    pan.pan.value = Math.max(-.85, Math.min(.85, right * .85));
    // Sources behind the listener lose some brilliance.
    const distantCutoff = recorded ? this.planetMix?.distantCutoff ?? 1900 : 1600;
    filter.frequency.value = (17_000 - (17_000 - distantCutoff) * blend) * (front < 0 ? .7 : 1);
    filter.Q.value = .4;
    const dry = context.createGain();
    dry.gain.value = gain / (1 + distance / 14);
    dry.connect(filter).connect(pan).connect(bus);
    const out = context.createGain();
    out.connect(dry);
    const send = this.engine.send;
    const wet = send ? context.createGain() : undefined;
    if (send && wet) {
      // Distant sources are dominated by reflections.
      const reflections = recorded ? this.planetMix?.reflections ?? .78 : 1;
      wet.gain.value = reflections * gain * (.35 + blend * .9) / (1 + distance / 40);
      out.connect(wet).connect(send);
    }
    return { at, blend, out, sources };
  }

  private noise(voice: Voice, start: number, duration: number, type: BiquadFilterType, frequency: number, q: number,
    level: number, attack = .001, to?: number): AudioBufferSourceNode | undefined {
    const context = this.engine.context!;
    const buffer = this.engine.noiseBuffer;
    if (!buffer || level <= 0) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Looping white noise has no audible seam, so a random start offset can never cut a long layer short.
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(gain).connect(voice.out);
    source.start(start, this.rand() * buffer.duration);
    source.stop(start + duration + .02);
    voice.sources.add(source);
    source.onended = () => { voice.sources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return source;
  }

  private tone(voice: Voice, start: number, duration: number, from: number, to: number, level: number,
    type: OscillatorType = 'sine', saturate = false): OscillatorNode | undefined {
    const context = this.engine.context!;
    if (level <= 0) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    const shaper = saturate ? this.shaper() : undefined;
    (shaper ? oscillator.connect(shaper) : oscillator).connect(gain).connect(voice.out);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    voice.sources.add(oscillator);
    oscillator.onended = () => { voice.sources.delete(oscillator); oscillator.disconnect(); shaper?.disconnect(); gain.disconnect(); };
    return oscillator;
  }

  /** Soft clipper (one per tone, shared curve) that adds harmonics to the low body for small speakers. */
  private shaper(): WaveShaperNode {
    if (!this.curve) {
      this.curve = new Float32Array(1024);
      for (let i = 0; i < this.curve.length; i++) {
        const x = i / (this.curve.length - 1) * 2 - 1;
        this.curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4);
      }
    }
    const shaper = this.engine.context!.createWaveShaper();
    shaper.curve = this.curve;
    return shaper;
  }

  private recording(id: string): AudioBuffer | undefined {
    const buffer = this.engine.assets.get(id);
    if (!buffer) this.engine.preload([id]);
    return buffer;
  }

  private sample(voice: Voice, buffer: AudioBuffer, pitch: number, level = 1, offset = 0): void {
    const context = this.engine.context!;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = pitch;
    const gain = level === 1 ? undefined : context.createGain();
    if (gain) {
      gain.gain.value = level;
      node.connect(gain).connect(voice.out);
    } else node.connect(voice.out);
    voice.sources.add(node);
    node.onended = () => { voice.sources.delete(node); node.disconnect(); gain?.disconnect(); };
    node.start(voice.at + offset);
  }

  shot(slot: WeaponSlot, shooter: string, source: SoundSource, listener: Listener, own: boolean, hardFloor = false): boolean {
    if (!this.engine.running) return false;
    const { audibleDistance, distantBlendStart, distantBlendEnd } = COMBAT.audio;
    const distance = own ? 0 : Math.hypot(source.x - listener.x, source.z - listener.z, (source.y ?? listener.y ?? 0) - (listener.y ?? 0));
    if (distance > audibleDistance) return false;
    const mix = smooth(distantBlendStart, distantBlendEnd, distance);
    const profile = WEAPON_RECORDINGS[slot];
    const variation = this.rand() < .5 ? 0 : 1;
    const near = mix < 1 ? this.recording(profile.near[variation]) ?? this.recording(profile.near[1 - variation]) : undefined;
    const distant = mix > 0 ? this.recording(profile.distant) : undefined;
    if (!near && !distant) { this.counts.unavailable++; return false; }
    const pitch = .98 + this.rand() * .04;
    const casing = hardFloor && own && profile.casing && this.rand() < .28 ? this.recording(profile.casing) : undefined;
    const casingOffset = .15;
    const length = Math.max((near?.duration ?? 0) / pitch, (distant?.duration ?? 0) / pitch,
      casing ? casingOffset + casing.duration : 0);
    const priority = own ? PRIORITY.threat - 1 : PRIORITY.combat - Math.min(14, distance / 6);
    const voice = this.voice(shooter, source, listener, own, length, profile.level * (.96 + this.rand() * .08), priority, true);
    if (!voice) return false;
    if (near) this.sample(voice, near, pitch, distant ? 1 - mix : 1);
    if (distant) this.sample(voice, distant, pitch, near ? mix : 1);
    if (casing) {
      this.sample(voice, casing, 1, .24, casingOffset);
      this.counts.casing++;
    }
    this.counts[own ? 'own' : 'remote']++;
    return true;
  }

  explosion(source: SoundSource, listener: Listener, distance: number): void {
    const profile = COMBAT.audio.explosion;
    const priority = distance < 12 ? PRIORITY.combat + 17 : PRIORITY.combat - Math.min(14, distance / 5);
    const voice = this.voice('blast', source, listener, false, 1.35, profile.gain * .76, priority);
    if (!voice) return;
    const { at, blend } = voice;
    this.noise(voice, at, .22 + blend * .21, 'lowpass', 5600 - 4200 * blend, .7, .94, .002, 190);
    this.tone(voice, at, .65, profile.bodyHz * (1.48 + this.rand() * .16), profile.bodyHz * .52, .93, 'sine', true);
    this.noise(voice, at + .035, .85 + .34 * blend, 'lowpass', 890 - blend * 380, .5, profile.tailGain * .52, .034);
  }

  private mechanics(owner: string, source: SoundSource, listener: Listener, own: boolean, steps: [number, number, number, number][]): void {
    const voice = this.voice(owner, source, listener, own, Math.max(...steps.map(([delay]) => delay)) + .2, own ? .55 : .4);
    if (!voice || (!own && voice.blend > .4)) return;
    for (const [delay, frequency, q, level] of steps) {
      this.noise(voice, voice.at + delay, .035, 'bandpass', frequency, q, level);
    }
  }

  /** Local snapshots are immediate. Remote snapshots follow the existing pose playback clock. */
  handling(packet: PlayersSnapshot, listener: Listener, ownId: string, own: boolean, ready: boolean): void {
    const previous = own ? this.ownHandling : this.remoteHandling;
    if (previous && packet.tick <= previous.tick) return;
    if (own) this.ownHandling = packet;
    else this.remoteHandling = packet;
    if (!previous || !ready || !this.engine.running) return;
    for (const player of packet.players) {
      if ((player.id === ownId) !== own) continue;
      if (!own && Math.hypot(player.x - listener.x, player.z - listener.z) > 32) continue;
      const before = previous.players.find(({ id }) => id === player.id);
      const cue = weaponHandlingCue(player, before, previous.tick, packet.tick);
      if (!cue) continue;
      const id = cue.action === 'switch' ? WEAPON_SWITCH_ASSET : WEAPON_RECORDINGS[cue.slot][cue.action];
      if (!id) continue;
      const buffer = this.recording(id);
      if (!buffer) { this.counts.unavailable++; continue; }
      const voice = this.voice(`${player.id}-handling`, player, listener, own, buffer.duration, own ? .70 : .56,
        own ? PRIORITY.combat : PRIORITY.world, true);
      if (!voice) continue;
      this.sample(voice, buffer, 1);
      this.counts[cue.action]++;
    }
  }

  clearTransient(): void {
    for (const release of this.transient) release();
    this.ownHandling = this.remoteHandling = undefined;
  }

  grenadeRelease(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    if (!own && Math.hypot(source.x - listener.x, source.z - listener.z) > 30) return;
    const voice = this.voice(`${operator}-throw`, source, listener, own, .18, .50, PRIORITY.world + 4);
    if (!voice) return;
    this.noise(voice, voice.at, .06, 'bandpass', 1650, 3.8, .25, .007, 740);
  }

  meleeSwing(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    if (!own && Math.hypot(source.x - listener.x, source.z - listener.z) > 30) return;
    const voice = this.voice(`${operator}-melee`, source, listener, own, .18, own ? .76 : .53, PRIORITY.combat);
    if (voice) this.noise(voice, voice.at, .115, 'bandpass', 540, 1.1, .39, .018, 1950);
  }

  resupply(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    this.mechanics(`${operator}-supply`, source, listener, own, [[0, 420, 2, .5], [.08, 1200, 4, .35], [.3, 2100, 8, .3], [.42, 1800, 8, .25]]);
  }
}

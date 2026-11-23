import { BALLOON, BOARDING_TICKS, DEPLOYMENT_PHASES, NET } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import type { AudioEngine } from './AudioEngine.ts';

const MUSIC_PATH = (import.meta.env?.BASE_URL ?? '/') + 'music/';

/**
 * Score cues. Levels sit the -14.5 LUFS masters under the -23 LUFS effect mix; the music bus adds the player volume.
 * `tail`: seconds after the Albatross touchdown at which the drop score starts to fade. `loop`: repeats until its
 * state ends. The briefing bed plays at 30 % of the master's level, well under the voices and the deck ambience. The title
 * screen plays "Silent Watch" at 40 %.
 */
export const MUSIC_TRACKS = {
  /** Titel- und Loginbildschirm: „Silent Watch“ bei 40 % der Originallautstärke. */
  title: { file: 'title-silent-watch', level: .4, fadeIn: 3, fadeOut: 2.5, tail: 0, loop: true },
  briefing: { file: 'briefing-silence', level: .3, fadeIn: 4, fadeOut: 3, tail: 0, loop: true },
  drop: { file: 'drop-larree-triomphale', level: .85, fadeIn: 1.2, fadeOut: 6, tail: 15, loop: false },
  balloon: { file: 'extraction-last-stand', level: .7, fadeIn: 2.5, fadeOut: 5, tail: 0, loop: false },
} as const;
export type MusicTrack = keyof typeof MUSIC_TRACKS;
export interface MusicCue { track: MusicTrack; offset: number }

const phaseStart = (phase: string): number => {
  let ticks = 0;
  for (const [name, duration] of DEPLOYMENT_PHASES) {
    if (name === phase) return ticks;
    ticks += duration;
  }
  return ticks;
};

/**
 * Which score belongs to the mission state, and how far into it (seconds) a client joining late should start.
 * Drop: from the moment every operator has reported ready (boarding countdown) through the flight and a short tail
 * after touchdown. Balloon extraction: from activation until the mission result. Briefing: quietly from the mission
 * selection through boarding until the drop score takes over at the countdown.
 */
export function musicCue(state: MissionSnapshot | undefined, tick: number, playing?: MusicTrack): MusicCue | undefined {
  if (!state || state.result) return;
  const extraction = state.extraction;
  if (extraction?.method === 'balloon') {
    const countdown = extraction.phase === 'COUNTDOWN' ? 0 : BALLOON.countdownTicks;
    const approach = extraction.phase === 'LIFT' ? BALLOON.approachTicks : 0;
    return { track: 'balloon', offset: Math.max(0, countdown + approach + tick - extraction.phaseAt) / NET.tickHz };
  }
  if (state.state === 'BOARDING' && state.boardingUntil > 0) {
    return { track: 'drop', offset: Math.max(0, tick - (state.boardingUntil - BOARDING_TICKS)) / NET.tickHz };
  }
  if (state.state === 'MISSION_SELECTION' || state.state === 'BOARDING') return { track: 'briefing', offset: 0 };
  if (state.state === 'DEPLOYMENT' && state.phase !== 'DOCKED' && state.phase !== 'BOARDING') {
    return { track: 'drop', offset: (BOARDING_TICKS + phaseStart(state.phase) + Math.max(0, tick - state.phaseAt)) / NET.tickHz };
  }
  // DEPLOYED begins when the touchdown phase ends; the tail counts from the touchdown itself.
  const touchdown = state.phaseAt - (DEPLOYMENT_PHASES.find(([phase]) => phase === 'TOUCHDOWN')?.[1] ?? 0);
  if (playing === 'drop' && state.phase === 'DEPLOYED' && tick - touchdown < MUSIC_TRACKS.drop.tail * NET.tickHz) {
    return { track: 'drop', offset: 0 };
  }
}

interface Channel { element: HTMLAudioElement; gain: GainNode; source: MediaElementAudioSourceNode; stopAt: number }

/**
 * Streams long score files through an HTML media element into the music bus instead of decoding them into PCM
 * (150 s of 48 kHz stereo would be ~57 MiB). One channel per track, cross-faded on changes.
 */
export class MusicPlayer {
  private readonly engine: AudioEngine;
  private readonly channels = new Map<MusicTrack, Channel>();
  /** Tracks that already played to their end in this run; they are not restarted. */
  private readonly finished = new Set<MusicTrack>();
  private run?: string;
  current?: MusicTrack;
  starts = 0;

  constructor(engine: AudioEngine) { this.engine = engine; }

  update(cue: MusicCue | undefined, run: string | undefined): void {
    if (run !== this.run) {
      this.run = run;
      this.finished.clear();
    }
    const context = this.engine.context;
    if (!context || !this.engine.running || typeof Audio === 'undefined') {
      if (this.current) this.stop(0);
      return;
    }
    const wanted = cue && !this.finished.has(cue.track) ? cue.track : undefined;
    if (wanted === this.current) return;
    if (this.current) this.fadeOut(this.current, MUSIC_TRACKS[this.current].fadeOut);
    this.current = wanted;
    if (wanted) this.start(context, wanted, cue!.offset);
  }

  private start(context: AudioContext, track: MusicTrack, offset: number): void {
    const bus = this.engine.bus('music');
    if (!bus) return;
    let channel = this.channels.get(track);
    if (!channel) {
      const element = new Audio();
      element.preload = 'auto';
      element.loop = MUSIC_TRACKS[track].loop;
      const ogg = element.canPlayType('audio/ogg; codecs="vorbis"');
      element.src = MUSIC_PATH + MUSIC_TRACKS[track].file + (ogg ? '.ogg' : '.mp3');
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(bus);
      element.addEventListener('ended', () => {
        this.finished.add(track);
        if (this.current === track) this.current = undefined;
      });
      channel = { element, gain, source, stopAt: 0 };
      this.channels.set(track, channel);
    }
    const { element, gain } = channel;
    channel.stopAt = 0;
    // Only seek for a late join; a fresh start keeps the composed intro.
    if (offset > 1.5 && Number.isFinite(element.duration) && offset >= element.duration) {
      this.finished.add(track);
      this.current = undefined;
      return;
    }
    element.currentTime = offset > 1.5 ? offset : 0;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(MUSIC_TRACKS[track].level, now + MUSIC_TRACKS[track].fadeIn);
    void element.play().catch(() => { this.engine.assets.errors++; });
    this.starts++;
  }

  private fadeOut(track: MusicTrack, seconds: number): void {
    const channel = this.channels.get(track);
    const context = this.engine.context;
    if (!channel || !context) return;
    const now = context.currentTime;
    channel.gain.gain.cancelScheduledValues(now);
    channel.gain.gain.setValueAtTime(channel.gain.gain.value, now);
    channel.gain.gain.linearRampToValueAtTime(0, now + Math.max(.05, seconds));
    const stopAt = now + seconds + .1;
    channel.stopAt = stopAt;
    setTimeout(() => { if (channel.stopAt === stopAt) channel.element.pause(); }, (seconds + .2) * 1000);
  }

  /** Fades everything out (leaving the room, disabling audio). */
  stop(seconds = .6): void {
    for (const track of this.channels.keys()) this.fadeOut(track, seconds);
    this.current = undefined;
  }

  metrics() { return { track: this.current ?? '', starts: this.starts }; }
}

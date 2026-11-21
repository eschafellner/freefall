/**
 * Clip contract of the hybrid character animation: which GLB clips FREEFALL plays, on which layer, how their time
 * is driven and what happens while a clip is still missing. The client, the coverage report and the offline asset
 * check read this single table. Asset requirements for artists: docs/CHARACTER_ASSET_REQUIREMENTS.md.
 */
import type { CharacterClip } from '../CharacterAnimation.ts';

export type ClipGroup = 'locomotion' | 'crouch' | 'slide' | 'dive' | 'prone' | 'supine' | 'getUp' | 'reload' | 'stim' | 'switch' | 'combat' | 'reaction';
/** `base`: full body (locomotion, postures). `upper`: upper-body layer over the base (masked by UPPER_BODY_BONES). */
export type ClipLayer = 'base' | 'upper';
/**
 * `free`: plays at authored rate. `speed`: rate follows the rendered ground speed (`clipSpeeds`).
 * `server`: clip time is set from server progress (posture transition, reload or stim action), never free-running.
 */
export type ClipTiming = 'free' | 'speed' | 'server';
/** `minimum`: without it the GLB is not used at all. `core`: requested production set. `optional`: polish. */
export type ClipPriority = 'minimum' | 'core' | 'optional';

export interface ClipRequirement {
  readonly id: CharacterClip;
  readonly group: ClipGroup;
  readonly layer: ClipLayer;
  readonly loop: boolean;
  readonly timing: ClipTiming;
  readonly priority: ClipPriority;
  /** What the player sees while the clip is missing. */
  readonly fallback: string;
}

const PROCEDURAL = 'prozedurales Rig für diesen Zustand';
const GLB_HANDLING = 'GLB-Grundpose, Waffe und Magazin prozedural';

const r = (id: CharacterClip, group: ClipGroup, layer: ClipLayer, loop: boolean, timing: ClipTiming,
  priority: ClipPriority, fallback: string): ClipRequirement => ({ id, group, layer, loop, timing, priority, fallback });

export const CLIP_REQUIREMENTS: readonly ClipRequirement[] = [
  r('idle', 'locomotion', 'base', true, 'free', 'minimum', 'ohne Idle bleibt das prozedurale Rig aktiv'),
  r('walk', 'locomotion', 'base', true, 'speed', 'minimum', 'Run (Walk oder Run ist Pflicht)'),
  r('run', 'locomotion', 'base', true, 'speed', 'minimum', 'Walk (Walk oder Run ist Pflicht)'),
  r('sprint', 'locomotion', 'base', true, 'speed', 'core', 'Run, sonst Walk'),
  r('strafeLeft', 'locomotion', 'base', true, 'speed', 'core', 'Walk, sonst Run'),
  r('strafeRight', 'locomotion', 'base', true, 'speed', 'core', 'Walk, sonst Run'),
  r('backward', 'locomotion', 'base', true, 'speed', 'core', 'Walk, sonst Run'),
  r('crouchEnter', 'crouch', 'base', false, 'server', 'core', PROCEDURAL),
  r('crouchIdle', 'crouch', 'base', true, 'free', 'core', PROCEDURAL),
  r('crouchWalk', 'crouch', 'base', true, 'speed', 'core', PROCEDURAL),
  r('crouchStrafeLeft', 'crouch', 'base', true, 'speed', 'core', 'Crouch Walk, sonst ' + PROCEDURAL),
  r('crouchStrafeRight', 'crouch', 'base', true, 'speed', 'core', 'Crouch Walk, sonst ' + PROCEDURAL),
  r('crouchAim', 'crouch', 'upper', true, 'free', 'core', GLB_HANDLING),
  r('crouchFire', 'crouch', 'upper', false, 'free', 'core', GLB_HANDLING),
  r('crouchReload', 'reload', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('crouchExit', 'crouch', 'base', false, 'server', 'core', PROCEDURAL),
  r('slideStart', 'slide', 'base', false, 'server', 'core', PROCEDURAL),
  r('slideLoop', 'slide', 'base', true, 'server', 'core', PROCEDURAL),
  r('slideEnd', 'slide', 'base', false, 'server', 'core', PROCEDURAL),
  r('diveForward', 'dive', 'base', false, 'server', 'core', PROCEDURAL),
  r('diveBackward', 'dive', 'base', false, 'server', 'core', PROCEDURAL),
  r('diveLeft', 'dive', 'base', false, 'server', 'core', PROCEDURAL),
  r('diveRight', 'dive', 'base', false, 'server', 'core', PROCEDURAL),
  r('diveForwardLeft', 'dive', 'base', false, 'server', 'optional', PROCEDURAL),
  r('diveForwardRight', 'dive', 'base', false, 'server', 'optional', PROCEDURAL),
  r('diveBackwardLeft', 'dive', 'base', false, 'server', 'optional', PROCEDURAL),
  r('diveBackwardRight', 'dive', 'base', false, 'server', 'optional', PROCEDURAL),
  r('proneEnter', 'prone', 'base', false, 'server', 'core', 'Prone-Grundpose, sonst ' + PROCEDURAL),
  r('proneLand', 'prone', 'base', false, 'server', 'core', 'Prone-Grundpose, sonst prozedurale Landung'),
  r('proneIdle', 'prone', 'base', true, 'free', 'core', PROCEDURAL),
  r('proneAim', 'prone', 'base', true, 'free', 'core', PROCEDURAL),
  r('proneFire', 'prone', 'upper', false, 'free', 'optional', GLB_HANDLING),
  r('proneCrawl', 'prone', 'base', true, 'speed', 'core', PROCEDURAL),
  r('proneReload', 'reload', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('proneStim', 'stim', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('proneSwitch', 'switch', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('supineEnter', 'supine', 'base', false, 'server', 'core', 'Supine-Grundpose, sonst ' + PROCEDURAL),
  r('supineLand', 'supine', 'base', false, 'server', 'core', 'Supine-Grundpose, sonst prozedurale Landung'),
  r('supineIdle', 'supine', 'base', true, 'free', 'core', PROCEDURAL),
  r('supineAim', 'supine', 'base', true, 'free', 'core', PROCEDURAL),
  r('supineFire', 'supine', 'upper', false, 'free', 'optional', GLB_HANDLING),
  r('supineMove', 'supine', 'base', true, 'speed', 'core', PROCEDURAL),
  r('supineReload', 'reload', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('supineStim', 'stim', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('supineSwitch', 'switch', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('proneGetUp', 'getUp', 'base', false, 'server', 'core', PROCEDURAL),
  r('supineGetUp', 'getUp', 'base', false, 'server', 'core', PROCEDURAL),
  r('reload', 'reload', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('reloadPistol', 'reload', 'upper', false, 'server', 'optional', 'Reload (Gewehr), sonst ' + GLB_HANDLING),
  r('stim', 'stim', 'upper', false, 'server', 'core', 'GLB-Grundpose, Waffe wird prozedural gesenkt'),
  r('weaponSwitch', 'switch', 'upper', false, 'server', 'core', GLB_HANDLING),
  r('aim', 'combat', 'base', true, 'free', 'optional', 'Idle mit prozeduraler Ziel- und Blickausrichtung'),
  r('fire', 'combat', 'upper', false, 'free', 'optional', 'prozeduraler Waffenrückstoß'),
  r('hit', 'reaction', 'upper', false, 'free', 'optional', 'kein Treffer-Clip, nur Waffen-/Kamerareaktion'),
  r('death', 'reaction', 'base', false, 'free', 'optional', 'Modell kippt als Ganzes'),
];

export const CLIP_REQUIREMENT = new Map(CLIP_REQUIREMENTS.map((entry) => [entry.id, entry]));

/** Clips that leave the GLB entirely and show the procedural rig while they are missing. */
export const PROCEDURAL_WHEN_MISSING: ReadonlySet<CharacterClip> = new Set(
  CLIP_REQUIREMENTS.filter((entry) => entry.fallback === PROCEDURAL).map((entry) => entry.id));

export interface ClipCoverage {
  /** Idle and Walk or Run: the GLB can be used. */
  usable: boolean;
  present: CharacterClip[];
  missing: ClipRequirement[];
  /** Missing core clips per group, for the log line and the asset report. */
  missingCore: Partial<Record<ClipGroup, CharacterClip[]>>;
}

export function clipCoverage(available: Iterable<CharacterClip>): ClipCoverage {
  const have = new Set(available);
  const present = CLIP_REQUIREMENTS.filter((entry) => have.has(entry.id)).map((entry) => entry.id);
  const missing = CLIP_REQUIREMENTS.filter((entry) => !have.has(entry.id));
  const missingCore: ClipCoverage['missingCore'] = {};
  for (const entry of missing) {
    if (entry.priority === 'optional') continue;
    // Walk and Run stand in for each other: only both missing is a gap.
    if ((entry.id === 'walk' || entry.id === 'run') && (have.has('walk') || have.has('run'))) continue;
    (missingCore[entry.group] ??= []).push(entry.id);
  }
  return { usable: have.has('idle') && (have.has('walk') || have.has('run')), present, missing, missingCore };
}

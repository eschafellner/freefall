import type { Object3D } from 'three';
import { ENEMY_ARCHETYPES, SCHABE_ARCHETYPE_ID, TEST_RIFLE } from '@freefall/shared';
import { EnemyVisualLOD } from './EnemyVisualLOD.ts';
import type { CharacterClip } from './characters/CharacterAnimation.ts';
import type { SkeletonConfig } from './characters/animation/HumanoidSkeleton.ts';

export const EQUIPMENT_SLOTS = ['Helmet', 'Torso', 'Arms', 'Legs', 'Backpack', 'PrimaryWeapon', 'SecondaryWeapon'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type EquipmentAnchors = Record<EquipmentSlot, { parent: Object3D; position: readonly [number, number, number] }>;

/** Animation-only GLB. A different humanoid skeleton is retargeted onto the character on load. */
export interface AnimationPackAsset {
  path: string;
  skeleton?: SkeletonConfig;
}

/** Character asset contract: docs/CHARACTER_ASSET_REQUIREMENTS.md. */
export interface SoldierAsset {
  /** GLB under public/assets, in meters with feet at the origin and forward along -Z. */
  path: string;
  /** Animation GLBs bound to the character's own skeleton (same bone names and bind pose). */
  animationPaths?: readonly string[];
  /** Animation GLBs with their own skeleton description; retargeted when the rigs differ. */
  animationPacks?: readonly AnimationPackAsset[];
  /** Humanoid role mapping of the character. Without it the naming preset is detected. */
  skeleton?: SkeletonConfig;
  /** Two-bone foot IK that keeps feet out of the ground. Off by default until a clip set has been reviewed. */
  footIK?: boolean;
  clips?: Partial<Record<CharacterClip, string>>;
  equipmentNodes?: Partial<Record<EquipmentSlot, string>>;
  /** Optional animated root whose horizontal translation and rotations are removed. */
  motionRoot?: string;
  /**
   * Ground speed in m/s each locomotion clip was authored for. When set, playback rate follows the
   * rendered speed so feet stay planted (clamped to 0.6–1.6×). Unset clips play at authored rate.
   */
  clipSpeeds?: Partial<Record<Exclude<CharacterClip, 'idle'>, number>>;
}

export interface WeaponAsset { path: string }

const weapons: Partial<Record<string, WeaponAsset>> = {};
export const ASSETS: { soldier?: SoldierAsset; weapons: typeof weapons; ktx2Transcoder?: string } = { weapons };

export const SCHABE_VISUAL = ENEMY_ARCHETYPES[SCHABE_ARCHETYPE_ID].visualAssetId;
export const ENEMY_VISUALS = { [SCHABE_VISUAL]: EnemyVisualLOD } as const;
export const PRIMARY_WEAPON_ASSET = TEST_RIFLE.assets.visual;

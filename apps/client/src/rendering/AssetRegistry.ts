import type { Object3D } from 'three';
import { ENEMY_ARCHETYPES, SCHABE_ARCHETYPE_ID, TEST_RIFLE } from '@freefall/shared';
import { EnemyVisualLOD } from './EnemyVisualLOD.ts';
import type { CharacterClip } from './characters/CharacterAnimation.ts';

export const EQUIPMENT_SLOTS = ['Helmet', 'Torso', 'Arms', 'Legs', 'Backpack', 'PrimaryWeapon', 'SecondaryWeapon'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type EquipmentAnchors = Record<EquipmentSlot, { parent: Object3D; position: readonly [number, number, number] }>;

export interface SoldierAsset {
  /** GLB under public/assets, in meters with feet at the origin and forward along -Z. */
  path: string;
  animationPaths?: readonly string[];
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
export const PRIMARY_WEAPON_ASSET = TEST_RIFLE.visualAssetId;

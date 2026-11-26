import * as T from 'three';
import type { CarrierProp } from '@freefall/shared';
import type { CardBatch } from './CarrierEffects.ts';
import type { CarrierScreens } from './CarrierScreens.ts';
import type { CarrierPalette } from './CarrierPalette.ts';
import type { ShipKit } from './ShipKit.ts';

/** Everything a builder of the carrier needs: the geometry kit, materials, light cards and the scene groups. */
export interface CarrierContext {
  kit: ShipKit;
  p: CarrierPalette;
  /** White work-light strips, tinted red under alarm. */
  lit: T.MeshStandardMaterial;
  /** Red warning lamps, pulsing with the alarm. */
  alarm: T.MeshStandardMaterial;
  /** Additive cards: under ceiling fixtures, pools on the deck, in front of windows. */
  ceilingGlow: CardBatch;
  floorGlow: CardBatch;
  glow(color: number, opacity: number): CardBatch;
  /** Always visible. */
  root: T.Group;
  /** Hidden on Low quality. */
  detail: T.Group;
  /** Shaft materials (strength follows the alarm). */
  shafts: T.ShaderMaterial[];
  /** Real lights with their base intensity (alarm dims them). */
  lights: { light: T.PointLight | T.SpotLight; color: T.Color; intensity: number; low: boolean }[];
  addLight(color: number, intensity: number, distance: number, x: number, y: number, z: number, low?: boolean, decay?: number): T.PointLight;
  /** Ticking callbacks (screens, fans, shield). */
  tick: ((seconds: number, dt: number) => void)[];
}

/** Local footprint of a prop: width along its own x, depth along its own z (front at +z). */
export function footprint(prop: CarrierProp): { w: number; d: number } {
  const turned = Math.abs(Math.sin(prop.yaw ?? 0)) > .5;
  return turned ? { w: prop.halfZ * 2, d: prop.halfX * 2 } : { w: prop.halfX * 2, d: prop.halfZ * 2 };
}

/** Builds one prop in its local frame (origin on the deck at the collider centre, front towards +z). */
export type PropBuilder = (c: CarrierContext, screens: CarrierScreens, prop: CarrierProp, w: number, d: number) => void;

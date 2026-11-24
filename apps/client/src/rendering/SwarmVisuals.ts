import type * as T from 'three';
import type { HordeFrame, WorldDefinition } from '@freefall/shared';
import type { ContactShadows } from './ContactShadows.ts';
import { EnemyVisualLOD } from './EnemyVisualLOD.ts';
import type { EnemyPose } from './EnemyVisualLOD.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { BREACHER_VISUAL, JAEGER_VISUAL, WarriorVisualLOD } from './WarriorVisualLOD.ts';

/** Geometry and material of a fallen body, by wire type. */
export interface FallenVisual {
  readonly geometry: T.BufferGeometry;
  readonly material: T.Material;
}

/**
 * All swarm renderers behind one interface: the approved Schabe (`EnemyVisualLOD`, wire type 0) and the warrior
 * castes. Each renderer draws only its own wire type from the shared horde frames.
 */
export class SwarmVisuals {
  readonly schabe: EnemyVisualLOD;
  readonly warriors: readonly WarriorVisualLOD[];
  /** Fallen body visuals indexed by wire type. */
  readonly fallen: readonly FallenVisual[];
  private before?: HordeFrame;
  private after?: HordeFrame;
  visible = 0;

  constructor(scene: T.Scene) {
    this.schabe = new EnemyVisualLOD(scene);
    this.warriors = [new WarriorVisualLOD(scene, JAEGER_VISUAL), new WarriorVisualLOD(scene, BREACHER_VISUAL)];
    const fallen: FallenVisual[] = [{ geometry: this.schabe.fallenGeometry, material: this.schabe.material }];
    for (const warrior of this.warriors) fallen[warrior.caste.type] = { geometry: warrior.fallenGeometry, material: warrior.material };
    this.fallen = fallen;
  }

  private typeOf(id: number): number {
    const a = this.before, b = this.after;
    const i = a?.byId.get(id);
    if (a && i !== undefined) return a.type[i];
    const j = b?.byId.get(id);
    return b && j !== undefined ? b.type[j] : 0;
  }

  clear(): void {
    this.schabe.clear();
    for (const warrior of this.warriors) warrior.clear();
    this.before = this.after = undefined;
  }

  /** Hit reaction or kill of any swarm creature; a kill returns the pose of the fallen body with its type. */
  hit(id: number, now: number, killed: boolean): EnemyPose | undefined {
    const type = this.typeOf(id);
    const warrior = this.warriors.find((entry) => entry.caste.type === type);
    if (warrior) warrior.hit(id, now, killed);
    // The Schabe renderer knows the interpolated pose of every frame entry (it only draws Schaben itself).
    const pose = warrior && !killed ? undefined : this.schabe.hit(id, now, killed);
    return pose && { ...pose, type };
  }

  draw(camera: T.Camera, a: HordeFrame | undefined, b: HordeFrame | undefined, alpha: number, now: number,
    quality: GraphicsQuality, shadows: ContactShadows, world?: WorldDefinition): void {
    this.before = a;
    this.after = b;
    this.schabe.draw(camera, a, b, alpha, now, quality, shadows, world);
    let visible = this.schabe.visible;
    for (const warrior of this.warriors) {
      warrior.draw(camera, a, b, alpha, now, quality, shadows, world);
      visible += warrior.visible;
    }
    this.visible = visible;
  }
}

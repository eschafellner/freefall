import * as T from 'three';
import type { OperatorLook } from '@freefall/shared';
import { ModelParts } from '../../ModelParts.ts';
import type { SkinInfluence } from '../../ModelParts.ts';
import { surfaceMaterial } from '../../AgentMeshes.ts';
import type { EquipmentSlot } from '../../AssetRegistry.ts';
import { bindPosition, boneOf } from './OperatorSkeleton.ts';
import type { OperatorBone, Side } from './OperatorSkeleton.ts';
import { rigidWeights } from './BodyLoft.ts';

/**
 * Wardrobe: the operator's look is assembled from exchangeable items, like armour sets in a squad shooter.
 *
 *   - `armor`  (Rüstung): suit, plates, gloves, boots, belt. Carries the weight class shown in a future armoury.
 *   - `helmet` (Helm): everything on the head, including the face when the helmet is open.
 *   - `pack`   (Rucksack): the back-mounted equipment on the spring-mounted backpack bone.
 *
 * Items draw bone-local shapes through a `PieceKit`. A look compiles into one skinned geometry per material channel
 * (cloth, plate), shared by every operator wearing it: a full look costs two draw calls per operator, no matter how
 * many pieces it has. Team markers stay separate meshes with the slot colour.
 */
export type Channel = 'cloth' | 'plate';
export type WardrobeSlot = 'armor' | 'helmet' | 'pack';
export type WeightClass = 'leicht' | 'mittel' | 'schwer' | 'ueberschwer';

export interface WardrobeItem {
  readonly id: string;
  readonly slot: WardrobeSlot;
  /** Display name for the armoury. */
  readonly name: string;
  readonly weight?: WeightClass;
  readonly description?: string;
  build(kit: PieceKit): void;
}

/** What one operator wears (`PlayerState.look`). Ids refer to `WARDROBE` entries. */
export type { OperatorLook } from '@freefall/shared';

export interface Marker {
  bone: OperatorBone;
  position: readonly [number, number, number];
  /** Outward normal of the patch in bone space. */
  facing: readonly [number, number, number];
  size: readonly [number, number];
}

export interface Anchor {
  bone: OperatorBone;
  position: readonly [number, number, number];
}

export interface CompiledLook {
  readonly key: string;
  readonly geometries: Partial<Record<Channel, T.BufferGeometry>>;
  readonly markers: readonly Marker[];
  readonly anchors: Partial<Record<EquipmentSlot, Anchor>>;
  readonly triangles: number;
  /** Weight class of the armour; the motion layer reads it for posture and step weight. */
  readonly weight: WeightClass;
}

type SidedName = Parameters<typeof boneOf>[0];

export class PieceKit {
  private readonly groups = new Map<string, { channel: Channel; parts: ModelParts }>();
  private skinned = 0;
  readonly markers: Marker[] = [];
  readonly anchors: Partial<Record<EquipmentSlot, Anchor>> = {};

  /** Shapes rigidly attached to one bone. Coordinates are relative to the bone's bind position. */
  on(bone: OperatorBone, draw: (m: ModelParts) => void, channel: Channel = 'plate'): void {
    const key = channel + ':' + bone;
    let group = this.groups.get(key);
    if (!group) {
      const parts = new ModelParts({ skinned: true });
      parts.offset.set(...bindPosition(bone));
      parts.skin = rigidWeights(bone);
      group = { channel, parts };
      this.groups.set(key, group);
    }
    const { parts } = group;
    const gloss = parts.gloss, glow = parts.glow, shade = parts.shade;
    draw(parts);
    parts.gloss = gloss;
    parts.glow = glow;
    parts.shade = shade;
  }

  /** The same piece on the left (side −1) and the right (side 1) bone; draw mirrors itself with `side`. */
  both(name: SidedName, draw: (m: ModelParts, side: Side) => void, channel: Channel = 'plate'): void {
    for (const side of [-1, 1] as const) this.on(boneOf(name, side), (m) => draw(m, side), channel);
  }

  /** Skinned shapes in bind-pose model space; `weights` decides how they deform. */
  skin(weights: (x: number, y: number, z: number) => SkinInfluence, draw: (m: ModelParts) => void, channel: Channel = 'cloth', occlusion = 0): void {
    const parts = new ModelParts({ skinned: true, occlusion });
    parts.skin = weights;
    draw(parts);
    this.groups.set(`${channel}:skin:${this.skinned++}`, { channel, parts });
  }

  /** Team colour patch (slot colour of the HUD). */
  marker(bone: OperatorBone, position: Marker['position'], facing: Marker['facing'], size: Marker['size'] = [.062, .049]): void {
    this.markers.push({ bone, position, facing, size });
  }

  /** Attachment point for equipment slots (e.g. the backpack stencil of convicts). */
  anchor(slot: EquipmentSlot, bone: OperatorBone, position: Anchor['position']): void {
    this.anchors[slot] = { bone, position };
  }

  compile(key: string, weight: WeightClass): CompiledLook {
    const byChannel = new Map<Channel, T.BufferGeometry[]>();
    for (const { channel, parts } of this.groups.values()) {
      if (!parts.size) continue;
      const list = byChannel.get(channel) ?? [];
      list.push(parts.geometry());
      byChannel.set(channel, list);
    }
    const geometries: Partial<Record<Channel, T.BufferGeometry>> = {};
    let triangles = 0;
    for (const [channel, list] of byChannel) {
      const merged = mergeSkinned(list);
      merged.computeBoundingSphere();
      geometries[channel] = merged;
      triangles += merged.getAttribute('position').count / 3;
    }
    return { key, geometries, markers: this.markers, anchors: this.anchors, triangles, weight };
  }
}

function mergeSkinned(list: T.BufferGeometry[]): T.BufferGeometry {
  if (list.length === 1) return list[0];
  // All groups share the same attribute layout (position, normal, color, surface, skinIndex, skinWeight).
  const names = Object.keys(list[0].attributes);
  const merged = new T.BufferGeometry();
  for (const name of names) {
    const first = list[0].getAttribute(name) as T.BufferAttribute;
    const total = list.reduce((sum, geometry) => sum + geometry.getAttribute(name).count, 0);
    const array = new (first.array.constructor as Float32ArrayConstructor)(total * first.itemSize);
    let offset = 0;
    for (const geometry of list) {
      const attribute = geometry.getAttribute(name) as T.BufferAttribute;
      array.set(attribute.array as Float32Array, offset);
      offset += attribute.array.length;
    }
    merged.setAttribute(name, new T.BufferAttribute(array, first.itemSize, first.normalized));
  }
  for (const geometry of list) geometry.dispose();
  return merged;
}

export function lookKey(look: OperatorLook): string { return `${look.armor}|${look.helmet}|${look.pack}`; }

/**
 * Builds looks on demand and shares them. One wardrobe per view (players, convicts); `dispose` releases every
 * compiled look and the two materials.
 */
export class OperatorWardrobe {
  readonly materials: Record<Channel, T.MeshStandardMaterial> = {
    cloth: surfaceMaterial({ vertexColors: true, roughness: .9, metalness: .04 }),
    plate: surfaceMaterial({ vertexColors: true, roughness: .78, metalness: .24 }),
  };
  /** Rigid props shared by every operator: stim injector, held grenade, team patch. */
  readonly props: { injector: T.BufferGeometry; frag: T.BufferGeometry; patch: T.BufferGeometry };
  private readonly looks = new Map<string, CompiledLook>();
  private readonly items: ReadonlyMap<string, WardrobeItem>;

  constructor(items: readonly WardrobeItem[]) {
    this.items = new Map(items.map((item) => [item.id, item]));
    const injector = new ModelParts();
    injector.box(0xc2c1a7, 0, .059, 0, .031, .112, .032, .008);
    injector.box(0x67362c, 0, .099, 0, .035, .014, .036, .004);
    injector.tube(0x232726, 0, .13, 0, .009, .012, .025, 0, 0, 8);
    const frag = new ModelParts();
    frag.gloss = .62;
    frag.oval(0x45514d, 0, .0, 0, .066, .095, .065);
    frag.box(0x768174, .018, .039, .007, .018, .061, .024, .004);
    const patch = new ModelParts();
    patch.box(0xffffff, 0, 0, 0, .062, .049, .007, .002);
    this.props = { injector: injector.geometry(), frag: frag.geometry(), patch: patch.geometry() };
  }

  get catalog(): readonly WardrobeItem[] { return [...this.items.values()]; }

  item(id: string, slot: WardrobeSlot): WardrobeItem {
    const item = this.items.get(id);
    if (!item || item.slot !== slot) throw new Error(`Unbekanntes Ausrüstungsteil ${slot}:${id}`);
    return item;
  }

  has(id: string, slot: WardrobeSlot): boolean { return this.items.get(id)?.slot === slot; }

  /** Replaces unknown or missing ids slot by slot with the fallback look. */
  resolve(look: Partial<OperatorLook> | undefined, fallback: OperatorLook): OperatorLook {
    if (!look) return fallback;
    const armor = look.armor && this.has(look.armor, 'armor') ? look.armor : fallback.armor;
    const helmet = look.helmet && this.has(look.helmet, 'helmet') ? look.helmet : fallback.helmet;
    const pack = look.pack && this.has(look.pack, 'pack') ? look.pack : fallback.pack;
    return armor === fallback.armor && helmet === fallback.helmet && pack === fallback.pack ? fallback : { armor, helmet, pack };
  }

  look(look: OperatorLook): CompiledLook {
    const key = lookKey(look);
    let compiled = this.looks.get(key);
    if (!compiled) {
      const kit = new PieceKit();
      const armor = this.item(look.armor, 'armor');
      armor.build(kit);
      this.item(look.helmet, 'helmet').build(kit);
      this.item(look.pack, 'pack').build(kit);
      compiled = kit.compile(key, armor.weight ?? 'mittel');
      this.looks.set(key, compiled);
    }
    return compiled;
  }

  dispose(): void {
    for (const look of this.looks.values()) for (const geometry of Object.values(look.geometries)) geometry?.dispose();
    this.looks.clear();
    for (const geometry of Object.values(this.props)) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

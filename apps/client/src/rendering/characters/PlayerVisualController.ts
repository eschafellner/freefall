import { EventHistory } from '../../networking/EventHistory.ts';
import { BASE_LOADOUT, CAMERA_BACK, FRAG, NET, WEAPONS, aimRay, allowsPostureAction, postureCollider, postureYaw,
  tacticalAimPitch, tacticalAimYaw, tacticalMuzzle, terrainIntersection, wrapAngle } from '@freefall/shared';
import * as T from 'three';
import { EQUIPMENT_SLOTS } from '../AssetRegistry.ts';
import type { EquipmentSlot, SoldierAsset } from '../AssetRegistry.ts';
import type { createKestrel } from '../weapons/Kestrel.ts';
import { WeaponVisualController } from '../weapons/WeaponVisualController.ts';
import { CharacterAnimation } from './CharacterAnimation.ts';
import { CharacterClipPlayer } from './CharacterClipPlayer.ts';
import { SkeletonOverlay } from './animation/SkeletonOverlay.ts';
import { SoldierRig } from './SoldierRig.ts';
import type { createSoldierParts } from './SoldierRig.ts';
import { CLIP_REQUIREMENT } from './animation/ClipLibrary.ts';

import type { EquipmentState, PostureState, ReloadState, ShotEvent, WorldDefinition } from '@freefall/shared';

export type WeaponCue = Pick<ShotEvent, 'shooter' | 'tick' | 'life' | 'slot'>;
export type PresentShot = (weapon: WeaponVisualController | undefined, now: number) => void;

interface QueuedShot {
  cue: WeaponCue;
  deadline: number;
  present?: PresentShot;
}

const NEUTRAL = new T.Vector3(0, 1, 0);

export class PlayerVisualController {
  readonly root = new T.Group();
  readonly slots = {} as Record<EquipmentSlot, T.Group>;
  readonly animation = new CharacterAnimation();
  readonly weapon: WeaponVisualController;
  readonly sidearm: WeaponVisualController;
  private readonly holstered: T.Mesh;
  private readonly rig: SoldierRig;
  private readonly importedStage = new T.Group();
  private imported?: CharacterClipPlayer;
  private importedOverlay?: SkeletonOverlay;
  private importedMount?: T.Object3D;
  private readonly importedAnchors: Partial<Record<EquipmentSlot, T.Object3D>> = {};
  /** Look input of the current frame for the GLB overlay (pitch, yaw offset from the body, weight). */
  private readonly lookInput = { pitch: 0, yaw: 0, look: 0, ground: 0 };
  private readonly muzzleWorld = new T.Vector3();
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  private readonly target = new T.Vector3();
  private readonly look = new T.Matrix4();
  private readonly desired = new T.Quaternion();
  private id = '';
  private life = 0;
  private hp = 0;
  private lastX = 0;
  private lastZ = 0;
  private heading = 0;
  private readonly pendingShots: QueuedShot[] = [];
  private readonly posedShots: PresentShot[] = [];
  private readonly shotCues = new EventHistory();
  private lastQueuedShot?: { shooter: string; tick: number };

  constructor(parts: ReturnType<typeof createSoldierParts>, rifle: ReturnType<typeof createKestrel>, team: number, operator = true) {
    this.weapon = new WeaponVisualController(rifle);
    this.rig = new SoldierRig(parts, team, this.weapon, operator);
    this.sidearm = new WeaponVisualController(rifle.pistol, true);
    this.sidearm.root.visible = false;
    this.holstered = new T.Mesh(rifle.pistol.body, rifle.finish);
    this.holstered.rotation.set(-1.38, 0, .10);
    if (operator) this.rig.torso.add(this.sidearm.root);
    this.importedStage.visible = false;
    this.root.add(this.rig.root, this.importedStage);
    this.root.visible = false;
    for (const name of EQUIPMENT_SLOTS) {
      const slot = new T.Group();
      slot.name = `Equipment.${name}`;
      const anchor = this.rig.anchors[name];
      anchor.parent.add(slot);
      slot.position.set(...anchor.position);
      this.slots[name] = slot;
      if (operator && name === 'SecondaryWeapon') slot.add(this.holstered);
    }
  }

  attachCharacter(model: T.Object3D, clips: readonly T.AnimationClip[], asset: SoldierAsset): void {
    const mount = model.getObjectByName(asset.equipmentNodes?.PrimaryWeapon ?? 'PrimaryWeapon');
    const mixer = new CharacterClipPlayer(model, clips, asset);
    if (!mount || !mixer.ready) {
      mixer.dispose();
      throw new Error('Soldaten-GLB benötigt PrimaryWeapon sowie Idle und Walk oder Run.');
    }
    this.imported?.dispose();
    this.importedStage.clear();
    this.imported = mixer;
    this.importedOverlay = new SkeletonOverlay(model, mixer.humanoid.bones, asset.footIK ?? false);
    this.importedMount = mount;
    this.importedStage.add(model);
    this.importedStage.visible = true;
    this.rig.root.visible = false;
    mount.add(this.weapon.root, this.sidearm.root);
    this.weapon.root.position.set(0, 0, 0);
    this.weapon.root.quaternion.identity();
    for (const name of EQUIPMENT_SLOTS) {
      this.importedAnchors[name] = model.getObjectByName(asset.equipmentNodes?.[name] ?? name);
    }
    this.mountEquipment(true);
  }

  private mountEquipment(imported: boolean): void {
    for (const name of EQUIPMENT_SLOTS) {
      if (name === 'PrimaryWeapon') continue;
      const slot = this.slots[name];
      if (imported) {
        const anchor = this.importedAnchors[name];
        if (anchor) {
          anchor.add(slot);
          slot.position.set(0, 0, 0);
        } else slot.removeFromParent();
      } else {
        const anchor = this.rig.anchors[name];
        anchor.parent.add(slot);
        slot.position.set(...anchor.position);
      }
    }
  }

  draw(id: string, life: number, hp: number, x: number, z: number, yaw: number, pitch: number,
    aim: boolean, sprint: boolean, reloadUntil: number, tick: number, now: number, dt: number, local: boolean, gear?: EquipmentState,
    posture?: PostureState, y = 0, interpolatedYaw?: number, reload?: ReloadState, actionTick = tick, world?: WorldDefinition): void {
    const bodyYaw = posture ? postureYaw(posture, yaw) : yaw;
    const heading = posture?.current === 'PRONE' || posture?.current === 'SUPINE' ? interpolatedYaw ?? bodyYaw : bodyYaw;
    const fresh = this.id !== id || this.life !== life;
    if (fresh) {
      this.animation.reset();
      this.imported?.reset();
      this.heading = heading;
    } else if (hp > 0 && hp < this.hp) {
      this.animation.hit();
      this.imported?.hit();
    }
    this.id = id;
    this.life = life;
    this.hp = hp;
    this.root.visible = true;
    this.root.position.set(x, y, z);
    const rotation = hp > 0 ? wrapAngle(heading - this.heading) * (1 - Math.exp(-dt * (local ? 18 : 15))) : 0;
    this.heading += rotation;
    this.root.rotation.y = -this.heading;

    const dx = fresh || Math.abs(x - this.lastX) > 1.5 ? 0 : (x - this.lastX) / Math.max(1e-4, dt);
    const dz = fresh || Math.abs(z - this.lastZ) > 1.5 ? 0 : (z - this.lastZ) / Math.max(1e-4, dt);
    this.lastX = x;
    this.lastZ = z;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const gearTick = gear?.action === 'grenade' || gear?.action === 'melee' ? actionTick : tick;
    const action = hp > 0 && gear && gearTick >= gear.started && gearTick < gear.until ? gear.action : undefined;
    const progress = gear && action ? T.MathUtils.clamp((gearTick - gear.started) / Math.max(1, gear.until - gear.started), 0, 1) : 0;
    const switching = action === 'primary' || action === 'secondary';
    const slot = switching && progress >= .5 ? action : gear?.slot ?? 'primary';
    this.holstered.visible = this.weapon.root.visible = slot === 'primary';
    this.sidearm.root.visible = slot === 'secondary';
    this.expireShots(now);
    while (this.pendingShots.length && (this.pendingShots[0].cue.tick ?? tick) <= tick) {
      const { cue, present } = this.pendingShots[0];
      const sameLife = cue.shooter === id && (cue.life === undefined || cue.life === life);
      const sameWeapon = cue.slot === undefined || cue.slot === slot;
      const canPose = sameWeapon && (!posture || allowsPostureAction(posture, 'fire'));
      // The locally interpolated pose can still be between postures when prediction permits a shot.
      if (cue.tick === undefined && sameLife && hp > 0 && !canPose) break;
      this.pendingShots.shift();
      if (sameLife && hp > 0 && canPose && tick - (cue.tick ?? tick) <= 6) {
        this.recoil();
        if (present) this.posedShots.push(present);
      } else present?.(undefined, now);
    }
    const handling = Math.sin(Math.PI * progress);
    this.animation.inject = action === 'stim' ? handling : 0;
    this.animation.throwing = action === 'grenade' ? handling : 0;
    this.animation.holdingGrenade = action === 'grenade' && !!gear &&
      gearTick < (gear.actionAt ?? gear.started + Math.ceil(FRAG.releaseSeconds * NET.tickHz));
    // Melee: short wind-up, thrust peaking on the server impact tick, recovery. Fallback until a clip exists.
    const melee = BASE_LOADOUT.melee;
    const impact = action === 'melee' && gear?.actionAt !== undefined
      ? (gear.actionAt - gear.started) / Math.max(1, gear.until - gear.started) : melee.windupTicks / melee.actionTicks;
    this.animation.melee = action !== 'melee' ? 0 : progress < impact
      ? -.35 * T.MathUtils.smoothstep(progress, 0, impact) : (1 - T.MathUtils.smoothstep(progress, impact, 1)) ** 1.4;
    this.animation.lower = switching ? handling : .7 * Math.max(this.animation.inject, this.animation.throwing);
    this.animation.gearAction = action;
    this.animation.actionProgress = progress;
    this.animation.weaponSlot = slot;
    const reloadEnd = (!reload || tick >= reload.started) && (!posture || allowsPostureAction(posture, 'reload')) ? reloadUntil : 0;
    this.animation.update(dt, dx * sin - dz * cos, dx * cos + dz * sin, sprint, aim && !action, hp > 0,
      reloadEnd, tick, rotation / Math.max(.001, dt), WEAPONS[slot].reloadSeconds, reload?.started);
    this.animation.tactical.update(hp > 0 ? posture : undefined, tick, dt, this.animation, fresh);
    const tactical = hp > 0 && posture && (posture.current === 'PRONE' || posture.current === 'SUPINE' ||
      posture.current === 'CROUCHING' || posture.current === 'SLIDING');
    if (this.animation.aim > .001 || tactical) {
      const aimYaw = tactical ? tacticalAimYaw(posture, yaw) : yaw;
      const shape = tactical ? postureCollider(posture, tick) : undefined;
      aimRay(this.ray, this.root.position, aimYaw, tactical ? tacticalAimPitch(posture, pitch) : pitch, shape?.lookHeight, y, !!world?.terrain);
      const { x: ox, y: oy, z: oz, dx: vx, dy: vy, dz: vz } = this.ray;
      if (shape && posture) {
        tacticalMuzzle(this.muzzleWorld, this.root.position, posture, aimYaw, shape);
        const distance = Math.min(22, terrainIntersection(world, ox, oy, oz, vx, vy, vz, CAMERA_BACK, 22));
        this.target.set(ox + vx * distance, oy + vy * distance, oz + vz * distance);
        // A steep bank can occlude the shoulder ray before it reaches the barrel. Keep the rig facing downrange.
        if ((this.target.x - this.muzzleWorld.x) * vx + (this.target.z - this.muzzleWorld.z) * vz <= 1e-7) {
          this.target.set(this.muzzleWorld.x + vx * 22, this.muzzleWorld.y + vy * 22, this.muzzleWorld.z + vz * 22);
        }
      } else {
        const distance = vy < 0 ? Math.min(22, (y - oy) / vy) : 22;
        this.target.set(ox + vx * distance, oy + vy * distance, oz + vz * distance);
      }
    }

    const { clip, fallback } = this.animation.tactical;
    const imported = this.imported && (hp <= 0 && !fresh ? this.importedStage.visible : !clip || this.imported.tacticalClip(clip, fallback));
    const mount = imported ? this.importedMount! : this.rig.torso;
    if (this.weapon.root.parent !== mount) mount.add(this.weapon.root, this.sidearm.root);
    if (Boolean(imported) !== this.importedStage.visible) {
      this.imported!.reset();
      this.mountEquipment(Boolean(imported));
    }
    this.rig.root.visible = !imported;
    this.importedStage.visible = Boolean(imported);
    if (imported) {
      const ground = posture && (posture.current === 'PRONE' || posture.current === 'SUPINE' || posture.current === 'DIVING' || posture.current === 'GETTING_UP');
      const look = this.lookInput;
      look.pitch = pitch;
      look.yaw = wrapAngle(yaw - this.heading);
      // Ground postures aim through their own clips and the tactical muzzle; sprint keeps the head mostly forward.
      look.look = hp > 0 && !ground ? 1 - .7 * this.animation.sprint : 0;
      look.ground = y;
      this.poseImported(dt);
    }
    else this.rig.pose(this.animation, this.activeWeapon, this.target, pitch, now, tactical ? this.muzzleWorld : undefined);
    this.sidearm.update(dt);
    for (const present of this.posedShots) present(this.activeWeapon, now);
    this.posedShots.length = 0;
  }

  /** Which GLB clips this character has and which ones fall back (undefined without a GLB). */
  get clipCoverage() { return this.imported?.coverage; }
  get playback() {
    const { tactical, reaction, locomotion } = this.animation;
    if (this.imported && this.importedStage.visible) return {
      clip: this.imported.baseClip ?? locomotion, time: this.imported.baseTime, normalized: false,
      overlay: this.imported.overlayClip, weight: this.imported.overlayWeight,
    };
    return { clip: reaction === 'death' ? reaction : tactical.clip ?? locomotion, time: tactical.progress ?? this.animation.phase / (Math.PI * 2),
      normalized: true, overlay: tactical.overlay, weight: undefined };
  }

  private get activeWeapon() { return this.sidearm.root.visible ? this.sidearm : this.weapon; }

  private poseImported(dt: number): void {
    const clips = this.imported!;
    clips.update(this.animation, dt);
    this.importedOverlay?.apply({ ...this.lookInput, kick: this.animation.kick });
    const fall = clips.hasDeath ? 0 : T.MathUtils.smoothstep(this.animation.fall, 0, 1);
    this.importedStage.rotation.z = -fall * 1.46;
    this.importedStage.position.y = fall * .24;
    const { aim, kick, reload, sprint } = this.animation;
    const gun = this.activeWeapon.root;
    // A reload or stim clip moves hands and weapon itself; the procedural dip only bridges missing clips.
    const overlay = clips.overlayClip && CLIP_REQUIREMENT.get(clips.overlayClip)?.group;
    const blend = clips.overlayWeight;
    const handling = T.MathUtils.smoothstep(reload, 0, .22) * (1 - T.MathUtils.smoothstep(reload, .8, 1)) * (overlay === 'reload' ? 1 - blend : 1);
    const lower = this.animation.lower * (overlay === 'stim' || overlay === 'switch' ? 1 - blend : 1);
    const strike = this.animation.melee;
    gun.position.set(0, -handling * .06 - lower * .11 + Math.max(0, strike) * .05, kick * .043 - strike * .24);
    gun.rotation.set(-handling * .36 - lower * .84 - sprint * .22 + kick * .07 + strike * .5, 0, handling * .42 - strike * .2);
    if (aim > .001 && gun.parent) {
      gun.parent.worldToLocal(this.target);
      this.target.y -= this.activeWeapon.sockets.Muzzle.position.y;
      this.look.lookAt(gun.position, this.target, NEUTRAL);
      this.desired.setFromRotationMatrix(this.look);
      gun.quaternion.slerp(this.desired, aim * .85);
    }
    this.activeWeapon.reload(reload);
  }

  queueShot(cue: WeaponCue, now = 0, present?: PresentShot): void {
    const { shooter, tick } = cue;
    if (tick !== undefined) {
      const previous = this.lastQueuedShot;
      const head = previous?.shooter === shooter ? Math.max(previous.tick, tick) : tick;
      if (!this.shotCues.accept(tick, tick + ':' + shooter, head)) return;
      if (head > tick) {
        // A late hit still presents at the confirmed position after its weapon pose has passed.
        present?.(undefined, now);
        return;
      }
      this.lastQueuedShot = { shooter, tick };
    }
    if (this.pendingShots.length >= 24) this.pendingShots.shift()!.present?.(undefined, now);
    this.pendingShots.push({ cue, deadline: now + (tick === undefined ? 100 : 300), present });
  }

  expireShots(now: number): void {
    while (this.pendingShots.length && this.pendingShots[0].deadline <= now) {
      this.pendingShots.shift()!.present?.(undefined, now);
    }
  }

  clearShots(): void {
    this.pendingShots.length = this.posedShots.length = 0;
    this.lastQueuedShot = undefined;
    this.shotCues.clear();
  }

  private recoil(): void {
    this.animation.fire();
    this.imported?.fire();
    if (this.sidearm.root.visible) {
      this.animation.kick *= WEAPONS.secondary.recoil.visualKick;
      this.sidearm.cycle();
    }
  }

  clear(): void {
    this.id = '';
    this.clearShots();
    this.root.visible = false;
    this.imported?.reset();
  }

  dispose(): void {
    this.weapon.detachModel();
    this.imported?.dispose();
    this.importedOverlay = undefined;
    this.rig.dispose();
    this.root.removeFromParent();
  }
}

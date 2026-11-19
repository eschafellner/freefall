import { BASE_LOADOUT, FRAG, NET, WEAPONS, aimRay, postureCollider, postureYaw, tacticalAimPitch, tacticalAimYaw, tacticalMuzzle, wrapAngle } from '@freefall/shared';
import * as T from 'three';
import { EQUIPMENT_SLOTS } from '../AssetRegistry.ts';
import type { EquipmentSlot, SoldierAsset } from '../AssetRegistry.ts';
import type { createKestrel } from '../weapons/Kestrel.ts';
import { WeaponVisualController } from '../weapons/WeaponVisualController.ts';
import { CharacterAnimation } from './CharacterAnimation.ts';
import { CharacterClipPlayer } from './CharacterClipPlayer.ts';
import { SoldierRig } from './SoldierRig.ts';
import type { createSoldierParts } from './SoldierRig.ts';

import type { EquipmentState, PostureState } from '@freefall/shared';

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
  private importedMount?: T.Object3D;
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

  constructor(parts: ReturnType<typeof createSoldierParts>, rifle: ReturnType<typeof createKestrel>, team: number, operator = true) {
    this.weapon = new WeaponVisualController(rifle);
    this.rig = new SoldierRig(parts, team, this.weapon, operator);
    this.sidearm = new WeaponVisualController(rifle.pistol, true);
    this.sidearm.root.visible = false;
    this.holstered = new T.Mesh(rifle.pistol.body, rifle.finish);
    this.holstered.rotation.set(-1.38, 0, .10);
    if (operator) this.rig.torso.add(this.sidearm.root);
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
    this.importedMount = mount;
    this.importedStage.add(model);
    this.rig.root.visible = false;
    mount.add(this.weapon.root, this.sidearm.root);
    this.weapon.root.position.set(0, 0, 0);
    this.weapon.root.quaternion.identity();
    for (const name of EQUIPMENT_SLOTS) {
      if (name === 'PrimaryWeapon') continue;
      const slot = this.slots[name];
      const anchor = model.getObjectByName(asset.equipmentNodes?.[name] ?? name);
      slot.removeFromParent();
      if (anchor) {
        anchor.add(slot);
        slot.position.set(0, 0, 0);
      }
    }
  }

  draw(id: string, life: number, hp: number, x: number, z: number, yaw: number, pitch: number,
    aim: boolean, sprint: boolean, reloadUntil: number, tick: number, now: number, dt: number, local: boolean, gear?: EquipmentState, posture?: PostureState, y = 0): void {
    const bodyYaw = posture ? postureYaw(posture, yaw) : yaw;
    const fresh = this.id !== id || this.life !== life;
    if (fresh) {
      this.animation.reset();
      this.imported?.reset();
      this.heading = bodyYaw;
    } else if (hp > 0 && hp < this.hp) {
      this.animation.hit();
      this.imported?.hit();
    }
    this.id = id;
    this.life = life;
    this.hp = hp;
    this.root.visible = true;
    this.root.position.set(x, y, z);
    const rotation = hp > 0 ? wrapAngle(bodyYaw - this.heading) * (1 - Math.exp(-dt * (local ? 18 : 15))) : 0;
    this.heading += rotation;
    this.root.rotation.y = -this.heading;

    const dx = fresh || Math.abs(x - this.lastX) > 1.5 ? 0 : (x - this.lastX) / Math.max(1e-4, dt);
    const dz = fresh || Math.abs(z - this.lastZ) > 1.5 ? 0 : (z - this.lastZ) / Math.max(1e-4, dt);
    this.lastX = x;
    this.lastZ = z;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const action = hp > 0 ? gear?.action : undefined;
    const progress = gear && action ? T.MathUtils.clamp((tick - gear.started) / Math.max(1, gear.until - gear.started), 0, 1) : 0;
    const switching = action === 'primary' || action === 'secondary';
    const slot = switching && progress >= .5 ? action : gear?.slot ?? 'primary';
    this.holstered.visible = this.weapon.root.visible = slot === 'primary';
    this.sidearm.root.visible = slot === 'secondary';
    const handling = Math.sin(Math.PI * progress);
    this.animation.inject = action === 'stim' ? handling : 0;
    this.animation.throwing = action === 'grenade' ? handling : 0;
    this.animation.holdingGrenade = action === 'grenade' && !!gear && tick < gear.started + Math.ceil(FRAG.releaseSeconds * NET.tickHz);
    // Melee: short wind-up, thrust peaking on the server impact tick, recovery. Fallback until a clip exists.
    const melee = BASE_LOADOUT.melee;
    const impact = melee.windupTicks / melee.actionTicks;
    this.animation.melee = action !== 'melee' ? 0 : progress < impact
      ? -.35 * T.MathUtils.smoothstep(progress, 0, impact) : (1 - T.MathUtils.smoothstep(progress, impact, 1)) ** 1.4;
    this.animation.lower = switching ? handling : .7 * Math.max(this.animation.inject, this.animation.throwing);
    this.animation.update(dt, dx * sin - dz * cos, dx * cos + dz * sin, sprint, aim && !action, hp > 0, reloadUntil, tick, rotation / Math.max(.001, dt), WEAPONS[slot].reloadSeconds);
    this.animation.tactical.update(hp > 0 ? posture : undefined, tick, dt, this.animation);
    const tactical = posture && (posture.current === 'PRONE' || posture.current === 'SUPINE' || posture.current === 'CROUCHING');
    if (this.animation.aim > .001 || tactical) {
      const aimYaw = tactical ? tacticalAimYaw(posture, yaw) : yaw;
      const shape = tactical ? postureCollider(posture, tick) : undefined;
      aimRay(this.ray, this.root.position, aimYaw, tactical ? tacticalAimPitch(posture, pitch) : pitch, shape?.lookHeight, y);
      if (shape && posture) tacticalMuzzle(this.muzzleWorld, this.root.position, posture, aimYaw, shape);
      const { x: ox, y: oy, z: oz, dx: vx, dy: vy, dz: vz } = this.ray;
      const distance = vy < 0 ? Math.min(22, -oy / vy) : 22;
      this.target.set(ox + vx * distance, oy + vy * distance, oz + vz * distance);
    }

    const clip = this.animation.tactical.clip;
    const imported = this.imported && this.importedMount && (!clip || this.imported.tacticalClip(clip));
    const mount = imported ? this.importedMount! : this.rig.torso;
    if (this.weapon.root.parent !== mount) mount.add(this.weapon.root, this.sidearm.root);
    this.rig.root.visible = !imported;
    this.importedStage.visible = Boolean(imported);
    if (imported) this.poseImported(dt);
    else this.rig.pose(this.animation, this.activeWeapon, this.target, pitch, now, tactical ? this.muzzleWorld : undefined);
    this.sidearm.update(dt);
  }

  private get activeWeapon() { return this.sidearm.root.visible ? this.sidearm : this.weapon; }

  private poseImported(dt: number): void {
    const clips = this.imported!;
    clips.update(this.animation, dt);
    const fall = clips.hasDeath ? 0 : T.MathUtils.smoothstep(this.animation.fall, 0, 1);
    this.importedStage.rotation.z = -fall * 1.46;
    this.importedStage.position.y = fall * .24;
    const { aim, kick, reload, sprint } = this.animation;
    const gun = this.activeWeapon.root;
    const handling = T.MathUtils.smoothstep(reload, 0, .22) * (1 - T.MathUtils.smoothstep(reload, .8, 1));
    const strike = this.animation.melee;
    gun.position.set(0, -handling * .06 - this.animation.lower * .11 + Math.max(0, strike) * .05, kick * .043 - strike * .24);
    gun.rotation.set(-handling * .36 - this.animation.lower * .84 - sprint * .22 + kick * .07 + strike * .5, 0, handling * .42 - strike * .2);
    if (aim > .001 && gun.parent) {
      gun.parent.worldToLocal(this.target);
      this.target.y -= this.activeWeapon.sockets.Muzzle.position.y;
      this.look.lookAt(gun.position, this.target, NEUTRAL);
      this.desired.setFromRotationMatrix(this.look);
      gun.quaternion.slerp(this.desired, aim * .85);
    }
    this.activeWeapon.reload(reload);
  }

  shot(id: string, target: T.Vector3): T.Vector3 | undefined {
    if (!this.root.visible || this.id !== id || this.hp <= 0) return;
    this.animation.fire();
    this.imported?.fire();
    if (this.sidearm.root.visible) {
      this.animation.kick *= WEAPONS.secondary.recoil.visualKick;
      this.sidearm.cycle();
    }
    return this.activeWeapon.muzzle(target);
  }

  clear(): void {
    this.id = '';
    this.root.visible = false;
    this.imported?.reset();
  }

  dispose(): void {
    this.weapon.detachModel();
    this.imported?.dispose();
    this.rig.dispose();
    this.root.removeFromParent();
  }
}

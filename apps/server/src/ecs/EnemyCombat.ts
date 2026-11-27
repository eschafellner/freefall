import {
  ATTACK_CHARGE, ATTACK_LEAP, ATTACK_MELEE, BASE_LOADOUT, ENEMY_TRAITS, MAX_ENEMIES, MAX_PLAYERS, NET, attackDuration, attackStrikeAt, clearWorldLine,
  groundHeight, groundedAttackContact, isGroundPosture, leapElevation, moveOnGround, postureAttackContact, postureCollider, postureYaw,
} from '@freefall/shared';
import type {
  AttackArc, AttackContact, AttackKind, EnemyAttackTiming, EnemyGameplay, EnemyTraits, MissionBalance, PostureCollider, WorldDefinition,
} from '@freefall/shared';
import type { EnemyFlanking } from './EnemyFlanking.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { damagePlayer } from '../systems/combat.ts';
import type { CombatContext, MeleeObject, SecondaryTarget } from '../systems/combat.ts';
import { protectionOf, resolveDamage } from '../systems/damage.ts';
import { currentOperator, validOperator } from '../systems/enemyTargeting.ts';
import type { EnemyApproach } from './EnemyApproach.ts';
import type { EnemyNavigation } from './EnemyNavigation.ts';
import type { HordeManager } from './HordeManager.ts';
import type { StaggerComponent } from './StaggerComponent.ts';

type AttackTarget = SimPlayer | MeleeObject;
type Contact = AttackContact | 'range';
type Outcome = Contact | 'pending' | 'stagger' | 'target-lost' | 'no-damage';

interface Attack {
  readonly owner: number;
  readonly start: number;
  readonly kind: AttackKind;
  readonly timing: EnemyAttackTiming;
  readonly target: AttackTarget;
  /** Leap path: take-off and landing point. */
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly life: number;
  readonly player?: SimPlayer;
  /** Charge: current heading (radians) and everyone already trampled by this charge. */
  heading: number;
  trampled?: Set<AttackTarget>;
  reservation: number;
  seenAt: number;
  resolved: boolean;
  result: Outcome;
  damage: number;
}

export class EnemyCombat {
  readonly timing: MissionBalance['meleeAttack'];
  private readonly approach: EnemyApproach;
  private readonly navigation: EnemyNavigation;
  private readonly stagger: StaggerComponent;
  private readonly attacks = new Map<number, Attack>();
  private readonly shapes: (PostureCollider | undefined)[] = Array(MAX_PLAYERS);
  private readonly arc: AttackArc = { x: 0, z: 0, cos: 1, sin: 0 };
  /** Per wire type: body, armor and attack traits. */
  private readonly traits: readonly EnemyTraits[];
  /** Leap or charge cooldown per slot, valid while `leapOwner` holds the enemy id. */
  private readonly leapReady = new Uint32Array(MAX_ENEMIES);
  private readonly leapOwner = new Uint32Array(MAX_ENEMIES);
  /** Optional flanking state: flankers leap only once committed. */
  flanking?: EnemyFlanking;
  readonly totals = { decisions: 0, validations: 0, starts: 0, hits: 0, operatorStarts: 0, operatorHits: 0, operatorDamage: 0,
    interruptions: 0, leaps: 0, charges: 0, trampled: 0 };
  windingUp = 0;
  active = 0;
  recovering = 0;
  validationMs = 0;

  constructor(timing: MissionBalance['meleeAttack'], approach: EnemyApproach, navigation: EnemyNavigation, stagger: StaggerComponent,
    traits: readonly EnemyTraits[] = ENEMY_TRAITS) {
    this.timing = timing;
    this.approach = approach;
    this.navigation = navigation;
    this.stagger = stagger;
    this.traits = traits;
  }

  private traitsOf(type: number): EnemyTraits { return this.traits[type] ?? this.traits[0]; }

  /** End of the strike window, relative to the attack start. */
  private activeEnd(attack: Attack): number { return attackStrikeAt(attack.timing) + attack.timing.activeTicks; }

  /** Replicated attack kind of a slot (only meaningful while `snapshotStart` is defined). */
  snapshotKind(horde: HordeManager, slot: number): AttackKind { return this.get(horde, slot)?.kind ?? ATTACK_MELEE; }

  /** Height above the ground of a leaping enemy; 0 for everything on the ground. */
  elevation(horde: HordeManager, slot: number, tick: number): number {
    const attack = this.get(horde, slot);
    if (attack?.kind !== ATTACK_LEAP || attack.result === 'stagger' || attack.result === 'target-lost') return 0;
    const leap = this.traitsOf(horde.type[slot]).leap;
    return leap ? leapElevation(leap, tick - attack.start) : 0;
  }

  get(horde: HordeManager, slot: number): Attack | undefined {
    const attack = this.attacks.get(slot);
    return attack?.owner === horde.id[slot] && horde.hp[slot] > 0 ? attack : undefined;
  }

  holding(horde: HordeManager, slot: number, tick: number): boolean {
    return this.snapshotStart(horde, slot, tick) !== undefined;
  }

  get snapshotCapacity(): number { return this.attacks.size; }

  snapshotStart(horde: HordeManager, slot: number, tick: number): number | undefined {
    const attack = this.get(horde, slot);
    return attack && tick < attack.start + attackDuration(attack.timing) && attack.result !== 'stagger' && attack.result !== 'target-lost'
      ? attack.start : undefined;
  }

  sample(horde: HordeManager, slot: number, tick: number, enemy: EnemyGameplay) {
    const attack = this.get(horde, slot);
    const age = attack ? tick - attack.start : 0;
    const timing = attack?.timing ?? this.traitsOf(horde.type[slot]).melee;
    const strike = attackStrikeAt(timing);
    const phase = !attack ? (this.navigation.repositionSector[slot] >= 0 ? 'REPOSITION' :
      this.navigation.attackSector[slot] >= 0 ? 'POSITION_FOR_ATTACK' : 'APPROACH') :
      attack.result === 'stagger' || attack.result === 'target-lost' ? 'INTERRUPTED' :
      age < timing.windupTicks ? 'WINDUP' : age < strike ? (attack.kind === ATTACK_CHARGE ? 'CHARGE' : 'LEAP')
      : age < strike + timing.activeTicks ? 'ACTIVE' : 'RECOVERY';
    const phaseEnd = phase === 'WINDUP' ? timing.windupTicks : phase === 'LEAP' || phase === 'CHARGE' ? strike : phase === 'ACTIVE'
      ? strike + timing.activeTicks : attackDuration(timing);
    return {
      type: attack?.kind === ATTACK_LEAP ? 'leap' : attack?.kind === ATTACK_CHARGE ? 'charge' : 'melee', phase, range: enemy.meleeRange, angle: 2 * timing.halfAngleDegrees,
      ...(attack && { id: this.eventId(attack), remainingTicks: Math.max(0, phaseEnd - age),
        result: attack.result, damage: attack.damage, reservation: attack.reservation >= 0 ? attack.reservation : undefined }),
    };
  }

  private eventId(attack: Attack): string { return `${attack.owner}:${attack.start}`; }

  private release(attack: Attack): void {
    this.approach.release(attack.reservation);
    attack.reservation = -1;
  }

  private remove(slot: number, attack: Attack): void {
    this.release(attack);
    this.attacks.delete(slot);
  }

  private interrupt(attack: Attack, reason: 'stagger' | 'target-lost'): void {
    attack.result = reason;
    this.release(attack);
    this.totals.interruptions++;
  }

  /** Dropping a connection cancels its pending impacts even if it resumes before the next simulation tick. */
  interruptOperator(player: SimPlayer, tick: number): void {
    for (const attack of this.attacks.values()) {
      if (attack.player === player && !attack.resolved && tick < attack.start + this.activeEnd(attack) &&
          attack.result !== 'target-lost' && attack.result !== 'stagger') this.interrupt(attack, 'target-lost');
    }
  }

  clear(): void {
    for (const attack of this.attacks.values()) this.release(attack);
    this.attacks.clear();
    this.windingUp = this.active = this.recovering = this.validationMs = 0;
  }

  /** Drop expired or replaced attacks before steering and after damage. */
  prune(horde: HordeManager, tick: number): void {
    for (const [slot, attack] of this.attacks) {
      if (attack.owner !== horde.id[slot] || horde.hp[slot] <= 0 || tick >= attack.start + attackDuration(attack.timing) ||
          attack.seenAt < tick - 1) this.remove(slot, attack);
    }
  }

  update(horde: HordeManager, players: readonly (SimPlayer | undefined)[], tick: number,
    enemies: readonly EnemyGameplay[], balance: MissionBalance['movement'], world?: WorldDefinition,
    secondary?: SecondaryTarget, context?: CombatContext, profile = false): void {
    this.prune(horde, tick);
    this.shapes.fill(undefined);
    this.windingUp = this.active = this.recovering = this.validationMs = 0;
    // Rotate first decision so dense-array order does not always win a contested sector.
    let index = horde.count ? ((Math.imul(tick, 31) >>> 0) % horde.count) : 0;
    for (let remaining = horde.count; remaining > 0; remaining--) {
      const slot = horde.active[index];
      if (++index === horde.count) index = 0;
      if (horde.hp[slot] <= 0) continue;
      const attack = this.attacks.get(slot);
      const player = players[horde.target[slot]];
      const staggered = tick < this.stagger.active(horde, slot);
      if (attack) {
        attack.seenAt = tick;
        const elapsed = tick - attack.start;
        if (elapsed >= this.activeEnd(attack) || attack.result === 'stagger' || attack.result === 'target-lost') {
          this.release(attack);
          if (!attack.resolved) {
            attack.resolved = true;
            if (attack.player) this.navigation.reconsiderAttackPosition(slot);
          }
          this.recovering++;
          continue;
        }
        const valid = attack.player
          ? !!currentOperator(players, attack.player, attack.life) && tick >= attack.player.protectedUntil
          : attack.target.hp > 0 && !validOperator(player) && secondary?.(slot) === attack.target;
        const airborne = attack.kind !== ATTACK_MELEE && elapsed >= attack.timing.windupTicks;
        // A leap in flight lands and a running charge runs out regardless of stagger or a lost target.
        if (!airborne && (staggered || (!valid && !attack.resolved))) {
          this.interrupt(attack, staggered ? 'stagger' : 'target-lost');
          this.recovering++;
          continue;
        }
        if (elapsed < attack.timing.windupTicks) {
          // A charging enemy keeps its horns on the target while it lowers its head.
          if (attack.kind === ATTACK_CHARGE) attack.heading = horde.yaw[slot] = Math.atan2(attack.target.x - horde.x[slot], -(attack.target.z - horde.z[slot]));
          this.windingUp++;
          continue;
        }
        if (elapsed < attackStrikeAt(attack.timing)) {
          if (attack.kind === ATTACK_CHARGE) this.run(horde, slot, attack, players, enemies[horde.type[slot]], tick, world, context);
          else this.fly(horde, slot, attack, elapsed, world);
          this.windingUp++;
          continue;
        }
        if (attack.kind === ATTACK_CHARGE) {
          // The charge resolved while running; the active phase is the skid and head toss.
          if (!attack.resolved) {
            attack.resolved = true;
            if (attack.result === 'pending') attack.result = 'range';
          }
          this.active++;
          continue;
        }
        if (!valid && !attack.resolved) {
          attack.resolved = true;
          attack.result = 'target-lost';
          this.release(attack);
          this.recovering++;
          continue;
        }
        this.active++;
        if (attack.resolved) continue;
        const enemy = enemies[horde.type[slot]];
        attack.result = this.validate(horde, slot, attack.target, attack.player, enemy, attack.timing, tick, balance, world, profile);
        if (attack.result !== 'hit') continue;
        // Consume the attack before invoking damage. Later ticks or repeat updates cannot apply it again.
        attack.resolved = true;
        const kind = attack.player ? 'operator' : 'id' in attack.target ? 'convict' : 'vehicle';
        const { amount } = resolveDamage(context?.policy ?? BASE_LOADOUT.damagePolicy,
          { source: 'melee', attacker: 'enemy', target: kind, base: enemy.meleeDamage,
            ...(attack.player && 'loadout' in attack.target && { protection: protectionOf(attack.target) }) });
        const hp = attack.target.hp;
        if ('damage' in attack.target) attack.target.damage(amount, tick);
        else damagePlayer(attack.target, amount, tick, context?.respawns ?? true, context);
        attack.damage = Math.max(0, hp - attack.target.hp);
        if (attack.damage > 0) {
          this.totals.hits++;
          if (attack.player) {
            this.totals.operatorHits++;
            this.totals.operatorDamage += attack.damage;
            context?.events?.push({ type: 'enemy-hit', tick, attack: this.eventId(attack),
              enemy: attack.owner, target: attack.player.id, life: attack.life, amount: attack.damage,
              direction: { x: horde.x[slot] - attack.player.x, z: horde.z[slot] - attack.player.z } });
          }
        } else attack.result = 'no-damage';
        continue;
      }

      const readyAt = horde.attackAt[slot];
      if (staggered || tick < readyAt || (tick !== readyAt && (tick + slot) % this.timing.decisionTicks !== 0)) continue;
      this.totals.decisions++;
      const operator = validOperator(player) ? player : undefined;
      const target = operator ?? secondary?.(slot);
      if (!target || target.hp <= 0 || (operator && tick < operator.protectedUntil)) continue;
      const enemy = enemies[horde.type[slot]];
      const traits = this.traitsOf(horde.type[slot]);
      if (traits.leap && this.tryLeap(horde, slot, target, operator, enemy, traits, tick, world)) continue;
      if (traits.charge && this.tryCharge(horde, slot, target, operator, enemy, traits, tick, world)) continue;
      const contact = this.validate(horde, slot, target, operator, enemy, traits.melee, tick, balance, world, profile);
      if (contact === 'angle') {
        this.navigation.face(horde, slot, target.x - horde.x[slot], target.z - horde.z[slot]);
      } else if (contact === 'cover' && operator) {
        this.navigation.reconsiderAttackPosition(slot);
      }
      if (contact !== 'hit') continue;
      const owner = horde.id[slot];
      const reservation = operator ? this.approach.reserve(operator, horde.x[slot], horde.z[slot], owner) : -1;
      if (operator && reservation < 0) continue;
      this.attacks.set(slot, { owner, start: tick, kind: ATTACK_MELEE, timing: traits.melee, target, player: operator,
        life: operator?.life ?? 0, fromX: horde.x[slot], fromZ: horde.z[slot], toX: horde.x[slot], toZ: horde.z[slot],
        heading: horde.yaw[slot], reservation, seenAt: tick, resolved: false, result: 'pending', damage: 0 });
      horde.vx[slot] = horde.vz[slot] = this.navigation.intentSpeed[slot] = 0;
      horde.attackAt[slot] = tick + Math.max(attackDuration(traits.melee), Math.ceil(enemy.meleeCooldown * NET.tickHz));
      this.totals.starts++;
      if (operator) this.totals.operatorStarts++;
      this.windingUp++;
    }

    for (const [slot, attack] of this.attacks) {
      if (attack.seenAt !== tick) this.remove(slot, attack);
    }
  }

  /**
   * Starts a leap when the target is inside the leap band, visible and the cooldown has passed. Flankers leap only once
   * committed. Vehicles are never leapt at.
   */
  private tryLeap(horde: HordeManager, slot: number, target: AttackTarget, operator: SimPlayer | undefined, enemy: EnemyGameplay,
    traits: EnemyTraits, tick: number, world: WorldDefinition | undefined): boolean {
    const leap = traits.leap!;
    if (!operator && !('id' in target)) return false;
    if (this.leapOwner[slot] === horde.id[slot] && tick < this.leapReady[slot]) return false;
    if (traits.tactics === 'flank' && this.flanking && !this.flanking.committed(horde, slot)) return false;
    const x = horde.x[slot], z = horde.z[slot];
    const dx = target.x - x, dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance < leap.minRange || distance > leap.maxRange) return false;
    const y = groundHeight(world, x, z) + enemy.hitHeight;
    if (world && !clearWorldLine(world, x, y, z, dx, groundHeight(world, target.x, target.z) + enemy.hitHeight - y, dz)) return false;
    // Land just inside striking reach in front of the target.
    const travel = Math.max(0, distance - enemy.meleeRange * .55);
    const owner = horde.id[slot];
    this.attacks.set(slot, { owner, start: tick, kind: ATTACK_LEAP, timing: leap, target, player: operator,
      life: operator?.life ?? 0, fromX: x, fromZ: z, toX: x + dx / distance * travel, toZ: z + dz / distance * travel,
      heading: Math.atan2(dx, -dz), reservation: -1, seenAt: tick, resolved: false, result: 'pending', damage: 0 });
    horde.vx[slot] = horde.vz[slot] = this.navigation.intentSpeed[slot] = 0;
    horde.yaw[slot] = Math.atan2(dx, -dz);
    horde.attackAt[slot] = tick + Math.max(attackDuration(leap), Math.ceil(enemy.meleeCooldown * NET.tickHz));
    this.leapOwner[slot] = owner;
    this.leapReady[slot] = tick + Math.max(attackDuration(leap), leap.cooldownTicks);
    this.totals.starts++;
    this.totals.leaps++;
    if (operator) this.totals.operatorStarts++;
    this.windingUp++;
    return true;
  }

  /**
   * Starts a charge when the target (operator or convict, never a vehicle) stands inside the charge band in clear view
   * and the cooldown has passed. The enemy lowers its head (windup) and then runs; see `run`.
   */
  private tryCharge(horde: HordeManager, slot: number, target: AttackTarget, operator: SimPlayer | undefined, enemy: EnemyGameplay,
    traits: EnemyTraits, tick: number, world: WorldDefinition | undefined): boolean {
    const charge = traits.charge!;
    if (!operator && !('id' in target)) return false;
    if (this.leapOwner[slot] === horde.id[slot] && tick < this.leapReady[slot]) return false;
    const x = horde.x[slot], z = horde.z[slot];
    const dx = target.x - x, dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance < charge.minRange || distance > charge.maxRange) return false;
    // The body has to fit through: check the line at knee height and at the shoulders.
    if (world) {
      const ground = groundHeight(world, x, z), targetGround = groundHeight(world, target.x, target.z);
      for (const height of [.6, enemy.hitHeight]) {
        if (!clearWorldLine(world, x, ground + height, z, dx, targetGround - ground, dz)) return false;
      }
    }
    const owner = horde.id[slot];
    const heading = Math.atan2(dx, -dz);
    this.attacks.set(slot, { owner, start: tick, kind: ATTACK_CHARGE, timing: charge, target, player: operator,
      life: operator?.life ?? 0, fromX: x, fromZ: z, toX: x, toZ: z, heading, trampled: new Set(),
      reservation: -1, seenAt: tick, resolved: false, result: 'pending', damage: 0 });
    horde.vx[slot] = horde.vz[slot] = this.navigation.intentSpeed[slot] = 0;
    horde.yaw[slot] = heading;
    horde.attackAt[slot] = tick + Math.max(attackDuration(charge), Math.ceil(enemy.meleeCooldown * NET.tickHz));
    this.leapOwner[slot] = owner;
    this.leapReady[slot] = tick + Math.max(attackDuration(charge), charge.cooldownTicks);
    this.totals.starts++;
    this.totals.charges++;
    if (operator) this.totals.operatorStarts++;
    this.windingUp++;
    return true;
  }

  /**
   * One running tick of a charge: steer a little towards the target, advance at charge speed (obstacles stop it like any
   * ground movement) and trample every living operator, and the targeted convict, inside the band ahead of the body.
   * Each victim is hit once per charge.
   */
  private run(horde: HordeManager, slot: number, attack: Attack, players: readonly (SimPlayer | undefined)[], enemy: EnemyGameplay,
    tick: number, world: WorldDefinition | undefined, context: CombatContext | undefined): void {
    const charge = this.traitsOf(horde.type[slot]).charge!;
    if (attack.target.hp > 0) {
      const wanted = Math.atan2(attack.target.x - horde.x[slot], -(attack.target.z - horde.z[slot]));
      const turn = Math.atan2(Math.sin(wanted - attack.heading), Math.cos(wanted - attack.heading));
      attack.heading += Math.max(-charge.steer, Math.min(charge.steer, turn));
    }
    const fx = Math.sin(attack.heading), fz = -Math.cos(attack.heading);
    const x = horde.x[slot] + fx * charge.step, z = horde.z[slot] + fz * charge.step;
    if (world) {
      const position = { x: horde.x[slot], z: horde.z[slot] };
      moveOnGround(position, Math.fround(x), Math.fround(z), world, this.traitsOf(horde.type[slot]).groundRadius);
      horde.x[slot] = position.x;
      horde.z[slot] = position.z;
    } else {
      horde.x[slot] = Math.fround(x);
      horde.z[slot] = Math.fround(z);
    }
    horde.vx[slot] = horde.vz[slot] = 0;
    horde.yaw[slot] = attack.heading;
    const trampled = attack.trampled ??= new Set();
    const contact = (target: { x: number; z: number }) => {
      const dx = target.x - horde.x[slot], dz = target.z - horde.z[slot];
      const ahead = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      return ahead > -charge.contactHalfWidth && ahead < charge.contactReach && across < charge.contactHalfWidth;
    };
    const base = enemy.meleeDamage * charge.damageMultiplier;
    const policy = context?.policy ?? BASE_LOADOUT.damagePolicy;
    for (const player of players) {
      if (!player || trampled.has(player) || !validOperator(player) || tick < player.protectedUntil || !contact(player)) continue;
      trampled.add(player);
      const { amount } = resolveDamage(policy, { source: 'melee', attacker: 'enemy', target: 'operator', base, protection: protectionOf(player) });
      const hp = player.hp;
      damagePlayer(player, amount, tick, context?.respawns ?? true, context);
      const dealt = Math.max(0, hp - player.hp);
      if (!dealt) continue;
      this.totals.hits++;
      this.totals.trampled++;
      this.totals.operatorHits++;
      this.totals.operatorDamage += dealt;
      if (player === attack.player) {
        attack.resolved = true;
        attack.result = 'hit';
        attack.damage = dealt;
      }
      context?.events?.push({ type: 'enemy-hit', tick, attack: this.eventId(attack), enemy: attack.owner, target: player.id,
        life: player.life, amount: dealt, direction: { x: horde.x[slot] - player.x, z: horde.z[slot] - player.z } });
    }
    // Without an operator target the charge was aimed at a convict (vehicles are never charged).
    const convict = attack.target as MeleeObject;
    if (!attack.player && convict.hp > 0 && !trampled.has(convict) && contact(convict)) {
      trampled.add(convict);
      const { amount } = resolveDamage(policy, { source: 'melee', attacker: 'enemy', target: 'convict', base });
      const hp = convict.hp;
      convict.damage(amount, tick);
      attack.damage = Math.max(0, hp - convict.hp);
      attack.resolved = true;
      attack.result = attack.damage > 0 ? 'hit' : 'no-damage';
      if (attack.damage > 0) {
        this.totals.hits++;
        this.totals.trampled++;
      }
    }
  }

  /** Moves a leaping enemy along its path; obstacles stop it like any ground movement. */
  private fly(horde: HordeManager, slot: number, attack: Attack, elapsed: number, world: WorldDefinition | undefined): void {
    const t = Math.min(1, (elapsed - attack.timing.windupTicks + 1) / attack.timing.flightTicks);
    const x = attack.fromX + (attack.toX - attack.fromX) * t, z = attack.fromZ + (attack.toZ - attack.fromZ) * t;
    if (world) {
      const position = { x: horde.x[slot], z: horde.z[slot] };
      moveOnGround(position, Math.fround(x), Math.fround(z), world, this.traitsOf(horde.type[slot]).groundRadius);
      horde.x[slot] = position.x;
      horde.z[slot] = position.z;
    } else {
      horde.x[slot] = Math.fround(x);
      horde.z[slot] = Math.fround(z);
    }
    horde.vx[slot] = horde.vz[slot] = 0;
  }

  private validate(horde: HordeManager, slot: number, target: AttackTarget, player: SimPlayer | undefined, enemy: EnemyGameplay,
    timing: EnemyAttackTiming, tick: number, balance: MissionBalance['movement'], world: WorldDefinition | undefined, profile: boolean): Contact {
    const x = horde.x[slot], z = horde.z[slot], reach = enemy.meleeRange;
    const dx = target.x - x, dz = target.z - z;
    const distanceSquared = dx * dx + dz * dz;
    const posture = player?.posture.current;
    let shape: PostureCollider | undefined;
    let cap = reach;
    if (player && posture !== 'STANDING') {
      shape = this.shapes[player.slot] ??= postureCollider(player.posture, tick, balance);
      // The square root is unnecessary for the reject-only bound.
      cap += shape.radius + shape.halfLength;
    }
    if (!(distanceSquared <= cap * cap)) return 'range';
    this.totals.validations++;
    const before = profile ? performance.now() : 0;
    const arc = this.arc;
    const angle = timing.halfAngleDegrees * Math.PI / 180;
    arc.cos = Math.cos(angle);
    arc.sin = Math.sin(angle);
    arc.x = Math.sin(horde.yaw[slot]);
    arc.z = -Math.cos(horde.yaw[slot]);
    let contact: AttackContact;
    const hitY = groundHeight(world, x, z) + enemy.hitHeight;
    if (player) {
      shape ??= balance.colliders.STANDING;
      const facing = postureYaw(player.posture, player.yaw);
      contact = isGroundPosture(player.posture.current)
        ? groundedAttackContact(player, shape, facing, posture === 'SUPINE', x, hitY, z, reach, balance.enemyAttackHalfHeight, arc, world)
        : postureAttackContact(player, shape, facing, x, hitY, z, reach, balance.enemyAttackHalfHeight, arc, world);
    } else if (dx * arc.x + dz * arc.z < Math.sqrt(distanceSquared) * arc.cos) {
      contact = 'angle';
    } else {
      const targetY = groundHeight(world, target.x, target.z) + enemy.hitHeight;
      contact = world && !clearWorldLine(world, x, hitY, z, dx, targetY - hitY, dz) ? 'cover' : 'hit';
    }
    if (profile) this.validationMs += performance.now() - before;
    return contact;
  }
}

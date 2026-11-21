import {
  BASE_LOADOUT, MAX_PLAYERS, NET, clearWorldLine, groundHeight, groundedAttackContact, isGroundPosture, postureAttackContact,
  postureCollider, postureYaw,
} from '@freefall/shared';
import type { AttackArc, AttackContact, EnemyGameplay, MissionBalance, PostureCollider, WorldDefinition } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';
import { damagePlayer } from '../systems/combat.ts';
import type { CombatContext, MeleeObject, SecondaryTarget } from '../systems/combat.ts';
import { resolveDamage } from '../systems/damage.ts';
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
  readonly target: AttackTarget;
  readonly life: number;
  readonly player?: SimPlayer;
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
  private readonly arc: AttackArc;
  private readonly activeEnd: number;
  private readonly duration: number;
  readonly totals = { decisions: 0, validations: 0, starts: 0, hits: 0, operatorStarts: 0, operatorHits: 0, operatorDamage: 0,
    interruptions: 0 };
  windingUp = 0;
  active = 0;
  recovering = 0;
  validationMs = 0;

  constructor(timing: MissionBalance['meleeAttack'], approach: EnemyApproach, navigation: EnemyNavigation, stagger: StaggerComponent) {
    this.timing = timing;
    this.approach = approach;
    this.navigation = navigation;
    this.stagger = stagger;
    const angle = timing.halfAngleDegrees * Math.PI / 180;
    this.arc = { x: 0, z: 0, cos: Math.cos(angle), sin: Math.sin(angle) };
    this.activeEnd = timing.windupTicks + timing.activeTicks;
    this.duration = this.activeEnd + timing.recoveryTicks;
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
    return attack && tick < attack.start + this.duration && attack.result !== 'stagger' && attack.result !== 'target-lost'
      ? attack.start : undefined;
  }

  sample(horde: HordeManager, slot: number, tick: number, enemy: EnemyGameplay) {
    const attack = this.get(horde, slot);
    const age = attack ? tick - attack.start : 0;
    const phase = !attack ? (this.navigation.repositionSector[slot] >= 0 ? 'REPOSITION' :
      this.navigation.attackSector[slot] >= 0 ? 'POSITION_FOR_ATTACK' : 'APPROACH') :
      attack.result === 'stagger' || attack.result === 'target-lost' ? 'INTERRUPTED' :
      age < this.timing.windupTicks ? 'WINDUP' : age < this.activeEnd ? 'ACTIVE' : 'RECOVERY';
    const phaseEnd = phase === 'WINDUP' ? this.timing.windupTicks : phase === 'ACTIVE' ? this.activeEnd : this.duration;
    return {
      type: 'melee', phase, range: enemy.meleeRange, angle: 2 * this.timing.halfAngleDegrees,
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
      if (attack.player === player && !attack.resolved && tick < attack.start + this.activeEnd &&
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
      if (attack.owner !== horde.id[slot] || horde.hp[slot] <= 0 || tick >= attack.start + this.duration ||
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
        if (elapsed >= this.activeEnd || attack.result === 'stagger' || attack.result === 'target-lost') {
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
        if (staggered || (!valid && !attack.resolved)) {
          this.interrupt(attack, staggered ? 'stagger' : 'target-lost');
          this.recovering++;
          continue;
        }
        if (elapsed < this.timing.windupTicks) {
          this.windingUp++;
          continue;
        }
        this.active++;
        if (attack.resolved) continue;
        const enemy = enemies[horde.type[slot]];
        attack.result = this.validate(horde, slot, attack.target, attack.player, enemy, tick, balance, world, profile);
        if (attack.result !== 'hit') continue;
        // Consume the attack before invoking damage. Later ticks or repeat updates cannot apply it again.
        attack.resolved = true;
        const kind = attack.player ? 'operator' : 'id' in attack.target ? 'convict' : 'vehicle';
        const { amount } = resolveDamage(context?.policy ?? BASE_LOADOUT.damagePolicy,
          { source: 'melee', attacker: 'enemy', target: kind, base: enemy.meleeDamage });
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
      const contact = this.validate(horde, slot, target, operator, enemy, tick, balance, world, profile);
      if (contact === 'angle') {
        this.navigation.face(horde, slot, target.x - horde.x[slot], target.z - horde.z[slot]);
      } else if (contact === 'cover' && operator) {
        this.navigation.reconsiderAttackPosition(slot);
      }
      if (contact !== 'hit') continue;
      const owner = horde.id[slot];
      const reservation = operator ? this.approach.reserve(operator, horde.x[slot], horde.z[slot], owner) : -1;
      if (operator && reservation < 0) continue;
      this.attacks.set(slot, { owner, start: tick, target, player: operator, life: operator?.life ?? 0,
        reservation, seenAt: tick, resolved: false, result: 'pending', damage: 0 });
      horde.vx[slot] = horde.vz[slot] = this.navigation.intentSpeed[slot] = 0;
      horde.attackAt[slot] = tick + Math.max(this.duration, Math.ceil(enemy.meleeCooldown * NET.tickHz));
      this.totals.starts++;
      if (operator) this.totals.operatorStarts++;
      this.windingUp++;
    }

    for (const [slot, attack] of this.attacks) {
      if (attack.seenAt !== tick) this.remove(slot, attack);
    }
  }

  private validate(horde: HordeManager, slot: number, target: AttackTarget, player: SimPlayer | undefined, enemy: EnemyGameplay,
    tick: number, balance: MissionBalance['movement'], world: WorldDefinition | undefined, profile: boolean): Contact {
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

import {
  BALANCE, BASE_LOADOUT, advancePosture, applyPostureInput, constrainTether, copyPosture, diveEnvelope, freshStamina,
  groundHeight, isGroundPosture, lerpAngle, newPosture, postureCollider, postureSweep, sampleDive, staminaFromSnapshot,
} from '@freefall/shared';
import type { EffectiveLoadout, EffectiveMobility, PlayerInput, PlayerState, PositionXZ, PostureState, StaminaState, WorldDefinition } from '@freefall/shared';

/** Corrections above this distance are shown at once instead of being blended (teleport-sized). */
const SNAP_DISTANCE = 2;
/** Visual correction blend rate (1/s). About 55 ms time constant: hides one-step corrections, not desyncs. */
const CORRECTION_RATE = 18;

/**
 * Client-side prediction of the local operator.
 *
 * A step sampled at a 30 Hz boundary moves the operator over the following 33 ms; the server applies the
 * same input over the same interval. `position` is the simulated (collision) position at the end of the
 * newest predicted step and is what interaction checks use. `rendered` is purely visual: it follows that
 * committed trajectory at frame time by interpolating from the previous step by the accumulator fraction,
 * plus a decaying offset that hides small reconciliation corrections. It never runs ahead of committed
 * input, so stops and reversals do not overshoot. The server stays authoritative; nothing visual feeds back
 * into simulation or hits.
 */
export class Prediction {
  readonly position = { x: 0, y: 0, z: 5 };
  readonly rendered = { x: 0, y: 0, z: 5 };
  world?: WorldDefinition;
  tether?: PositionXZ & { radius: number };
  frozen = false;
  balance = BALANCE.movement;
  /** Speeds, dive, slide and stamina of the own armor; set from the confirmed loadout. */
  mobility: EffectiveMobility = BASE_LOADOUT.mobility;
  slide = BASE_LOADOUT.slide;
  /** Predicted stamina, re-based on every snapshot like the position. */
  stamina: StaminaState = freshStamina(BASE_LOADOUT.mobility.stamina);
  posture = newPosture();
  visualPosture: PostureState = this.posture;
  visualTick = 0;
  private previousPosture = this.posture;
  private tick = 0;
  private readonly correctionOrigin = { x: 0, y: 0, z: 0 };

  /** Reconciliation telemetry. Counted for every server confirmation that moved the prediction. */
  readonly stats = { corrections: 0, lastCorrection: 0, maxCorrection: 0, snaps: 0 };

  private readonly previous = { x: 0, y: 0, z: 5 };
  private readonly pending: PlayerInput[] = [];
  private life = 0;
  private alive = false;
  private ready = false;
  private errorX = 0;
  private errorZ = 0;

  private move(input: PlayerInput): void {
    if (this.frozen) return;
    this.tick++;
    advancePosture(this.position, this.posture, this.tick, this.balance, this.world, this.tether);
    // Like the server: an input of an earlier life is acknowledged but does not move the operator.
    if (input.life !== undefined && input.life !== this.life) return;
    applyPostureInput(this.position, this.posture, input, this.tick, this.balance, this.world, this.tether,
      this.mobility, this.slide, this.mobility, this.stamina);
  }

  /** Armor of the own loadout: speeds, dive, slide and stamina rules. */
  setLoadout(loadout: Pick<EffectiveLoadout, 'mobility' | 'slide'>): void {
    this.mobility = loadout.mobility;
    this.slide = loadout.slide;
    if (this.stamina.value > loadout.mobility.stamina.max) this.stamina.value = loadout.mobility.stamina.max;
  }

  /** Predicted inputs the server has not acknowledged yet (network round trip plus server input buffer). */
  get unacknowledged(): number { return this.pending.length; }

  /** Current visual offset from the interpolated prediction in meters. */
  get error(): number { return Math.hypot(this.errorX, this.errorZ); }

  awaitSnapshot(): void {
    this.pending.length = 0;
    this.ready = false;
  }

  confirm(player: PlayerState, serverTick = this.tick): void {
    const snap = !this.ready || this.life !== player.life || this.alive !== (player.hp > 0);
    const x = this.position.x;
    const z = this.position.z;
    const y = this.position.y;
    const predicted = this.posture.current;
    this.ready = true;
    this.life = player.life;
    this.alive = player.hp > 0;
    this.position.x = player.x;
    this.position.z = player.z;
    this.position.y = player.y ?? 0;
    this.tick = serverTick;
    this.posture = player.posture ? copyPosture(player.posture) : newPosture(player.bodyYaw ?? player.yaw);
    this.stamina = staminaFromSnapshot(player.stamina, this.mobility.stamina);
    while (this.pending[0] && this.pending[0].seq <= player.ack) this.pending.shift();
    if (snap) this.pending.length = 0;
    if (this.alive) for (const input of this.pending) this.move(input);
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const dy = y - this.position.y;
    const size = Math.hypot(dx, dy, dz);
    if (snap || predicted !== this.posture.current) this.previousPosture = copyPosture(this.posture);
    if (snap || size > SNAP_DISTANCE) {
      // Discontinuity: new life, death, first state or a real desync. Show the authoritative state.
      this.errorX = this.errorZ = 0;
      this.previous.x = this.position.x;
      this.previous.z = this.position.z;
      this.previous.y = this.position.y;
      if (!snap) this.stats.snaps++;
      return;
    }
    if (size > 1e-6) {
      this.stats.corrections++;
      this.stats.lastCorrection = size;
      this.stats.maxCorrection = Math.max(this.stats.maxCorrection, size);
    }
    // Shift the interpolation segment with the correction and keep the visible position continuous.
    this.previous.x -= dx;
    this.previous.z -= dz;
    this.previous.y -= dy;
    this.errorX += dx;
    this.errorZ += dz;
  }

  step(input: PlayerInput): void {
    this.pending.push(input);
    if (this.pending.length > 24) this.pending.shift();
    this.previous.x = this.position.x;
    this.previous.z = this.position.z;
    this.previous.y = this.position.y;
    this.previousPosture = this.posture.current === 'STANDING' && !input.posture ? this.posture : copyPosture(this.posture);
    if (this.ready && this.alive) this.move(input);
  }

  /**
   * @param dt frame time in seconds, for the correction blend.
   * @param alpha fraction of the running fixed step already elapsed, 0..1.
   */
  sample(dt: number, alpha = 1): void {
    const smooth = Math.exp(-dt * CORRECTION_RATE);
    this.errorX *= smooth;
    this.errorZ *= smooth;
    if (Math.abs(this.errorX) < 1e-5) this.errorX = 0;
    if (Math.abs(this.errorZ) < 1e-5) this.errorZ = 0;
    const t = Math.max(0, Math.min(1, alpha));
    let x = this.previous.x + (this.position.x - this.previous.x) * t;
    let z = this.previous.z + (this.position.z - this.previous.z) * t;
    const division = this.posture.current === 'DIVING' || this.posture.current === 'GETTING_UP' ? 0 : 1;
    this.visualPosture = t < division ? this.previousPosture : this.posture;
    if (isGroundPosture(this.posture.current) && this.previousPosture.current === this.posture.current &&
        this.previousPosture.started === this.posture.started && this.previousPosture.yaw !== this.posture.yaw) {
      this.visualPosture = { ...this.posture,
        yaw: lerpAngle(this.previousPosture.yaw, this.posture.yaw, t),
      };
    }
    this.visualTick = this.tick - 1 + t;
    const { landedDive } = this.posture;
    const dive = this.visualPosture.current === 'DIVING' ? this.posture.dive ?? landedDive : undefined;
    let y = this.previous.y + (this.position.y - this.previous.y) * t;
    if (dive) {
      // Reconciliation can retime the dive. Anchor the blend to its corrected fixed-tick path.
      sampleDive(dive, this.visualTick, this.rendered);
      ({ x, y, z } = this.rendered);
    } else if (this.position.y === 0) y = 0;
    let fraction = 1;
    if ((this.errorX || this.errorZ) && (dive || isGroundPosture(this.visualPosture.current) ||
        this.visualPosture.current === 'GETTING_UP')) {
      this.correctionOrigin.x = x;
      this.correctionOrigin.y = groundHeight(this.world, x, z);
      this.correctionOrigin.z = z;
      const shape = dive ? diveEnvelope(dive.landing, this.balance) : postureCollider(this.visualPosture, this.visualTick, this.balance);
      fraction = postureSweep(this.correctionOrigin, this.errorX, this.errorZ, (this.world?.terrain ? this.correctionOrigin.y + (dive ? y : 0) : y) + shape.height,
        shape, this.visualPosture.yaw, this.world, this.tether);
    }
    this.rendered.x = x + this.errorX * fraction;
    this.rendered.z = z + this.errorZ * fraction;
    if (this.tether) constrainTether(this.rendered, this.tether, this.tether.radius);
    this.rendered.y = this.world?.terrain ? groundHeight(this.world, this.rendered.x, this.rendered.z) + (dive ? y : 0) : y;
  }
}

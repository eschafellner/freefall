import { BALANCE, advancePosture, applyPostureInput, constrainTether, copyPosture, newPosture } from '@freefall/shared';
import type { PlayerInput, PlayerState, PositionXZ, PostureState, WorldDefinition } from '@freefall/shared';

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
  posture = newPosture();
  visualPosture: PostureState = this.posture;
  visualTick = 0;
  private previousPosture = this.posture;
  private tick = 0;

  /** Reconciliation telemetry. Counted for every server confirmation that moved the prediction. */
  readonly stats = { corrections: 0, lastCorrection: 0, maxCorrection: 0, snaps: 0 };

  private readonly previous = { x: 0, y: 0, z: 5 };
  private readonly pending: PlayerInput[] = [];
  private life = 0;
  private alive = false;
  private ready = false;
  private errorX = 0;
  private errorY = 0;
  private errorZ = 0;

  private move(input: PlayerInput): void {
    if (this.frozen) return;
    this.tick++;
    advancePosture(this.position, this.posture, this.tick, this.balance, this.world, this.tether);
    applyPostureInput(this.position, this.posture, input.posture && input.life !== this.life
      ? { ...input, posture: undefined } : input, this.tick, this.balance, this.world, this.tether);
  }

  /** Predicted inputs the server has not acknowledged yet (network round trip plus server input buffer). */
  get unacknowledged(): number { return this.pending.length; }

  /** Current visual offset from the interpolated prediction in meters. */
  get error(): number { return Math.hypot(this.errorX, this.errorY, this.errorZ); }

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
    this.posture = player.posture ? copyPosture(player.posture) : newPosture(player.yaw);
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
      this.errorX = this.errorY = this.errorZ = 0;
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
    this.errorY += dy;
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
    this.errorY *= smooth;
    if (Math.abs(this.errorX) < 1e-5) this.errorX = 0;
    if (Math.abs(this.errorY) < 1e-5) this.errorY = 0;
    if (Math.abs(this.errorZ) < 1e-5) this.errorZ = 0;
    const t = Math.max(0, Math.min(1, alpha));
    this.rendered.x = this.previous.x + (this.position.x - this.previous.x) * t + this.errorX;
    this.rendered.z = this.previous.z + (this.position.z - this.previous.z) * t + this.errorZ;
    this.rendered.y = Math.max(0, this.previous.y + (this.position.y - this.previous.y) * t + this.errorY);
    const division = this.posture.current === 'DIVING' || this.posture.current === 'GETTING_UP' ? 0 : 1;
    this.visualPosture = t < division ? this.previousPosture : this.posture;
    this.visualTick = this.tick - 1 + t;
    if (this.tether) constrainTether(this.rendered, this.tether, this.tether.radius);
  }
}

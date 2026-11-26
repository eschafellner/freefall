import * as T from 'three';

/**
 * Fulton-style tow for the balloon extraction. The fighter's hook catches the lift line under the balloon and
 * keeps flying: every secured operator is a point mass on an elastic line (nylon stretch), pulled off the ground
 * by line tension against gravity, quadratic air drag and ground friction. Fixed sub-steps keep every client on the
 * same trajectory, so a late joiner fast-forwards to the same pose.
 */
export const TOW = {
  /** Fighter speed when the hook catches the line, m/s. */
  pickupSpeed: 28,
  /** Forward acceleration after the catch, m/s². */
  acceleration: 5,
  /** Climb rate at the catch and climb acceleration, m/s and m/s². */
  climbSpeed: 4, climbAcceleration: 3.6,
  gravity: 9.81,
  /** Operator incl. armour and pack, kg; drag area Cd·A, m². */
  mass: 118, dragArea: .62, airDensity: 1.2,
  /** Axial line stiffness E·A per kilogram of operator: a short line is stiffer than a long one (k = E·A / L). */
  elasticity: 220,
  /** Damping ratio of the line: nylon absorbs most of the snatch instead of throwing the operator back. */
  dampingRatio: .7,
  /** The hook's line brake pays out line above this tension per kilogram (≈ 4.5 g) and absorbs the snatch. */
  brake: 4.5 * 9.81,
  /** Ground friction coefficient while the operator is still dragged over the ground. */
  friction: .6,
  /** Harness height above the operator's feet. */
  harness: 1.2,
  /** The line hangs with a little slack before the catch. */
  slack: 1.02,
  /** Pickup yoke below the balloon centre: the fighter passes under the envelope and takes the line here. */
  yokeDrop: 5.6,
  step: 1 / 240,
} as const;

const UP = new T.Vector3(0, 1, 0);

/** Hook position s seconds after the catch along the fighter's heading (unit vector in the xz plane). */
export function hookAt(start: T.Vector3, heading: T.Vector3, s: number, target: T.Vector3): T.Vector3 {
  const along = TOW.pickupSpeed * s + .5 * TOW.acceleration * s * s;
  return target.set(start.x + heading.x * along, start.y + TOW.climbSpeed * s + .5 * TOW.climbAcceleration * s * s,
    start.z + heading.z * along);
}

export function hookVelocity(heading: T.Vector3, s: number, target: T.Vector3): T.Vector3 {
  const speed = TOW.pickupSpeed + TOW.acceleration * s;
  return target.set(heading.x * speed, TOW.climbSpeed + TOW.climbAcceleration * s, heading.z * speed);
}

export type GroundAt = (x: number, z: number) => number;

export class TowLine {
  /** Harness position (world). */
  readonly position = new T.Vector3();
  readonly velocity = new T.Vector3();
  /** Body orientation: the operator hangs from the harness, the body axis follows the line once it is taut. */
  readonly rotation = new T.Quaternion();
  /** Unstretched line length; grows while the brake pays out line. */
  length: number;
  private stiffness: number;
  private damping: number;
  time = 0;
  /** Line tension per kilogram, m/s² (0 when slack). */
  tension = 0;
  peakTension = 0;
  grounded = true;
  private readonly hook = new T.Vector3();
  private readonly hookSpeed = new T.Vector3();
  private readonly line = new T.Vector3();
  private readonly aim = new T.Quaternion();
  private readonly heading = new T.Vector3();
  private readonly start = new T.Vector3();
  private readonly ground: GroundAt;

  constructor(harness: T.Vector3, start: T.Vector3, heading: T.Vector3, ground: GroundAt) {
    this.position.copy(harness);
    this.start.copy(start);
    this.heading.copy(heading);
    this.ground = ground;
    this.length = Math.max(4, harness.distanceTo(start) * TOW.slack);
    this.stiffness = TOW.elasticity / this.length;
    this.damping = 2 * TOW.dampingRatio * Math.sqrt(this.stiffness);
  }

  /** Advances the fixed-step simulation to s seconds after the catch. */
  advance(s: number): void {
    while (this.time + TOW.step <= s + 1e-9) this.step(TOW.step);
  }

  /** Line sag for drawing: 0 when taut, else the depth of a shallow catenary. */
  sag(hook: T.Vector3): number {
    const span = this.position.distanceTo(hook);
    return span >= this.length ? 0 : .5 * Math.sqrt(this.length * this.length - span * span);
  }

  private step(dt: number): void {
    const { position, velocity, line } = this;
    hookAt(this.start, this.heading, this.time, this.hook);
    hookVelocity(this.heading, this.time, this.hookSpeed);
    line.subVectors(this.hook, position);
    const distance = line.length();
    line.divideScalar(Math.max(distance, 1e-6));
    const stretch = distance - this.length;
    const rate = (this.hookSpeed.x - velocity.x) * line.x + (this.hookSpeed.y - velocity.y) * line.y +
      (this.hookSpeed.z - velocity.z) * line.z;
    // A line only pulls: no compression, and the damping cannot push the operator back.
    this.tension = stretch > 0 ? Math.max(0, this.stiffness * stretch + this.damping * rate) : 0;
    if (this.tension > TOW.brake) {
      // Line brake: pays out just enough line to hold the tension at the brake limit.
      this.length = Math.min(distance, this.length + (this.tension - TOW.brake) / this.stiffness);
      this.stiffness = TOW.elasticity / this.length;
      this.damping = 2 * TOW.dampingRatio * Math.sqrt(this.stiffness);
      this.tension = TOW.brake;
    }
    this.peakTension = Math.max(this.peakTension, this.tension);
    const speed = velocity.length();
    const drag = .5 * TOW.airDensity * TOW.dragArea * speed / TOW.mass;
    velocity.x += (line.x * this.tension - drag * velocity.x) * dt;
    velocity.y += (line.y * this.tension - drag * velocity.y - TOW.gravity) * dt;
    velocity.z += (line.z * this.tension - drag * velocity.z) * dt;
    position.addScaledVector(velocity, dt);
    const floor = this.ground(position.x, position.z) + TOW.harness;
    this.grounded = position.y <= floor;
    if (this.grounded) {
      position.y = floor;
      // Normal force carries what the line does not lift; friction brakes the drag over the ground.
      const normal = Math.max(0, TOW.gravity - line.y * this.tension);
      if (velocity.y < 0) velocity.y = 0;
      const horizontal = Math.hypot(velocity.x, velocity.z);
      if (horizontal > 0) {
        const keep = Math.max(0, horizontal - TOW.friction * normal * dt) / horizontal;
        velocity.x *= keep;
        velocity.z *= keep;
      }
    }
    // Hanging from the harness: the body axis turns into the line, upright while the line is slack on the ground.
    if (this.tension > 0) this.aim.setFromUnitVectors(UP, line);
    else if (this.grounded) this.aim.identity();
    this.rotation.slerp(this.aim, 1 - Math.exp(-dt * (this.tension > 0 ? 7 : 3)));
    this.time += dt;
  }
}

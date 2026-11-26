/**
 * Damped springs for secondary motion (weapon inertia, upper-body reactions, backpack bounce). Sub-stepped so a long
 * frame cannot explode; framerate independent within the clamped step.
 */
export class Spring {
  value = 0;
  velocity = 0;

  /** `frequency` in Hz, `damping` ratio (1 = critical, < 1 overshoots). */
  step(target: number, frequency: number, damping: number, dt: number): number {
    const omega = 2 * Math.PI * frequency;
    const k = omega * omega, c = 2 * damping * omega;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (k * (target - this.value) - c * this.velocity) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  kick(impulse: number): void { this.velocity += impulse; }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }
}

/** Smooth, deterministic noise from a few incommensurate sines (idle sway, glances). */
export function wobble(t: number, seed: number): number {
  return (Math.sin(t * .63 + seed) + .6 * Math.sin(t * 1.37 + seed * 2.1) + .3 * Math.sin(t * 2.71 + seed * 3.7)) / 1.9;
}

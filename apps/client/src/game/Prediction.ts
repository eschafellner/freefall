import { NET, constrainTether, movePlayer } from '@freefall/shared';
import type { PlayerInput, PlayerState, PositionXZ, WorldDefinition } from '@freefall/shared';

export class Prediction {
  readonly position = { x: 0, z: 5 };
  readonly rendered = { x: 0, z: 5 };
  world?: WorldDefinition;
  tether?: PositionXZ & { radius: number };
  frozen = false;

  private move(input: PlayerInput): void {
    if (this.frozen) return;
    movePlayer(this.position, input, 1 / NET.tickHz, this.world, this.tether);
  }
  private readonly pending: PlayerInput[] = [];
  private life = 0;
  private alive = false;
  private ready = false;
  private errorX = 0;
  private errorZ = 0;

  confirm(player: PlayerState): void {
    const snap = !this.ready || this.life !== player.life || this.alive !== (player.hp > 0);
    const x = this.position.x;
    const z = this.position.z;
    this.ready = true;
    this.life = player.life;
    this.alive = player.hp > 0;
    this.position.x = player.x;
    this.position.z = player.z;
    while (this.pending[0] && this.pending[0].seq <= player.ack) this.pending.shift();
    if (snap) this.pending.length = 0;
    if (this.alive) for (const input of this.pending) this.move(input);
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    if (snap || dx * dx + dz * dz > 4) {
      this.errorX = this.errorZ = 0;
    } else {
      this.errorX += dx;
      this.errorZ += dz;
    }
  }

  step(input: PlayerInput): void {
    this.pending.push(input);
    if (this.pending.length > 24) this.pending.shift();
    if (this.ready && this.alive) this.move(input);
  }

  sample(dt: number): void {
    const smooth = Math.exp(-dt * 18);
    this.errorX *= smooth;
    this.errorZ *= smooth;
    this.rendered.x = this.position.x + this.errorX;
    this.rendered.z = this.position.z + this.errorZ;
    if (this.tether) constrainTether(this.rendered, this.tether, this.tether.radius);
  }
}

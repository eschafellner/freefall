/**
 * Client side of scripts/motion-bench.ts. Mirrors the per-frame order of Game.draw() and the
 * remote interpolation of PlayerView.draw() so the benchmark measures the shipped code paths.
 */
import { NET, PLAYER_MOTION } from '@freefall/shared';
import type { PlayerInput, PlayersSnapshot } from '@freefall/shared';
import { remotePose } from '../apps/client/src/game/RemoteInterpolation.ts';
import { Prediction } from '../apps/client/src/game/Prediction.ts';
import { MatchTimeline } from '../apps/client/src/game/Timeline.ts';
import { ThirdPersonCamera } from '../apps/client/src/rendering/ThirdPersonCamera.ts';
import { PlayerVisualController } from '../apps/client/src/rendering/characters/PlayerVisualController.ts';
import { createOperatorWardrobe } from '../apps/client/src/rendering/characters/operator/Catalog.ts';
import { createKestrel } from '../apps/client/src/rendering/weapons/Kestrel.ts';

const STEP = 1000 / NET.tickHz;
const parts = createOperatorWardrobe();
const rifle = createKestrel();

export interface FrameScript { forward: number; strafe: number; sprint: boolean; aim: boolean; yaw: (t: number, yaw: number, dt: number) => number }
export interface FrameSample { t: number; x: number; z: number; cx: number; cy: number; cz: number; rx: number; rz: number;
  anim: number; remoteAnim: number; loco: string; held: boolean; moving: boolean }

export class SimClient {
  readonly id: string;
  readonly hz: number;
  onCorrection?: (size: number) => void;
  onFrame?: (sample: FrameSample) => void;
  private readonly send: (input: PlayerInput) => void;
  private readonly timeline = new MatchTimeline();
  private readonly prediction = new Prediction();
  private readonly camera = new ThirdPersonCamera();
  private readonly local = new PlayerVisualController(parts, rifle, 0x73d5e7);
  private readonly remote = new PlayerVisualController(parts, rifle, 0xf5b65f);
  private last = 0;
  private elapsed = 0;
  private seq = 0;
  private yaw = 0;
  private pitch = -.12;
  private lastLife = 0;
  private hp = 0;
  private tick = 0;
  private startedAt = 0;
  private readonly pose = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };

  constructor(id: string, hz: number, send: (input: PlayerInput) => void) {
    this.id = id;
    this.hz = hz;
    this.send = send;
  }

  receive(packet: PlayersSnapshot): void {
    this.timeline.players.push(packet);
    this.tick = packet.tick;
    const own = packet.players.find((p) => p.id === this.id);
    if (!own) return;
    this.hp = own.hp;
    const lifeChanged = own.life !== this.lastLife;
    if (lifeChanged) {
      this.yaw = own.yaw;
      this.lastLife = own.life;
    }
    const x = this.prediction.position.x, z = this.prediction.position.z;
    this.prediction.confirm(own);
    if (!lifeChanged) this.onCorrection?.(Math.hypot(this.prediction.position.x - x, this.prediction.position.z - z));
  }

  frame(now: number, script: FrameScript, _startYaw: number): void {
    if (!this.startedAt) this.startedAt = now;
    const dt = Math.max(0, Math.min(.1, (now - this.last) / 1000));
    this.last = now;
    this.yaw = script.yaw((now - this.startedAt) / 1000, this.yaw, dt);
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.elapsed += dt * 1000;
    const steps = Math.floor(this.elapsed / STEP);
    this.elapsed -= steps * STEP;
    for (let i = 0; i < steps; i++) {
      const input: PlayerInput = { seq: ++this.seq, forward: script.forward, strafe: script.strafe, yaw: this.yaw,
        pitch: this.pitch, sprint: script.sprint, fire: false, aim: script.aim, reload: false };
      this.prediction.step(input);
      this.send(input);
    }
    this.prediction.sample(dt, this.elapsed / STEP);
    const players = this.timeline.players;
    players.sample(now);
    const rendered = this.prediction.rendered;
    this.local.draw(this.id, this.lastLife, this.hp, rendered.x, rendered.z, this.yaw, this.pitch, script.aim, script.sprint,
      0, this.tick, now, dt, true);
    this.camera.update(rendered, this.yaw, this.pitch, script.aim, this.local.animation.sprint, dt);

    let rx = 0, rz = 0, held = false;
    const a = players.before, b = players.after;
    if (a && b) {
      const player = a.players.find((p) => p.id === 'remote');
      if (player) {
        const next = b.players.find((p) => p.id === player.id);
        const pose = remotePose(player, a, b, players.alpha, next, this.pose);
        rx = pose.x;
        rz = pose.z;
        held = a === b;
        const motion = player.motion ?? 0;
        const { yaw: heading, pitch, tick } = pose;
        this.remote.draw(player.id, player.life, player.hp, rx, rz, heading, pitch,
          Boolean(motion & PLAYER_MOTION.aim), Boolean(motion & PLAYER_MOTION.sprint), 0, tick, now, dt, false);
      }
    }
    const c = this.camera.camera.position;
    this.onFrame?.({ t: now, x: rendered.x, z: rendered.z, cx: c.x, cy: c.y, cz: c.z, rx, rz,
      anim: this.local.animation.speed, remoteAnim: this.remote.animation.speed, loco: this.local.animation.locomotion,
      held, moving: script.forward !== 0 || script.strafe !== 0 });
  }
}

/** Isolated CPU timings for tactical physics, posing and camera. No renderer or network. */
import assert from 'node:assert/strict';
import { BALANCE, BODENBRUCH, NET, advancePosture, applyPostureInput, missionGround, newPosture, postureCollider,
  resolveMissionBalance } from '@freefall/shared';
import type { PlayerInput, Posture } from '@freefall/shared';
import { ThirdPersonCamera, cameraAnchorWeight } from '../apps/client/src/rendering/ThirdPersonCamera.ts';
import { PlayerVisualController } from '../apps/client/src/rendering/characters/PlayerVisualController.ts';
import { createSoldierParts } from '../apps/client/src/rendering/characters/SoldierRig.ts';
import { createKestrel } from '../apps/client/src/rendering/weapons/Kestrel.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';

const parts = createSoldierParts();
const rifle = createKestrel();
const camera = new ThirdPersonCamera();
const world = missionGround(BODENBRUCH.world);
const balance = resolveMissionBalance(BALANCE, 'normal').movement;
const crew = Array.from({ length: 4 }, (_, i) => ({ id: String(i),
  position: { x: -145 + i * 2, y: 0, z: 178 }, posture: newPosture(),
  visual: new PlayerVisualController(parts, rifle, 0x73d5e7), direction: i % 2 ? -1 : 1,
}));
const local = crew[0];
const dt = 1 / 120;
const warmup = 600;
const frames = 2400;
const cycle = 150;
const seen = new Set<Posture>();
const samples = { physics: [] as number[], pose: [] as number[], camera: [] as number[] };
let tick = 0;
for (let frame = 0; frame < warmup + frames; frame++) {
  const measured = frame >= warmup;
  const now = (frame + 1) * dt * 1000;
  if (frame % (120 / NET.tickHz) === 0) {
    tick++;
    const phase = tick % cycle;
    if (phase === 1) for (const [i, actor] of crew.entries()) {
      Object.assign(actor.position, { x: -145 + i * 2, y: 0, z: 178 });
    }
    const input: PlayerInput = { seq: tick, yaw: 0, pitch: -.15, forward: 0, strafe: phase >= 40 && phase < 70 ? .25 : 0,
      sprint: false, fire: false, aim: phase >= 40 && phase < 70,
      posture: phase === 1 ? 'crouch' : phase === 10 ? 'dive' : phase === 70 ? 'stand' : undefined,
    };
    const before = performance.now();
    for (const { position, posture, direction } of crew) {
      input.forward = phase === 10 ? direction : 0;
      advancePosture(position, posture, tick, balance, world);
      applyPostureInput(position, posture, input, tick, balance, world);
    }
    if (measured) samples.physics.push(performance.now() - before);
    for (const { posture } of crew) seen.add(posture.current);
  }
  const phaseTick = tick + (frame % (120 / NET.tickHz)) * dt * NET.tickHz;
  const aim = tick % cycle >= 40 && tick % cycle < 70;
  const beforePose = performance.now();
  for (const { id, visual, position, posture } of crew) {
    visual.draw(id, 1, 100, position.x, position.z, 0, -.15, aim, false, 0, phaseTick, now, dt,
      id === local.id, undefined, posture, position.y);
  }
  const afterPose = performance.now();
  camera.update(local.position, 0, -.15, aim, 0, dt, world, local.position.y,
    postureCollider(local.posture, phaseTick, balance).lookHeight, cameraAnchorWeight(local.posture, phaseTick));
  const afterCamera = performance.now();
  if (measured) {
    samples.pose.push(afterPose - beforePose);
    samples.camera.push(afterCamera - afterPose);
  }
}
for (const stance of ['STANDING', 'CROUCHING', 'DIVING', 'PRONE', 'SUPINE', 'GETTING_UP'] as const) assert.ok(seen.has(stance), stance);
console.log('%s · %d warm-up + %d measured frames at a virtual 120 Hz · %s', process.version, warmup, frames, [...seen].join(', '));
console.table(Object.entries(samples).map(([stage, times]) => ({ stage, samples: times.length, ...timingStats(times) })));

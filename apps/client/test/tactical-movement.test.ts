import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, BODENBRUCH, NET, PLAYER, advancePosture, applyPostureInput, copyPosture, newPosture, slidePeakStep, wrapAngle } from '@freefall/shared';
import type { OperatorPosition, PlayerInput, PlayerState, PlayersSnapshot, PostureState } from '@freefall/shared';
import { playerSnapshot } from '../../server/src/networking/snapshots.ts';
import { Battlefield } from '../../server/src/simulation/Battlefield.ts';
import { Prediction } from '../src/game/Prediction.ts';
import { remotePose } from '../src/game/RemoteInterpolation.ts';
import { Timeline } from '../src/game/Timeline.ts';
import { Bindings, DEFAULT_BINDINGS, bindings as liveBindings, setMenuInputContext } from '../src/input/Bindings.ts';
import { DesktopInput, analogMovement } from '../src/input/DesktopInput.ts';
import { cameraPreferences, normalizeCameraPreferences } from '../src/rendering/CameraPreferences.ts';
import { LANDING_TICKS, TacticalAnimation } from '../src/rendering/characters/TacticalAnimation.ts';
import { ThirdPersonCamera, cameraAnchorWeight } from '../src/rendering/ThirdPersonCamera.ts';

const idle = (seq: number): PlayerInput => ({ seq, life: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, sprint: false });
const movement = BALANCE.movement;
const player: PlayerState = { id: 'p', slot: 0, x: 0, z: 0, hp: 100, yaw: 0, life: 1, ack: 0, respawnTick: 0, kills: 0 };

test('pending crawl, turn and get-up replay against authoritative snapshots in either ground posture', () => {
  for (const stance of ['PRONE', 'SUPINE'] as const) {
    const world = { ...BODENBRUCH.world, obstacles: [] };
    const arena = new Battlefield(2, world);
    const operator = arena.addPlayer('p');
    operator.posture = { ...newPosture(), current: stance, requested: stance };
    const prediction = new Prediction();
    prediction.world = world;
    prediction.confirm(playerSnapshot(arena, 'p').players[0], arena.tick);
    const inputs: PlayerInput[] = Array.from({ length: 65 }, (_, i) => ({
      ...idle(i + 1), forward: .7, strafe: .5, yaw: wrapAngle(.2 * i), ...(i === 20 && { posture: 'stand' as const }),
    }));
    const expected: { position: OperatorPosition; posture: PostureState }[] = [];
    for (let i = 0; i < inputs.length; i++) {
      prediction.step(inputs[i]);
      expected.push({ position: { ...prediction.position }, posture: copyPosture(prediction.posture) });
      if (i < 2) continue;
      assert.ok(arena.receiveInput('p', inputs[i - 2]));
      arena.step();
      const snapshot = playerSnapshot(arena, 'p');
      const prior = expected[i - 2].posture;
      if (prior.current === 'STANDING') {
        assert.equal(operator.posture.current, prior.current);
        assert.equal(operator.posture.yaw, prior.yaw);
      } else assert.deepEqual(prior, operator.posture);
      prediction.confirm(snapshot.players[0], snapshot.tick);
      assert.deepEqual(prediction.position, expected[i].position);
      // Standing snapshots omit expired transition detail.
      assert.equal(prediction.posture.current, expected[i].posture.current);
      assert.equal(prediction.stats.corrections, 0);
    }
    assert.equal(expected[20].posture.getUpId, 21);
    assert.equal(expected.at(-1)?.posture.current, 'STANDING');
  }
});

test('remote ground orientation wraps independently and get-up freezes position through its end tick', () => {
  const a: PlayersSnapshot = { tick: 10, host: 'p', players: [] };
  const b: PlayersSnapshot = { ...a, tick: 14 };
  const posture: PostureState = { ...newPosture(3.07), current: 'PRONE', requested: 'PRONE' };
  const first = { ...player, posture };
  const last = { ...player, x: .12, yaw: 2, posture: { ...posture, yaw: -3.07 } };
  const out = { x: 0, z: 0, yaw: 0, tick: 0, pitch: 0 };
  const middle = remotePose(first, a, b, .5, last, out);
  assert.equal(middle.yaw, 1);
  assert.ok(Math.abs(middle.bodyYaw! - Math.PI) < 1e-12);
  const rising = { ...last, posture: { ...last.posture, current: 'GETTING_UP', from: 'PRONE', requested: 'STANDING',
    started: 12, until: 36, getUpId: 27 } } satisfies PlayerState;
  assert.equal(remotePose(first, a, b, .25, rising, out).posture?.current, 'PRONE');
  assert.equal(remotePose(first, a, b, .5, rising, out).posture?.getUpId, 27);
  assert.equal(remotePose(first, a, b, .75, rising, out).x, rising.x);
  const finished = { ...player, x: .35 };
  const across = (alpha: number) => remotePose(rising, { ...a, tick: 34 }, { ...b, tick: 38 }, alpha, finished, out);
  assert.equal(across(.25).x, rising.x);
  assert.equal(across(.25).posture?.current, 'GETTING_UP');
  assert.equal(across(.5).posture, undefined);
  assert.ok(Math.abs(across(.75).x - .235) < 1e-12);
});

test('a snapshot gap across landing and get-up stops remote movement at the rise tick', () => {
  const dive = { id: 1, x: 0, z: -1, yaw: 0, from: 'STANDING', landing: 'PRONE', originX: 0, originZ: 0,
    started: 5, takeoff: 8, until: 28, distance: 5, arcHeight: .62 } as const;
  const airborne: PlayerState = { ...player, z: -4.8, posture: { ...newPosture(), current: 'DIVING', requested: 'PRONE',
    started: dive.started, until: dive.until, dive } };
  const rising: PlayerState = { ...player, z: -5.08, posture: { ...newPosture(), current: 'GETTING_UP', requested: 'STANDING',
    from: 'PRONE', started: 31, until: 55, landedDive: dive } };
  const a = { tick: 27, host: 'p', players: [airborne] };
  const b = { tick: 33, host: 'p', players: [rising] };
  const out = { x: 0, z: 0, yaw: 0, tick: 0, pitch: 0 };
  assert.equal(remotePose(airborne, a, b, .5, rising, out).posture?.current, 'PRONE');
  const up = remotePose(airborne, a, b, 4 / 6, rising, out);
  assert.equal(up.posture?.current, 'GETTING_UP');
  assert.equal(up.z, rising.z);
  assert.equal(remotePose(airborne, a, b, 1.25, rising, out).z, rising.z);
});

test('duplicate and older player snapshots are rejected before consumers update local state', () => {
  const timeline = new Timeline<PlayersSnapshot>();
  const newest = { tick: 20, host: 'p', players: [{ ...player, life: 2 }] };
  assert.equal(timeline.push(newest, 1000), true);
  assert.equal(timeline.push({ ...newest, players: [player] }, 1001), false);
  assert.equal(timeline.push({ ...newest, tick: 19, players: [player] }, 1002), false);
  assert.equal(timeline.latest, newest);
});

test('late crawl reconciliation keeps the rendered collider behind a wall after dive history expires', () => {
  const prediction = new Prediction();
  const posture: PostureState = { ...newPosture(), current: 'PRONE', requested: 'PRONE' };
  const grounded = { ...player, posture };
  prediction.confirm(grounded, 0);
  for (let seq = 1; seq <= 22; seq++) prediction.step({ ...idle(seq), strafe: 1 });
  const wall = { x: .65, z: 0, halfX: .05, halfZ: 2, height: 1, kind: 'barrier' as const };
  prediction.world = { ...BODENBRUCH.world, obstacles: [wall] };
  prediction.confirm({ ...grounded, ack: 22 }, 22);
  prediction.sample(0);
  assert.ok(prediction.error > .3);
  assert.ok(prediction.rendered.x <= wall.x - wall.halfX - movement.colliders.PRONE.radius + 1e-7);
  assert.equal(prediction.rendered.y, 0);
});

test('ground camera stays under a canopy, eases out and keeps its bearing through a change of posture', () => {
  const camera = new ThirdPersonCamera();
  const p = { x: 0, z: 0 };
  const world = { ...BODENBRUCH.world, obstacles: [{ x: 0, z: 0, halfX: 2, halfZ: 2, bottom: .63, height: 2,
    kind: 'barrier' as const }] };
  camera.update(p, 0, -.28, false, 0, 1 / 60, world, 0, movement.colliders.PRONE.lookHeight, 1);
  assert.ok(camera.camera.position.y < .63);
  assert.ok(camera.camera.position.y >= .19);
  const z = camera.camera.position.z;
  const rotation = camera.camera.quaternion.clone();
  camera.update(p, 0, -.28, false, 0, 1 / 60, undefined, 0, movement.colliders.SUPINE.lookHeight, 1);
  assert.ok(camera.camera.position.z > z && camera.camera.position.z < 1.5);
  assert.ok(camera.camera.quaternion.angleTo(rotation) < 1e-6);
  for (let i = 0; i < 60; i++) camera.update(p, 0, .69, true, 0, 1 / 60, undefined, 0, movement.colliders.SUPINE.lookHeight, 1);
  assert.ok(camera.camera.position.y >= .19);
});

test('prediction replays a pending slide bit for bit with the server before and after confirmation', () => {
  const world = { ...BODENBRUCH.world, obstacles: [] };
  const arena = new Battlefield(2, world);
  const operator = arena.addPlayer('p');
  const prediction = new Prediction();
  prediction.world = world;
  prediction.confirm(playerSnapshot(arena, 'p').players[0], arena.tick);
  const inputs: PlayerInput[] = Array.from({ length: 26 }, (_, i) => idle(i + 1));
  Object.assign(inputs[0], { forward: .8, strafe: .6, sprint: true, yaw: .42 });
  Object.assign(inputs[1], { ...inputs[0], seq: 2, posture: 'crouch' });
  const predicted: { position: OperatorPosition; posture: PostureState }[] = [];
  for (const [i, input] of inputs.entries()) {
    prediction.step(input);
    predicted.push({ position: { ...prediction.position }, posture: copyPosture(prediction.posture) });
    if (i < 2) continue;
    assert.ok(arena.receiveInput('p', inputs[i - 2]));
    arena.step();
    const expected = predicted[i - 2];
    assert.deepEqual(expected.position, { x: operator.x, y: operator.y, z: operator.z });
    assert.deepEqual(expected.posture, operator.posture);

    const snapshot = playerSnapshot(arena, 'p');
    prediction.confirm(snapshot.players[0], snapshot.tick);
    assert.equal(prediction.unacknowledged, 2);
    assert.deepEqual(prediction.position, predicted[i].position);
    assert.deepEqual(prediction.posture, predicted[i].posture);
  }
  assert.equal(predicted[1].posture.current, 'SLIDING');
  assert.equal(operator.posture.current, 'CROUCHING');
  assert.equal(prediction.stats.corrections, 0);
});

test('remote interpolation accepts a fast slide step and still snaps on teleport or life change', () => {
  const slide = { x: 0, z: -1, distance: 9, decay: 1 };
  const sliding: PostureState = { ...newPosture(), current: 'SLIDING', requested: 'CROUCHING', started: 4, until: 16, slide };
  const step = slidePeakStep(slide, sliding.until - sliding.started);
  assert.ok(step > 2 * PLAYER.sprintSpeed / NET.tickHz);
  const a: PlayersSnapshot = { tick: 4, host: 'p', players: [{ ...player, posture: sliding }] };
  const b: PlayersSnapshot = { tick: 5, host: 'p', players: [{ ...player, z: -step, posture: sliding }] };
  const out = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  assert.equal(remotePose(a.players[0], a, b, .5, b.players[0], out).z, -step / 2);
  assert.equal(remotePose(a.players[0], a, b, .5, { ...b.players[0], z: -2 * step }, out).z, -2 * step);
  assert.equal(remotePose(a.players[0], a, b, .5, { ...b.players[0], life: 2 }, out).z, -step);
});

test('prediction replays unacknowledged analog dive, then matches the server through landing', () => {
  const position = { x: 0, y: 0, z: 0 };
  const posture = newPosture();
  const prediction = new Prediction();
  prediction.confirm(player, 1);
  const dive = { ...idle(1), posture: 'dive' as const, forward: -.73, strafe: .35 };
  prediction.step(dive);
  assert.equal(prediction.posture.current, 'DIVING');
  for (let tick = 2; tick <= 45; tick++) {
    const input = tick === 2 ? dive : idle(tick - 1);
    if (tick > 2) prediction.step(input);
    advancePosture(position, posture, tick, movement);
    applyPostureInput(position, posture, input, tick, movement);
    if (tick % 2 === 0) {
      const before = { ...prediction.position };
      prediction.confirm({ ...player, ...position, posture, ack: tick - 1 }, tick);
      assert.deepEqual(prediction.position, before);
      assert.equal(prediction.posture.current, posture.current);
    }
  }
  assert.equal(prediction.posture.current, 'SUPINE');
  assert.equal(prediction.stats.corrections, 0);
});

test('server rejection rolls back a locally predicted dive without retaining an action', () => {
  const prediction = new Prediction();
  prediction.confirm(player, 0);
  prediction.step({ ...idle(1), posture: 'dive' });
  for (let i = 2; i < 8; i++) prediction.step(idle(i));
  assert.ok(prediction.position.y > 0);
  prediction.confirm({ ...player, ack: 7 }, 7);
  assert.equal(prediction.position.y, 0);
  assert.equal(prediction.posture.current, 'STANDING');
  prediction.sample(1 / NET.tickHz, .5);
  assert.notEqual(prediction.visualPosture.current, 'DIVING');
  assert.equal(prediction.rendered.y, 0);
});

test('reconnect waits for a snapshot and discards unconfirmed dives from the old connection', () => {
  const prediction = new Prediction();
  prediction.confirm(player, 0);
  prediction.step({ ...idle(1), posture: 'dive' });
  assert.equal(prediction.posture.current, 'DIVING');
  prediction.awaitSnapshot();
  prediction.confirm(player, 60);
  assert.equal(prediction.unacknowledged, 0);
  assert.equal(prediction.posture.current, 'STANDING');
  assert.equal(prediction.posture.dive, undefined);
});

test('a remote remains airborne until the server landing tick, and reconnect restores ground posture', () => {
  const dive: PostureState = { ...newPosture(), current: 'DIVING', requested: 'PRONE', started: 2, until: 25,
    dive: { id: 1, x: 0, z: -1, yaw: 0, from: 'STANDING', landing: 'PRONE', originX: 0, originZ: 0,
      started: 2, takeoff: 5, until: 25, distance: 5, arcHeight: .62 } };
  const grounded: PostureState = { ...newPosture(), current: 'PRONE', requested: 'PRONE', from: 'DIVING', started: 25, until: 25 };
  const a: PlayersSnapshot = { tick: 24, host: 'p', players: [{ ...player, y: .11, z: -4.89, posture: dive }] };
  const b: PlayersSnapshot = { tick: 26, host: 'p', players: [{ ...player, z: -5, posture: grounded }] };
  const out = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  assert.equal(remotePose(a.players[0], a, b, .49, b.players[0], out).posture?.current, 'DIVING');
  const landing = remotePose(a.players[0], a, b, .5, b.players[0], out);
  assert.equal(landing.posture?.current, 'PRONE');
  assert.equal(landing.y, 0);
  const prediction = new Prediction();
  prediction.confirm(b.players[0], b.tick);
  prediction.step(idle(1));
  assert.equal(prediction.posture.current, 'PRONE');
});

test('remote reconstruction follows server preparation, impact, and landing across a snapshot gap', () => {
  const world = { ...BODENBRUCH.world, obstacles: [
    { x: 0, z: -2.1, halfX: 2, halfZ: .02, height: 1.5, kind: 'barrier' as const },
  ] };
  const arena = new Battlefield(2, world);
  const operator = arena.addPlayer('p');
  Object.assign(operator, { x: 0, z: 0 });
  const frames = [playerSnapshot(arena, '')];
  assert.ok(arena.receiveInput('p', { ...idle(1), posture: 'dive' }));
  for (let i = 0; i < 26; i++) {
    arena.step();
    frames.push(playerSnapshot(arena, ''));
  }
  const before = frames[0], after = frames.at(-1)!;
  const landing = after.players[0].posture?.landedDive;
  assert.ok(landing?.impact);
  const out = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  for (const frame of frames.slice(0, -1)) {
    const alpha = frame.tick / after.tick;
    const expected = frame.players[0];
    const sampled = remotePose(before.players[0], before, after, alpha, after.players[0], out);
    assert.ok(Math.abs(sampled.z - expected.z) < 1e-9);
    assert.ok(Math.abs((sampled.y ?? 0) - (expected.y ?? 0)) < 1e-9);
    assert.equal(sampled.posture?.current, expected.posture?.current);
  }
  const impact = frames[landing.impact.tick];
  const held = remotePose(before.players[0], before, impact, 1.5, impact.players[0], out);
  assert.equal(held.tick, impact.tick);
  assert.equal(held.z, impact.players[0].z);
  assert.equal(held.posture?.dive?.id, landing.id);
});

test('reconnect midflight resumes a confirmed impact path and reconciles to its landing', () => {
  const world = { ...BODENBRUCH.world, obstacles: [
    { x: 0, z: 2.1, halfX: 2, halfZ: .02, height: 2, kind: 'barrier' as const },
  ] };
  const arena = new Battlefield(2, world);
  const operator = arena.addPlayer('p');
  Object.assign(operator, { x: 0, z: 0 });
  const predicting = new Prediction();
  const start = playerSnapshot(arena, 'p');
  predicting.confirm(start.players[0], start.tick);
  const first = { ...idle(1), posture: 'dive' as const, forward: -1 };
  let reconnect: Prediction | undefined;
  for (let seq = 1; seq < 28; seq++) {
    const input = seq === 1 ? first : idle(seq);
    predicting.step(input); // The client learns about the blocker through the authoritative path.
    reconnect?.step(input);
    assert.ok(arena.receiveInput('p', input));
    arena.step();
    const snapshot = playerSnapshot(arena, 'p');
    const current = snapshot.players[0];
    if (current.posture?.dive?.impact && !reconnect) {
      reconnect = new Prediction();
      reconnect.world = world;
      reconnect.confirm(current, snapshot.tick);
      predicting.world = world;
      predicting.confirm(current, snapshot.tick);
    }
    if (!reconnect) continue;
    assert.deepEqual(predicting.posture, operator.posture);
    assert.deepEqual(reconnect.position, { x: operator.x, y: operator.y, z: operator.z });
    predicting.sample(1 / NET.tickHz, 1);
    assert.ok(predicting.rendered.z <= world.obstacles[0].z - world.obstacles[0].halfZ - movement.colliders.SUPINE.halfLength + 1e-6);
    assert.equal(predicting.rendered.y, operator.y);
  }
  assert.equal(reconnect?.posture.current, 'SUPINE');
  assert.ok(predicting.stats.corrections > 0);
});

test('dive visuals choose heading variants and preserve the server landing even near the side boundary', () => {
  const animation = new TacticalAnimation();
  for (const [forward, strafe, clip] of [
    [1, 0, 'diveForward'], [-1, 0, 'diveBackward'], [0, -1, 'diveLeft'], [0, 1, 'diveRight'],
    [1, 1, 'diveForwardRight'], [-.03, 1, 'diveBackwardRight'], [1, -1, 'diveForwardLeft'], [-1, -1, 'diveBackwardLeft'],
  ] as const) {
    const posture = newPosture();
    applyPostureInput({ x: 0, y: 0, z: 0 }, posture, { ...idle(1), posture: 'dive', forward, strafe }, 1);
    animation.reset();
    animation.update(posture, 14, .05, { speed: 0, combat: 'ready' });
    assert.equal(animation.clip, clip);
    assert.equal(animation.supine > 0, forward < 0);
    assert.equal(animation.prone > 0, forward >= 0);
    if (strafe) assert.equal(Math.sign(animation.roll), -Math.sign(strafe));
  }
});

test('touchdown plays once on the existing clock and is interrupted by get-up or death', () => {
  const animation = new TacticalAnimation();
  const moving = { speed: .6, combat: 'aim' };
  for (const forward of [1, -1]) {
    const position = { x: 0, y: 0, z: 0 };
    const posture = newPosture();
    applyPostureInput(position, posture, { ...idle(1), posture: 'dive', forward }, 1);
    const touchdown = posture.until;
    const belly = forward > 0;
    animation.update(posture, touchdown - 1, .016, moving, true);
    assert.equal(animation.clip, belly ? 'diveForward' : 'diveBackward');
    advancePosture(position, posture, touchdown, movement);
    animation.update(posture, touchdown, .016, moving, true);
    assert.equal(animation.clip, belly ? 'proneLand' : 'supineLand');
    assert.equal(animation.progress, 0);
    assert.equal(animation.fallback, belly ? 'proneCrawl' : 'supineMove');
    animation.update(posture, touchdown + LANDING_TICKS, .016, moving);
    assert.equal(animation.clip, belly ? 'proneCrawl' : 'supineMove');
    assert.equal(animation.progress, undefined);
    const rising: PostureState = { ...posture, current: 'GETTING_UP', from: belly ? 'PRONE' : 'SUPINE', until: touchdown + 30 };
    animation.update(rising, touchdown + 2, .016, moving);
    assert.equal(animation.clip, belly ? 'proneGetUp' : 'supineGetUp');
    animation.update(undefined, touchdown + 3, .016, moving);
    assert.equal(animation.clip, undefined);
    assert.equal(animation.overlay, undefined);
  }
});

test('camera follows posture clocks, keeps a backward-dive bearing and converges independently of frame cadence', () => {
  const p = { x: 0, y: 0, z: 0 };
  const dive = newPosture();
  applyPostureInput(p, dive, { ...idle(1), forward: -1, posture: 'dive' }, 1);
  const fixed = new ThirdPersonCamera(), jittered = new ThirdPersonCamera();
  const yaw = 1.3, pitch = -.16;
  fixed.update(p, yaw, pitch, false, 0, 1 / 60);
  const bearing = fixed.camera.quaternion.clone();
  fixed.update(p, yaw, pitch, false, 0, 1 / 60, undefined, .4, movement.colliders.DIVING.lookHeight, cameraAnchorWeight(dive, 12));
  assert.ok(fixed.camera.quaternion.angleTo(bearing) < 1e-6);
  fixed.reset();
  const run = (camera: ThirdPersonCamera, samples: number[]) => {
    for (const dt of samples) camera.update(p, yaw, pitch, true, 0, dt, undefined, 0, movement.colliders.SUPINE.lookHeight, 1);
  };
  run(fixed, Array(60).fill(1 / 60));
  run(jittered, Array.from({ length: 120 }, (_, i) => i % 2 ? .011 : 1 / 60 - .011));
  assert.ok(fixed.camera.position.distanceTo(jittered.camera.position) < 1e-8);
  assert.ok(fixed.camera.position.y < 2);
  const rising: PostureState = { ...newPosture(), current: 'GETTING_UP', from: 'SUPINE', started: 10, until: 40 };
  assert.equal(cameraAnchorWeight(rising, 10), 1);
  assert.equal(cameraAnchorWeight(rising, 40), 0);
  assert.equal(cameraAnchorWeight({ ...rising, current: 'SUPINE' }, 35), 1);
  assert.ok(cameraAnchorWeight({ ...rising, current: 'CROUCHING' }, 35) > 0);
});

test('reduced motion suppresses positional and FOV effects and malformed options use safe defaults', () => {
  assert.deepEqual(normalizeCameraPreferences({ follow: -1, shake: null, sensitivity: 5, smoothing: .8 }, true),
    { follow: 1, shake: 1, sensitivity: 1, smoothing: .8, muzzleFlash: 1, reducedMotion: true });
  const preferences = { ...cameraPreferences };
  try {
    Object.assign(cameraPreferences, { reducedMotion: true, shake: 1 });
    const rig = new ThirdPersonCamera();
    const p = { x: 0, z: 0 };
    rig.update(p, 0, -.1, false, 0, .016);
    const before = rig.camera.position.clone();
    rig.blast(1);
    rig.update(p, 0, -.1, false, 1, .016);
    assert.equal(rig.camera.fov, 62);
    assert.ok(before.distanceTo(rig.camera.position) < 1e-8);
  } finally { Object.assign(cameraPreferences, preferences); }
});

test('rebinding detects a conflict, persists a replacement, and resets to defaults', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  const bindings = new Bindings(storage);
  assert.match(bindings.rebind('DIVE', 'KeyC') ?? '', /Ducken/);
  assert.match(bindings.rebind('DIVE', 'F2') ?? '', /reserviert/);
  assert.match(bindings.rebind('DIVE', 'Mouse99') ?? '', /reserviert/);
  assert.equal(bindings.rebind('DIVE', 'Mouse4'), undefined);
  const reloaded = new Bindings(storage);
  assert.equal(reloaded.code('DIVE'), 'Mouse4');
  reloaded.reset();
  assert.equal(new Bindings(storage).code('DIVE'), 'KeyX');
});

test('desktop controls isolate bindings, menu and focus loss from gameplay and expose bounded analog input', (t) => {
  const canvas = new EventTarget() as unknown as HTMLCanvasElement;
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, hidden: false });
  const originals = { window: Object.getOwnPropertyDescriptor(globalThis, 'window'), document: Object.getOwnPropertyDescriptor(globalThis, 'document') };
  for (const [key, value] of [['window', win], ['document', doc]] as const) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    setMenuInputContext('menu');
    liveBindings.reset();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let clears = 0, interactions = 0;
  const input = new DesktopInput(canvas, () => {}, () => {}, () => { clears++; }, () => { interactions++; }, () => {});
  const key = (code: string) => win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false }));
  key(DEFAULT_BINDINGS.DIVE);
  assert.equal(input.sample(1).posture, undefined);
  doc.pointerLockElement = canvas;
  setMenuInputContext('settings');
  key(DEFAULT_BINDINGS.INTERACT);
  assert.equal(interactions, 0);
  setMenuInputContext('rebinding');
  assert.equal(liveBindings.rebind('DIVE', 'KeyY'), undefined);
  key('KeyY');
  assert.equal(input.sample(2).posture, undefined);
  setMenuInputContext('menu');
  key('KeyY');
  key(DEFAULT_BINDINGS.MOVE_FORWARD);
  assert.equal(input.sample(3).posture, 'dive');
  assert.equal(input.sample(4).forward, 1);
  win.dispatchEvent(new Event('blur'));
  assert.equal(input.sample(5).forward, 0);
  assert.equal(clears, 1);
  doc.pointerLockElement = null;
  input.dispose();
  assert.deepEqual(analogMovement(.1, -.1), { forward: 0, strafe: 0 });
  assert.ok(analogMovement(.4, -.3).forward > 0);
  const diagonal = analogMovement(1, -1);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 1e-9);
});

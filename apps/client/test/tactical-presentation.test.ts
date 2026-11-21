import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWorld, groundHeight, missionGround, newPosture, postureCollider } from '@freefall/shared';
import type { MissionEvent, MissionSnapshot } from '@freefall/shared';
import { DamageFeedback } from '../src/game/DamageFeedback.ts';
import { MissionPresentation, PresentationNotices } from '../src/game/MissionPresentation.ts';
import { cameraPreferences } from '../src/rendering/CameraPreferences.ts';
import { ThirdPersonCamera, cameraAnchorWeight } from '../src/rendering/ThirdPersonCamera.ts';

const snapshot = (patch: Partial<MissionSnapshot> = {}): MissionSnapshot => ({
  tick: 100, missionId: 'test', instanceId: 'run-1', difficultyId: 'normal', state: 'ACTIVE_MISSION',
  operators: [], phase: 'DEPLOYED', phaseAt: 0, phaseUntil: 0, boardingUntil: 0, primaryObjectivesCompleted: false,
  convicts: [], resultUntil: 0, objectives: [], threat: 0, nests: [], alarms: [], groups: 0, activeNests: 0,
  activeBreaches: 0, breachCount: 0, nestsDestroyed: 0, debug: false, ...patch,
});

test('higher-priority notices preempt, keep their lifetime, and fit in one slot', () => {
  const notices = new PresentationNotices();
  notices.offer('Nachladen', 'information', 0);
  notices.offer('Extraktion läuft', 'extraction', 10);
  notices.offer('Schwarmnest zerstört', 'objective', 20);
  notices.offer('Vitalstatus kritisch', 'damage', 30, 600);
  notices.offer('Vitalstatus kritisch', 'damage', 80, 600);
  assert.equal(notices.current(200), 'Vitalstatus kritisch');
  assert.equal(notices.current(630), 'Extraktion läuft');
  assert.equal(notices.current(2610), 'Schwarmnest zerstört');
  assert.equal(notices.current(2620), '');
});

test('mission events reject duplicates, stale packets and prior instances while accepting fresh reordering', () => {
  const notices = new PresentationNotices();
  const presentation = new MissionPresentation(notices);
  presentation.snapshot(snapshot(), 0);
  const nest: MissionEvent = { type: 'SwarmNestDestroyed', tick: 105, instanceId: 'run-1', sequence: 5, nestId: 1 };
  assert.ok(presentation.event(nest, 105, 0));
  assert.equal(notices.current(10), 'Schwarmnest zerstört');
  assert.equal(presentation.event(nest, 106, 500), false);
  assert.ok(presentation.event({ ...nest, tick: 103, sequence: 3, nestId: 2 }, 106, 600));
  assert.equal(presentation.event({ ...nest, tick: 101, sequence: 1 }, 180, 700), false);
  presentation.reset();
  presentation.snapshot(snapshot({ tick: 120 }), 800);
  assert.equal(notices.current(800), '');
  assert.equal(presentation.event(nest, 120, 810), false);
  presentation.snapshot(snapshot({ instanceId: 'run-2', tick: 300 }), 820);
  assert.equal(presentation.event({ ...nest, tick: 301 }, 301, 830), false);
  assert.ok(presentation.event({ ...nest, tick: 301, instanceId: 'run-2' }, 301, 830));
});

test('both extraction methods read authoritative phases; reconnect only restores the persistent state', () => {
  for (const method of ['albatross', 'balloon'] as const) {
    const notices = new PresentationNotices();
    const presentation = new MissionPresentation(notices);
    presentation.snapshot(snapshot(), 0);
    presentation.snapshot(snapshot({ tick: 101, state: 'EXTRACTION_AVAILABLE' }), 10);
    assert.equal(notices.current(10), 'Extraktion verfügbar');
    const lift = snapshot({ tick: 105, state: 'EXTRACTION_IN_PROGRESS', extraction: {
      method, phase: 'LIFT', startedAt: 102, phaseAt: 104, endsAt: 120, securedIds: ['local'], radius: 5, x: 0, z: 0,
    } });
    presentation.snapshot(lift, 2700);
    assert.match(notices.current(2700), /Abflug/);
    presentation.reset();
    presentation.snapshot(lift, 2800);
    assert.equal(notices.current(2800), '');
    assert.equal(presentation.event({ type: 'ExtractionStarted', method, tick: 104, arrivalAt: 120 }, 105, 2810), false);
  }
});

test('damage directions use camera-relative cardinal bearings, cap simultaneous hits and expire', () => {
  const feedback = new DamageFeedback();
  const indicators = Array.from({ length: 3 }, () => ({ hidden: true, style: { transform: '', opacity: '' } }));
  const element = { children: indicators } as unknown as HTMLElement;
  feedback.add(undefined, 0);
  feedback.add({ x: 0, z: 0 }, 0);
  feedback.draw(element, 0, 0);
  assert.ok(indicators.every(({ hidden }) => hidden));
  feedback.add({ x: 0, z: -1 }, 10);
  feedback.add({ x: 1, z: 0 }, 11);
  feedback.add({ x: 0, z: 1 }, 12);
  feedback.draw(element, 0, 13);
  assert.equal(indicators[0].style.transform, 'rotate(0rad)');
  assert.equal(indicators[1].style.transform, `rotate(${Math.PI / 2}rad)`);
  assert.ok(indicators.every(({ hidden }) => !hidden));
  feedback.add({ x: -1, z: 0 }, 14);
  feedback.draw(element, -Math.PI / 2, 15);
  assert.equal(indicators[0].style.transform, 'rotate(0rad)');
  feedback.draw(element, 0, 640);
  assert.ok(indicators.every(({ hidden }) => hidden));
});

test('aiming suppresses cosmetic positional motion and priority keeps weaker cues from extending damage', () => {
  const preferences = { ...cameraPreferences };
  const calm = new ThirdPersonCamera(), reacting = new ThirdPersonCamera(), stacked = new ThirdPersonCamera();
  const position = { x: 0, z: 0 };
  try {
    Object.assign(cameraPreferences, { shake: 1, reducedMotion: false });
    reacting.impulse('damage', .4);
    stacked.impulse('damage', .4);
    for (let i = 0; i < 20; i++) stacked.impulse('mission', 1);
    for (const rig of [calm, reacting, stacked]) rig.update(position, 0, -.1, true, 0, 1 / 60);
    assert.deepEqual(calm.camera.position.toArray(), reacting.camera.position.toArray());
    for (const rig of [calm, reacting, stacked]) rig.update(position, 0, -.1, false, 0, 1 / 60);
    assert.ok(calm.camera.position.distanceTo(reacting.camera.position) > 0);
    assert.deepEqual(stacked.camera.position.toArray(), reacting.camera.position.toArray());
    reacting.clearImpulse();
    reacting.update(position, 0, -.1, false, 0, 1 / 60);
    calm.update(position, 0, -.1, false, 0, 1 / 60);
    assert.deepEqual(reacting.camera.position.toArray(), calm.camera.position.toArray());
  } finally { Object.assign(cameraPreferences, preferences); }
});

test('low postures and steep pitch keep the camera above generated terrain on every planet', () => {
  for (const planet of ['ice', 'desert', 'green-plains', 'forest']) {
    const generated = generateWorld(planet, 76)!;
    const world = missionGround(generated.world);
    const rig = new ThirdPersonCamera();
    const points = [world.deployment, ...generated.relays, ...generated.balloonSites, ...world.patrolRegions.slice(0, 5).map((region) => region.route.waypoints[0])];
    for (const point of points) {
      const floor = groundHeight(world, point.x, point.z);
      for (const current of ['STANDING', 'CROUCHING', 'DIVING', 'PRONE', 'SUPINE', 'GETTING_UP'] as const) {
        const posture = { ...newPosture(), current, started: 0, until: 25, from: 'SUPINE' as const };
        const height = postureCollider(posture, 10).lookHeight;
        for (let i = 0; i < 8; i++) {
          rig.update(point, i * Math.PI / 4, .69, true, 0, 1 / 60, world, floor, height, cameraAnchorWeight(posture, 10));
          const camera = rig.camera.position;
          assert.ok(camera.y - groundHeight(world, camera.x, camera.z) >= .189,
            `${planet}/${current} terrain clearance at ${point.x},${point.z}`);
        }
      }
    }
  }
});

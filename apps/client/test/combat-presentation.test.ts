import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { NET, newPosture, postureCollider } from '@freefall/shared';
import type { ExplosionEvent, ImpactSurface, MeleeEvent, PlayersSnapshot, PostureState } from '@freefall/shared';
import { CombatPresentation } from '../src/networking/CombatPresentation.ts';
import { cameraPreferences } from '../src/rendering/CameraPreferences.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';
import { ThirdPersonCamera, cameraAnchorWeight } from '../src/rendering/ThirdPersonCamera.ts';
import { GrenadeView, explosionSurface } from '../src/rendering/weapons/GrenadeView.ts';
import { VisualEffectsManager } from '../src/rendering/VisualEffectsManager.ts';

const blast: ExplosionEvent = { type: 'blast', id: 1, tick: 100, x: 0, y: .09, z: -9, radius: 10.5,
  contact: { surface: 'forest-floor', normal: [0, 1, 0] } };
const melee: MeleeEvent = { type: 'melee', tick: 103, attacker: 'a', x: 0, z: -1, yaw: 0, enemy: 1, damage: 10,
  eliminated: false, staggered: true, contact: { x: 0, y: .55, z: -2 } };

test('reconnect rejects unseen historical shots, blasts and damage while a later swing still plays', () => {
  const history = new CombatPresentation();
  const shot = { shooter: 'a', tick: 119, fromX: 0, fromY: 1, fromZ: 0, toX: 0, toY: 1, toZ: -6,
    enemy: 1, eliminated: false };
  const damage = { type: 'enemy-hit', tick: 120, attack: 'first', enemy: 1, target: 'a', life: 1, amount: 5 } as const;
  history.snapshot(100);
  history.suspend(105);
  history.snapshot(120);
  history.fence(120);
  assert.equal(history.shot(shot), false);
  assert.equal(history.accept({ ...blast, tick: 120 }, 120), false);
  assert.equal(history.accept(damage, 120), false);
  assert.ok(history.shot({ ...shot, tick: 121 }));
  assert.equal(history.shot({ ...shot, tick: 121 }), false);
  assert.ok(history.accept({ ...melee, tick: 122 }, 123));
  assert.ok(history.accept({ ...damage, tick: 121 }, 123));
  assert.equal(history.accept({ ...damage, tick: 121 }, 123), false);
});

test('a full feedback window retains original identities without crowding out confirmed action cues', () => {
  const history = new CombatPresentation();
  const first = { type: 'enemy-hit', tick: 100, attack: 'first', enemy: 1, target: 'a', life: 1, amount: 5 } as const;
  assert.ok(history.accept(first, 100));
  for (let index = 1; index < 48 * (NET.tickHz + 1); index++) {
    const tick = first.tick + Math.floor(index / 48);
    assert.ok(history.accept({ ...first, tick, attack: String(index) }, tick));
  }
  assert.equal(history.accept(first, 100 + NET.tickHz), false);
  assert.ok(history.accept({ ...blast, tick: 120 }, 130));
  assert.ok(history.accept({ ...first, tick: 131, attack: 'new-window' }, 131));
});

test('out-of-order detonations supersede queued and late throw cues for the same grenade', () => {
  const history = new CombatPresentation();
  const release = { type: 'grenade-release', tick: 97, id: blast.id, owner: 'a', x: 1, y: 1, z: 1 } as const;
  assert.ok(history.accept(release, 97));
  history.queue(release, 1000);
  assert.ok(history.accept(blast, 100));
  history.draw(100, 1100, () => assert.fail('throw audio played after detonation'));
  assert.ok(history.accept({ ...blast, id: 2 }, 100));
  assert.equal(history.accept({ ...release, id: 2 }, 100), false);
});

test('authoritative actions deduplicate every channel across jitter, bursts and reconnect fences', () => {
  const history = new CombatPresentation();
  assert.ok(history.accept(melee, 103));
  assert.ok(history.accept(blast, 104), 'an unseen older event within the window may arrive out of order');
  assert.equal(history.accept({ ...blast, tick: 101 }, 104), false);
  assert.equal(history.accept(melee, 104), false);
  assert.equal(history.duplicates, 2);
  history.queue(melee, 1000);
  const drawn: MeleeEvent[] = [];
  history.draw(102, 1050, (event) => { if (event.type === 'melee') drawn.push(event); });
  assert.equal(drawn.length, 0);
  history.draw(103, 1070, (event) => { if (event.type === 'melee') drawn.push(event); });
  assert.deepEqual(drawn, [melee]);
  history.queue({ ...melee, tick: 104 }, 1080);
  history.fence(106);
  history.draw(106, 1100, () => assert.fail('old queued event survived the fence'));
  assert.equal(history.accept({ ...blast, id: 2, tick: 105 }, 106), false);
  assert.equal(history.accept({ ...blast, id: 3, tick: 110 }, 110), true);
  history.clear();
  assert.ok(history.accept(blast, 100), 'another room can reuse its grenade serials');
});

test('snapshots interpolate a single canister from release and never start a blast', () => {
  const scene = new T.Scene();
  const view = new GrenadeView(scene);
  const camera = new T.PerspectiveCamera();
  const before: PlayersSnapshot = { tick: 8, host: 'a', players: [] };
  const after: PlayersSnapshot = { ...before, tick: 12, grenades: [
    { id: 1, x: 0, y: 2, z: -6, detonates: 100, release: { tick: 10, x: 0, y: 1, z: -4 } },
  ] };
  view.draw(before, after, .25, 12, camera, 0, 1, false, 0, 0);
  assert.equal(view.metrics().grenades, 0);
  view.draw(before, after, .75, 12, camera, 10, 1, false, 0, 0);
  assert.equal(view.metrics().grenades, 1);
  const canisters = scene.children[0] as T.InstancedMesh;
  const matrix = new T.Matrix4();
  canisters.getMatrixAt(0, matrix);
  const position = new T.Vector3().setFromMatrixPosition(matrix);
  assert.deepEqual(position.toArray(), [0, 1.5, -5]);
  view.draw(after, after, 0, 100, camera, 50, 1, false, 0, 0);
  assert.equal(view.metrics().grenades, 0);
  assert.equal(view.metrics().blasts, 0);
  view.explode(blast, 60, camera);
  view.draw(after, after, 0, 99, camera, 65, 1, false, 0, 0);
  assert.equal(view.metrics().grenades, 0);
  assert.equal(view.metrics().blasts, 1);
  view.fence(100);
  view.draw(after, after, 0, 99, camera, 70, 1, false, 0, 0);
  assert.equal(view.metrics().blasts, 0);
  assert.equal(view.metrics().grenades, 0);
  const fresh = { ...after, tick: 110, grenades: [{ id: 2, x: 2, y: 1, z: 4, detonates: 130 }] };
  view.draw(after, fresh, 0, 110, camera, 75, 1, false, 0, 0);
  assert.equal(view.metrics().grenades, 1);
});

test('pooled core, soil, smoke and lights obey quality, accessibility and cleanup', () => {
  const scene = new T.Scene();
  const view = new GrenadeView(scene);
  const camera = new T.PerspectiveCamera();
  const draw = (now: number, flash = 1, reduced = false) => view.draw(undefined, undefined, 0, now, camera, now, flash, reduced, 2, -1);
  const surfaces: ImpactSurface[] = ['snow', 'ice', 'sand', 'dirt', 'grass', 'forest-floor', 'rock', 'metal'];
  assert.equal(new Set(surfaces.map((surface) => explosionSurface(surface).dust.getHex())).size, surfaces.length);
  assert.equal(explosionSurface('invalid' as ImpactSurface), explosionSurface());
  for (const quality of Object.values(GRAPHICS_QUALITY)) {
    view.setQuality(quality);
    for (let i = 0; i < 28; i++) view.explode({ ...blast, id: i + 1 }, 100, camera);
    draw(110);
    const sample = view.metrics();
    assert.equal(sample.blasts, quality.explosionSlots);
    assert.equal(sample.smoke, sample.blasts * quality.explosionSmoke);
    assert.equal(sample.dust, sample.blasts * quality.explosionDust);
    assert.equal(sample.lights, Number(quality.explosionLight > 0));
    draw(120, 0, true);
    assert.equal(view.metrics().lights, 0);
    assert.ok(view.metrics().debris <= sample.debris);
    draw(330);
    assert.equal(view.metrics().lights, 0);
    draw(1800);
    assert.equal(view.metrics().blasts, 0);
    assert.equal(view.metrics().smoke, 0);
    assert.equal(view.metrics().debris, 0);
  }
  assert.equal(scene.children.length, 5, 'world object count stays constant when pools are reused');
  view.clear();
  assert.equal(view.metrics().last, undefined);
});

test('melee shares the impact pool and never emits a tracer or protected-target hit', () => {
  const effects = new VisualEffectsManager(new T.Scene(), [{ geometry: new T.BoxGeometry(), material: new T.MeshBasicMaterial() }]);
  const camera = new T.PerspectiveCamera();
  effects.melee({ ...melee, damage: 0 }, 10, camera, true);
  effects.draw(20, camera);
  assert.equal(effects.metrics().particles, 0);
  effects.melee(melee, 30, camera, true);
  effects.draw(40, camera);
  assert.ok(effects.metrics().particles > 0);
  assert.equal(effects.metrics().tracers, 0);
  effects.draw(300, camera);
  assert.equal(effects.metrics().particles, 0);
});

test('camera impulses are bounded by posture and accessibility, independent of weapon FOV kick', () => {
  const preferences = { ...cameraPreferences };
  const position = { x: 0, z: 0 };
  try {
    Object.assign(cameraPreferences, { shake: 1, reducedMotion: false });
    for (const current of ['STANDING', 'CROUCHING', 'PRONE', 'SUPINE', 'GETTING_UP'] as const) {
      const posture: PostureState = { ...newPosture(0), current, from: 'SUPINE', started: 0, until: 20 };
      const height = postureCollider(posture, 10).lookHeight;
      const tilt = cameraAnchorWeight(posture, 10);
      const calm = new ThirdPersonCamera(), moving = new ThirdPersonCamera();
      const update = (rig: ThirdPersonCamera) => rig.update(position, 0, -.18, false, 0, 1 / 60, undefined, 0, height, tilt);
      for (let i = 0; i < 36; i++) { update(calm); update(moving); }
      calm.fire();
      moving.fire();
      for (let i = 0; i < 24; i++) moving.blast(.8);
      update(calm);
      update(moving);
      const displacement = moving.camera.position.distanceTo(calm.camera.position);
      assert.ok(displacement > 0 && displacement <= .06);
      assert.ok(moving.camera.position.y >= .16);
      assert.equal(moving.camera.fov, calm.camera.fov);
      cameraPreferences.shake = 0;
      update(calm);
      update(moving);
      assert.equal(moving.camera.position.distanceTo(calm.camera.position), 0);
      cameraPreferences.shake = 1;
    }
  } finally { Object.assign(cameraPreferences, preferences); }
});

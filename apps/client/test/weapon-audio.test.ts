import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BALANCE, newPosture } from '@freefall/shared';
import type { PlayerState, ReloadState } from '@freefall/shared';
import { AudioAssets } from '../src/audio/AudioAssets.ts';
import { AudioEngine } from '../src/audio/AudioEngine.ts';
import { WeaponAudio, weaponHandlingCue } from '../src/audio/WeaponAudio.ts';
import { WEAPON_ASSET_IDS, WEAPON_RECORDINGS } from '../src/audio/WeaponAudioCatalog.ts';

test('each registered operator weapon has an auditable sample bank within the sustained-fire budget', () => {
  const read = (file: string) => JSON.parse(readFileSync(new URL('../../../docs/' + file, import.meta.url), 'utf8'));
  const masters = (read('audio-masters.json') as {
    id: string; category?: string; seconds: number; peakDbfs: number; layers?: { source: string }[];
  }[]).filter(({ category }) => category === 'weapon');
  assert.deepEqual(masters.map(({ id }) => id).sort(), [...WEAPON_ASSET_IDS].sort());
  const sources = read('audio-sources.json');
  for (const { id, layers, peakDbfs } of masters) {
    assert.ok(layers?.length, id);
    assert.ok(peakDbfs <= -6, id);
    for (const { source } of layers) {
      assert.equal(sources[source].license, 'CC0 1.0', source);
      assert.match(sources[source].sha256, /^[a-f0-9]{64}$/i);
    }
  }
  for (const weapon of BALANCE.weapons.values()) {
    const bank = WEAPON_RECORDINGS[weapon.sounds.fire];
    const maxDuration = Math.max(...[...bank.near, bank.distant].map((id) => masters.find((asset) => asset.id === id)!.seconds));
    assert.ok(maxDuration / (.98 * (bank.pitch ?? 1)) + .115 + .025 < 4 / weapon.roundsPerSecond, weapon.id);
    assert.notEqual(bank.near[0], bank.near[1]);
  }
});

function makeAudioProbe(load = true) {
  const engine = new AudioEngine();
  engine.settings.enabled = true;
  const created: { file: string; at: number }[] = [];
  let stopped = 0;
  const param = () => ({ value: 0 });
  const node = () => ({
    gain: param(), pan: param(), frequency: param(), Q: param(),
    connect: (destination: unknown) => destination, disconnect() {},
  });
  const context = {
    currentTime: 0, state: 'running',
    createGain: node, createStereoPanner: node, createBiquadFilter: node,
    createBufferSource: () => ({
      ...node(), playbackRate: param(), buffer: undefined as { id: string } | undefined,
      start(at: number) { created.push({ file: this.buffer!.id, at }); },
      stop() { stopped++; },
    }),
  };
  engine.context = context as unknown as AudioContext;
  engine.bus = () => node() as unknown as AudioNode;
  engine.assets.get = (id) => load ? { id, duration: id.endsWith('distant') ? .24 : .226 } as unknown as AudioBuffer : undefined;
  engine.preload = () => {};
  return { engine, context, weapons: new WeaponAudio(engine), created, stopped: () => stopped };
}

test('four rifles submit 80 one-shots to bounded audio voices, with near variations and a spatial distant sample', () => {
  const { engine, context, weapons, created, stopped } = makeAudioProbe();
  const listener = { x: 0, y: 1, z: 0, yaw: 0 };
  for (let i = 0; i < 20; i++) {
    context.currentTime = i / 10;
    for (const [shooter, x] of [[0, 0], [1, 8], [2, 45], [3, 100]] as const) {
      assert.equal(weapons.shot('rifle', String(shooter), { ...listener, x }, listener, shooter === 0), true);
    }
  }
  assert.equal(weapons.metrics().own, 20);
  assert.equal(weapons.metrics().remote, 60);
  assert.equal(engine.droppedVoices, 0);
  assert.ok(engine.peakVoices <= 16);
  assert.ok(created.some(({ file, at }) => file === 'kestrel-shot-distant' && Math.abs(at - .120) < .0001));
  assert.ok(WEAPON_RECORDINGS.rifle.near.every((id) => created.some(({ file }) => file === id)));
  assert.equal(weapons.shot('pistol', 'pistol', { ...listener, x: 200 }, listener, false), false);
  assert.equal(weapons.shot('pistol', 'pistol', listener, listener, true), true);
  assert.ok(created.at(-1)?.file.startsWith('p01-shot-'));
  weapons.clearTransient();
  assert.equal(engine.activeVoices, 0);
  assert.equal(stopped(), created.length);
});

test('missing or suspended samples never schedule a fallback or a deferred ghost shot', () => {
  const { context, weapons, created } = makeAudioProbe(false);
  const listener = { x: 0, z: 0, yaw: 0 };
  assert.equal(weapons.shot('pistol', 'owner', listener, listener, true), false);
  assert.equal(weapons.metrics().unavailable, 1);
  context.state = 'suspended';
  assert.equal(weapons.shot('rifle', 'owner', listener, listener, true), false);
  assert.equal(weapons.metrics().unavailable, 1);
  assert.deepEqual(created, []);
});

test('environment decoding cannot evict retained weapon PCM and cleanup still clears the shared cache', async (t) => {
  const assets = new AudioAssets();
  assets.retain(['weapon']);
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const size = input.includes('/weapon.') ? 1 : 52;
    return new Response(new Uint8Array([size]));
  });
  const context = {
    decodeAudioData: async (data: ArrayBuffer) => ({
      numberOfChannels: 1, length: new Uint8Array(data)[0] * 1024 * 1024 / 4,
    }),
  } as unknown as AudioContext;
  await assets.load(context, 'weapon');
  await assets.load(context, 'forest');
  await assets.load(context, 'plains');
  assert.ok(assets.get('weapon'));
  assert.ok(assets.get('plains'));
  assert.equal(assets.get('forest'), undefined);
  assert.equal(assets.metrics().pcmMiB, 53);
  assets.close();
  assert.equal(assets.metrics().pcmMiB, 0);
});

const reload: ReloadState = { phase: 'RELOAD_START', slot: 'primary', started: 20, removalAt: 33, insertAt: 65, until: 83, at: 20 };
const player: PlayerState = { id: 'owner', slot: 0, life: 1, x: 0, z: 0, yaw: 0, hp: 100, ack: 20, respawnTick: 0, kills: 0 };
const packet = (phase: ReloadState['phase'], at: number, posture = newPosture()): PlayerState =>
  ({ ...player, posture, reload: { ...reload, phase, at } });

test('handling accepts exact server phases on the ground and rejects interrupted, stale and invalid-life transitions', () => {
  for (const current of ['STANDING', 'CROUCHING', 'PRONE', 'SUPINE'] as const) {
    const posture = { ...newPosture(), current };
    assert.deepEqual(weaponHandlingCue(packet('MAGAZINE_REMOVAL', 33, posture), player, 32, 34), { action: 'remove', slot: 'primary' });
    assert.deepEqual(weaponHandlingCue(packet('RELOAD_COMPLETE', 66, posture), player, 64, 66), { action: 'insert', slot: 'primary' });
  }
  for (const current of ['DIVING', 'GETTING_UP'] as const) {
    assert.equal(weaponHandlingCue(packet('MAGAZINE_REMOVAL', 33, { ...newPosture(), current }), player, 32, 33), undefined);
  }
  const ready = {
    ...player, reloadUntil: 0,
    equipment: { slot: 'primary', inactiveAmmo: 12, magazines: { primary: 6, secondary: 4 }, grenades: 2, stims: 5,
      started: 0, until: 0, stimResultAt: 0, meleeReadyAt: 0 },
  } satisfies PlayerState;
  assert.deepEqual(weaponHandlingCue(ready, packet('RELOAD_COMPLETE', 66), 82, 83), { action: 'finish', slot: 'primary' });
  const switching = { ...ready, equipment: { ...ready.equipment, action: 'secondary' as const, started: 83, until: 98 } };
  assert.deepEqual(weaponHandlingCue(switching, player, 82, 84), { action: 'switch', slot: 'secondary' });
  assert.equal(weaponHandlingCue(packet('RELOAD_INTERRUPTED', 64), player, 63, 65), undefined);
  assert.equal(weaponHandlingCue({ ...ready, reload: { ...reload, phase: 'READY', at: 80 } }, packet('RELOAD_COMPLETE', 66), 79, 80), undefined);
  assert.equal(weaponHandlingCue(packet('MAGAZINE_REMOVAL', 33), player, 31, 38), undefined);
  assert.equal(weaponHandlingCue({ ...packet('MAGAZINE_REMOVAL', 33), life: 2 }, player, 32, 33), undefined);
});

test('a fresh snapshot or duplicate cannot replay handling sounds after reconnect', () => {
  const { weapons, created } = makeAudioProbe();
  const listener = { x: 0, z: 0, yaw: 0 };
  const handle = (tick: number, phase: ReloadState['phase'], ready = true) =>
    weapons.handling({ tick, host: 'owner', players: [packet(phase, tick)] }, listener, 'owner', true, ready);
  handle(32, 'RELOAD_START', false);
  handle(33, 'MAGAZINE_REMOVAL');
  handle(33, 'MAGAZINE_REMOVAL');
  handle(32, 'RELOAD_START');
  assert.deepEqual(created.map(({ file }) => file), ['kestrel-mag-out']);
  weapons.clearTransient();
  handle(66, 'RELOAD_COMPLETE');
  handle(67, 'RELOAD_COMPLETE');
  assert.deepEqual(created.map(({ file }) => file), ['kestrel-mag-out']);
});

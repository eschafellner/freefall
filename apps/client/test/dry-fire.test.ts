import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayerState, WeaponSlot } from '@freefall/shared';
import { AudioEngine } from '../src/audio/AudioEngine.ts';
import { WeaponAudio } from '../src/audio/WeaponAudio.ts';
import { DryTrigger, emptyWeaponHint, weaponEmpty } from '../src/game/DryFire.ts';
import { Bindings } from '../src/input/Bindings.ts';

function operator(slot: WeaponSlot, ammo: number, mags: number, other = { ammo: 12, mags: 4 }): PlayerState {
  return {
    id: 'p', slot: 0, x: 0, z: 0, hp: 100, yaw: 0, life: 1, ack: 0, respawnTick: 0, kills: 0, ammo,
    equipment: {
      slot, inactiveAmmo: other.ammo,
      magazines: slot === 'primary' ? { primary: mags, secondary: other.mags } : { primary: other.mags, secondary: mags },
    },
  } as unknown as PlayerState;
}

test('one click per trigger pull on an empty weapon', () => {
  const trigger = new DryTrigger();
  assert.equal(trigger.update(true, true, true), true);
  for (let i = 0; i < 30; i++) assert.equal(trigger.update(true, true, true), false, 'holding does not repeat');
  assert.equal(trigger.update(false, true, true), false);
  assert.equal(trigger.update(true, true, true), true, 'a new pull clicks again');
});

test('running dry while holding clicks once the next shot would be due', () => {
  const trigger = new DryTrigger();
  assert.equal(trigger.update(true, false, true), false, 'rounds left: the shot fires instead');
  assert.equal(trigger.update(true, true, false), false, 'fire interval not elapsed yet');
  assert.equal(trigger.update(true, true, true), true);
  assert.equal(trigger.update(true, true, true), false);
});

test('blocked pulls stay silent and a pull held through the block clicks once afterwards', () => {
  const trigger = new DryTrigger();
  // Reload, weapon switch, blocked posture or no combat: Game passes pull=false.
  for (let i = 0; i < 5; i++) assert.equal(trigger.update(false, true, true), false);
  assert.equal(trigger.update(true, true, true), true);
});

test('an empty magazine with reserve is not dry: the server reloads automatically', () => {
  assert.equal(weaponEmpty(operator('primary', 0, 2), 0), false);
  assert.equal(weaponEmpty(operator('primary', 0, 0), 0), true);
  assert.equal(weaponEmpty(operator('primary', 3, 0), 3), false);
  // Unconfirmed predicted shots already emptied the magazine.
  assert.equal(weaponEmpty(operator('primary', 3, 0), 0), true);
  assert.equal(weaponEmpty({ ...operator('primary', 0, 0), equipment: undefined } as PlayerState, 0), false);
});

test('HUD hint names the switch key, also after rebinding, or points to resupply', () => {
  const keys = new Bindings();
  const label = (action: Parameters<Bindings['label']>[0]) => keys.label(action);
  assert.equal(emptyWeaponHint(operator('primary', 4, 0), label, true), undefined);
  assert.deepEqual(emptyWeaponHint(operator('primary', 0, 0), label, true), { key: '2', text: 'Wechseln' });
  assert.deepEqual(emptyWeaponHint(operator('secondary', 0, 0, { ammo: 0, mags: 3 }), label, true), { key: '1', text: 'Wechseln' });
  assert.equal(keys.rebind('SWITCH_SECONDARY', 'KeyQ'), undefined);
  assert.deepEqual(emptyWeaponHint(operator('primary', 0, 0), label, true), { key: 'Q', text: 'Wechseln' });
  assert.deepEqual(emptyWeaponHint(operator('primary', 0, 0, { ammo: 0, mags: 0 }), label, true), { text: 'Nachschub am Albatross' });
  assert.deepEqual(emptyWeaponHint(operator('primary', 0, 0, { ammo: 0, mags: 0 }), label, false), { text: 'Keine Munition übrig' });
});

test('dry-fire cue is synthesised on the weapon bus without recordings and respects a muted engine', () => {
  const engine = new AudioEngine();
  engine.settings.enabled = true;
  let started = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain: param(), pan: param(), frequency: param(), Q: param(), type: '',
    connect: (destination: unknown) => destination, disconnect() {} });
  const source = () => ({ ...node(), buffer: undefined as unknown, loop: false, onended: null as unknown,
    start() { started++; }, stop() {} });
  engine.context = { currentTime: 0, state: 'running', createGain: node, createStereoPanner: node, createBiquadFilter: node,
    createBufferSource: source, createOscillator: source, createWaveShaper: node } as unknown as AudioContext;
  engine.bus = () => node() as unknown as AudioNode;
  Object.defineProperty(engine, 'noiseBuffer', { get: () => ({ duration: 1 }) });
  const assets: string[] = [];
  engine.assets.get = (id) => { assets.push(id); return undefined; };
  engine.preload = () => {};
  const weapons = new WeaponAudio(engine);
  const listener = { x: 0, z: 0, yaw: 0 };
  assert.equal(weapons.dryFire('primary', 'p', listener), true);
  assert.equal(weapons.dryFire('secondary', 'p', listener), true);
  assert.equal(started, 6, 'two noise layers and one ring per click');
  assert.deepEqual(assets, [], 'no sample lookups');
  assert.equal(weapons.metrics().dry, 2);
  engine.settings.enabled = false;
  assert.equal(weapons.dryFire('primary', 'p', listener), false);
  assert.equal(weapons.metrics().dry, 2);
});

/**
 * Milestone 8.1A: VX-13 Cerberus (Kaliber 13, Einzelpatronen-Nachladen, Schrot) und frei wählbares Loadout.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BODENBRUCH, CAMERA_SHOULDER, CARRIER_WORLD, STANDARD_LOADOUT, createBalanceRegistry, presetSelection,
  resolveSelection, shotRays, validateLoadoutSelection,
} from '@freefall/shared';
import type { BalanceRegistry, LoadoutSelection, PlayerInput, WorldDefinition } from '@freefall/shared';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';

const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };
const CERBERUS: LoadoutSelection = { ...STANDARD_LOADOUT, primaryWeaponId: 'vx-13' };

class Range extends Battlefield {
  constructor(registry: BalanceRegistry = BALANCE) { super(7, open, registry); }
}

function setup(selection = CERBERUS, registry?: BalanceRegistry) {
  const field = new Range(registry);
  const player: SimPlayer = field.addPlayer('a');
  Object.assign(player, { x: 0, z: 0, protectedUntil: 0 });
  assert.equal(field.setLoadout('a', selection), undefined);
  let seq = 0;
  const drive = (extra: Partial<PlayerInput> = {}, ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      field.receiveInput('a', { ...idle, seq: ++seq, ...(extra.equipment ? { life: player.life } : {}), ...extra });
      field.step();
    }
  };
  return { field, player, drive };
}

test('VX-13 Cerberus: Kaliber 13, 9 im Röhrenmagazin + 1 im Lauf, 80 Patronen Reserve, 12 Schrotkugeln à 18', () => {
  const loadout = resolveSelection(BALANCE, CERBERUS);
  const shotgun = loadout.weapons.primary;
  assert.equal(shotgun.displayName, 'VX-13 Cerberus');
  assert.equal(shotgun.caliber.id, 'caliber.13g');
  assert.equal(shotgun.magazineSize, 9);
  assert.equal(shotgun.feed.type, 'single');
  assert.equal(shotgun.feed.chamberRounds, 1);
  assert.equal(shotgun.capacity, 10);
  assert.equal(shotgun.reserve, 80);
  assert.equal(shotgun.projectile.projectilesPerShot, 12);
  assert.equal(shotgun.projectile.damage, 18);
  assert.ok(shotgun.projectile.pelletSpread > 0);
  // The standard loadout keeps its values; magazine weapons have no chamber round.
  const standard = resolveSelection(BALANCE, STANDARD_LOADOUT);
  assert.equal(standard.weapons.primary.capacity, 45);
  assert.equal(standard.weapons.secondary.capacity, 12);
});

test('a shotgun shot traces every pellet, deals damage per pellet and counts as one shot', () => {
  const { field, player, drive } = setup();
  assert.equal(player.ammo, 10);
  const enemy = field.horde.spawn(CAMERA_SHOULDER, -6, 0);
  field.horde.hp[enemy] = 1000;
  drive({ fire: true, pitch: -.16 });
  assert.equal(field.shots.length, 1);
  const shot = field.shots[0];
  assert.equal(shot.pellets?.length, 11);
  assert.equal(shotRays(shot).length, 12);
  const hits = shotRays(shot).filter((ray) => ray.enemy === field.horde.id[enemy]).length;
  assert.ok(hits >= 9, `nur ${hits} Kugeln getroffen`);
  assert.ok(Math.abs(1000 - field.horde.hp[enemy] - hits * 18) < 1e-6);
  assert.equal(field.stats.data.shots.primary, 1);
  assert.equal(field.stats.data.hits.primary, 1);
  assert.equal(player.ammo, 9);
});

test('single-round reload inserts one round per cycle until full and never exceeds 9 + 1', () => {
  const { player, drive } = setup();
  const shotgun = player.loadout.weapons.primary;
  player.ammo = 7;
  drive({ reload: true });
  assert.equal(player.reload.phase, 'RELOAD_START');
  let inserted = 0;
  const phase = () => player.reload.phase as string;
  for (let i = 0; i < 200 && phase() !== 'READY'; i++) {
    const before = player.ammo;
    drive();
    if (player.ammo > before) inserted++;
  }
  assert.equal(inserted, 3);
  assert.equal(player.ammo, shotgun.capacity);
  assert.equal(player.equipment.magazines.primary, 77);
  drive({ reload: true });
  assert.equal(player.reload.phase, 'READY', 'voll: kein weiteres Nachladen');
});

test('an empty shotgun chambers the first round (longer cycle), then loads the tube', () => {
  const { player, drive } = setup();
  const shotgun = player.loadout.weapons.primary;
  assert.equal(shotgun.feed.type, 'single');
  if (shotgun.feed.type !== 'single') return;
  player.ammo = 0;
  drive({ reload: true });
  drive({}, shotgun.feed.startTicks);
  assert.equal(player.reload.phase, 'SHELL_LOADING');
  assert.equal(player.reload.until - player.reload.started, shotgun.feed.chamberTicks);
  while (player.ammo === 0) drive();
  while ((player.reload.phase as string) === 'SHELL_INSERTION') drive();
  assert.equal(player.reload.until - player.reload.started, shotgun.reloadTicks);
});

test('a new fire press ends the reload between rounds and keeps every inserted round', () => {
  const { field, player, drive } = setup();
  player.ammo = 5;
  drive({ reload: true });
  while (player.ammo === 5) drive();
  assert.equal(player.ammo, 6);
  player.fireAt = 0;
  drive({ fire: true, pitch: -.12 });
  assert.equal(player.reload.phase, 'READY');
  assert.equal(field.shots.length, 1);
  assert.equal(player.ammo, 5);
  assert.equal(player.equipment.magazines.primary, 79);
});

test('holding fire on an empty shotgun keeps reloading until the trigger is pressed again', () => {
  const { field, player, drive } = setup();
  player.ammo = 0;
  drive({ fire: true });
  assert.notEqual(player.reload.phase, 'READY');
  for (let i = 0; i < 60; i++) drive({ fire: true });
  assert.ok(player.ammo >= 2, String(player.ammo));
  assert.equal(field.shots.length, 0);
  drive();
  player.fireAt = 0;
  drive({ fire: true, pitch: -.12 });
  assert.equal(field.shots.length, 1);
});

test('switching weapons interrupts a single-round reload without losing loaded rounds', () => {
  const { player, drive } = setup();
  player.ammo = 3;
  drive({ reload: true });
  while (player.ammo === 3) drive();
  drive({ equipment: 'secondary' });
  assert.ok(player.reload.phase === 'READY' || player.reload.phase === 'RELOAD_INTERRUPTED');
  assert.equal(player.equipment.magazines.primary, 79);
  while (player.equipment.action) drive();
  assert.equal(player.equipment.inactiveAmmo, 4);
});

test('a magazine weapon with a chamber round keeps it on a tactical reload', () => {
  const data = structuredClone(BALANCE_SOURCES);
  (data.weapons.weapons[0] as { feed: { type: string; chamberRounds: number } }).feed = { type: 'magazine', chamberRounds: 1 };
  const registry = createBalanceRegistry(data);
  const { player, drive } = setup(presetSelection(registry), registry);
  assert.equal(player.ammo, 46);
  player.ammo = 10;
  drive({ reload: true });
  for (let i = 0; i < 90 && player.reload.phase !== 'READY'; i++) drive();
  assert.equal(player.ammo, 46);
  player.ammo = 0;
  drive({ reload: true });
  for (let i = 0; i < 90 && player.reload.phase !== 'READY'; i++) drive();
  assert.equal(player.ammo, 45);
});

test('loadout selections are validated and applied with a full resupply, missions only on the Carrier', () => {
  assert.deepEqual(validateLoadoutSelection(BALANCE, CERBERUS), { selection: CERBERUS });
  assert.match((validateLoadoutSelection(BALANCE, { ...CERBERUS, primaryWeaponId: 'p-01' }) as { error: string }).error, /keine Primärwaffe/);
  assert.match((validateLoadoutSelection(BALANCE, { ...CERBERUS, armorId: 'armor.gold' }) as { error: string }).error, /Rüstung "armor\.gold" ist unbekannt/);
  assert.match((validateLoadoutSelection(BALANCE, { primaryWeaponId: 'vx-13' }) as { error: string }).error, /fehlt/);
  assert.match((validateLoadoutSelection(BALANCE, 'vx-13') as { error: string }).error, /Objekt erwartet/);

  const mission = new MissionInstance(3, BODENBRUCH);
  const player = mission.addPlayer('host');
  assert.equal(mission.state, 'CARRIER_HUB');
  player.ammo = 1;
  assert.equal(mission.setLoadout('host', CERBERUS), undefined);
  assert.equal(player.loadout.weapons.primary.id, 'vx-13');
  assert.equal(player.ammo, 10);
  assert.equal(player.equipment.magazines.primary, 80);
  assert.equal(mission.setLoadout('missing', CERBERUS), 'Operator nicht gefunden');
  const snapshot = playerSnapshot(mission, 'host').players.find(({ id }) => id === 'host');
  assert.deepEqual(snapshot?.weapons, { primary: 'vx-13', secondary: 'p-01' });
});

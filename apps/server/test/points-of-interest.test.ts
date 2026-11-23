import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARDING_TICKS, BODENBRUCH, CARRIER_SHIP, LANDING_STAGE_TICKS, POI_COUNT, POI_LAYOUTS, POI_LOOT, WORLD_PROFILES, generateWorld,
  openGround, sampleLimits, spawnPoiLoot,
} from '@freefall/shared';
import type { PickupKind, PickupSnapshot } from '@freefall/shared';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { PickupSystem } from '../src/mission/Pickups.ts';
import type { createPlayer } from '../src/simulation/Player.ts';

const count = (pickups: readonly PickupSnapshot[], kind: PickupKind) => pickups.filter((pickup) => pickup.kind === kind).length;

test('jede Welt hat acht PoI, genau einen prägnanten, abseits von Landezone, Relais und Extraktion', () => {
  const worlds = [...[...WORLD_PROFILES.keys()].flatMap((id) => Array.from({ length: 40 }, (_, seed) => generateWorld(id, seed * 101 + 7)!))];
  for (const plan of worlds) {
    const { world, relays, balloonSites } = plan;
    const points = world.pointsOfInterest!;
    assert.equal(points.length, POI_COUNT, plan.identity.id);
    assert.equal(points.filter(({ prominent }) => prominent).length, 1);
    assert.equal(new Set(points.map(({ kind }) => kind)).size, POI_COUNT, 'jeder Typ höchstens einmal');
    for (const poi of points) {
      for (const site of [world.deployment, ...relays, ...balloonSites]) assert.ok(Math.hypot(site.x - poi.x, site.z - poi.z) > site.radius + poi.radius);
      for (const other of points) if (other !== poi) assert.ok(Math.hypot(other.x - poi.x, other.z - poi.z) >= 38);
    }
    // Felsen der PoI rendert das Biom, Metallteile sind debris-Kollider.
    assert.ok(world.obstacles.some(({ kind }) => kind === 'debris'));
  }
  assert.equal(BODENBRUCH.world.pointsOfInterest?.length, POI_COUNT, 'auch die feste Bodenbruch-Welt');
});

test('Beute je Stufe: Mengen, Probenarten ab Stufe 4 und 6, Artefakte nur am prägnanten PoI', () => {
  const plan = generateWorld('desert', 4242)!;
  const landmark = plan.world.pointsOfInterest!.find(({ prominent }) => prominent)!;
  for (let level = 1; level <= 7; level++) for (let seed = 0; seed < 20; seed++) {
    const loot = spawnPoiLoot(plan.world, seed, level);
    assert.equal(count(loot, 'tissue'), POI_LOOT.tissue.spawn[level - 1]);
    assert.equal(count(loot, 'rock'), level >= 4 ? POI_LOOT.rock.spawn[level - 1] : 0);
    const artifacts = loot.filter(({ kind }) => kind === 'artifact');
    if (level < 6) assert.equal(artifacts.length, 0);
    else {
      assert.ok(artifacts.length >= 2 && artifacts.length <= 3);
      for (const artifact of artifacts) assert.ok(Math.hypot(artifact.x - landmark.x, artifact.z - landmark.z) <= landmark.radius);
    }
    const supplies = loot.filter(({ kind }) => kind === 'ammo' || kind === 'stims' || kind === 'grenades');
    assert.ok(supplies.length >= 2 * POI_COUNT && supplies.length <= 4 * POI_COUNT);
    assert.ok(count(loot, 'mark') <= POI_COUNT);
    for (const pickup of loot) assert.ok(openGround(plan.world, pickup.x, pickup.z, .5) || pickup.x === landmark.x, pickup.id);
    assert.equal(new Set(loot.map(({ id }) => id)).size, loot.length);
  }
  assert.deepEqual(spawnPoiLoot(plan.world, 5, 4), spawnPoiLoot(plan.world, 5, 4), 'deterministisch');
  // Mehr gespawnt als extrahiert werden darf.
  assert.deepEqual(sampleLimits(2), { tissue: 10, rock: 0, artifact: 0 });
  assert.deepEqual(sampleLimits(7, 3), { tissue: 30, rock: 15, artifact: 3 });
  for (let level = 1; level <= 7; level++) assert.ok(POI_LOOT.tissue.spawn[level - 1] > POI_LOOT.tissue.limit[level - 1]);
  let marks = 0;
  for (let seed = 0; seed < 400; seed++) marks += count(spawnPoiLoot(plan.world, seed, 3), 'mark');
  assert.ok(Math.abs(marks / (400 * POI_COUNT) - .15) < .03, 'rund 15 % je PoI');
});

function deployed(difficultyId: string) {
  const mission = new MissionInstance(51296, BODENBRUCH);
  const host = mission.addPlayer('host');
  const wing = mission.addPlayer('wing');
  Object.assign(host, { x: 0, z: 3 });
  assert.ok(mission.select(host.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId }));
  assert.ok(mission.start(host.id));
  for (const player of [host, wing]) {
    Object.assign(player, { ...CARRIER_SHIP, x: player.slot % 2 ? 1 : -1 });
    assert.ok(mission.action(player.id, 'ready'));
  }
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  assert.equal(mission.state, 'ACTIVE_MISSION');
  return { mission, host, wing, pickups: mission.pickupSystem! };
}

function take(mission: MissionInstance, player: ReturnType<typeof createPlayer>, pickup: PickupSnapshot): boolean {
  Object.assign(player, { x: pickup.x, z: pickup.z });
  for (let i = 0; i < 7; i++) mission.step();
  return mission.interact(player.id);
}

test('Aufnehmen: Truppenlimit, Vorräte bis zur Kapazität, Marken für den Trupp, Proben fallen beim Tod', () => {
  const { mission, host, wing, pickups } = deployed('normal');
  const snapshot = mission.snapshot();
  assert.ok(snapshot.pickups!.length > 20);
  assert.deepEqual(snapshot.samples?.limits, { tissue: 10, rock: 0, artifact: 0 });

  // Gewebeproben bis zum Truppenlimit 10, danach bleibt die Probe liegen.
  const tissue = () => pickups.snapshot().filter(({ kind }) => kind === 'tissue');
  for (let k = 0; k < 6; k++) assert.ok(take(mission, host, tissue()[0]));
  for (let k = 0; k < 4; k++) assert.ok(take(mission, wing, tissue()[0]));
  assert.deepEqual(pickups.teamCarried(), { tissue: 10, rock: 0, artifact: 0 });
  const rest = tissue().length;
  assert.equal(take(mission, wing, tissue()[0]), false);
  assert.equal(tissue().length, rest, 'Probe bleibt liegen');
  assert.equal(mission.drainFeedback().at(-1)?.code, 'pickup-limit');

  // Granatenkiste füllt nur bis zur Kapazität (2), der Rest verfällt; volle Operator lassen die Kiste liegen.
  const box = pickups.snapshot().find(({ kind }) => kind === 'grenades');
  if (box) {
    host.equipment.grenades = 0;
    assert.ok(take(mission, host, box));
    assert.equal(host.equipment.grenades, host.loadout.grenade.capacity);
    const next = pickups.snapshot().find(({ kind }) => kind === 'grenades');
    if (next) {
      assert.equal(take(mission, host, next), false);
      assert.ok(pickups.snapshot().some(({ id }) => id === next.id));
    }
  }
  const ammo = pickups.snapshot().find(({ kind }) => kind === 'ammo');
  if (ammo) {
    host.equipment.magazines.primary = 0;
    assert.ok(take(mission, host, ammo));
    assert.equal(host.equipment.magazines.primary, POI_LOOT.grant.primaryMagazines);
  }

  // Fällt der Wingman, liegen seine vier Proben einzeln am Boden und können wieder aufgenommen werden.
  const position = { x: wing.x, z: wing.z };
  wing.hp = 0;
  mission.step();
  const dropped = pickups.snapshot().filter(({ id }) => id.startsWith('drop/'));
  assert.equal(dropped.length, 4);
  for (const item of dropped) assert.ok(Math.hypot(item.x - position.x, item.z - position.z) < 2.5);
  assert.deepEqual(pickups.teamCarried(), { tissue: 6, rock: 0, artifact: 0 });
  assert.ok(take(mission, host, dropped[0]));
  assert.equal(pickups.carriedBy(host.id).tissue, 7);
});

test('Einsatzmarken vom Boden zählen sofort, auch ohne Hauptziele; extrahierte Proben sind gekappt', () => {
  const { mission, host, wing, pickups } = deployed('freefall');
  const mark = { id: 'test/mark', kind: 'mark' as const, x: host.x + 40, z: host.z };
  const system = pickups as unknown as { items: Map<string, PickupSnapshot> };
  system.items.set(mark.id, mark);
  assert.ok(take(mission, host, mark));
  assert.equal(pickups.marksFound, 1);
  host.hp = wing.hp = 0;
  for (let i = 0; i < 3 && !mission.snapshot().result; i++) mission.step();
  const result = mission.snapshot().result!;
  assert.equal(result.marksFound, 1);
  assert.deepEqual(result.rewards[0].resources, { marks: 1 }, 'ohne Hauptziele nur die gefundene Marke');

  const world = BODENBRUCH.world;
  const team = new PickupSystem(world, [], { tissue: 3, rock: 0, artifact: 0 });
  assert.equal(team.carry('a', { tissue: 2 }), true);
  assert.equal(team.carry('b', { tissue: 5 }), true);
  assert.deepEqual(team.teamCarried(), { tissue: 3, rock: 0, artifact: 0 });
  assert.deepEqual(team.extracted(['a', 'b']), { tissue: 3 });
  assert.deepEqual(team.extracted(['b']), { tissue: 1 });
  assert.equal(POI_LAYOUTS['albatross-wreck'].prominent, true);
});

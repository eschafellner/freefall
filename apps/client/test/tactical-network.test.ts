import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARRIER_WORLD, NET } from '@freefall/shared';
import type { PlayerInput, PlayersSnapshot } from '@freefall/shared';
import { playerSnapshot } from '../../server/src/networking/snapshots.ts';
import { Battlefield } from '../../server/src/simulation/Battlefield.ts';
import { damagePlayer } from '../../server/src/systems/combat.ts';
import { Prediction } from '../src/game/Prediction.ts';
import { Timeline } from '../src/game/Timeline.ts';

const profiles = [
  { name: 'LAN', delay: 1, jitter: 0 },
  { name: 'WAN', delay: 3, jitter: 0 },
  { name: 'high latency', delay: 8, jitter: 0 },
  { name: 'ordered jitter with a 300 ms stall', delay: 3, jitter: 4, stall: true },
  { name: 'application snapshot drops and replays', delay: 3, jitter: 2, replay: true },
];

for (const profile of profiles) {
  test(`four clients converge after tactical movement and ground combat under ${profile.name}`, (t) => {
    const world = { ...CARRIER_WORLD, half: 100, obstacles: [] };
    const field = new Battlefield(73, world);
    const crew = Array.from({ length: 4 }, (_, i) => {
      const operator = field.addPlayer(`op-${i}`);
      operator.x = i * 12 - 18;
      operator.hp -= operator.loadout.medical.healAmount;
      return { operator, prediction: new Prediction(), snapshots: new Timeline<PlayersSnapshot>(), inputAt: 0, snapshotAt: 0 };
    });
    const initial = playerSnapshot(field, crew[0].operator.id);
    for (const { operator, prediction, snapshots } of crew) {
      prediction.world = world;
      prediction.confirm(initial.players[operator.slot], 0);
      snapshots.push(initial, 0);
    }

    const delivery = new Map<number, (() => void)[]>();
    const at = (tick: number, fn: () => void) => {
      const batch = delivery.get(tick);
      if (batch) batch.push(fn);
      else delivery.set(tick, [fn]);
    };
    let bytes = 0, dropped = 0, rejected = 0;
    for (let tick = 1; tick <= 375; tick++) {
      for (const client of crew) {
        const { operator, prediction } = client;
        const groundCombat = tick >= 73 && tick < 94;
        const secondDive = tick === 330 && operator.slot === 0;
        if (tick <= 305 || (tick >= 326 && tick <= 355)) {
          const input: PlayerInput = { seq: tick, life: operator.life, yaw: 0, pitch: -.05, sprint: false,
            forward: secondDive ? 1 : tick === 20 ? operator.slot % 2 ? -1 : 1 : 0, strafe: groundCombat ? .4 : 0,
            aim: groundCombat, fire: groundCombat, reload: tick === 104,
            ...((tick === 20 || secondDive) && { posture: 'dive' }), ...(tick === 264 && { posture: 'stand' }),
            ...(tick === 195 && { equipment: 'stim' }),
          };
          prediction.step(input);
          const delay = profile.delay + (tick * 7 + operator.slot) % (profile.jitter + 1);
          const stall = profile.stall && tick >= 75 && tick < 84 ? 84 : tick;
          client.inputAt = Math.max(client.inputAt, stall + delay);
          at(client.inputAt, () => {
            assert.ok(field.receiveInput(operator.id, input));
            if (profile.replay && (input.posture || input.equipment || input.reload)) {
              assert.equal(field.receiveInput(operator.id, input), false);
              rejected++;
            }
          });
        }
      }
      for (const dispatch of delivery.get(tick) ?? []) dispatch();
      delivery.delete(tick);
      field.step();
      if (tick === 346) {
        const { operator } = crew[0];
        assert.equal(operator.posture.current, 'DIVING');
        assert.ok(operator.y > 0);
        assert.equal(damagePlayer(operator, operator.hp, field.tick), operator.loadout.maxHealth);
      }

      if (Math.floor(tick * NET.playerHz / NET.tickHz) > Math.floor((tick - 1) * NET.playerHz / NET.tickHz)) {
        const snapshot = playerSnapshot(field, crew[0].operator.id);
        if (profile.replay && tick >= 18 && tick < 305 && tick % 7 === 0) { dropped += crew.length; continue; }
        bytes += Buffer.byteLength(JSON.stringify(snapshot));
        for (const client of crew) {
          const delay = profile.delay + (tick * 11 + client.operator.slot) % (profile.jitter + 1);
          client.snapshotAt = Math.max(client.snapshotAt, tick + delay);
          const arrival = client.snapshotAt;
          at(arrival, () => {
            const now = arrival / NET.tickHz * 1000;
            assert.ok(client.snapshots.push(snapshot, now));
            client.prediction.confirm(snapshot.players[client.operator.slot], snapshot.tick);
            if (profile.replay && snapshot.tick % 5 === 0) {
              at(tick + delay + profile.jitter + 4, () => {
                assert.equal(client.snapshots.push(snapshot), false);
                rejected++;
              });
            }
          });
        }
      }

      if (tick === 60) for (const { operator } of crew) {
        assert.equal(operator.posture.current, operator.slot % 2 ? 'SUPINE' : 'PRONE');
        assert.equal(operator.y, 0);
      }
      if (tick === 320) for (const { operator } of crew) assert.equal(operator.posture.current, 'STANDING');
    }

    for (const { operator, prediction } of crew) {
      assert.equal(operator.ack, 355);
      assert.equal(prediction.unacknowledged, 0);
      assert.equal(prediction.posture.current, 'STANDING');
      assert.deepEqual(prediction.position, { x: operator.x, y: 0, z: operator.z });
      assert.equal(operator.equipment.stims, operator.loadout.medical.maxCharges - 1);
      assert.equal(operator.hp, operator.slot === 0 ? 0 : operator.loadout.maxHealth);
      assert.equal(operator.equipment.magazines.primary, operator.loadout.weapons.primary.reserve - 1);
      assert.equal(operator.ammo, operator.loadout.weapons.primary.magazineSize);
    }
    assert.equal(field.stats.data.magazinesUsed.primary, 4);
    assert.ok(field.stats.data.shots.primary >= 4);
    t.diagnostic(JSON.stringify({ simulatedTicks: field.tick, playerSnapshotJsonBytesPerClient: bytes,
      dropped, rejected, primaryShots: field.stats.data.shots.primary,
      corrected: crew.reduce((sum, client) => sum + client.prediction.stats.corrections, 0),
      maxCorrectionM: Math.max(...crew.map((client) => client.prediction.stats.maxCorrection)),
      snaps: crew.reduce((sum, client) => sum + client.prediction.stats.snaps, 0),
    }));
  });
}

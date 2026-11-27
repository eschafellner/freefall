import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODENBRUCH, STANDARD_LOADOUT, resolveSelection, BALANCE } from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';
import { playerSnapshot } from '../../server/src/networking/snapshots.ts';
import { Battlefield } from '../../server/src/simulation/Battlefield.ts';
import { Prediction } from '../src/game/Prediction.ts';

const idle = (seq: number): PlayerInput => ({ seq, life: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, sprint: false });

test('prediction runs sprint, exhaustion, dive and recovery exactly like the server in every armour', () => {
  for (const armorId of ['armor.sr4_scout', 'armor.standard_carrier', 'armor.bw9_bulwark', 'armor.kr12_colossus']) {
    const world = { ...BODENBRUCH.world, half: 400, obstacles: [] };
    const arena = new Battlefield(4, world);
    const operator = arena.addPlayer('p')!;
    const selection = { ...STANDARD_LOADOUT, armorId };
    assert.equal(arena.setLoadout('p', selection), undefined);
    Object.assign(operator, { x: 0, z: 0 });
    const prediction = new Prediction();
    prediction.world = world;
    prediction.setLoadout(resolveSelection(BALANCE, selection));
    prediction.confirm(playerSnapshot(arena, 'p').players[0], arena.tick);
    // 16 s sprint (exhausts every armour), a dive attempt while exhausted (refused), 4 s rest, sprint again.
    const inputs: PlayerInput[] = Array.from({ length: 700 }, (_, i) => ({
      ...idle(i + 1), forward: i < 480 || i > 600 ? 1 : 0, sprint: i < 480 || i > 600, yaw: .3,
      ...(i === 400 && { posture: 'dive' as const }),
    }));
    const expected: { x: number; z: number; stamina: number }[] = [];
    let exhausted = false;
    for (let i = 0; i < inputs.length; i++) {
      prediction.step(inputs[i]);
      expected.push({ x: prediction.position.x, z: prediction.position.z, stamina: prediction.stamina.value });
      exhausted ||= prediction.stamina.exhausted;
      if (i < 2) continue;
      assert.ok(arena.receiveInput('p', inputs[i - 2]));
      arena.step();
      const snapshot = playerSnapshot(arena, 'p');
      assert.equal(operator.staminaState.value, expected[i - 2].stamina, `${armorId}: server stamina at input ${i - 2}`);
      prediction.confirm(snapshot.players[0], snapshot.tick);
      assert.equal(prediction.position.x, expected[i].x);
      assert.equal(prediction.position.z, expected[i].z);
      assert.equal(prediction.stamina.value, expected[i].stamina);
    }
    assert.equal(prediction.stats.corrections, 0, `${armorId}: no reconciliation corrections`);
    assert.ok(exhausted, `${armorId}: the long sprint exhausted the operator`);
  }
});

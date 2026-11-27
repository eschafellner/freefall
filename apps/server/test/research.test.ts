/**
 * Forschung: Forschungsgebiet "Taktische Stoffwechselmodulation" (Raum FORSCHUNG im Carrier).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, CARRIER_WORLD, RESEARCH_FIELDS, STANDARD_LOADOUT, UNLOCKS, armorMobility, researchBonus, researchModifiers,
  resolveSelection } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { AccountService } from '../src/accounts/AccountService.ts';
import { AccountStore } from '../src/accounts/AccountStore.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';

const FIELD = RESEARCH_FIELDS[0]!;
const IDS = FIELD.stages.map(({ id }) => id);
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };

test('Gebiet, Stufen, Kosten und Kette laut Vorgabe', () => {
  assert.equal(FIELD.displayName, 'Taktische Stoffwechselmodulation');
  assert.deepEqual(FIELD.stages.map(({ displayName }) => displayName), ['Genetische Überlegenheit I', 'Erweitertes Training I',
    'Genetische Überlegenheit II', 'Erweitertes Training II', 'Leistungssteigernde Einsatzversorgung I']);
  assert.deepEqual(FIELD.stages.map(({ cost }) => cost), [
    { tissue: 50, credits: 2000 }, { tissue: 60, rock: 10, credits: 3000 }, { tissue: 70, rock: 25, credits: 4000 },
    { tissue: 70, rock: 35, artifact: 5, credits: 5000 }, { tissue: 70, rock: 45, artifact: 15, credits: 6000 }]);
  for (const [index, id] of IDS.entries()) {
    const entry = UNLOCKS.byId.get(id)!;
    assert.equal(entry.kind, 'research');
    assert.equal(entry.acquisition, 'choice');
    assert.deepEqual(entry.requires, index ? [IDS[index - 1]] : [], 'jede Stufe setzt die vorige voraus');
  }
});

test('Wirkung: +30/+20 Lebenspunkte, Ausdauer +10 %/+10 %, Hechtsprung +35 %', () => {
  assert.deepEqual(researchBonus(IDS), { maxHealth: 50, stamina: .2, dive: .35 });
  const base = resolveSelection(BALANCE, STANDARD_LOADOUT);
  const resolve = (count: number) => resolveSelection(BALANCE, STANDARD_LOADOUT, [], [], {}, 'custom', researchModifiers(IDS.slice(0, count)));
  assert.deepEqual([1, 2, 3, 4, 5].map((count) => resolve(count).maxHealth), [130, 130, 150, 150, 150]);
  assert.equal(resolve(2).mobility.stamina.max, Math.round(base.mobility.stamina.max * 1.1));
  assert.equal(resolve(4).mobility.stamina.max, Math.round(base.mobility.stamina.max * 1.2));
  assert.equal(resolve(4).mobility.diveDistance, base.mobility.diveDistance);
  assert.ok(Math.abs(resolve(5).mobility.diveDistance - base.mobility.diveDistance * 1.35) < 1e-9);
  // Heilstim heilt einen Anteil der maximalen Lebenspunkte; Tempo und Sprint bleiben unverändert.
  assert.equal(resolve(5).medical.healAmount / resolve(5).maxHealth, base.medical.healAmount / base.maxHealth);
  assert.equal(resolve(5).mobility.sprintSpeed, base.mobility.sprintSpeed);
  // Ohne Forschung exakt die bisherigen Werte; KR-12 kann auch mit Forschung keinen Hechtsprung.
  assert.deepEqual(resolveSelection(BALANCE, STANDARD_LOADOUT, [], [], {}, 'custom', []).mobility, base.mobility);
  assert.equal(armorMobility(BALANCE, 200, { dive: 1.35 }).diveDistance, 0);
});

test('Forschung kaufen: nur in Reihenfolge, Preis wird abgebucht', async () => {
  const service = new AccountService(new AccountStore(':memory:'));
  try {
    const account = (await service.store.register('Kestrel', 'geheimes-passwort'))!;
    const me = { id: account.id, level: 1 };
    assert.equal(service.unlock(me, IDS[1]!).ok, false, 'Stufe 2 nicht vor Stufe 1');
    assert.match((service.unlock(me, IDS[0]!) as { reason: string }).reason, /Gewebe/);
    service.store.grantResources(account.id, { tissue: 300, rock: 150, artifact: 100, credits: 45_000 }, 'test');
    const before = service.store.resources(account.id);
    for (const id of IDS.slice(0, 4)) assert.deepEqual(service.unlock(me, id), { ok: true }, id);
    const after = service.store.resources(account.id);
    assert.deepEqual({ tissue: before.tissue - after.tissue, rock: before.rock - after.rock, artifact: before.artifact - after.artifact,
      credits: before.credits - after.credits }, { tissue: 250, rock: 70, artifact: 5, credits: 14_000 });
    // Das ganze Gebiet kostet 320 Gewebe, mehr als die Obergrenze von 300: Die letzte Stufe braucht neue Proben.
    assert.match((service.unlock(me, IDS[4]!) as { reason: string }).reason, /20 Gewebe/);
    service.store.grantResources(account.id, { tissue: 20 }, 'test-2');
    assert.deepEqual(service.unlock(me, IDS[4]!), { ok: true });
    assert.deepEqual(service.research(account.id), [...IDS].sort());
  } finally {
    service.store.close();
  }
});

test('Simulation: Forschung erhöht Lebenspunkte und Ausdauer, Snapshot meldet maxHp; Gäste unverändert', () => {
  const field = new Battlefield(3, open);
  const guest = field.addPlayer('guest');
  const operator = field.addPlayer('op');
  field.setResearch('op', IDS.slice(0, 3));
  assert.equal(operator.loadout.maxHealth, 150);
  assert.equal(operator.hp, 150, 'ein unverletzter Operator bleibt voll');
  assert.equal(operator.staminaState.value, operator.loadout.mobility.stamina.max);
  assert.equal(guest.loadout.maxHealth, 100);
  // Neues Loadout behält die Forschung.
  assert.equal(field.setLoadout('op', { ...STANDARD_LOADOUT, armorId: 'armor.bw9_bulwark' }), undefined);
  assert.equal(operator.loadout.maxHealth, 150);
  operator.hp = 60;
  field.setResearch('op', IDS);
  assert.equal(operator.hp, 60, 'Verwundete behalten ihre Lebenspunkte');
  const players = playerSnapshot(field, 'op').players;
  assert.equal(players.find(({ id }) => id === 'op')!.maxHp, 150);
  assert.equal(players.find(({ id }) => id === 'guest')!.maxHp, undefined);
});

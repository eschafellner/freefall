import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BalanceValidationError, POI_LOOT, SIMULATION_HZ, createBalanceRegistry, magazineModifiers, resolveWeapon,
} from '@freefall/shared';
import { evaluateBalance } from '../../../scripts/balance-editor/analysis.ts';
import { SOURCE_KEYS, applyDrafts } from '../../../scripts/balance-editor/drafts.ts';
import type { Disk, SourceKey } from '../../../scripts/balance-editor/drafts.ts';
import { applyJsonEdits, valueSpans } from '../../../scripts/balance-editor/jsonEdit.ts';

const DATA = new URL('../../../packages/shared/src/balance/data/', import.meta.url);
const dataFile = (name: string) => readFileSync(new URL(name, DATA), 'utf8');

/** The published files as the editor reads them. */
function disk(): Disk {
  const texts = {} as Record<SourceKey, string>, data = {} as Record<SourceKey, unknown>;
  for (const key of SOURCE_KEYS) { texts[key] = dataFile(`${key}.json`); data[key] = JSON.parse(texts[key]); }
  return { dir: '', texts, data, revision: 'test' };
}

type Sources = {
  weapons: { weapons: { magazineSize: number; feed: { type: string }; magazineVariants: unknown[] }[] };
  loot: { supplies: number[]; tissue: { perSite: number[] }; rock: { spawn: number[] } };
};
const sources = () => structuredClone(BALANCE_SOURCES) as unknown as Sources;
const issuesOf = (data: unknown): string[] => {
  try { createBalanceRegistry(data); return []; } catch (error) { if (error instanceof BalanceValidationError) return [...error.issues]; throw error; }
};

test('balance editor: leaf edits change only the edited values and keep the hand formatting', () => {
  const text = dataFile('ammunition.json');
  const edited = applyJsonEdits(text, [
    { path: ['calibers', 0, 'damage'], value: 22.5 },
    { path: ['calibers', 0, 'falloff', 'minMultiplier'], value: 0.55 },
    { path: ['ammunition', 1, 'displayName'], value: 'Vollmantel "neu"' },
  ]);
  const expected = structuredClone(JSON.parse(text));
  expected.calibers[0].damage = 22.5;
  expected.calibers[0].falloff.minMultiplier = 0.55;
  expected.ammunition[1].displayName = 'Vollmantel "neu"';
  assert.deepEqual(JSON.parse(edited), expected);
  const before = text.split('\n'), after = edited.split('\n');
  assert.equal(after.length, before.length, 'single-line caliber entries stay on one line');
  const changedLines = before.filter((line, i) => line !== after[i]);
  assert.equal(changedLines.length, 2, 'only the caliber line and the ammunition name line change');
});

test('balance editor: spans cover every value and structural edits are refused', () => {
  const text = '{ "a": [1, 2.5e3, -0.25], "b": { "c": "x\\"y", "d": true, "e": null } }';
  const spans = valueSpans(text);
  const at = (path: unknown[]) => { const span = spans.get(JSON.stringify(path))!; return text.slice(span.start, span.end); };
  assert.equal(at(['a', 1]), '2.5e3');
  assert.equal(at(['b', 'c']), '"x\\"y"');
  assert.equal(at([]), text);
  assert.throws(() => applyJsonEdits(text, [{ path: ['b'], value: 1 }]), /kein Einzelwert/);
  assert.throws(() => applyJsonEdits(text, [{ path: ['z'], value: 1 }]), /existiert nicht/);
  assert.throws(() => applyJsonEdits(text, [{ path: ['a', 0], value: Number.NaN }]), /ungültiger Wert/);
  assert.throws(() => valueSpans('{ "a": 1 } x'), SyntaxError);
});

test('balance editor: derived values come from the resolver and the shared damage rules', () => {
  const evaluation = evaluateBalance(BALANCE_SOURCES, { difficultyId: 'normal', distance: 0 });
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.version?.hash, BALANCE.version.hash);
  const analysis = evaluation.analysis!;
  for (const row of analysis.weapons) {
    const weapon = resolveWeapon(BALANCE, row.weaponId, row.ammoId);
    assert.equal(row.damage, weapon.projectile.damage);
    assert.equal(row.shotDamage, weapon.projectile.damage * weapon.projectile.projectilesPerShot);
    assert.equal(row.roundsPerSecond, SIMULATION_HZ / weapon.fireInterval);
  }
  // Every enemy appears with each armor class its hit zones (or its body) carry.
  for (const enemy of BALANCE.enemies.values()) {
    const classes = enemy.hitZones?.length ? new Set(enemy.hitZones.map((zone) => zone.armorClass)) : new Set([enemy.armorClass]);
    assert.deepEqual(new Set(analysis.targets.filter((t) => t.enemyId === enemy.id).map((t) => t.armorClass)), classes);
  }
  // Shots to kill: enough to reach the enemy's health, one fewer is not.
  analysis.kills.forEach((cells, row) => cells.forEach((cell, column) => {
    if (cell.shots === null) return;
    const health = BALANCE.enemy(analysis.targets[column]!.enemyId).gameplay.health;
    assert.ok(cell.shots * cell.shotDamage >= health - 1e-6, `${analysis.weapons[row]!.weaponId} kills`);
    assert.ok((cell.shots - 1) * cell.shotDamage < health, `${analysis.weapons[row]!.weaponId} needs every shot`);
    assert.equal(cell.penetrates, cell.shotDamage >= analysis.weapons[row]!.shotDamage - 1e-9);
  }));
});

test('balance editor: falloff reduces damage at range, invalid drafts report every issue', () => {
  const near = evaluateBalance(BALANCE_SOURCES, { distance: 0 }).analysis!;
  const far = evaluateBalance(BALANCE_SOURCES, { distance: 400 }).analysis!;
  far.weapons.forEach((row, i) => assert.ok(row.shotDamage < near.weapons[i]!.shotDamage, `${row.weaponId} falls off at 400 m`));

  const draft = structuredClone(BALANCE_SOURCES) as { weapons: { weapons: { reserve: number; magazineSize: number }[] } };
  draft.weapons.weapons[0]!.reserve = 999;
  draft.weapons.weapons[1]!.magazineSize = 0;
  const invalid = evaluateBalance(draft);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.analysis, undefined);
  assert.ok(invalid.issues.some((issue) => issue.startsWith('weapons.json › weapons[0].reserve')), invalid.issues.join('\n'));
  assert.ok(invalid.issues.some((issue) => issue.startsWith('weapons.json › weapons[1].magazineSize')), invalid.issues.join('\n'));
});

test('balance editor: drafts accept values and magazine variants, refuse read-only and structural changes', () => {
  const d = disk();
  const draft = structuredClone(d.data) as Record<string, any>;
  draft.weapons.weapons[0].magazineSize = 40;
  draft.weapons.weapons[0].magazineVariants.push({ type: 'drum', displayName: 'Trommelmagazin', magazineSize: 100,
    modifiers: [{ stat: 'reloadSeconds', operation: 'multiply', value: 1.3 }] });
  draft.weapons.weapons[1].id = 'renamed';
  draft.weapons.weapons[1].attachmentSlots.push('optic');
  draft.weapons.weapons[2].newField = 1;
  draft.enemies.archetypes[0].gameplay.health = 1;
  draft.loot.grant.stims = 3;
  const result = applyDrafts(d, { weapons: draft.weapons, enemies: draft.enemies, loot: draft.loot }, '8.1B-test');
  assert.deepEqual(result.changes.map((c) => `${c.fileName} ${c.kind} ${c.path.join('.')}`).sort(), [
    'loot.json value grant.stims', 'manifest.json value release',
    'weapons.json list weapons.0.magazineVariants', 'weapons.json value weapons.0.magazineSize',
  ]);
  assert.equal(result.errors.length, 4, result.errors.join('\n'));
  assert.match(result.errors.join('\n'), /weapons\[1\]\.id: schreibgeschützt/);
  assert.match(result.errors.join('\n'), /weapons\[1\]\.attachmentSlots: Einträge hinzufügen oder entfernen geht hier nur direkt in der Datei/);
  assert.match(result.errors.join('\n'), /weapons\[2\]: Felder hinzufügen/);
  assert.match(result.errors.join('\n'), /archetypes\[0\]\.gameplay\.health: Schabe ist geschützt/);

  // The new variant is written in the style of the file; every other line stays as it was.
  const edits = result.changes.filter((c) => c.file === 'weapons').map(({ path, after }) => ({ path, value: after }));
  const text = applyJsonEdits(d.texts.weapons, edits);
  assert.deepEqual(JSON.parse(text), result.data.weapons);
  assert.ok(text.includes(`      "magazineVariants": [
        {
          "type": "drum",
          "displayName": "Trommelmagazin",
          "magazineSize": 100,
          "modifiers": [
            { "stat": "reloadSeconds", "operation": "multiply", "value": 1.3 }
          ]
        }
      ]`), text);
  const restored = applyJsonEdits(text, [{ path: ['weapons', 0, 'magazineVariants'], value: [] }, { path: ['weapons', 0, 'magazineSize'], value: 45 }]);
  assert.equal(restored, d.texts.weapons, 'every byte outside the edited values stays unchanged');
});

test('balance: magazine variants are validated and resolve on the equipment layer', () => {
  assert.deepEqual(issuesOf(BALANCE_SOURCES), []);
  const data = sources();
  const kestrel = data.weapons.weapons[0]!;
  kestrel.magazineVariants = [
    { type: 'compact', displayName: 'Klein', magazineSize: 45, modifiers: [] },
    { type: 'extended', displayName: 'Erweitert', magazineSize: 60, modifiers: [] },
    { type: 'drum', displayName: 'Trommel', magazineSize: 60, modifiers: [{ stat: 'reserve', operation: 'add', value: -4 }] },
    { type: 'extended', displayName: 'Doppelt', magazineSize: 70, modifiers: [] },
  ];
  data.weapons.weapons[2]!.magazineVariants = [{ type: 'extended', displayName: 'Rohr', magazineSize: 12, modifiers: [] }];
  const issues = issuesOf(data).join('\n');
  assert.match(issues, /weapons\[0\]\.magazineVariants\[0\]\.magazineSize: Das kleine Magazin muss weniger als das Standardmagazin \(45\)/);
  assert.match(issues, /weapons\[0\]\.magazineVariants\[2\]\.magazineSize: Das Trommelmagazin muss mehr als das erweiterte Magazin \(60\)/);
  assert.match(issues, /weapons\[0\]\.magazineVariants\[3\]\.type: Variante "extended" ist bereits vorhanden/);
  assert.match(issues, /weapons\[2\]\.magazineVariants: nur für Waffen mit wechselbarem Magazin/);

  const valid = sources();
  valid.weapons.weapons[0]!.magazineVariants = [
    { type: 'drum', displayName: 'Trommel', magazineSize: 100, modifiers: [{ stat: 'reserve', operation: 'add', value: -4 }, { stat: 'reloadSeconds', operation: 'multiply', value: 1.5 }] },
  ];
  const registry = createBalanceRegistry(valid);
  const weapon = registry.weapon('kestrel-ar-01');
  const drum = resolveWeapon(registry, weapon.id, undefined, magazineModifiers(weapon, 'drum'));
  assert.equal(drum.magazineSize, 100);
  assert.equal(drum.capacity, 100);
  assert.equal(drum.reserve, weapon.reserve - 4);
  assert.equal(drum.reloadSeconds, weapon.reloadSeconds * 1.5);
  assert.equal(resolveWeapon(registry, weapon.id).magazineSize, 45, 'the standard magazine stays the default');
  assert.throws(() => magazineModifiers(weapon, 'compact'), /keine Magazinvariante "compact"/);

  const analysis = evaluateBalance(valid).analysis!;
  const row = analysis.weapons.find((w) => w.weaponId === weapon.id && w.magazine === 'drum' && w.isDefaultAmmo)!;
  assert.equal(row.totalRounds, 100 + (weapon.reserve - 4) * 100);
});

test('balance: PoI loot comes from loot.json and is validated', () => {
  assert.equal(POI_LOOT, BALANCE.loot);
  assert.deepEqual(POI_LOOT.grant, { primaryMagazines: 2, stims: 2, grenades: 4 });
  const data = sources();
  data.loot.supplies = [5, 2];
  data.loot.tissue.perSite = [9, 3];
  data.loot.rock.spawn[0] = 4;
  const issues = issuesOf(data).join('\n');
  assert.match(issues, /loot\.json › supplies: \[min, max\] erwartet/);
  assert.match(issues, /loot\.json › tissue\.perSite: \[min, max\] erwartet/);
  assert.match(issues, /loot\.json › rock\.spawn\[0\]: Stufe 1 liegt vor fromLevel 4/);

  // What the editor shows per pickup follows the server's unit rules (Pickups.ts, Resupply.ts).
  const supplies = evaluateBalance(BALANCE_SOURCES).analysis!.supplies;
  const kestrel = supplies.weapons.find((w) => w.weaponId === 'kestrel-ar-01')!;
  assert.deepEqual(kestrel.ammoBox, { units: 2, rounds: 90 });
  const shotgun = supplies.weapons.find((w) => w.weaponId === 'vx-13')!;
  assert.equal(shotgun.unit, 'rounds');
  assert.equal(shotgun.ammoBox!.units, POI_LOOT.grant.primaryMagazines * BALANCE.weapon('vx-13').magazineSize);
  assert.equal(supplies.weapons.find((w) => w.weaponId === 'p-01')!.ammoBox, null, 'the ammo box only fills the primary weapon');
  assert.equal(supplies.firstAidKit.heal, POI_LOOT.grant.stims * supplies.stimHeal);
});

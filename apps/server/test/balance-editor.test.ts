import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BALANCE, BALANCE_SOURCES, SIMULATION_HZ, resolveWeapon } from '@freefall/shared';
import { evaluateBalance } from '../../../scripts/balance-editor/analysis.ts';
import { applyLeafEdits, valueSpans } from '../../../scripts/balance-editor/jsonEdit.ts';

const dataFile = (name: string) => readFileSync(new URL(`../../../packages/shared/src/balance/data/${name}`, import.meta.url), 'utf8');

test('balance editor: leaf edits change only the edited values and keep the hand formatting', () => {
  const text = dataFile('ammunition.json');
  const edited = applyLeafEdits(text, [
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
  assert.throws(() => applyLeafEdits(text, [{ path: ['b'], value: 1 }]), /kein Einzelwert/);
  assert.throws(() => applyLeafEdits(text, [{ path: ['z'], value: 1 }]), /existiert nicht/);
  assert.throws(() => applyLeafEdits(text, [{ path: ['a', 0], value: Number.NaN }]), /ungültiger Wert/);
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

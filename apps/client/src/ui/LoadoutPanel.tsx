import { useEffect, useState } from 'react';
import { ARMOR, BALANCE, NET, STANDARD_LOADOUT, resolveWeapon } from '@freefall/shared';
import type { EffectiveWeapon, LoadoutSelection, WeaponSlot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { sameSelection } from '../game/Loadouts.ts';
import { KitIcon } from './HudIcons.tsx';

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const penetration = (level: number) => ARMOR.classes[level - 1]?.penetrationName ?? String(level);

function WeaponStats({ weapon }: { weapon: EffectiveWeapon }) {
  const { projectile, feed } = weapon;
  const single = feed.type === 'single';
  return <dl className="loadout-stats">
    <dt>Kaliber</dt><dd>{weapon.caliber.displayName} · {weapon.ammo.displayName}</dd>
    <dt>Schaden</dt><dd>{projectile.projectilesPerShot > 1
      ? `${projectile.projectilesPerShot} × ${number.format(projectile.damage)}` : number.format(projectile.damage)}</dd>
    <dt>Durchschlag</dt><dd>{projectile.penetration} · {penetration(projectile.penetration)}</dd>
    <dt>Feuerrate</dt><dd>{number.format(weapon.roundsPerSecond * 60)} Schuss/min</dd>
    <dt>{single ? 'Röhrenmagazin' : 'Magazin'}</dt><dd>{weapon.magazineSize}{feed.chamberRounds ? ` + ${feed.chamberRounds} im Lauf` : ''}</dd>
    <dt>Reserve</dt><dd>{weapon.reserve} {single ? 'Patronen' : 'Magazine'}</dd>
    <dt>Nachladen</dt><dd>{single
      ? `Einzeln · ${number.format(weapon.reloadSeconds)} s je Patrone, leer ${number.format(feed.type === 'single' ? feed.chamberTicks / NET.tickHz : 0)} s für die erste`
      : `Magazinwechsel · ${number.format(weapon.reloadSeconds)} s`}</dd>
    <dt>Reichweite</dt><dd>{weapon.effectiveRange} m · voller Schaden bis {number.format(projectile.falloff.startMeters)} m</dd>
  </dl>;
}

interface Choice { id: string; displayName: string; description?: string }

function Picker({ label, value, choices, onChange }: { label: string; value: string; choices: readonly Choice[]; onChange: (id: string) => void }) {
  const chosen = choices.find(({ id }) => id === value);
  return <label className="loadout-field">
    <span className="loadout-label"><KitIcon id={value}/>{label}</span>
    <select value={value} disabled={choices.length < 2} onChange={(event) => onChange(event.target.value)}>
      {choices.map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
    </select>
    {chosen?.description && <small>{chosen.description}</small>}
  </label>;
}

const weaponsIn = (slot: WeaponSlot): Choice[] => [...BALANCE.weapons.values()].filter((weapon) => weapon.slot === slot);

/** Carrier station "Ausrüstung": weapons, melee, tactical slot, backpack and body armor. The server validates. */
export function LoadoutPanel({ status, apply }: { status: GameStatus; apply: (selection: LoadoutSelection) => void }) {
  const active = status.loadout.selection;
  const [draft, setDraft] = useState<LoadoutSelection>(active);
  const key = JSON.stringify(active);
  useEffect(() => setDraft(active), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (field: keyof LoadoutSelection) => (id: string) => setDraft({ ...draft, [field]: id });
  const changed = !sameSelection(draft, active);
  const primary = resolveWeapon(BALANCE, draft.primaryWeaponId);
  const secondary = resolveWeapon(BALANCE, draft.secondaryWeaponId);
  return <div className="carrier-console loadout-panel">
    <div className="field-heading"><strong>Ausrüstung</strong><span>{changed ? 'Nicht übernommen' : 'Aktiv'}</span></div>
    <div className="loadout-grid">
      <section>
        <Picker label="Primärwaffe" value={draft.primaryWeaponId} choices={weaponsIn('primary')} onChange={set('primaryWeaponId')}/>
        <WeaponStats weapon={primary}/>
      </section>
      <section>
        <Picker label="Sekundärwaffe" value={draft.secondaryWeaponId} choices={weaponsIn('secondary')} onChange={set('secondaryWeaponId')}/>
        <WeaponStats weapon={secondary}/>
      </section>
      <section className="loadout-kit">
        <Picker label="Nahkampfwaffe" value={draft.meleeId} choices={[...BALANCE.meleeAttacks.values()]} onChange={set('meleeId')}/>
        <Picker label="Taktische Ausrüstung" value={draft.grenadeId} choices={[...BALANCE.grenades.values()]} onChange={set('grenadeId')}/>
        <Picker label="Medizin" value={draft.medicalId} choices={[...BALANCE.medicalItems.values()]} onChange={set('medicalId')}/>
        <Picker label="Rucksack" value={draft.backpackId} choices={[...BALANCE.backpacks.values()]} onChange={set('backpackId')}/>
        <Picker label="Rüstung" value={draft.armorId} choices={[...BALANCE.bodyArmors.values()]} onChange={set('armorId')}/>
      </section>
    </div>
    <div className="loadout-actions">
      <button className="secondary" type="button" disabled={!changed} onClick={() => apply(draft)}>Ausrüstung übernehmen</button>
      <button className="text-button" type="button" disabled={sameSelection(draft, STANDARD_LOADOUT)}
        onClick={() => setDraft(STANDARD_LOADOUT)}>Standardausrüstung</button>
    </div>
    <p>Beim Übernehmen wirst du vollständig neu ausgerüstet. Wechsel sind nur auf dem Carrier möglich.</p>
    {status.loadoutError && <p role="alert" className="loadout-error">{status.loadoutError}</p>}
  </div>;
}

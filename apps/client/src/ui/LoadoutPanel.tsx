import { useEffect, useState } from 'react';
import { ARMOR, BALANCE, NET, STANDARD_LOADOUT, reserveInRounds, resolveWeapon } from '@freefall/shared';
import type { EffectiveWeapon, LoadoutSelection, WeaponSlot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { sameSelection } from '../game/Loadouts.ts';
import { bindings } from '../input/Bindings.ts';
import { ArmorStats, WEIGHT_CLASS_NAMES } from './ArmoryPanel.tsx';
import { KitIcon } from './HudIcons.tsx';
import { Terminal } from './Terminal.tsx';

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const penetration = (level: number) => ARMOR.classes[level - 1]?.penetrationName ?? String(level);

function WeaponStats({ weapon }: { weapon: EffectiveWeapon }) {
  const { projectile, feed } = weapon;
  const single = feed.type === 'single';
  const loose = reserveInRounds(feed);
  const rows: [string, string][] = [
    ['Kaliber', `${weapon.caliber.displayName} · ${weapon.ammo.displayName}`],
    ['Schaden', projectile.projectilesPerShot > 1 ? `${projectile.projectilesPerShot} × ${number.format(projectile.damage)}` : number.format(projectile.damage)],
    ['Durchschlag', `${projectile.penetration} · ${penetration(projectile.penetration)}`],
    ['Feuerrate', `${number.format(weapon.roundsPerSecond * 60)} Schuss/min`],
    [single ? 'Röhrenmagazin' : feed.type === 'break' ? 'Läufe' : 'Magazin', `${weapon.magazineSize}${feed.chamberRounds ? ` + ${feed.chamberRounds}` : ''} · Reserve ${weapon.reserve} ${loose ? 'Patr.' : 'Mag.'}`],
    ['Nachladen', single ? `${number.format(weapon.reloadSeconds)} s je Patrone` : `${number.format(weapon.reloadSeconds)} s`],
    ['Reichweite', `${weapon.effectiveRange} m`],
  ];
  return <dl className="intel-params loadout-stats">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

interface Choice { id: string; displayName: string; description?: string }

function Picker({ label, value, choices, onChange }: { label: string; value: string; choices: readonly Choice[]; onChange: (id: string) => void }) {
  const chosen = choices.find(({ id }) => id === value);
  return <label className="loadout-field" title={chosen?.description}>
    <span className="loadout-label"><KitIcon id={value}/>{label}</span>
    <select value={value} disabled={choices.length < 2} onChange={(event) => onChange(event.target.value)}>
      {choices.map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
    </select>
  </label>;
}

const weaponsIn = (slot: WeaponSlot): Choice[] => [...BALANCE.weapons.values()].filter((weapon) => weapon.slot === slot);
const armors: Choice[] = [...BALANCE.bodyArmors.values()].sort((a, b) => a.armorRating - b.armorRating)
  .map((armor) => ({ id: armor.id, displayName: `${armor.displayName} · ${WEIGHT_CLASS_NAMES[armor.weightClass]} · ${armor.armorRating}`, description: armor.description }));

/** Carrier station "Ausrüstung": weapons, melee, tactical slot, backpack and body armor. The server validates. */
export function LoadoutPanel({ status, apply, close, fault }: {
  status: GameStatus; apply: (selection: LoadoutSelection) => void; close: () => void; fault?: string;
}) {
  const active = status.loadout.selection;
  const [draft, setDraft] = useState<LoadoutSelection>(active);
  const key = JSON.stringify(active);
  useEffect(() => setDraft(active), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (field: keyof LoadoutSelection) => (id: string) => setDraft({ ...draft, [field]: id });
  const changed = !sameSelection(draft, active);
  const primary = resolveWeapon(BALANCE, draft.primaryWeaponId);
  const secondary = resolveWeapon(BALANCE, draft.secondaryWeaponId);
  return <Terminal kicker="Skyfall Carrier · Waffenkammer" title="Ausrüstung" className="loadout-terminal"
    state={<span className={changed ? 'pending' : 'active'}>{changed ? 'Nicht übernommen' : 'Aktiv'}</span>}
    onClose={close} closeKey={bindings.label('INTERACT')} fault={status.loadoutError ?? fault}
    actions={<>
      <button className="primary" type="button" disabled={!changed} onClick={() => apply(draft)}>Ausrüstung übernehmen<span aria-hidden="true">✓</span></button>
      <button className="text-button" type="button" disabled={sameSelection(draft, STANDARD_LOADOUT)}
        onClick={() => setDraft(STANDARD_LOADOUT)}>Standard</button>
    </>}>
    <section className="loadout-weapon">
      <h3>Primärwaffe</h3>
      <KitIcon id={primary.id} slot="primary" className="large"/>
      <Picker label="Modell" value={draft.primaryWeaponId} choices={weaponsIn('primary')} onChange={set('primaryWeaponId')}/>
      <WeaponStats weapon={primary}/>
    </section>
    <section className="loadout-weapon">
      <h3>Sekundärwaffe</h3>
      <KitIcon id={secondary.id} slot="secondary" className="large"/>
      <Picker label="Modell" value={draft.secondaryWeaponId} choices={weaponsIn('secondary')} onChange={set('secondaryWeaponId')}/>
      <WeaponStats weapon={secondary}/>
    </section>
    <section className="loadout-kit">
      <h3>Ausstattung</h3>
      <div className="loadout-kit-grid">
        <Picker label="Nahkampf" value={draft.meleeId} choices={[...BALANCE.meleeAttacks.values()]} onChange={set('meleeId')}/>
        <Picker label="Taktisch" value={draft.grenadeId} choices={[...BALANCE.grenades.values()]} onChange={set('grenadeId')}/>
        <Picker label="Medizin" value={draft.medicalId} choices={[...BALANCE.medicalItems.values()]} onChange={set('medicalId')}/>
        <Picker label="Rucksack" value={draft.backpackId} choices={[...BALANCE.backpacks.values()]} onChange={set('backpackId')}/>
      </div>
    </section>
    <section className="loadout-kit loadout-armor">
      <h3>Rüstung</h3>
      <div className="loadout-armor-grid">
        <div className="terminal-column">
          <Picker label="Modell" value={draft.armorId} choices={armors} onChange={set('armorId')}/>
          <p className="terminal-note">{BALANCE.bodyArmor(draft.armorId).description} Vorschau im Raum Rüstung.</p>
        </div>
        <ArmorStats armor={BALANCE.bodyArmor(draft.armorId)}/>
      </div>
    </section>
  </Terminal>;
}

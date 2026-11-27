import { useEffect, useState } from 'react';
import { BALANCE, TEAM_COLORS, UNLOCKS, formatResourceAmounts, hasResources, missingResources, resolveWeapon, unlockBlocker } from '@freefall/shared';
import type { AccountUnlock, LoadoutSelection, UnlockDefinition } from '@freefall/shared';
import { AccountError, unlock, unlocks } from '../account/AccountClient.ts';
import type { GameStatus } from '../game/Game.ts';
import { bindings } from '../input/Bindings.ts';
import { ArmorPreview } from './ArmorPreview.tsx';
import { ArmorStats, WEIGHT_CLASS_NAMES, armorLook } from './ArmoryPanel.tsx';
import type { ArmoryAccount } from './ArmoryPanel.tsx';
import { KitIcon } from './HudIcons.tsx';
import { WeaponStats } from './LoadoutPanel.tsx';
import { ResourceBar } from './Resources.tsx';
import { Terminal } from './Terminal.tsx';

type GroupId = 'weapon' | 'armor' | 'kit' | 'attachment';
const isArmor = (entry: UnlockDefinition) => !!entry.equipmentId && BALANCE.bodyArmors.has(entry.equipmentId);
/**
 * Arsenal-Rubriken: Rüstungen bekommen eine eigene Rubrik, obwohl sie im Register Verbesserungen sind. Forschung hat
 * ihren eigenen Raum (FORSCHUNG, `ResearchPanel`).
 */
const GROUPS: readonly { id: GroupId; label: string; match: (entry: UnlockDefinition) => boolean }[] = [
  { id: 'weapon', label: 'Waffen', match: (entry) => entry.kind === 'weapon' },
  { id: 'armor', label: 'Rüstungen', match: isArmor },
  { id: 'kit', label: 'Ausstattung', match: (entry) => entry.kind === 'upgrade' && !isArmor(entry) },
  { id: 'attachment', label: 'Attachments', match: (entry) => entry.kind === 'attachment' },
];
const SOURCE: Record<AccountUnlock['source'], string> = { starter: 'Grundausstattung', level: 'Levelstufe', choice: 'Freigeschaltet', admin: 'Vergeben' };
const SLOT_NAMES: Record<string, string> = { primary: 'Primärwaffe', secondary: 'Sekundärwaffe' };

/** Loadout-Feld, das eine Freischaltung belegt, oder undefined (Attachments, Forschung). */
function loadoutField(entry: UnlockDefinition): keyof LoadoutSelection | undefined {
  if (entry.weaponId) return BALANCE.weapons.get(entry.weaponId)?.slot === 'secondary' ? 'secondaryWeaponId' : 'primaryWeaponId';
  const id = entry.equipmentId;
  if (!id) return undefined;
  if (BALANCE.bodyArmors.has(id)) return 'armorId';
  if (BALANCE.grenades.has(id)) return 'grenadeId';
  if (BALANCE.medicalItems.has(id)) return 'medicalId';
  if (BALANCE.meleeAttacks.has(id)) return 'meleeId';
  if (BALANCE.backpacks.has(id)) return 'backpackId';
  return undefined;
}
const itemId = (entry: UnlockDefinition) => entry.weaponId ?? entry.equipmentId;

/**
 * Carrier-Station "Arsenal": zentrale Stelle für Freischaltungen. Listet Waffen, Rüstungen, Ausstattung und Attachments
 * mit Status, Preis und Werten, kauft gegen Ressourcen (zweistufig, keine Rückerstattung) und rüstet
 * Freigeschaltetes direkt aus. Ohne Account (Gastraum) ist alles verfügbar und nichts käuflich.
 */
export function ArsenalPanel({ status, apply, close, fault, account }: {
  status: GameStatus; apply: (selection: LoadoutSelection) => void; close: () => void; fault?: string; account?: ArmoryAccount;
}) {
  const active = status.loadout.selection;
  const [group, setGroup] = useState<GroupId>('weapon');
  const [chosenId, setChosenId] = useState<string>();
  const [owned, setOwned] = useState<readonly AccountUnlock[]>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string>();
  const [shopFault, setShopFault] = useState('');
  const [notice, setNotice] = useState('');
  const token = account?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    unlocks(token).then((list) => { if (!cancelled) setOwned(list); },
      (error: unknown) => { if (!cancelled) setShopFault(error instanceof AccountError ? error.message : 'Arsenal nicht verfügbar.'); });
    return () => { cancelled = true; };
  }, [token]);
  const have = new Map((owned ?? []).map((entry) => [entry.id, entry]));
  const ids = new Set(have.keys());
  const level = account?.profile.level ?? 1;
  const loading = !!account && !owned && !shopFault;

  const entries = UNLOCKS.list.filter(GROUPS.find(({ id }) => id === group)!.match);
  const chosen = entries.find(({ id }) => id === chosenId) ?? entries[0];
  useEffect(() => { setConfirm(undefined); setNotice(''); }, [chosen?.id]);

  /** Zustand einer Freischaltung für diesen Operator. */
  function state(entry: UnlockDefinition) {
    const mine = have.get(entry.id);
    if (!account) return { available: true, label: 'Gastraum' };
    if (mine) return { available: true, label: SOURCE[mine.source] };
    if (!owned) return { available: false, label: '…' };
    const blocker = unlockBlocker(entry, level, ids, UNLOCKS);
    if (blocker) return { available: false, label: blocker, blocker };
    const price = hasResources(entry.cost) ? formatResourceAmounts(entry.cost) : '';
    if (entry.acquisition !== 'choice') return { available: false, label: 'beim nächsten Abgleich' };
    const short = entry.cost ? missingResources(account.profile.resources, entry.cost) : {};
    return { available: false, label: price || 'frei', price, buyable: true, short: hasResources(short) ? formatResourceAmounts(short) : '' };
  }
  const equipped = (entry: UnlockDefinition) => {
    const field = loadoutField(entry);
    return !!field && active[field] === itemId(entry);
  };

  async function buy(entry: UnlockDefinition) {
    if (!account) return;
    if (confirm !== entry.id) { setConfirm(entry.id); return; }
    setBusy(true); setShopFault(''); setNotice('');
    try {
      const result = await unlock(account.token, entry.id);
      setOwned(result.unlocks);
      if (result.account) account.onAccount(result.account);
      setNotice(`${entry.displayName} freigeschaltet.`);
    } catch (error) {
      setShopFault(error instanceof AccountError ? error.message : 'Freischaltung fehlgeschlagen.');
    } finally {
      setBusy(false); setConfirm(undefined);
    }
  }

  const current = chosen && state(chosen);
  const field = chosen && loadoutField(chosen);
  const weapon = chosen?.weaponId ? resolveWeapon(BALANCE, chosen.weaponId) : undefined;
  const armor = chosen?.equipmentId && BALANCE.bodyArmors.has(chosen.equipmentId) ? BALANCE.bodyArmor(chosen.equipmentId) : undefined;
  const slot = status.players.find((player) => player.id === status.ownId)?.slot ?? 0;

  let action = null;
  if (chosen && current) {
    if (current.buyable) {
      const confirming = confirm === chosen.id;
      action = <button className={`primary${confirming ? ' confirm' : ''}`} type="button" disabled={busy || !!current.short}
        onClick={() => void buy(chosen)}>
        {current.short ? `Es fehlen ${current.short}` : confirming ? `Kauf bestätigen · ${current.price}` : `Freischalten · ${current.price}`}
        <span aria-hidden="true">◆</span></button>;
    } else if (current.available && field) {
      const on = equipped(chosen);
      action = <button className="primary" type="button" disabled={on}
        onClick={() => { apply({ ...active, [field]: itemId(chosen)! }); setNotice(`${chosen.displayName} ausgerüstet.`); }}>
        {on ? 'Ausgerüstet' : 'Ausrüsten'}<span aria-hidden="true">✓</span></button>;
    } else if (current.blocker) {
      action = <button className="primary" type="button" disabled>Gesperrt: {current.blocker}</button>;
    }
  }

  return <Terminal kicker="Skyfall Carrier · Deck 03" title="Arsenal" className="arsenal-terminal"
    state={account ? `Level ${level}` : 'Gastraum'}
    onClose={close} closeKey={bindings.label('INTERACT')} fault={shopFault || status.loadoutError || fault}
    actions={<>{action}{confirm && <button className="text-button" type="button" onClick={() => setConfirm(undefined)}>Abbrechen</button>}</>}>
    <section className="terminal-column arsenal-index">
      {account && <ResourceBar balance={account.profile.resources} max/>}
      <div className="arsenal-tabs" role="tablist" aria-label="Rubriken">
        {GROUPS.map(({ id, label }) => {
          const count = UNLOCKS.list.filter(GROUPS.find((entry) => entry.id === id)!.match).length;
          return <button key={id} type="button" role="tab" aria-selected={group === id} disabled={!count}
            onClick={() => { setGroup(id); setChosenId(undefined); }}>{label}<b>{count}</b></button>;
        })}
      </div>
      {loading && <p className="terminal-note" role="status">Lade Freischaltungen …</p>}
      <div className="arsenal-list" role="listbox" aria-label={GROUPS.find(({ id }) => id === group)!.label}>
        {entries.map((entry) => {
          const entryState = state(entry);
          const kind = entryState.available ? 'owned' : entryState.buyable ? entryState.short ? 'short' : 'buyable' : 'locked';
          return <button key={entry.id} type="button" role="option" aria-selected={entry.id === chosen?.id}
            className={`arsenal-entry ${kind}${entry.id === chosen?.id ? ' chosen' : ''}${equipped(entry) ? ' worn' : ''}`}
            onClick={() => setChosenId(entry.id)}>
            {entry.weaponId && <KitIcon id={entry.weaponId} slot={BALANCE.weapons.get(entry.weaponId)?.slot}/>}
            <strong>{entry.displayName}</strong>
            <span>{entryState.label}</span>
          </button>;
        })}
      </div>
    </section>
    {chosen && current && <section className="terminal-column arsenal-detail">
      {armor ? <div className="arsenal-stage armor"><ArmorPreview look={armorLook(armor.id, active.backpackId)} team={TEAM_COLORS[slot % TEAM_COLORS.length]}/></div>
        : weapon ? <div className="arsenal-stage"><KitIcon id={weapon.id} slot={weapon.slot} className="large"/></div> : null}
      <h3>{chosen.displayName}<b>{weapon ? SLOT_NAMES[weapon.slot] ?? '' : armor ? WEIGHT_CLASS_NAMES[armor.weightClass] : ''}</b></h3>
      <p className="terminal-note">{armor?.description ?? chosen.description}</p>
      <dl className="intel-params arsenal-terms">
        <div><dt>Status</dt><dd className={current.available ? 'better' : ''}>{current.available ? current.label : current.blocker ? `Gesperrt · ${current.blocker}` : 'Nicht freigeschaltet'}</dd></div>
        {!current.available && current.price && <div><dt>Preis</dt><dd className="arsenal-price">{current.price}</dd></div>}
        {!current.available && chosen.level > 1 && <div><dt>Mindestlevel</dt><dd>{chosen.level}</dd></div>}
        {field && current.available && <div><dt>Loadout</dt><dd>{equipped(chosen) ? 'Ausgerüstet' : 'Im Lager'}</dd></div>}
      </dl>
      {weapon && <WeaponStats weapon={weapon}/>}
      {armor && <ArmorStats armor={armor} research={status.research}/>}
      {confirm === chosen.id && <p className="terminal-warn" role="status">Freischaltungen sind endgültig, es gibt keine Rückerstattung.</p>}
      {notice && <p className="arsenal-notice" role="status">{notice}</p>}
    </section>}
  </Terminal>;
}

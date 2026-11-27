import { useEffect, useState } from 'react';
import { BALANCE, MAX_ARMOR_RATING, STANDARD_LOADOUT, TEAM_COLORS, UNLOCKS, armorDamageTaken, formatResourceAmounts, hasResources,
  missingResources, unlockBlocker } from '@freefall/shared';
import type { AccountProfile, AccountUnlock, ArmorWeightClass, BodyArmorDefinition, LoadoutSelection, OperatorLook } from '@freefall/shared';
import { unlock, unlocks } from '../account/AccountClient.ts';
import type { GameStatus } from '../game/Game.ts';
import { sameSelection } from '../game/Loadouts.ts';
import { bindings } from '../input/Bindings.ts';
import { ArmorPreview } from './ArmorPreview.tsx';
import { ResourceBar } from './Resources.tsx';
import { Terminal } from './Terminal.tsx';

export const WEIGHT_CLASS_NAMES: Readonly<Record<ArmorWeightClass, string>> = {
  leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer', ueberschwer: 'Überschwer',
};
const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** Armour values of one body armour: rating, damage taken, effective health. */
export function ArmorStats({ armor }: { armor: BodyArmorDefinition }) {
  const taken = armorDamageTaken(BALANCE.armorEffects, armor.armorRating);
  const health = BALANCE.operator.maxHealth / taken;
  return <dl className="intel-params loadout-stats armor-stats">
    <div><dt>Gewichtsklasse</dt><dd>{WEIGHT_CLASS_NAMES[armor.weightClass]}</dd></div>
    <div className="armor-rating"><dt>Rüstungspunkte</dt>
      <dd><i style={{ '--fill': `${armor.armorRating / MAX_ARMOR_RATING * 100}%` } as React.CSSProperties}/>{armor.armorRating}</dd></div>
    <div><dt>Erlittener Schaden</dt><dd className={taken > 1 ? 'worse' : taken < 1 ? 'better' : ''}>{percent.format(taken)}</dd></div>
    <div><dt>Effektive Lebenspunkte</dt><dd>{number.format(health)}</dd></div>
  </dl>;
}

export function armorLook(armorId: string, backpackId: string): OperatorLook {
  const armor = BALANCE.bodyArmor(armorId).visual;
  return { armor: armor.armor, helmet: armor.helmet, pack: BALANCE.backpack(backpackId).visual };
}

/** Unlock that grants a body armour (Arsenal entry with its price). */
const unlockOf = (armorId: string) => UNLOCKS.list.find((entry) => entry.equipmentId === armorId);

/** Signed-in operator: the Rüstkammer reads what the account owns and can buy armour like the Arsenal. */
export interface ArmoryAccount {
  token: string;
  profile: AccountProfile;
  onAccount: (profile: AccountProfile) => void;
}

/**
 * Carrier station "Rüstung" (Rüstkammer): pick the body armour with a turntable preview and its values, buy locked
 * armour with SKR and put it on. Applies the whole loadout with the new armour; the server validates ownership like in
 * the Ausrüstung terminal. Without an account (guest rooms) every armour is available.
 */
export function ArmoryPanel({ status, apply, close, fault, account }: {
  status: GameStatus; apply: (selection: LoadoutSelection) => void; close: () => void; fault?: string; account?: ArmoryAccount;
}) {
  const active = status.loadout.selection;
  const [armorId, setArmorId] = useState(active.armorId);
  const [owned, setOwned] = useState<readonly AccountUnlock[]>();
  const [buying, setBuying] = useState(false);
  const [shopFault, setShopFault] = useState('');
  useEffect(() => setArmorId(active.armorId), [active.armorId]);
  const token = account?.token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    unlocks(token).then((list) => { if (!cancelled) setOwned(list); }, () => { if (!cancelled) setShopFault('Freischaltungen nicht verfügbar.'); });
    return () => { cancelled = true; };
  }, [token]);
  const ids = new Set((owned ?? []).map(({ id }) => id));
  /** Unlock still missing for an armour, or undefined when it can be worn. Unknown until the list has loaded. */
  const lock = (id: string) => {
    const entry = unlockOf(id);
    return account && owned && entry && !ids.has(entry.id) ? entry : undefined;
  };
  const draft: LoadoutSelection = { ...active, armorId };
  const changed = !sameSelection(draft, active);
  const armors = [...BALANCE.bodyArmors.values()].sort((a, b) => a.armorRating - b.armorRating);
  const chosen = BALANCE.bodyArmor(armorId);
  const locked = lock(armorId);
  const price = locked && hasResources(locked.cost) ? formatResourceAmounts(locked.cost) : '';
  const blocker = locked && account ? unlockBlocker(locked, account.profile.level, ids, UNLOCKS) : undefined;
  const short = locked?.cost && account ? missingResources(account.profile.resources, locked.cost) : {};
  const affordable = !Object.keys(short).length;
  const slot = status.players.find((player) => player.id === status.ownId)?.slot ?? 0;

  async function buy() {
    if (!account || !locked) return;
    setBuying(true);
    setShopFault('');
    try {
      const result = await unlock(account.token, locked.id);
      setOwned(result.unlocks);
      if (result.account) account.onAccount(result.account);
    } catch (error) {
      setShopFault(error instanceof Error ? error.message : 'Freischaltung fehlgeschlagen.');
    } finally {
      setBuying(false);
    }
  }

  return <Terminal kicker="Skyfall Carrier · Rüstkammer" title="Rüstung" className="armory-terminal"
    state={<span className={locked ? 'pending' : changed ? 'pending' : 'active'}>{locked ? 'Gesperrt' : changed ? 'Nicht übernommen' : 'Aktiv'}</span>}
    onClose={close} closeKey={bindings.label('INTERACT')} fault={shopFault || status.loadoutError || fault}
    actions={<>
      {locked
        ? <button className="primary" type="button" disabled={buying || !!blocker || !affordable} onClick={() => void buy()}>
          {blocker ? `Gesperrt: ${blocker}` : affordable ? `Freischalten · ${price}` : `Es fehlen ${formatResourceAmounts(short)}`}
          <span aria-hidden="true">◆</span></button>
        : <button className="primary" type="button" disabled={!changed} onClick={() => apply(draft)}>Rüstung anlegen<span aria-hidden="true">✓</span></button>}
      <button className="text-button" type="button" disabled={armorId === STANDARD_LOADOUT.armorId}
        onClick={() => setArmorId(STANDARD_LOADOUT.armorId)}>Standard</button>
    </>}>
    <section className="armory-stage">
      <ArmorPreview look={armorLook(armorId, active.backpackId)} team={TEAM_COLORS[slot % TEAM_COLORS.length]}/>
    </section>
    <section className="terminal-column armory-list">
      <h3>Rüstungen <b>{armors.length}</b></h3>
      <div role="radiogroup" aria-label="Rüstung">
        {armors.map((armor) => <button key={armor.id} type="button" role="radio" aria-checked={armor.id === armorId}
          className={`armor-option${armor.id === armorId ? ' chosen' : ''}${armor.id === active.armorId ? ' worn' : ''}`}
          onClick={() => setArmorId(armor.id)}>
          <strong>{armor.displayName}</strong>
          <span>{WEIGHT_CLASS_NAMES[armor.weightClass]} · {armor.armorRating} Rüstungspunkte</span>
          {lock(armor.id)?.cost && <small className="armor-price">{formatResourceAmounts(lock(armor.id)!.cost!)}</small>}
        </button>)}
      </div>
      <h3>{chosen.displayName}</h3>
      <p className="terminal-note">{chosen.description}</p>
      <ArmorStats armor={chosen}/>
      {account && <ResourceBar balance={account.profile.resources} ids={['credits']}/>}
      <p className="terminal-note">Rüstungspunkte senken jeden Treffer: Gegner, Explosionen und Eigenbeschuss. Tempo und Ausdauer sind noch für alle Klassen gleich.</p>
    </section>
  </Terminal>;
}

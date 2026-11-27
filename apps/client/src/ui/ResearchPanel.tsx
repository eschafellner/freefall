import { useEffect, useState } from 'react';
import { BALANCE, RESEARCH_FIELDS, RESOURCES, formatResourceAmounts, hasResources, missingResources, researchBonus } from '@freefall/shared';
import type { AccountUnlock, ResearchField, ResearchStage } from '@freefall/shared';
import { AccountError, unlock, unlocks } from '../account/AccountClient.ts';
import type { GameStatus } from '../game/Game.ts';
import { bindings } from '../input/Bindings.ts';
import type { ArmoryAccount } from './ArmoryPanel.tsx';
import { ResourceBar } from './Resources.tsx';
import { Terminal } from './Terminal.tsx';

const count = new Intl.NumberFormat('de-DE');
const percent = (share: number) => `+${Math.round(share * 100)} %`;
const stageNumber = (index: number) => String(index + 1).padStart(2, '0');

/** Gesamtwirkung abgeschlossener Stufen als Zeilen: Lebenspunkte, Ausdauer, Hechtsprung. */
function effectRows(done: Iterable<string>) {
  const bonus = researchBonus(done);
  return {
    health: BALANCE.operator.maxHealth + bonus.maxHealth,
    stamina: bonus.stamina,
    dive: bonus.dive,
  };
}

/**
 * Carrier-Station "Forschung": Forschungsgebiete als Ketten von Stufen. Jede Stufe setzt die vorige voraus, kostet
 * Proben und SKR und wirkt dauerhaft auf den eigenen Operator (Lebenspunkte, Ausdauer, Hechtsprung). Gekauft wird wie
 * im Arsenal (zweistufig, keine Rückerstattung); danach meldet `onResearch` dem Server die neue Forschung.
 */
export function ResearchPanel({ status, close, fault, account, onResearch }: {
  status: GameStatus; close: () => void; fault?: string; account?: ArmoryAccount; onResearch: () => void;
}) {
  const [fieldId, setFieldId] = useState(RESEARCH_FIELDS[0]!.id);
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
      (error: unknown) => { if (!cancelled) setShopFault(error instanceof AccountError ? error.message : 'Forschung nicht verfügbar.'); });
    return () => { cancelled = true; };
  }, [token]);

  const done = new Set((owned ?? []).map(({ id }) => id).filter((id) => id.startsWith('research.')));
  const field: ResearchField = RESEARCH_FIELDS.find(({ id }) => id === fieldId) ?? RESEARCH_FIELDS[0]!;
  const next = field.stages.find((stage) => !done.has(stage.id));
  const chosen: ResearchStage = field.stages.find(({ id }) => id === chosenId) ?? next ?? field.stages[field.stages.length - 1]!;
  const index = field.stages.indexOf(chosen);
  // The selection moves on to the next stage after a purchase; the success notice stays until the player picks a stage.
  useEffect(() => setConfirm(undefined), [chosen.id]);

  const total = RESEARCH_FIELDS.reduce((sum, entry) => sum + entry.stages.length, 0);
  const finished = RESEARCH_FIELDS.reduce((sum, entry) => sum + entry.stages.filter(({ id }) => done.has(id)).length, 0);
  const complete = done.has(chosen.id);
  const previous = index > 0 ? field.stages[index - 1]! : undefined;
  const waiting = !complete && previous && !done.has(previous.id);
  const short = account && !complete ? missingResources(account.profile.resources, chosen.cost) : {};
  const price = formatResourceAmounts(chosen.cost);
  const now = effectRows(done);
  const after = effectRows([...done, chosen.id]);

  async function research() {
    if (!account) return;
    if (confirm !== chosen.id) { setConfirm(chosen.id); return; }
    setBusy(true); setShopFault(''); setNotice('');
    try {
      const result = await unlock(account.token, chosen.id);
      setOwned(result.unlocks);
      if (result.account) account.onAccount(result.account);
      onResearch();
      setNotice(`${chosen.displayName} abgeschlossen. Die Wirkung gilt ab sofort.`);
    } catch (error) {
      setShopFault(error instanceof AccountError ? error.message : 'Forschung fehlgeschlagen.');
    } finally {
      setBusy(false); setConfirm(undefined);
    }
  }

  const confirming = confirm === chosen.id;
  const action = !account ? <button className="primary" type="button" disabled>Forschung nur mit Operator-Konto</button>
    : !owned ? <button className="primary" type="button" disabled>Lade Forschungsstand …</button>
    : complete ? <button className="primary" type="button" disabled>Erforscht<span aria-hidden="true">✓</span></button>
    : waiting ? <button className="primary" type="button" disabled>Zuerst {previous!.displayName}</button>
    : hasResources(short) ? <button className="primary" type="button" disabled>Es fehlen {formatResourceAmounts(short)}</button>
    : <button className={`primary${confirming ? ' confirm' : ''}`} type="button" disabled={busy} onClick={() => void research()}>
      {confirming ? `Forschung bestätigen · ${price}` : `Erforschen · ${price}`}<span aria-hidden="true">◆</span></button>;

  return <Terminal kicker="Skyfall Carrier · Deck 03" title="Forschung" className="research-terminal"
    state={account ? `${finished} / ${total} Stufen erforscht` : 'Gastraum'}
    onClose={close} closeKey={bindings.label('INTERACT')} fault={shopFault || fault}
    actions={<>{action}{confirming && <button className="text-button" type="button" onClick={() => setConfirm(undefined)}>Abbrechen</button>}</>}>
    <section className="terminal-column research-index">
      {account && <ResourceBar balance={account.profile.resources} max/>}
      <div className="research-fields" role="tablist" aria-label="Forschungsgebiete">
        {RESEARCH_FIELDS.map((entry) => {
          const progress = entry.stages.filter(({ id }) => done.has(id)).length;
          return <button key={entry.id} type="button" role="tab" aria-selected={entry.id === field.id}
            onClick={() => { setFieldId(entry.id); setChosenId(undefined); }}>
            <strong>{entry.displayName}</strong>
            <span>{progress} / {entry.stages.length} Stufen</span>
            <i style={{ '--fill': `${progress / entry.stages.length * 100}%` } as React.CSSProperties}/>
          </button>;
        })}
      </div>
      <p className="terminal-note">{field.description}</p>
      <ol className="research-chain" aria-label={field.displayName}>
        {field.stages.map((stage, position) => {
          const finishedStage = done.has(stage.id);
          const open = !finishedStage && (position === 0 || done.has(field.stages[position - 1]!.id));
          const state = finishedStage ? 'done' : open ? 'open' : 'locked';
          return <li key={stage.id} className={`research-stage ${state}${stage.id === chosen.id ? ' chosen' : ''}`}>
            <button type="button" aria-current={stage.id === chosen.id} onClick={() => { setChosenId(stage.id); setNotice(''); }}>
              <b>{finishedStage ? '✓' : stageNumber(position)}</b>
              <strong>{stage.displayName}</strong>
              <em>{finishedStage ? 'Erforscht' : open ? 'Verfügbar' : 'Gesperrt'}</em>
              <span>{finishedStage ? stage.effectText : formatResourceAmounts(stage.cost)}</span>
            </button>
          </li>;
        })}
      </ol>
    </section>
    <section className="terminal-column research-detail">
      <h3>{chosen.displayName}<b>Stufe {index + 1} / {field.stages.length}</b></h3>
      <p className="research-text">{chosen.description}</p>
      <div className="research-effect"><span>Auswirkung</span><strong>{chosen.effectText}</strong></div>
      <dl className="intel-params research-terms">
        <div><dt>Status</dt><dd className={complete ? 'better' : waiting ? '' : hasResources(short) ? 'worse' : 'open'}>
          {complete ? 'Erforscht' : waiting ? `Benötigt ${previous!.displayName}` : hasResources(short) ? 'Ressourcen fehlen' : 'Bereit zur Forschung'}</dd></div>
        {RESOURCES.filter(({ id }) => chosen.cost[id]).map(({ id, displayName }) => {
          const need = chosen.cost[id]!;
          const have = account?.profile.resources[id] ?? 0;
          return <div key={id}><dt>{displayName}</dt>
            <dd className={complete || !account ? '' : have >= need ? 'better' : 'worse'}>
              {count.format(need)}{account && !complete && <small> · vorhanden {count.format(have)}</small>}</dd></div>;
        })}
      </dl>
      <h3>Wirkung auf deinen Operator</h3>
      <dl className="intel-params research-terms">
        <div><dt>Lebenspunkte</dt><dd>{now.health}{!complete && after.health !== now.health && <b> → {after.health}</b>}</dd></div>
        <div><dt>Ausdauer</dt><dd>{percent(now.stamina)}{!complete && after.stamina !== now.stamina && <b> → {percent(after.stamina)}</b>}</dd></div>
        <div><dt>Hechtsprungweite</dt><dd>{percent(now.dive)}{!complete && after.dive !== now.dive && <b> → {percent(after.dive)}</b>}</dd></div>
      </dl>
      {confirming && <p className="terminal-warn" role="status">Forschung ist endgültig, es gibt keine Rückerstattung.</p>}
      {notice && <p className="arsenal-notice" role="status">{notice}</p>}
      {!account && <p className="terminal-note">Im Gastraum gibt es keine Forschung. Melde dich mit einem Operator an, um zu forschen.</p>}
    </section>
  </Terminal>;
}

import { useEffect, useState } from 'react';
import { DIFFICULTY_REGISTRY, PLANET_REGISTRY, levelProgress } from '@freefall/shared';
import type { AccountProfile, MissionHistoryEntry } from '@freefall/shared';
import { AccountError, missionHistory } from '../account/AccountClient.ts';
import { ResourceBar, ResourceGain } from './Resources.tsx';

const number = new Intl.NumberFormat('de-DE');
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const OUTCOME: Record<MissionHistoryEntry['outcome'], string> = {
  'extracted': 'Extraktion', 'team-lost': 'Truppausfall', 'objective-unavailable': 'Abgebrochen',
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Level, Fortschritt zum nächsten Level und Gesamt-EP. */
export function LevelMeter({ experience, compact = false }: { experience: number; compact?: boolean }) {
  const { level, current, needed } = levelProgress(experience);
  const share = needed ? current / needed : 1;
  return <div className={compact ? 'level-meter compact' : 'level-meter'}>
    <div className="level-meter-head"><strong>Level {level}</strong>
      <span>{needed ? `${number.format(current)} / ${number.format(needed)} EP` : 'Höchstes Level'}</span></div>
    <div className="level-meter-bar" role="progressbar" aria-label="Fortschritt zum nächsten Level"
      aria-valuemin={0} aria-valuemax={needed || 1} aria-valuenow={needed ? current : 1}><i style={{ width: `${share * 100}%` }}/></div>
    {!compact && <small>{number.format(experience)} EP gesamt</small>}
  </div>;
}

/** Dienstakte: Level und die letzten Einsätze des angemeldeten Operators. */
export function ServiceRecord({ token, account, onBack }: { token: string; account: AccountProfile; onBack: () => void }) {
  const [entries, setEntries] = useState<MissionHistoryEntry[]>();
  const [fault, setFault] = useState('');
  useEffect(() => {
    let cancelled = false;
    missionHistory(token).then((list) => { if (!cancelled) setEntries(list); },
      (error: unknown) => { if (!cancelled) setFault(error instanceof AccountError ? error.message : 'Dienstakte nicht verfügbar.'); });
    return () => { cancelled = true; };
  }, [token]);
  return <div className="title-card service-record">
    <div className="title-card-head"><span>Dienstakte · {account.handle}</span></div>
    <LevelMeter experience={account.experience}/>
    <ResourceBar balance={account.resources} max/>
    {fault && <div className="fault" role="alert">{fault}</div>}
    {!entries && !fault && <p role="status">Lade Einsätze …</p>}
    {entries?.length === 0 && <p>Noch keine abgeschlossenen Einsätze.</p>}
    {!!entries?.length && <ol className="record-list">
      {entries.map((entry) => <li key={entry.resultId} className={`record ${entry.outcome}`}>
        <div className="record-head">
          <strong>{entry.missionName}</strong>
          <b>+{number.format(entry.experience)} EP</b>
        </div>
        <div className="record-meta">
          <span>{date.format(entry.finishedAt)}</span>
          {entry.planetId && <span>{PLANET_REGISTRY.get(entry.planetId)?.displayName ?? entry.planetId}</span>}
          <span>{DIFFICULTY_REGISTRY.get(entry.difficultyId)?.displayName ?? entry.difficultyId}</span>
        </div>
        <div className="record-meta">
          <em>{OUTCOME[entry.outcome]}{entry.outcome === 'extracted' && !entry.extracted ? ' · nicht an Bord' : ''}</em>
          <span>Ziele {entry.objectivesCompleted}/{entry.objectivesTotal}</span>
          <span>{entry.kills} Abschüsse</span>
          <span>{clock(entry.durationSeconds)}</span>
        </div>
        <div className="record-meta"><ResourceGain credited={entry.resources} forfeited={entry.forfeited}/></div>
        {entry.squad.length > 0 && <div className="record-squad">mit {entry.squad.join(', ')}</div>}
      </li>)}
    </ol>}
    <button className="title-link" type="button" onClick={onBack}>Zurück zur Einsatzleitstelle</button>
  </div>;
}

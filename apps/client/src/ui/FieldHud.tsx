import type { CSSProperties } from 'react';
import { BALLOON, DIFFICULTY_REGISTRY, FRAG, MAX_PLAYERS, MISSION_REGISTRY, NET, PLANET_REGISTRY, PLAYER, STIM, TEAM_COLORS,
  TIME_OF_DAY, distanceSquared, isOptionalObjective, missionObjectives } from '@freefall/shared';
import type { MissionSnapshot, PlayerState } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { bindings } from '../input/Bindings.ts';
import { KitIcon, Pips } from './HudIcons.tsx';
import { playerWeapon, reserveLabel } from '../game/Loadouts.ts';

export function seconds(until: number, status: GameStatus): number {
  return Math.max(0, Math.ceil((until - Math.max(status.mission?.tick ?? 0, status.serverTick)) / NET.tickHz));
}

/** Fallback ohne Account (Gastmodus). Der Rang bleibt ein Platzhalter, das Level kommt aus dem Roster. */
export const OPERATOR_RANK = { level: 1, rank: 'Operator' } as const;

const clock = (ticks: number) => {
  const total = Math.max(0, Math.floor(ticks / NET.tickHz));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const readable = (id: string) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function MemberKit({ player }: { player: PlayerState }) {
  const gear = player.equipment;
  const slot = gear?.slot ?? 'primary';
  return <ul className="member-kit">
    {(['primary', 'secondary'] as const).map((weaponSlot) => {
      const weapon = playerWeapon(player, weaponSlot);
      const loaded = weaponSlot === slot ? player.ammo : gear?.inactiveAmmo;
      return <li key={weaponSlot} className={weaponSlot === slot ? 'drawn' : ''}>
        <KitIcon id={weapon.id} slot={weaponSlot}/><span>{weapon.displayName}</span>
        <b>{loaded ?? '–'}/{weapon.capacity}{gear && ` · ${reserveLabel(weapon, gear.magazines[weaponSlot])}`}</b>
      </li>;
    })}
    {gear && <li><KitIcon id="grenade"/><span>{FRAG.displayName}</span><Pips value={gear.grenades} max={FRAG.capacity}/></li>}
    {gear && <li><KitIcon id="stim"/><span>{STIM.displayName}</span><Pips value={gear.stims} max={STIM.maxCharges}/></li>}
  </ul>;
}

/** Team overview on the left. TAB expands every card with the member's equipment. */
export function TeamPanel({ status, mission, expanded }: { status: GameStatus; mission?: MissionSnapshot; expanded: boolean }) {
  const players = [...status.players].sort((a, b) => Number(b.id === status.ownId) - Number(a.id === status.ownId) || a.slot - b.slot);
  return <section className={`squad team ${expanded ? 'expanded' : ''}`} aria-label="Spieler im Einsatz">
    <div className="team-heading"><span>Trupp</span><b>{players.length}/{MAX_PLAYERS}</b></div>
    {players.map((player) => {
      const secured = mission?.extraction?.securedIds.includes(player.id);
      const connection = mission?.operators.find((op) => op.id === player.id);
      const offline = connection?.connected === false;
      const down = !player.hp;
      const state = offline ? 'Offline' : down ? 'Gefallen' : mission?.extraction ? secured ? 'Gesichert' : 'Ungesichert' : '';
      const health = Math.max(0, Math.min(1, player.hp / PLAYER.health));
      const own = player.id === status.ownId;
      const account = status.roster.find(({ id }) => id === player.id);
      return <article key={player.id} className={`member ${own ? 'own' : ''} ${down ? 'down' : ''} ${offline ? 'offline' : ''}`}
        style={{ '--slot-color': `#${TEAM_COLORS[player.slot].toString(16).padStart(6, '0')}` } as CSSProperties}>
        <div className="member-head">
          <span className="member-slot">{player.slot + 1}</span>
          <div className="member-name">
            <strong title={account && `${account.name}#${account.tag}`}>{account?.name ?? (own ? 'Du' : `OP ${String(player.slot + 1).padStart(2, '0')}`)}</strong>
            <small>Level {account?.level ?? OPERATOR_RANK.level} · {OPERATOR_RANK.rank}</small>
          </div>
          {state && <em className="member-state">{state}</em>}
          <b className="hp">{player.hp}</b>
        </div>
        <div className="member-hp"><i style={{ width: `${health * 100}%` }}/></div>
        {expanded && <MemberKit player={player}/>}
      </article>;
    })}
  </section>;
}

export interface Alert { tone: string; label: string; value?: string }

/** Hinweiszeilen oben in der Mitte, darunter der TAB-Hinweis (Einsatz und Carrier). */
export function AlertStack({ items }: { items: readonly Alert[] }) {
  return <div className="field-alerts" role="status">
    {items.map((item) => <div key={item.label} className={`field-alert ${item.tone}`}><span>{item.label}</span>{item.value && <strong>{item.value}</strong>}</div>)}
    <div className="intel-hint"><kbd>Tab</kbd> Einsatzinfo</div>
  </div>;
}

/** Urgent mission state that must stay visible without TAB: extraction timer and swarm breaches. */
export function FieldAlerts({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  const extraction = mission.extraction;
  const own = status.players.find((player) => player.id === status.ownId);
  const tethered = extraction?.method === 'balloon' && extraction.securedIds.includes(status.ownId);
  const items: Alert[] = [];
  if (extraction) {
    const remaining = seconds(extraction.endsAt, status);
    items.push({ tone: 'extract', label: extraction.method === 'balloon' ? BALLOON.displayName : 'Albatross 02',
      value: extraction.phase === 'LIFT' ? 'Abflug' : extraction.phase === 'APPROACH' ? 'Rettungsjäger im Anflug'
        : `${extraction.method === 'balloon' ? 'Abholung' : 'Start'} in ${remaining} s · ${extraction.securedIds.length} gesichert` });
    if (extraction.method === 'balloon' && extraction.phase === 'COUNTDOWN' && extraction.phaseAt > extraction.startedAt) {
      items.push({ tone: 'warn', label: 'Neuer Anflug', value: 'Am Seil sichern' });
    }
    if (tethered && own && distanceSquared(extraction, own) >= (extraction.radius - 1.25) ** 2) items.push({ tone: 'warn', label: 'Seil gespannt', value: 'Zonengrenze' });
  } else if (mission.primaryObjectivesCompleted) {
    items.push({ tone: 'extract', label: 'Hauptziele erfüllt', value: `${bindings.label('BALLOON')} · Extraktionsballon einsetzen` });
  }
  if (mission.activeBreaches > 0) items.push({ tone: 'warn', label: 'Schwarmdurchbruch', value: `${mission.activeBreaches} aktiv` });
  return <AlertStack items={items}/>;
}

/** TAB overlay: objectives and the mission parameters. */
export function IntelOverlay({ mission, status, open }: { mission: MissionSnapshot; status: GameStatus; open: boolean }) {
  const name = mission.plan?.displayName ?? MISSION_REGISTRY.get(mission.missionId)?.displayName ?? '';
  const objectives = missionObjectives(mission);
  const difficulty = DIFFICULTY_REGISTRY.get(mission.difficultyId);
  const planet = PLANET_REGISTRY.get(mission.selection?.planetId ?? mission.plan?.world?.planetId ?? '')?.displayName;
  const primary = objectives.filter((item) => !isOptionalObjective(item));
  const completed = mission.objectives.filter((obj) => obj.state === 'complete' && primary.some((item) => item.id === obj.id)).length;
  const albatross = mission.albatross;
  const elapsed = mission.phase === 'DEPLOYED' ? mission.tick - mission.phaseAt : 0;
  const weather = status.weather?.current;
  const params: [string, string][] = [
    ['Einsatzzeit', clock(elapsed)],
    ['Planet', planet ?? '–'],
    ['Schwierigkeit', difficulty?.displayName ?? '–'],
    ...(mission.plan?.timeOfDay ? [['Tageszeit', TIME_OF_DAY[mission.plan.timeOfDay]] as [string, string]] : []),
    ...(weather ? [['Wetter', readable(weather)] as [string, string]] : []),
    ['Aktive Nester', String(mission.activeNests)],
    ['Durchbrüche', `${mission.activeBreaches} aktiv · ${mission.breachCount} gesamt`],
    ['Albatross 02', !albatross ? '–' : `${albatross.lifecycleState === 'DESTROYED' ? 'Zerstört' : albatross.extractionAvailable ? 'Flugfähig' : 'Flugunfähig'} · ${
      albatross.thrusters.filter(({ state }) => state !== 'DESTROYED').length}/4 Düsen`],
    ...(mission.plan ? [['Sammelpunkt', mission.plan.extraction.balloon.label] as [string, string]] : []),
  ];
  return <section className={`intel ${open ? 'open' : ''}`} aria-label="Einsatzinformationen" aria-hidden={!open}>
    <header className="intel-head">
      <span>Operation · {planet}</span>
      <h2>{name}</h2>
      <div className="intel-progress"><span>{mission.primaryObjectivesCompleted ? 'Extraktion' : 'Primärziele'}</span>
        <b>{completed} / {primary.length}</b><i style={{ width: `${primary.length ? completed / primary.length * 100 : 0}%` }}/></div>
    </header>
    <div className="intel-body">
      <div>
        <h3>Ziele</h3>
        <ol className="field-objectives">
          {objectives.map((objective) => {
            const entry = mission.objectives.find((item) => item.id === objective.id);
            if (!entry) return null;
            const detail = entry.state === 'failed' ? 'Gescheitert' : entry.state === 'cancelled' ? 'Beendet' :
              objective.kind === 'destroy-nests' ? `${entry.progress} / ${objective.count}`
              : entry.state === 'defending' ? (entry.completeAt ? `Verbindung · ${seconds(entry.completeAt, status)} s` :
                `Relais besetzen · ${Math.round(entry.progress * 100)} %`)
              : entry.state === 'complete' ? 'Erfüllt' : entry.state === 'locked' ? 'Gesperrt' : 'Bereit';
            return <li key={entry.id} className={entry.state}>
              <i aria-hidden="true"/><span>{objective.label}{isOptionalObjective(objective) && <em> optional</em>}</span><small>{detail}</small>
            </li>;
          })}
        </ol>
      </div>
      <div>
        <h3>Lage</h3>
        <div className="threat"><span>Bedrohung</span><b>{mission.threat}</b><i style={{ width: `${Math.min(100, mission.threat)}%` }}/></div>
        <dl className="intel-params">{params.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
    </div>
  </section>;
}

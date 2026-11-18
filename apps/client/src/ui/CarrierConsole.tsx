import { DIFFICULTIES, MISSION_REGISTRY, PLANET_REGISTRY } from '@freefall/shared';
import type { MissionSelection, MissionSnapshot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';

export function OperatorManifest({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  return <ol className="carrier-manifest" aria-label="Operator-Status">
    {mission.operators.map((operator) => {
      const player = status.players.find(({ id }) => id === operator.id);
      return <li key={operator.id}>
        <span>{operator.id === status.ownId ? 'Du' : `Operator ${(player?.slot ?? 0) + 1}`}</span>
        <strong>{!operator.connected ? 'Verbindung unterbrochen' : operator.ready ? 'Bereit' : operator.boarded ? 'An Bord' : 'Auf dem Carrier'}</strong>
      </li>;
    })}
  </ol>;
}

export function CarrierConsole({ mission, status, select, start }: {
  mission: MissionSnapshot; status: GameStatus; select: (value: MissionSelection) => void; start: () => void;
}) {
  const first = PLANET_REGISTRY.values().next().value!;
  const current = mission.selection ?? { planetId: first.id, missionId: first.missions[0], difficultyId: mission.difficultyId };
  const planet = PLANET_REGISTRY.get(current.planetId)!;
  const definition = MISSION_REGISTRY.get(current.missionId)!;
  const commit = (patch: Partial<MissionSelection>) => select({ ...current, ...patch });
  return <div className="carrier-console">
    <div className="field-heading"><strong>Missionskonsole</strong><span>{status.host ? 'Einsatzleitung' : 'Truppansicht'}</span></div>
    <div className="console-grid">
      <label>Planet
        <select value={current.planetId} disabled={!status.host} onChange={(event) => {
          const next = PLANET_REGISTRY.get(event.target.value)!;
          commit({ planetId: next.id, missionId: next.missions[0] });
        }}>
          {[...PLANET_REGISTRY.values()].map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
        </select>
      </label>
      <label>Mission
        <select value={current.missionId} disabled={!status.host} onChange={(event) => commit({ missionId: event.target.value })}>
          {planet.missions.map((id) => <option key={id} value={id}>{MISSION_REGISTRY.get(id)?.displayName}</option>)}
        </select>
      </label>
      <label>Schwierigkeit
        <select value={current.difficultyId} disabled={!status.host} onChange={(event) => commit({ difficultyId: event.target.value })}>
          {DIFFICULTIES.map(({ id, level, displayName }) => <option key={id} value={id}>{level} · {displayName}</option>)}
        </select>
      </label>
    </div>
    <p>{definition.briefing}</p>
    <OperatorManifest mission={mission} status={status}/>
    {status.host && (mission.selection
      ? <button className="secondary" type="button" onClick={start}>Boarding freigeben</button>
      : <button className="secondary" type="button" onClick={() => select(current)}>Einsatz auswählen</button>)}
  </div>;
}

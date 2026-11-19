import { bindings } from '../input/Bindings.ts';
import { BALLOON, DIFFICULTY_REGISTRY, MISSION_REGISTRY, NET, PLANET_REGISTRY, distanceSquared, isCarrierScene } from '@freefall/shared';
import type { DeploymentPhase, MissionSnapshot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { OperatorManifest } from './CarrierConsole.tsx';

const phaseText: Partial<Record<DeploymentPhase, string>> = {
  LOCKED: 'Rampe verriegelt', DROPPING: 'Fallflug', ATMOSPHERIC_ENTRY: 'Atmosphäreneintritt',
  BRAKING: 'Bremsschub', TOUCHDOWN: 'Aufsetzen',
};

export function seconds(until: number, status: GameStatus): number {
  return Math.max(0, Math.ceil((until - Math.max(status.mission?.tick ?? 0, status.serverTick)) / NET.tickHz));
}

export function MissionHud({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  const definition = MISSION_REGISTRY.get(mission.missionId);
  if (!definition || mission.result) return null;
  const difficulty = DIFFICULTY_REGISTRY.get(mission.difficultyId);
  const selection = mission.selection;
  const own = status.players.find((player) => player.id === status.ownId);
  const carrier = isCarrierScene(mission.state, mission.phase);
  const deployment = mission.state === 'DEPLOYMENT';
  const extraction = mission.extraction;
  const remaining = extraction ? seconds(extraction.endsAt, status) : 0;
  const tethered = extraction?.method === 'balloon' && extraction.securedIds.includes(status.ownId);
  const completed = mission.objectives.filter((obj) => obj.state === 'complete' &&
    definition.objectives.some((item) => item.id === obj.id && item.kind === 'activate')).length;
  const total = definition.objectives.filter((item) => item.kind === 'activate').length;

  return <>
    {carrier && !deployment && <aside className="field-orders carrier-orders">
      <div className="field-heading"><strong>Skyfall Carrier</strong><span>Deck 03</span></div>
      <p>{mission.state === 'BOARDING' ? `Vorn durch die Luftschleuse zum Albatross 02. An Bord mit ${bindings.label('INTERACT')} bereit melden.`
        : `Missionskonsole in der Mitte der Messe. Mit ${bindings.label('INTERACT')} öffnen.`}</p>
      {selection && <div className="field-counter"><span>{PLANET_REGISTRY.get(selection.planetId)?.displayName}</span>
        <strong>{definition.displayName} · {difficulty?.displayName}</strong></div>}
      <OperatorManifest mission={mission} status={status}/>
      {mission.boardingUntil > 0 && <div className="field-extract"><span>START</span><strong>{seconds(mission.boardingUntil, status)} s</strong></div>}
    </aside>}
    {deployment && <div className="deployment-brief" role="status">
      <span>ALBATROSS 02 · {difficulty?.displayName}</span>
      <strong>{phaseText[mission.phase]}</strong><p>{definition.displayName} · {PLANET_REGISTRY.get(selection?.planetId ?? '')?.displayName}</p>
    </div>}
    {!carrier && !deployment && <aside className="field-orders" aria-label="Missionsziele">
      <div className="field-heading"><strong>{definition.displayName}</strong><span>{difficulty?.displayName}</span></div>
      <div className="field-counter"><span>PRIMÄRZIELE</span><strong>{completed} / {total}</strong></div>
      <ol className="field-objectives">
        {definition.objectives.map((objective) => {
          const entry = mission.objectives.find((item) => item.id === objective.id);
          if (!entry) return null;
          const detail = objective.kind === 'destroy-nests' ? `${entry.progress} / ${objective.count} · optional`
            : entry.state === 'defending' ? `Verbindung · ${seconds(entry.completeAt, status)} s`
            : entry.state === 'complete' ? 'Aktiv' : entry.state === 'locked' ? 'Gesperrt' : 'Bereit';
          return <li key={entry.id} className={entry.state}>
            <i aria-hidden="true">{entry.state === 'complete' ? '✓' : '◇'}</i><span>{objective.label}</span><small>{detail}</small>
          </li>;
        })}
      </ol>
      {mission.albatross && <div className="field-extract">
        <span>ALBATROSS 02</span>
        <strong>{mission.albatross.lifecycleState === 'DESTROYED' ? 'Zerstört' : mission.albatross.extractionAvailable ? 'Flugfähig' : 'Flugunfähig'} ·
          {mission.albatross.thrusters.filter(({ state }) => state !== 'DESTROYED').length}/4 Düsen</strong>
      </div>}
      {mission.primaryObjectivesCompleted && <div className="extraction-orders">
        <strong>Hauptziele erfüllt</strong>
        {extraction ? <>
          <span>{extraction.method === 'balloon' ? BALLOON.displayName : 'Albatross 02'} · {extraction.securedIds.length} gesichert</span>
          <span>{extraction.phase === 'LIFT' ? 'Abflug' : extraction.phase === 'APPROACH' ? 'Rettungsjäger im Anflug'
            : extraction.method === 'balloon' ? `Abholung in ${remaining} s` : `Start in ${remaining} s`}</span>
          {extraction.method === 'balloon' && extraction.phase === 'COUNTDOWN' && extraction.phaseAt > extraction.startedAt &&
            <strong>Neuer Anflug · Am Seil sichern</strong>}
          {tethered && own && distanceSquared(extraction, own) >= (extraction.radius - 1.25) ** 2 && <strong>Seil gespannt · Zonengrenze</strong>}
        </> : <>
          <span><kbd>{bindings.label('BALLOON')}</kbd> Extraktionsballon einsetzen</span>
        </>}
      </div>}
    </aside>}
    <div className="combat-notice" role="status">
      {mission.activeBreaches > 0 && <div className="breach-warning">Schwarmdurchbruch entdeckt {mission.activeBreaches > 1 && `× ${mission.activeBreaches}`}</div>}
      {status.notice && <div>{status.notice}</div>}
    </div>
    {status.interaction && !deployment && <div className="interact-hint"><kbd>{bindings.label('INTERACT')}</kbd> {status.interaction}</div>}
    {own?.hp === 0 && <div className="respawn" role="status"><strong>Außer Gefecht</strong><span>Der Einsatztrupp bleibt im Feld.</span></div>}
  </>;
}

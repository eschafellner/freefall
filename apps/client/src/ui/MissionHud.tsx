import { bindings } from '../input/Bindings.ts';
import { DIFFICULTY_REGISTRY, MISSION_REGISTRY, PLANET_REGISTRY, isCarrierScene } from '@freefall/shared';
import type { DeploymentPhase, MissionSnapshot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { OperatorManifest } from './CarrierConsole.tsx';
import { FieldAlerts, IntelOverlay, seconds } from './FieldHud.tsx';

export { seconds };

const phaseText: Partial<Record<DeploymentPhase, string>> = {
  DOCKED: 'Am Carrier angedockt', BOARDING: 'Trupp an Bord', LOCKED: 'Rampe verriegelt', DROPPING: 'Fallflug', ATMOSPHERIC_ENTRY: 'Atmosphäreneintritt',
  BRAKING: 'Bremsschub', TOUCHDOWN: 'Aufsetzen',
};

/** Mission overlays. In the field only urgent alerts stay on screen; objectives and parameters open with TAB. */
export function MissionHud({ mission, status, intel = false }: { mission: MissionSnapshot; status: GameStatus; intel?: boolean }) {
  const name = mission.plan?.displayName ?? MISSION_REGISTRY.get(mission.missionId)?.displayName;
  if (!name || mission.result) return null;
  const difficulty = DIFFICULTY_REGISTRY.get(mission.difficultyId);
  const selection = mission.selection;
  const own = status.players.find((player) => player.id === status.ownId);
  const carrier = isCarrierScene(mission.state, mission.phase);
  const deployment = mission.state === 'DEPLOYMENT';

  return <>
    {carrier && !deployment && <aside className="field-orders carrier-orders">
      <div className="field-heading"><strong>Skyfall Carrier</strong><span>Deck 03</span></div>
      <p>{mission.state === 'BOARDING' ? `Vorn durch die Luftschleuse zum Albatross 02. An Bord mit ${bindings.label('INTERACT')} bereit melden.`
        : `Missionskonsole in der Mitte der Messe. Mit ${bindings.label('INTERACT')} öffnen.`}</p>
      {selection && <div className="field-counter"><span>{PLANET_REGISTRY.get(selection.planetId)?.displayName}</span>
        <strong>{name} · {difficulty?.displayName}</strong></div>}
      {mission.state === 'BOARDING' && mission.plan && <p>{mission.plan.briefing}</p>}
      <OperatorManifest mission={mission} status={status}/>
      {mission.boardingUntil > 0 && <div className="field-extract"><span>START</span><strong>{seconds(mission.boardingUntil, status)} s</strong></div>}
    </aside>}
    {deployment && <div className="deployment-brief" role="status">
      <span>ALBATROSS 02 · {difficulty?.displayName}</span>
      <strong>{phaseText[mission.phase]}</strong><p>{name} · {PLANET_REGISTRY.get(selection?.planetId ?? '')?.displayName}</p>
      {mission.phaseUntil > 0 && <p>{seconds(mission.phaseUntil, status)} s</p>}
    </div>}
    {!carrier && !deployment && <>
      <FieldAlerts mission={mission} status={status}/>
      <IntelOverlay mission={mission} status={status} open={intel}/>
    </>}
    {status.interaction && !deployment && <div className="interact-hint"><kbd>{bindings.label('INTERACT')}</kbd> {status.interaction}</div>}
    {own?.hp === 0 && <div className="respawn" role="status"><strong>Außer Gefecht</strong><span>Der Einsatztrupp bleibt im Feld.</span></div>}
  </>;
}

import { bindings } from '../input/Bindings.ts';
import { DIFFICULTY_REGISTRY, MISSION_REGISTRY, PLANET_REGISTRY, isCarrierScene } from '@freefall/shared';
import type { DeploymentPhase, MissionSnapshot } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { OperatorManifest, missionParams, missionTitle } from './CarrierConsole.tsx';
import { AlertStack, FieldAlerts, IntelOverlay, seconds } from './FieldHud.tsx';
import type { Alert } from './FieldHud.tsx';

export { seconds };

const phaseText: Partial<Record<DeploymentPhase, string>> = {
  DOCKED: 'Am Carrier angedockt', BOARDING: 'Trupp an Bord', LOCKED: 'Rampe verriegelt', DROPPING: 'Fallflug', ATMOSPHERIC_ENTRY: 'Atmosphäreneintritt',
  BRAKING: 'Bremsschub', TOUCHDOWN: 'Aufsetzen',
};

const SAMPLE_LABELS = [['tissue', 'Gewebe'], ['rock', 'Gestein'], ['artifact', 'Artefakte']] as const;

/** Getragene Proben: eigene Menge und Stand des Trupps gegen das Limit. Nur sichtbar, wenn der Trupp Proben trägt. */
function SampleHud({ mission, ownId }: { mission: MissionSnapshot; ownId: string }) {
  const samples = mission.samples;
  if (!samples) return null;
  const own = samples.carried[ownId] ?? {};
  const shown = SAMPLE_LABELS.filter(([id]) => samples.team[id] > 0);
  if (!shown.length) return null;
  return <aside className="sample-hud" aria-label="Getragene Proben">
    {shown.map(([id, label]) => <div key={id} className={`sample ${id}${samples.team[id] >= samples.limits[id] ? ' full' : ''}`}>
      <i aria-hidden="true"/><span>{label}</span><b>{own[id] ?? 0}</b><small>Trupp {samples.team[id]}/{samples.limits[id]}</small>
    </div>)}
  </aside>;
}

/** Carrier-Deck: wie im Einsatz nur knappe Hinweiszeilen oben; Briefing, Trupp und Parameter liegen auf TAB. */
function CarrierAlerts({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  const title = missionTitle(mission);
  const ready = mission.operators.filter((operator) => operator.ready).length;
  const items: Alert[] = [];
  if (mission.state === 'BOARDING') {
    items.push({ tone: 'extract', label: 'Boarding', value: `Albatross 02 · ${ready}/${mission.operators.length} bereit${
      mission.boardingUntil > 0 ? ` · Start in ${seconds(mission.boardingUntil, status)} s` : ''}` });
    items.push({ tone: 'info', label: 'Luftschleuse', value: `An Bord mit ${bindings.label('INTERACT')} bereit melden` });
  } else if (title) {
    items.push({ tone: 'info', label: 'Auftrag', value: `${title} · ${PLANET_REGISTRY.get(mission.selection?.planetId ?? '')?.displayName ?? ''}` });
    items.push({ tone: 'info', label: 'Missionskonsole', value: status.host ? 'Boarding freigeben' : 'Warte auf Boarding-Freigabe' });
  } else {
    items.push({ tone: 'info', label: 'Einsatzplanung', value: status.host ? 'Missionskonsole in der Messe' : 'Einsatzleitung wählt den Auftrag' });
  }
  return <AlertStack items={items}/>;
}

/** TAB am Carrier: gewählter Auftrag mit Briefing, Bereitschaft des Trupps und Parametern. */
function CarrierIntel({ mission, status, open }: { mission: MissionSnapshot; status: GameStatus; open: boolean }) {
  const title = missionTitle(mission);
  const ready = mission.operators.filter((operator) => operator.ready).length;
  const total = mission.operators.length;
  const params = missionParams(mission);
  return <section className={`intel ${open ? 'open' : ''}`} aria-label="Einsatzinformationen" aria-hidden={!open}>
    <header className="intel-head">
      <span>Skyfall Carrier · Deck 03</span>
      <h2>{title ?? 'Kein Auftrag gewählt'}</h2>
      <div className="intel-progress"><span>{mission.state === 'BOARDING' ? 'Boarding · bereit gemeldet' : 'Bereitschaft'}</span>
        <b>{ready} / {total}</b><i style={{ width: `${total ? ready / total * 100 : 0}%` }}/></div>
    </header>
    <div className="intel-body">
      <div>
        <h3>Briefing</h3>
        <p className="intel-brief">{mission.plan?.briefing ?? (mission.selection ? MISSION_REGISTRY.get(mission.selection.missionId)?.briefing
          : 'Die Einsatzleitung wählt an der Missionskonsole in der Messe einen Auftrag.')}</p>
        <h3>Trupp</h3>
        <OperatorManifest mission={mission} status={status}/>
      </div>
      <div>
        <h3>Parameter</h3>
        {params.length ? <dl className="intel-params">{params.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          : <p className="intel-brief">Noch keine Einsatzdaten.</p>}
      </div>
    </div>
  </section>;
}

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
    {carrier && !deployment && <>
      <CarrierAlerts mission={mission} status={status}/>
      <CarrierIntel mission={mission} status={status} open={intel}/>
    </>}
    {deployment && <div className="deployment-brief" role="status">
      <span>ALBATROSS 02 · {difficulty?.displayName}</span>
      <strong>{phaseText[mission.phase]}</strong><p>{name} · {PLANET_REGISTRY.get(selection?.planetId ?? '')?.displayName}</p>
      {mission.phaseUntil > 0 && <p>{seconds(mission.phaseUntil, status)} s</p>}
    </div>}
    {!carrier && !deployment && <>
      <FieldAlerts mission={mission} status={status}/>
      <SampleHud mission={mission} ownId={status.ownId}/>
      <IntelOverlay mission={mission} status={status} open={intel}/>
    </>}
    {status.interaction && !deployment && <div className="interact-hint"><kbd>{bindings.label('INTERACT')}</kbd> {status.interaction}</div>}
    {own?.hp === 0 && <div className="respawn" role="status"><strong>Außer Gefecht</strong><span>Der Einsatztrupp bleibt im Feld.</span></div>}
  </>;
}

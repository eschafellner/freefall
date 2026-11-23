import { useState } from 'react';
import { DIFFICULTIES, MISSION_MODIFIERS, MISSION_REGISTRY, MISSION_TEMPLATES, NET, PLANET_MISSION_PROFILES, PLANET_REGISTRY,
  WORLD_PROFILES, PROCEDURAL_CONTRACT_ID, TIME_OF_DAY, isTimeOfDay, isWorldSeed } from '@freefall/shared';
import type { MissionGenerationSelection, MissionSnapshot, TimeOfDay } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';
import { bindings } from '../input/Bindings.ts';
import { Terminal } from './Terminal.tsx';

export function OperatorManifest({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  return <ol className="carrier-manifest" aria-label="Operator-Status">
    {mission.operators.map((operator) => {
      const player = status.players.find(({ id }) => id === operator.id);
      const state = !operator.connected ? 'offline' : operator.ready ? 'ready' : operator.boarded ? 'boarded' : '';
      return <li key={operator.id} className={state}>
        <i aria-hidden="true"/>
        <span>{status.roster.find(({ id }) => id === operator.id)?.name ?? (operator.id === status.ownId ? 'Du' : `Operator ${(player?.slot ?? 0) + 1}`)}</span>
        <strong>{!operator.connected ? 'Verbindung unterbrochen' : operator.ready ? 'Bereit' : operator.boarded ? 'An Bord' : 'Auf dem Carrier'}</strong>
      </li>;
    })}
  </ol>;
}

/** Eckdaten des gewählten Auftrags als Liste (Missionskonsole und TAB-Einsatzinfo am Carrier). */
export function missionParams(mission: MissionSnapshot): [string, string][] {
  const chosen = mission.selection;
  const plan = mission.plan;
  if (!chosen) return [];
  const params: [string, string][] = [
    ['Planet', PLANET_REGISTRY.get(chosen.planetId)?.displayName ?? '–'],
    ['Schwierigkeit', DIFFICULTIES.find(({ id }) => id === chosen.difficultyId)?.displayName ?? '–'],
  ];
  if (plan?.world) params.push(['Tageszeit', TIME_OF_DAY[plan.timeOfDay ?? 'day']]);
  if (plan) {
    params.push(['Gegnerlimit', String(plan.encounter.maxActiveEnemies)]);
    params.push(['Erste Verstärkung', `nach ${Math.ceil(plan.encounter.firstExtractionPressureTicks / NET.tickHz)} s`]);
    if (plan.modifiers.length) params.push(['Modifikatoren', plan.modifiers.map((id) => MISSION_MODIFIERS.get(id)?.displayName ?? id).join(', ')]);
    params.push(['Sammelpunkt', plan.extraction.balloon.label]);
    if (mission.debug) {
      params.push(['Missions-Seed', `${plan.seed} · v${plan.generatorVersion}`]);
      if (plan.world) params.push(['Welt-Seed', `${plan.world.seed} · v${plan.world.generatorVersion}`]);
    }
  }
  return params;
}

export function missionTitle(mission: MissionSnapshot): string | undefined {
  const chosen = mission.selection;
  return chosen && (mission.plan?.displayName ?? MISSION_REGISTRY.get(chosen.missionId)?.displayName);
}

/** Carrier-Station "Missionskonsole": links die Auftragswahl (nur Host), rechts das Lagebild des gewählten Auftrags. */
export function CarrierConsole({ mission, status, select, start, close, fault }: {
  mission: MissionSnapshot; status: GameStatus; select: (value: MissionGenerationSelection) => void; start: () => void;
  close: () => void; fault?: string;
}) {
  const first = PLANET_REGISTRY.values().next().value!;
  const plan = mission.plan;
  const chosen = mission.selection;
  const [planetId, setPlanet] = useState(chosen?.planetId ?? first.id);
  const [contract, setContract] = useState(plan || mission.fallback ? PROCEDURAL_CONTRACT_ID : chosen?.missionId ?? PROCEDURAL_CONTRACT_ID);
  const [difficultyId, setDifficulty] = useState(chosen?.difficultyId ?? mission.difficultyId);
  const [templateId, setTemplate] = useState(plan?.requestedTemplateId ?? '');
  const [seed, setSeed] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(plan?.timeOfDay ?? 'day');
  const [worldSeed, setWorldSeed] = useState('');
  const planet = PLANET_REGISTRY.get(planetId)!;
  const worldSelection = WORLD_PROFILES.has(planet.id);
  const hasProcedural = worldSelection || PLANET_MISSION_PROFILES.has(planet.id);
  const templates = PLANET_MISSION_PROFILES.get(planet.id)?.templateIds ?? [...MISSION_TEMPLATES.keys()];
  const generated = contract === PROCEDURAL_CONTRACT_ID;
  const commit = () => select({ planetId, missionId: contract, difficultyId,
    ...(worldSelection && timeOfDay !== 'day' ? { timeOfDay } : {}),
    ...(worldSelection && worldSeed !== '' ? { worldSeed: Number(worldSeed) } : {}),
    ...(generated && templateId ? { templateId } : {}), ...(generated && seed !== '' && mission.debug ? { seed: Number(seed) } : {}) });
  const seedValid = (seed === '' || isWorldSeed(Number(seed))) && (!worldSelection || worldSeed === '' || isWorldSeed(Number(worldSeed)));
  const title = missionTitle(mission);
  const params = missionParams(mission);
  const ready = mission.operators.filter(({ ready }) => ready).length;

  return <Terminal kicker="Skyfall Carrier · Missionskonsole" title="Einsatzplanung" className="console-terminal"
    state={status.host ? 'Einsatzleitung' : 'Truppansicht'} onClose={close} closeKey={bindings.label('INTERACT')} fault={fault}
    actions={status.host && chosen
      ? <button className="primary" type="button" onClick={start}>Boarding freigeben<span aria-hidden="true">↗</span></button>
      : <p className="terminal-note">{status.host ? 'Wähle einen Auftrag, um das Boarding freizugeben.' : 'Die Einsatzleitung wählt den Auftrag und gibt das Boarding frei.'}</p>}>
    {status.host && <div className="terminal-column">
      <h3>Auftrag wählen</h3>
      <div className="terminal-fields">
        <label>Planet
          <select value={planet.id} onChange={(event) => {
            const next = PLANET_REGISTRY.get(event.target.value)!;
            setPlanet(next.id);
            setTemplate('');
            setContract((WORLD_PROFILES.has(next.id) || PLANET_MISSION_PROFILES.has(next.id)) ? PROCEDURAL_CONTRACT_ID : next.missions[0]);
          }}>
            {[...PLANET_REGISTRY.values()].map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
          </select>
        </label>
        <label>Auftrag
          <select value={contract} onChange={(event) => setContract(event.target.value)}>
            {hasProcedural && <option value={PROCEDURAL_CONTRACT_ID}>Prozeduraler Auftrag</option>}
            {planet.missions.map((id) => <option key={id} value={id}>{MISSION_REGISTRY.get(id)?.displayName}</option>)}
          </select>
        </label>
        <label>Schwierigkeit
          <select value={difficultyId} onChange={(event) => setDifficulty(event.target.value)}>
            {DIFFICULTIES.map(({ id, level, displayName }) => <option key={id} value={id}>{level} · {displayName}</option>)}
          </select>
        </label>
        {worldSelection && <label>Tageszeit
          <select aria-label="Tageszeit" value={timeOfDay} onChange={(event) => {
            if (isTimeOfDay(event.target.value)) setTimeOfDay(event.target.value);
          }}>
            {Object.entries(TIME_OF_DAY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>}
        {generated && <label className="wide">Vorlage
          <select value={templateId} onChange={(event) => setTemplate(event.target.value)}>
            <option value="">Zufällig</option>
            {templates.map((id) => <option key={id} value={id}>{MISSION_TEMPLATES.get(id)?.displayName}</option>)}
          </select>
        </label>}
      </div>
      {(worldSelection || (generated && mission.debug)) && <details className="terminal-advanced">
        <summary>Erweitert</summary>
        <div className="terminal-fields">
          {worldSelection && <label>Welt-Seed
            <input type="number" min="0" max="4294967295" step="1" placeholder="Zufällig" value={worldSeed}
              onChange={(event) => setWorldSeed(event.target.value)}/>
          </label>}
          {generated && mission.debug && <label>Missions-Seed
            <input type="number" min="0" max="4294967295" step="1" placeholder="Zufällig" value={seed} onChange={(event) => setSeed(event.target.value)}/>
          </label>}
        </div>
      </details>}
      <button className="secondary" type="button" disabled={generated && !seedValid} onClick={commit}>
        {generated ? 'Auftrag erzeugen' : 'Auftrag auswählen'}
      </button>
    </div>}
    <div className="terminal-column">
      <h3>Lagebild</h3>
      {chosen ? <div className="terminal-brief">
        <strong>{title}</strong>
        {mission.fallback && <p role="status" className="terminal-warn">Ersatzauftrag · Generierung fehlgeschlagen (Seed {mission.fallback.seed}).</p>}
        <p>{plan?.briefing ?? MISSION_REGISTRY.get(chosen.missionId)?.briefing}</p>
        <dl className="intel-params">{params.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div> : <p className="terminal-empty">Noch kein Auftrag gewählt.</p>}
      {status.notice && <p className="terminal-warn" role="status">{status.notice}</p>}
      <h3>Trupp <b>{ready}/{mission.operators.length} bereit</b></h3>
      <OperatorManifest mission={mission} status={status}/>
    </div>
  </Terminal>;
}

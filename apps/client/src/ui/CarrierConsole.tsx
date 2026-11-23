import { useState } from 'react';
import { DIFFICULTIES, MISSION_MODIFIERS, MISSION_REGISTRY, MISSION_TEMPLATES, NET, PLANET_MISSION_PROFILES, PLANET_REGISTRY,
  WORLD_PROFILES, PROCEDURAL_CONTRACT_ID, TIME_OF_DAY, isTimeOfDay, isWorldSeed } from '@freefall/shared';
import type { MissionGenerationSelection, MissionSnapshot, TimeOfDay } from '@freefall/shared';
import type { GameStatus } from '../game/Game.ts';

export function OperatorManifest({ mission, status }: { mission: MissionSnapshot; status: GameStatus }) {
  return <ol className="carrier-manifest" aria-label="Operator-Status">
    {mission.operators.map((operator) => {
      const player = status.players.find(({ id }) => id === operator.id);
      return <li key={operator.id}>
        <span>{status.roster.find(({ id }) => id === operator.id)?.name ?? (operator.id === status.ownId ? 'Du' : `Operator ${(player?.slot ?? 0) + 1}`)}</span>
        <strong>{!operator.connected ? 'Verbindung unterbrochen' : operator.ready ? 'Bereit' : operator.boarded ? 'An Bord' : 'Auf dem Carrier'}</strong>
      </li>;
    })}
  </ol>;
}

export function CarrierConsole({ mission, status, select, start }: {
  mission: MissionSnapshot; status: GameStatus; select: (value: MissionGenerationSelection) => void; start: () => void;
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
  const planet = PLANET_REGISTRY.get(status.host ? planetId : chosen?.planetId ?? first.id)!;
  const worldSelection = WORLD_PROFILES.has(planet.id);
  const hasProcedural = worldSelection || PLANET_MISSION_PROFILES.has(planet.id);
  const templates = PLANET_MISSION_PROFILES.get(planet.id)?.templateIds ?? [...MISSION_TEMPLATES.keys()];
  const visibleContract = status.host ? contract : plan || mission.fallback ? PROCEDURAL_CONTRACT_ID : chosen?.missionId ?? PROCEDURAL_CONTRACT_ID;
  const generated = visibleContract === PROCEDURAL_CONTRACT_ID;
  const commit = () => select({ planetId, missionId: contract, difficultyId,
    ...(worldSelection && timeOfDay !== 'day' ? { timeOfDay } : {}),
    ...(worldSelection && worldSeed !== '' ? { worldSeed: Number(worldSeed) } : {}),
    ...(generated && templateId ? { templateId } : {}), ...(generated && seed !== '' && mission.debug ? { seed: Number(seed) } : {}) });
  const seedValid = (seed === '' || isWorldSeed(Number(seed))) && (!worldSelection || worldSeed === '' || isWorldSeed(Number(worldSeed)));
  return <div className="carrier-console">
    <div className="field-heading"><strong>Missionskonsole</strong><span>{status.host ? 'Einsatzleitung' : 'Truppansicht'}</span></div>
    <div className="console-grid">
      <label>Planet
        <select value={planet.id} disabled={!status.host} onChange={(event) => {
          const next = PLANET_REGISTRY.get(event.target.value)!;
          setPlanet(next.id);
          setTemplate('');
          setContract((WORLD_PROFILES.has(next.id) || PLANET_MISSION_PROFILES.has(next.id)) ? PROCEDURAL_CONTRACT_ID : next.missions[0]);
        }}>
          {[...PLANET_REGISTRY.values()].map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
        </select>
      </label>
      <label>Auftrag
        <select value={visibleContract} disabled={!status.host} onChange={(event) => setContract(event.target.value)}>
          {hasProcedural && <option value={PROCEDURAL_CONTRACT_ID}>Prozeduraler Auftrag</option>}
          {planet.missions.map((id) => <option key={id} value={id}>{MISSION_REGISTRY.get(id)?.displayName}</option>)}
        </select>
      </label>
      <label>Schwierigkeit
        <select value={status.host ? difficultyId : chosen?.difficultyId ?? mission.difficultyId} disabled={!status.host}
          onChange={(event) => setDifficulty(event.target.value)}>
          {DIFFICULTIES.map(({ id, level, displayName }) => <option key={id} value={id}>{level} · {displayName}</option>)}
        </select>
      </label>
      {generated && status.host && <label>Vorlage
        <select value={templateId} onChange={(event) => setTemplate(event.target.value)}>
          <option value="">Zufällig</option>
          {templates.map((id) => <option key={id} value={id}>{MISSION_TEMPLATES.get(id)?.displayName}</option>)}
        </select>
      </label>}
      {worldSelection && status.host && <label>Tageszeit
        <select aria-label="Tageszeit" value={timeOfDay} onChange={(event) => {
          if (isTimeOfDay(event.target.value)) setTimeOfDay(event.target.value);
        }}>
          {Object.entries(TIME_OF_DAY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {worldSelection && status.host && <label>Welt-Seed
        <input type="number" min="0" max="4294967295" step="1" placeholder="Zufällig" value={worldSeed}
          onChange={(event) => setWorldSeed(event.target.value)}/>
      </label>}
      {generated && status.host && mission.debug && <label>Missions-Seed
        <input type="number" min="0" max="4294967295" step="1" value={seed} onChange={(event) => setSeed(event.target.value)}/>
      </label>}
    </div>
    {status.host && <button className="secondary" type="button" disabled={generated && !seedValid} onClick={commit}>
      {generated ? 'Neuen Auftrag erzeugen' : 'Einsatz auswählen'}
    </button>}
    {chosen && <>
      <div className="field-heading"><strong>{plan?.displayName ?? MISSION_REGISTRY.get(chosen.missionId)?.displayName}</strong>
        <span>{PLANET_REGISTRY.get(chosen.planetId)?.displayName} · {DIFFICULTIES.find(({ id }) => id === chosen.difficultyId)?.displayName}</span>
      </div>
      {mission.fallback && <p role="status">Ersatzauftrag · Generierung fehlgeschlagen (Seed {mission.fallback.seed}).</p>}
      <p>{plan?.briefing ?? MISSION_REGISTRY.get(chosen.missionId)?.briefing}</p>
      {plan && <>
        <p>Gegnerlimit {plan.encounter.maxActiveEnemies} · Erste Extraktionsverstärkung nach {Math.ceil(plan.encounter.firstExtractionPressureTicks / NET.tickHz)} s</p>
        {plan.modifiers.length > 0 && <p>{plan.modifiers.map((id) => MISSION_MODIFIERS.get(id)?.displayName ?? id).join(', ')}</p>}
        {plan.world && <p>Welt-Seed {plan.world.seed} · Weltgenerator v{plan.world.generatorVersion}</p>}
        {plan.world && <p>Tageszeit · {TIME_OF_DAY[plan.timeOfDay ?? 'day']}</p>}
        <p>Missions-Seed {plan.seed} · Generator v{plan.generatorVersion} · Auswahl {plan.requestedTemplateId ? 'nach Vorlage' : 'zufällig'}</p>
      </>}
      {status.host && <button className="secondary" type="button" onClick={start}>Boarding für diesen Auftrag freigeben</button>}
    </>}
    {status.notice && <p role="status">{status.notice}</p>}
    <OperatorManifest mission={mission} status={status}/>
  </div>;
}

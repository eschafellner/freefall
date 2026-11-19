import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { BODENBRUCH, DIFFICULTY_REGISTRY, isCarrierScene, HORDE_SIZES, MAX_PLAYERS, PLAYER, TEAM_COLORS, PLAYER_MOTION } from '@freefall/shared';
import { Game, INITIAL_STATUS } from '../game/Game.ts';
import type { GameStatus } from '../game/Game.ts';
import { initialQuality, rememberQuality } from '../rendering/GraphicsQuality.ts';
import type { QualityName } from '../rendering/GraphicsQuality.ts';
import type { MissionDebugAction } from '@freefall/shared';
import { VitalSigns, WeaponReadout } from './EquipmentHud.tsx';
import { MissionHud, seconds } from './MissionHud.tsx';
import { CarrierConsole, OperatorManifest } from './CarrierConsole.tsx';
import type { GameMode, JoinMode } from '../networking/Match.ts';

const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('de-DE');
const roomFromUrl = new URLSearchParams(location.search).get('room') ?? '';

function Brand() {
  return <div className="brand">
    <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 2 30 10v12L16 30 2 22V10L16 2Z" stroke="currentColor" strokeOpacity=".64"/>
      <path d="M8 10h16l-8 13-8-13Z" fill="currentColor"/>
      <path d="M13 11h6l-3 6-3-6Z" fill="#172022"/>
    </svg>
    <div><strong>FREEFALL</strong></div>
  </div>;
}

function Metrics({ status }: { status: GameStatus }) {
  const server = status.metrics;
  const motion = status.motion;
  return <><aside className="telemetry" aria-label="Live-Telemetrie">
    <div className="panel-title"><span className="signal" /> Live-Telemetrie <kbd>F2</kbd></div>
    <dl className="metrics">
      <dt>FPS / Frame</dt><dd>{Math.round(status.fps)} <span>/ {status.frameMs.toFixed(1)} ms</span></dd>
      <dt>CPU / GPU</dt><dd>{status.cpuMs.toFixed(1)} <span>/ {status.gpuMs === null ? '–' : status.gpuMs.toFixed(1)} ms</span></dd>
      <dt>Draw Calls / Dreiecke</dt><dd>{status.drawCalls} <span>/ {number.format(status.triangles)}</span></dd>
      <dt>Meshes / Instanzen</dt><dd>{status.meshes} <span>/ {number.format(status.instances)}</span></dd>
      <dt>Geometrien / Texturen</dt><dd>{status.geometries} <span>/ {status.textures}</span></dd>
      <dt>Gegner sichtbar / aktiv</dt><dd>{number.format(status.visibleEnemies)} <span>/ {number.format(status.activeEnemies)}</span></dd>
      <dt>Ping</dt><dd>{status.ping === null ? '–' : `${Math.round(status.ping)} ms`}</dd>
      <dt>Netzlast ≈</dt><dd>{decimal.format(status.bytesPerSecond / 1000)} kB/s</dd>
    </dl>
    <div className="metrics-divider">SERVER <span>{server ? `${server.tickHz.toFixed(1)} Hz` : 'Offline'}</span></div>
    <dl className="metrics">
      <dt>Tick · zuletzt</dt><dd>{server ? `${server.lastMs.toFixed(2)} ms` : '–'}</dd>
      <dt>Tick · Ø / P95</dt><dd>{server ? <>{server.meanMs.toFixed(2)} <span>/ {server.p95Ms.toFixed(2)} ms</span></> : '–'}</dd>
      <dt>Gegner / Spieler</dt><dd>{server ? <>{number.format(server.activeEnemies)} <span>/ {server.activePlayers}</span></> : '–'}</dd>
      <dt>Verworfene Steps</dt><dd>{server?.droppedSteps ?? '–'}</dd>
      {status.mission && <>
        <dt>Threat</dt><dd>{status.mission.threat} / 100</dd>
        <dt>Patrouillengruppen</dt><dd>{status.mission.groups}</dd>
        <dt>Aktive Nester</dt><dd>{status.mission.activeNests}</dd>
        <dt>Durchbrüche aktiv / gesamt</dt><dd>{status.mission.activeBreaches} / {status.mission.breachCount}</dd>
      </>}
    </dl>
  </aside>
  {motion && <aside className="telemetry motion-telemetry" aria-label="Bewegungstelemetrie">
      <div className="panel-title"><span className="signal" /> Bewegung <kbd>{motion.animState}</kbd></div>
      <dl className="metrics">
        <dt>Frame P95 / P99</dt><dd>{motion.frameP95.toFixed(1)} <span>/ {motion.frameP99.toFixed(1)}</span></dd>
        <dt>Snapshots / Jitter</dt><dd>{motion.snapshotHz.toFixed(0)} Hz <span>/ {motion.snapshotJitterMs.toFixed(0)} ms</span></dd>
        <dt>Interp. / Puffer</dt><dd>{motion.interpolationMs.toFixed(0)} <span>/ {motion.bufferedMs.toFixed(0)} ms</span></dd>
        <dt>Extrapol. / gehalten</dt><dd>{motion.extrapolatedPct.toFixed(1)} <span>/ {motion.heldPct.toFixed(1)} %</span></dd>
        <dt>Prediction Error</dt><dd>{motion.predictionErrorCm.toFixed(1)} cm</dd>
        <dt>Korrekturen/s / letzte</dt><dd>{motion.correctionsPerSecond.toFixed(1)} <span>/ {motion.lastCorrectionCm.toFixed(1)} cm</span></dd>
        <dt>Korr. max / Snaps</dt><dd>{motion.maxCorrectionCm.toFixed(1)} <span>/ {motion.snaps}</span></dd>
        <dt>Unbestätigte Eingaben</dt><dd>{motion.unacknowledged}</dd>
        <dt>Tempo Lauf / Anim.</dt><dd>{motion.moveSpeed.toFixed(1)} <span>/ {motion.animSpeed.toFixed(1)} m/s</span></dd>
      </dl>
  </aside>}
  </>;
}

export function App() {
  const surface = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [quality, setQuality] = useState(initialQuality);
  const qualityRef = useRef(quality);
  const [fault, setFault] = useState('');
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(roomFromUrl);
  const [telemetry, setTelemetry] = useState(false);
  const [mode, setMode] = useState<GameMode>('mission');
  useEffect(() => { game.current?.setTelemetry(telemetry); }, [telemetry]);
  const [copied, setCopied] = useState(false);
  const active = Boolean(status.roomId);
  const mission = status.mission;
  const inCarrier = status.missionRoom && (!mission || isCarrierScene(mission.state, mission.phase));
  const result = mission?.result;
  const cinematic = mission?.state === 'DEPLOYMENT' || mission?.extraction?.phase === 'LIFT';
  const reward = result?.rewards.find(({ operatorId }) => operatorId === status.ownId);
  const own = status.players.find((player) => player.id === status.ownId);

  useEffect(() => {
    if (!surface.current) return;
    try {
      game.current = new Game(surface.current, setStatus, setFault, qualityRef.current);
    } catch (error) {
      console.error(error);
      setFatal(true);
      setFault('WebGL 2 konnte nicht gestartet werden. Aktiviere Hardwarebeschleunigung und lade die Seite neu.');
      return;
    }
    const toggle = (event: KeyboardEvent) => {
      if (event.code === 'F3' && !event.repeat) {
        event.preventDefault();
        game.current?.toggleRoutes();
      }
      if (event.code === 'F2' && !event.repeat) {
        event.preventDefault();
        setTelemetry((show) => !show);
      }
    };
    window.addEventListener('keydown', toggle);
    return () => {
      window.removeEventListener('keydown', toggle);
      game.current?.dispose();
      game.current = null;
    };
  }, []);

  async function connect(joinMode: JoinMode) {
    if (!game.current || busy) return;
    setFault('');
    setCopied(false);
    setBusy(true);
    try {
      await game.current.connect(joinMode, code.trim(), mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFault(`Beitritt fehlgeschlagen. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const invite = new URL(location.href);
    invite.searchParams.set('room', status.roomId);
    try {
      await navigator.clipboard.writeText(invite.href);
      setCopied(true);
    } catch {
      setFault('Link konnte nicht kopiert werden. Teile stattdessen den angezeigten Raumcode.');
    }
  }

  function changeQuality(value: QualityName) {
    qualityRef.current = value;
    setQuality(value);
    game.current?.setQuality(value);
    rememberQuality(value);
  }

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.trim()) void connect('code');
  };

  return <main className={`freefall ${status.locked ? 'in-game' : 'in-menu'} ${(own?.motion ?? 0) & PLAYER_MOTION.aim ? 'aiming' : ''}`}>
    <div ref={surface} className="surface"/>
    <div className={`vignette ${status.hurt ? 'hurt' : ''}`}/>
    <header className="topbar">
      <Brand />
      <div className="mission-label"><span>{inCarrier ? 'CARRIER' : status.missionRoom ? 'OPERATION' : active ? 'TESTARENA' : 'KOOP'}</span>
        <strong>{inCarrier ? 'Skyfall Carrier' : status.missionRoom ? BODENBRUCH.displayName : active ? 'Boreal Relay' : 'Einsatzleitstelle'}</strong></div>
      <div className={`connection ${active ? 'is-online' : ''}`}><i />{active ? 'Verbunden' : 'Bereit zum Beitritt'}</div>
    </header>

    {telemetry && <Metrics status={status}/>}
    {status.locked && mission && <MissionHud mission={mission} status={status}/>}
    {!status.locked && <section className="operations" aria-label={active ? 'Einsatzsteuerung' : 'Koop-Lobby'}>
      <div className="eyebrow"><span />{active ? inCarrier ? 'Skyfall Carrier · Deck 03' : status.missionRoom ? BODENBRUCH.displayName : 'Boreal Relay · Testarena' : 'KOOP · 1–4 SPIELER'}</div>
      {active ? <>
        <h1 className="room-heading">{result ? result.primaryObjectivesCompleted ? 'Einsatz erfolgreich' : 'Einsatz gescheitert'
          : status.atConsole ? 'Einsatzplanung' : inCarrier ? 'Mannschaftsdeck' : 'Einsatz bereit'}</h1>
        {result && <>
          <p>{result.extractionSucceeded ? `Extraktion bestätigt · ${result.extractedOperatorIds.length} Operator`
            : 'Trupp ausgefallen · Keine Operatoren extrahiert'}</p>
          <p>Convicts im Statusbericht {result.convictsSurvived}/{result.convictsDeployed} lebend.
            Albatross {result.albatrossSurvived ? 'erhalten' : 'zerstört'}.</p>
          {reward && <div className="result-reward">{reward.baseExperience} Basis-EP + {reward.extractionBonusExperience} Extraktions-EP
            <strong>{reward.totalExperience} EP</strong></div>}
          <button className="primary" type="button" onClick={() => game.current?.action('return-vote')}
            aria-pressed={mission.operators.some(({ id, endVote }) => id === status.ownId && endVote)}>
            Rückkehr bestätigen <span>{seconds(mission.resultUntil, status)} s</span>
          </button>
        </>}
        {!result && <div className="room">
          <div><span>RAUMCODE</span><strong>{status.roomId}</strong></div>
          <button className="text-button" type="button" onClick={() => void copyLink()}>{copied ? 'Kopiert' : 'Einladungslink kopieren'}</button>
        </div>}
        {mission && status.atConsole && !result && <CarrierConsole mission={mission} status={status}
          select={(selection) => game.current?.select(selection)} start={() => game.current?.startMission()}/>}
        {mission?.state === 'BOARDING' && <OperatorManifest mission={mission} status={status}/>}
        {!result && <button className="primary" type="button" onClick={() => { setFault(''); game.current?.lock(); }}
          disabled={!status.ready || (status.missionRoom && !mission)}>
          {status.ready && (!status.missionRoom || mission) ? inCarrier ? 'Carrier betreten' : status.missionRoom ? 'Einsatz betreten' : 'Arena betreten' : 'Synchronisiere …'}
          <span aria-hidden="true">↗</span>
        </button>}
        <div className="session-actions">
          <button className="text-button" type="button" onClick={() => void game.current?.leave()}>Raum verlassen</button>
          <span>{status.players.length} / {MAX_PLAYERS} Operator</span>
        </div>
        {!status.missionRoom && <div className="horde-control">
          <label>Hordengröße</label><span>{status.host ? 'Host-Steuerung' : 'Host stellt ein'}</span>
          <div className="sizes" aria-label="Zahl der simulierten Gegner">
            {HORDE_SIZES.map((size) => <button key={size} type="button" disabled={!status.host} aria-pressed={status.metrics?.hordeSize === size} onClick={() => game.current?.setHorde(size)}>{number.format(size)}</button>)}
          </div>
        </div>}
        {mission && !inCarrier && <div className="session-difficulty">{DIFFICULTY_REGISTRY.get(mission.difficultyId)?.displayName}</div>}
        {mission?.debug && status.host &&
          <div className="debug-controls">
            {([
              ['patrol', 'Patrouille'], ['alert', 'Alarm'], ['breach', 'Durchbruch'], ['nest', 'Nest'],
              ['destroy-nest', 'Nest zerstören'], ['objectives', 'Relais abschließen'],
              ['board', 'Boarding simulieren'], ['deploy', 'Deployment starten'], ['land', 'Direkt landen'],
              ['damage-thruster', 'Düse beschädigen'], ['destroy-albatross', 'Albatross zerstören'],
              ['balloon', 'Ballon auslösen'], ['fighter', 'Rettungsjäger rufen'],
            ] satisfies [MissionDebugAction, string][]).map(([action, label]) =>
              <button className="secondary" key={action} type="button" onClick={() => game.current?.debug(action)}>{label}</button>)}
            <button className="secondary" type="button" onClick={() => game.current?.toggleRoutes()}>Routen · F3</button>
            {mission.convicts.length > 0 && <ul className="debug-convicts">{mission.convicts.map((convict) =>
              <li key={convict.id}>Convict {convict.slot + 1} · {convict.state} · {convict.hp}/{convict.maxHp} · {convict.equipmentId} · {convict.weaponId}</li>)}</ul>}
          </div>}
      </> : <>
        <h1>FREEFALL<span>.</span></h1>
        <div className="mode-picker" aria-label="Spielmodus">
          <button type="button" aria-pressed={mode === 'mission'} onClick={() => setMode('mission')}>Operation Bodenbruch</button>
          <button type="button" aria-pressed={mode === 'arena'} onClick={() => setMode('arena')}>Boreal Relay</button>
        </div>
        <p>{mode === 'mission' ? 'Plant euren Einsatz auf dem Skyfall Carrier und stellt die Verbindung nach Dev’ Ault wieder her.' : 'Testarena mit einstellbarer Hordengröße für Kampftraining und Benchmarks.'}</p>
        <button className="primary" type="button" onClick={() => void connect('create')} disabled={busy || fatal}>Raum erstellen<span aria-hidden="true">↗</span></button>
        <form className="join" onSubmit={join}>
          <input maxLength={64} aria-label="Raumcode" placeholder="Raumcode" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" spellCheck={false}/>
          <button className="secondary" type="submit" disabled={!code.trim() || busy || fatal}>Beitreten</button>
        </form>
        <button className="text-button quick" type="button" disabled={busy || fatal} onClick={() => void connect('quick')}>Schnellbeitritt</button>
        {busy && <small className="joining" role="status">Verbindung wird aufgebaut …</small>}
      </>}
      <label className="graphics-choice">Grafikqualität
        <select value={quality} onChange={(event) => changeQuality(event.target.value as QualityName)} disabled={fatal}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {fault && <div className="fault" role="alert">{fault}</div>}
    </section>}

    {status.locked && !inCarrier && !cinematic && own && own.hp > 0 && <div className={`reticle ${status.hit ? 'hit' : ''} ${status.eliminated ? 'kill' : ''}`} aria-hidden="true"><i/><i/><i/><i/></div>}
    {active && status.respawn > 0 && <div className="respawn" role="status"><strong>Außer Gefecht</strong><span>Respawn in {status.respawn.toFixed(1)} s</span></div>}

    <footer className="bottom">
      {active && own && <div className="operator-hud">
        {status.locked && !cinematic && <VitalSigns player={own} tick={status.serverTick}/>}
        <div className="squad" aria-label="Spieler im Einsatz">
        {Array.from({ length: MAX_PLAYERS }, (_, slot) => {
          const player = status.players.find((entry) => entry.slot === slot);
          const secured = player && mission?.extraction?.securedIds.includes(player.id);
          const connection = player && mission?.operators.find((op) => op.id === player.id);
          return <div className={`squad-slot ${player ? '' : 'vacant'}`} key={slot} style={{ '--slot-color': `#${TEAM_COLORS[slot].toString(16)}` } as CSSProperties}>
            <div className="slot-index">{slot + 1}</div>
            <div className="slot-body"><span>{!player ? 'Frei' : player.id === status.ownId ? 'Du' : `OP ${String(slot + 1).padStart(2, '0')}`}</span>
              {player && <small>{connection?.connected === false ? 'Offline' : !player.hp ? 'Gefallen' :
                mission?.extraction ? secured ? 'Gesichert' : 'Ungesichert' : ''}</small>}
              <div className="slot-hp"><i style={{ width: `${(player?.hp ?? 0) / PLAYER.health * 100}%` }}/></div></div>
            {player && <strong className="hp">{player.hp}</strong>}
          </div>;
        })}
      </div></div>}
      {!status.locked && !cinematic && <div className="controls">
        <span><kbd>WASD</kbd> Bewegen</span><span><kbd>Shift</kbd> Sprinten</span><span><kbd>RMB</kbd> Zielen</span><span><kbd>LMB</kbd> Feuern</span><span><kbd>R</kbd> Nachladen</span>{status.missionRoom && <span><kbd>E</kbd> Interagieren</span>}<span><kbd>Esc</kbd> Menü</span>
      </div>}
      {active && own && status.locked && !inCarrier && !cinematic && <WeaponReadout player={own} tick={status.serverTick}/>}
    </footer>
  </main>;
}

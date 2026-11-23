import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BODENBRUCH, DIFFICULTY_REGISTRY, isCarrierScene, HORDE_SIZES, MAX_PLAYERS, NET, PLAYER_MOTION, planetWeather } from '@freefall/shared';
import { Game, INITIAL_STATUS } from '../game/Game.ts';
import type { GameStatus } from '../game/Game.ts';
import { DAMAGE_DIRECTIONS } from '../game/DamageFeedback.ts';
import { cameraPreferences } from '../rendering/CameraPreferences.ts';
import { initialQuality, rememberQuality } from '../rendering/GraphicsQuality.ts';
import type { QualityName } from '../rendering/GraphicsQuality.ts';
import type { MissionDebugAction } from '@freefall/shared';
import { CombatLoadout } from './EquipmentHud.tsx';
import { TeamPanel } from './FieldHud.tsx';
import { MissionHud, seconds } from './MissionHud.tsx';
import { CarrierConsole, OperatorManifest } from './CarrierConsole.tsx';
import { LoadoutPanel } from './LoadoutPanel.tsx';
import type { GameMode, JoinMode } from '../networking/Match.ts';
import type { AccountSession } from '@freefall/shared';
import { AccountError, forgetSession, logout, restoreSession } from '../account/AccountClient.ts';
import { LoginPanel, TitleScreen } from './TitleScreen.tsx';
import { LevelMeter, ServiceRecord } from './ServiceRecord.tsx';
import { AccountSettings, Arsenal, PrivacyNotice } from './AccountPanels.tsx';
import { FullscreenSettings, enterFullscreenIfWanted } from './Fullscreen.tsx';
import { UNLOCKS } from '@freefall/shared';

import { ControlSettings } from './ControlSettings.tsx';
import { bindings } from '../input/Bindings.ts';

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
  const weather = status.weather;
  const audio = status.audio.diagnostics;
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
      {status.eventTiming && <>
        <dt>Ereignisalter ≈ Schuss / Aktion / Mission</dt><dd>{
          [status.eventTiming.shot, status.eventTiming.action, status.eventTiming.mission]
            .map((ms) => ms === undefined ? '–' : Math.round(ms)).join(' / ')} ms</dd>
        <dt>Wartezeit Posenabgleich</dt><dd>{status.eventTiming.poseWait === undefined ? '–' : `${Math.round(status.eventTiming.poseWait)} ms`}</dd>
      </>}
      {status.weaponVfx && <>
        <dt>Waffen-VFX</dt><dd>{status.weaponVfx.flashes}/{status.weaponVfx.flashCap} Blitz · {status.weaponVfx.tracers}/{status.weaponVfx.tracerCap} Tracer</dd>
        <dt>Hülsen / Lauflicht</dt><dd>{status.weaponVfx.casings}/{status.weaponVfx.casingCap} / {status.weaponVfx.lights}</dd>
        <dt>Impact-VFX</dt><dd>{status.weaponVfx.impacts}/{status.weaponVfx.tracerCap} · {status.weaponVfx.particles}/{status.weaponVfx.particleCap} Partikel · {status.weaponVfx.impactMs.toFixed(2)} ms</dd>
        <dt>Impact-Pool</dt><dd>{status.weaponVfx.impactAccepted} angenommen ({status.impactRate ?? 0}/s) · {status.weaponVfx.impactReused} wiederverwendet · {status.weaponVfx.impactDropped} gekürzt</dd>
        <dt>Impact-Audio</dt><dd>{status.impactSounds ?? 0} abgespielt</dd>
        {status.lastImpact?.impact && <>
          <dt>Letzter bestätigter Impact</dt><dd>{status.lastImpact.tick}:{status.lastImpact.shooter} · {status.lastImpact.impact.kind}{
            status.lastImpact.impact.kind === 'world' ? ' · ' + status.lastImpact.impact.surface : ''}</dd>
          <dt>Kontakt / Normale</dt><dd>{[status.lastImpact.toX, status.lastImpact.toY, status.lastImpact.toZ].map((value) => value.toFixed(2)).join(' / ')} · {
            'normal' in status.lastImpact.impact ? status.lastImpact.impact.normal?.map((value) => value.toFixed(2)).join(' / ') : '–'}</dd>
        </>}
        <dt>Verworfene Schuss-Echos</dt><dd>{status.duplicateShots ?? 0}</dd>
      </>}
      {status.explosiveVfx && <>
        <dt>Granaten / Explosionen</dt><dd>{status.explosiveVfx.grenades} / {status.explosiveVfx.blasts}/{status.explosiveVfx.cap} · {status.explosiveVfx.accepted} bestätigt</dd>
        <dt>Rauch / Staub / Splitter / Licht</dt><dd>{status.explosiveVfx.smoke} / {status.explosiveVfx.dust} / {status.explosiveVfx.debris} / {status.explosiveVfx.lights} · {status.explosiveVfx.updateMs.toFixed(2)} ms</dd>
        <dt>Explosionspool</dt><dd>{status.explosiveVfx.recycled} wiederverwendet · {status.explosiveVfx.dropped} gekürzt</dd>
        <dt>Nahkampf / Treffer / Echos</dt><dd>{status.meleeSwings ?? 0} / {status.confirmedMeleeHits ?? 0} / {status.duplicateActions ?? 0}</dd>
        {status.explosiveVfx.last && <>
          <dt>Letzte Detonation</dt><dd>#{status.explosiveVfx.last.id} · {status.explosiveVfx.last.grenade ?? 'Frag'} · {status.explosiveVfx.last.contact?.surface ?? '—'}</dd>
          <dt>Detonationspunkt</dt><dd>{[status.explosiveVfx.last.x, status.explosiveVfx.last.y, status.explosiveVfx.last.z].map((v) => v.toFixed(2)).join(' / ')}</dd>
        </>}
      </>}
    </dl>
    {weather && status.mission?.debug && <>
      <div className="metrics-divider">ATMOSPHÄRE <span>{weather.profile}</span></div>
      <dl className="metrics" aria-label="Atmosphärentelemetrie" data-atmosphere={JSON.stringify(weather)}>
        <dt>Wetter</dt><dd>{weather.current}{weather.target && ` → ${weather.target} (${Math.round(weather.progress * 100)} %)`}</dd>
        <dt>Tageszeit / Version</dt><dd>{weather.timeOfDay} / {weather.version}.{weather.revision}</dd>
        <dt>Wind / Stärke / Böe</dt><dd>{Math.round(weather.direction * 180 / Math.PI)}° / {weather.strength.toFixed(2)} / {weather.gust.toFixed(2)}</dd>
        <dt>Partikel / Limit</dt><dd>{weather.particles} / {weather.cap}</dd>
        <dt>Atmosphäre / Partikel</dt><dd>{weather.updateMs.toFixed(3)} / {weather.particleMs.toFixed(3)} ms</dd>
      </dl>
    </>}
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
    {server?.hordeDirector && status.mission?.encounter && <>
      <div className="metrics-divider">HORDE DIRECTOR <span>{status.mission.state}</span></div>
      <dl className="metrics">
        <dt>Phase / Dauer</dt><dd>{server.hordeDirector.state} / {Math.max(0, Math.floor((status.mission.tick - server.hordeDirector.stateAt) / NET.tickHz))} s</dd>
        <dt>Druck / Bedrängung</dt><dd>{decimal.format(server.hordeDirector.pressure * 100)} % / {server.hordeDirector.nearby} nah · {server.hordeDirector.attacking} im Angriff</dd>
        <dt>Welle / Rest / Budget</dt><dd>{server.hordeDirector.waveId ?? '–'} / {server.hordeDirector.remaining} / {server.hordeDirector.budget}</dd>
        <dt>Operatoren / Skalierung</dt><dd>{server.hordeDirector.living} / ×{decimal.format(server.hordeDirector.scale)}</dd>
        <dt>Gegner / Reserviert / Limit</dt><dd>{server.activeEnemies} / {server.hordeDirector.reserved} / {server.hordeDirector.cap}</dd>
        <dt>Wartende Gruppen</dt><dd>{server.hordeDirector.queuedGroups}</dd>
        <dt>Letzter Spawnbereich</dt><dd>{server.hordeDirector.lastSpawnRegion ?? '–'}</dd>
        <dt>Letzter Kandidat</dt><dd>{server.hordeDirector.lastRegion ?? '–'} · {server.hordeDirector.lastResult ?? '–'}</dd>
        <dt>Prüfungen/s / Welle/s / verworfen</dt><dd>{server.hordeDirector.checksPerSecond} / {server.hordeDirector.waveChecksPerSecond} / {server.hordeDirector.failures}</dd>
        <dt>Director / Prüfung / Spawn</dt><dd>{server.hordeDirector.updateMs.toFixed(3)} / {server.hordeDirector.validationMs.toFixed(3)} / {server.hordeDirector.initializationMs.toFixed(3)} ms</dd>
        <dt>Pause / Budgetlimit</dt><dd>{server.hordeDirector.hold ?? '–'} / {server.hordeDirector.throttled ? 'aktiv' : '–'}</dd>
      </dl>
    </>}
    {server?.enemyAI && <>
      <div className="metrics-divider">GEGNER-KI <span>Letzter Tick</span></div>
      <dl className="metrics">
        <dt>Ziel / Navigation</dt><dd>{server.enemyAI.targetMs.toFixed(2)} / {server.enemyAI.navigationMs.toFixed(2)} ms</dd>
        <dt>Lenkung / Nachbarn / Kollision</dt><dd>{server.enemyAI.steeringMs.toFixed(2)} / {server.enemyAI.neighborMs.toFixed(2)} / {server.enemyAI.collisionMs.toFixed(2)} ms</dd>
        <dt>Pfade / aufgeschoben</dt><dd>{server.enemyAI.pathRequests} / {server.enemyAI.deferredPaths}</dd>
        <dt>Distanzfelder neu / Cache</dt><dd>{server.enemyAI.fieldBuilds} / {server.enemyAI.fieldHits} · {server.enemyAI.fieldMs.toFixed(2)} ms</dd>
        <dt>Wahrnehmung</dt><dd>{server.enemyAI.perceptionMs.toFixed(2)} ms</dd>
        <dt>Nahkampf / Encounter</dt><dd>{server.enemyAI.attackMs.toFixed(2)} / {server.enemyAI.encounterMs.toFixed(2)} ms</dd>
        <dt>Trefferprüfung</dt><dd>{server.enemyAI.attackValidationMs.toFixed(2)} ms</dd>
        <dt>Windup / Aktiv / Recovery</dt><dd>{server.enemyAI.attacks.windup} / {server.enemyAI.attacks.active} / {server.enemyAI.attacks.recovery}</dd>
        <dt>Angriffe / Treffer pro Sekunde</dt><dd>{server.enemyAI.attacks.startsPerSecond.toFixed(1)} / {server.enemyAI.attacks.hitsPerSecond.toFixed(1)}</dd>
        <dt>Stecken / kein Pfad / repariert</dt><dd>{server.enemyAI.stuckEpisodes} / {server.enemyAI.unreachableEpisodes} / {server.enemyAI.recoveries}</dd>
        <dt>Recovery versucht / gelöst / wartet</dt><dd>{server.enemyAI.recoveryAttempts} / {server.enemyAI.recoverySuccesses} / {server.enemyAI.recoveryFallbacks}</dd>
        {server.enemyAI.samples.map((enemy) => <Fragment key={enemy.id}>
          <dt>#{enemy.id} · {enemy.state}</dt>
          <dd>{enemy.targetValid && enemy.distance !== undefined ? `${enemy.target} · ${enemy.distance.toFixed(1)} m` : 'Kein gültiges Ziel'}</dd>
          <dt>{enemy.destination ? `Wegpunkt ${enemy.destination.x.toFixed(1)}, ${enemy.destination.z.toFixed(1)}` : 'Kein Wegpunkt'}</dt>
          <dd>{enemy.cooldownTicks} Ticks {enemy.waitingForClearance ? '· Wartet auf Freiraum' : enemy.stuck ? `· Recovery ${enemy.recoveryAttempts}` : enemy.unreachable ? '· Kein Pfad' : ''}</dd>
          {enemy.combat && <>
            <dt>{enemy.combat.type} · {enemy.combat.phase} {enemy.combat.id && `· ${enemy.combat.id}`}</dt>
            <dd>{enemy.combat.range.toFixed(2)} m / {enemy.combat.angle}°{enemy.combat.remainingTicks !== undefined && ` · ${enemy.combat.remainingTicks} Ticks`}</dd>
            {enemy.combat.result && <>
              <dt>Validierung / Sektor</dt><dd>{enemy.combat.result} · {enemy.combat.damage ?? 0} HP · {enemy.combat.reservation ?? '–'}</dd>
            </>}
          </>}
          <dt>Nachbarn / Tempo</dt><dd>{enemy.neighborCount ?? '–'} / {enemy.velocity ? Math.hypot(enemy.velocity.x, enemy.velocity.z).toFixed(1) : '–'} m/s</dd>
          {enemy.steering && enemy.separation && enemy.avoidance && <>
            <dt>Lenkung · Trennung · Ausweichen (x/z)</dt>
            <dd>{[enemy.steering, enemy.separation, enemy.avoidance].map(({ x, z }) => `${x.toFixed(1)}/${z.toFixed(1)}`).join(' · ')}</dd>
          </>}
        </Fragment>)}
      </dl>
    </>}
    {server?.combat && <CombatMetrics combat={server.combat}/>}
    <div className="metrics-divider" data-audio={audio && JSON.stringify(audio)}>
      AUDIO <span>{status.audio.voices} Stimmen</span>
    </div>
    <dl className="metrics">
      <dt>Stimmen Spitze / verworfen</dt><dd>{status.audio.peak} <span>/ {status.audio.dropped}</span></dd>
      {audio && <>
        <dt>Audio-Kontext</dt><dd>{audio.context}{audio.duck ? ' · Ducking' : ''}</dd>
        <dt>Planet / Wetter-Audio</dt><dd>{audio.planet ?? '–'} <span>{audio.weather ?? '–'} · {audio.wind ?? '–'}</span></dd>
        <dt>Budget / Kampf / Ambience / 3D</dt><dd>{audio.budget} <span>/ {audio.combat} / {audio.ambience} / {audio.spatial}</span></dd>
        <dt>Ereignisse / s</dt><dd>{audio.rate}</dd>
        <dt>Audio CPU / Horde-Spitze</dt><dd>{audio.updateMs.toFixed(2)} <span>/ {audio.enemyPeakMs.toFixed(2)} ms</span></dd>
        <dt>Audio-Cache</dt><dd>{audio.buffers} <span>· {audio.pcmMiB.toFixed(1)} MiB PCM · {audio.loading} laden</span></dd>
        <dt>Audio Laden / Dekodieren / Fehler</dt><dd>{audio.loadMs.toFixed(0)} / {audio.decodeMs.toFixed(0)} ms <span>/ {audio.errors}</span></dd>
        <dt>Waffen-Audio lokal / remote</dt><dd>{audio.weapon.own} / {audio.weapon.remote} <span>· {audio.weapon.unavailable} Samples nicht bereit</span></dd>
        <dt>Magazin raus / rein / Abschluss / Wechsel / Hülse</dt>
        <dd>{audio.weapon.remove} / {audio.weapon.insert} / {audio.weapon.finish} / {audio.weapon.switch} / {audio.weapon.casing}</dd>
        <dt>Master / Kampf / Welt / Amb. / Wetter / UI</dt><dd>{[audio.levels.master, audio.levels.weapons, audio.levels.environment,
          audio.levels.ambience, audio.levels.weather, audio.levels.ui].map((v) => Math.round(100 * v)).join(' / ')} %
          {audio.levels.muted ? ' · stumm' : ''}</dd>
      </>}
    </dl>
  </aside>
  {motion && <aside className="telemetry motion-telemetry" aria-label="Bewegungstelemetrie">
      <div className="panel-title"><span className="signal" /> Bewegung <kbd>{motion.animState}</kbd></div>
      <dl className="metrics">
        <dt>Frame P95 / P99</dt><dd>{motion.frameP95.toFixed(1)} <span>/ {motion.frameP99.toFixed(1)}</span></dd>
        <dt>Kamera / Reticle / Schadens-HUD</dt><dd>{motion.cameraMs.toFixed(3)} / {motion.reticleMs.toFixed(3)} / {motion.damageHudMs.toFixed(3)} ms</dd>
        <dt>Snapshots / Jitter</dt><dd>{motion.snapshotHz.toFixed(0)} Hz <span>/ {motion.snapshotJitterMs.toFixed(0)} ms</span></dd>
        <dt>Interp. / Puffer</dt><dd>{motion.interpolationMs.toFixed(0)} <span>/ {motion.bufferedMs.toFixed(0)} ms</span></dd>
        <dt>Extrapol. / gehalten</dt><dd>{motion.extrapolatedPct.toFixed(1)} <span>/ {motion.heldPct.toFixed(1)} %</span></dd>
        <dt>Prediction Error</dt><dd>{motion.predictionErrorCm.toFixed(1)} cm</dd>
        <dt>Korrekturen/s / letzte</dt><dd>{motion.correctionsPerSecond.toFixed(1)} <span>/ {motion.lastCorrectionCm.toFixed(1)} cm</span></dd>
        <dt>Korr. max / Snaps</dt><dd>{motion.maxCorrectionCm.toFixed(1)} <span>/ {motion.snaps}</span></dd>
        <dt>Unbestätigte Eingaben</dt><dd>{motion.unacknowledged}</dd>
        <dt>Haltung / Zielhaltung</dt><dd>{motion.posture} <span>/ {motion.requestedPosture}</span></dd>
        <dt>Hechtsprung / Cooldown</dt><dd>{motion.dive}</dd>
        <dt>Körperwinkel / Kriechtempo</dt><dd>{motion.bodyYaw.toFixed(0)}° <span>/ {motion.groundSpeed.toFixed(2)} m/s</span></dd>
        <dt>Aufstehen / Aktion</dt><dd>{motion.getUp} <span>/ {motion.action}</span></dd>
        <dt>Kollider / Bodenkontakt</dt><dd>{motion.collider} <span>m · {motion.grounded ? 'ja' : 'nein'}</span></dd>
        <dt>Erlaubte Aktionen</dt><dd>{motion.actions || '–'}</dd>
        <dt>Serverposition</dt><dd>{motion.serverPosition}</dd>
        <dt>Sichtbare Position</dt><dd>{motion.visualPosition}</dd>
        <dt>Animationszeit / Oberkörper</dt><dd>{motion.playback}</dd>
        <dt>Kamera / Kollisionsrückzug</dt><dd>{motion.camera}</dd>
        <dt>Kameraziel</dt><dd>{motion.cameraTarget}</dd>
        <dt>Letzte Eingabe</dt><dd>{motion.input}</dd>
        <dt>Tempo Lauf / Anim.</dt><dd>{motion.moveSpeed.toFixed(1)} <span>/ {motion.animSpeed.toFixed(1)} m/s</span></dd>
      </dl>
  </aside>}
  </>;
}

function CombatMetrics({ combat }: { combat: NonNullable<GameStatus['metrics']>['combat'] & object }) {
  const accuracy = (slot: 'primary' | 'secondary') => combat.shots[slot] ? Math.round(combat.hits[slot] / combat.shots[slot] * 100) : 0;
  const ff = combat.friendlyFireDamage;
  return <>
    <div className="metrics-divider">KAMPF <span>Einsatz</span></div>
    <dl className="metrics">
      <dt>AR Schüsse / Treffer</dt><dd>{combat.shots.primary} <span>/ {combat.hits.primary} ({accuracy('primary')} %)</span></dd>
      <dt>P-01 Schüsse / Treffer</dt><dd>{combat.shots.secondary} <span>/ {combat.hits.secondary} ({accuracy('secondary')} %)</span></dd>
      <dt>Schaden AR / P-01</dt><dd>{number.format(combat.damage.primary)} <span>/ {number.format(combat.damage.secondary)}</span></dd>
      <dt>Magazine / verworfen</dt><dd>{combat.magazinesUsed.primary + combat.magazinesUsed.secondary} <span>/ {combat.roundsDiscarded.primary + combat.roundsDiscarded.secondary} Schuss</span></dd>
      <dt>Granaten / Gegner / Nester</dt><dd>{combat.grenadesThrown} <span>/ {number.format(combat.grenadeDamageEnemies)} / {number.format(combat.grenadeDamageNests)}</span></dd>
      <dt>Nahkampf Treffer / Stagger</dt><dd>{combat.meleeHits} <span>/ {combat.staggers}</span></dd>
      <dt>Eigenbeschuss / selbst</dt><dd>{ff.bullet + ff.explosion + ff.melee} <span>/ {combat.selfDamage}</span></dd>
      <dt>Nachschub / Explosion max</dt><dd>{combat.resupplyUses} <span>/ {combat.blastQueryMsMax.toFixed(3)} ms</span></dd>
    </dl>
  </>;
}

function AudioSettings({ game }: { game: Game | null }) {
  const [, refresh] = useState(0);
  const settings = game?.audio.settings;
  if (!game || !settings) return null;
  const channels = [['master', 'Master'], ['weapons', 'Kampf'], ['environment', 'Welt'],
    ['ambience', 'Ambience'], ['weather', 'Wetter'], ['ui', 'Interface'], ['music', 'Musik']] as const;
  return <fieldset className="audio-settings"><legend>Audio</legend>
    <div className="audio-toggles">
      <label><input type="checkbox" checked={settings.enabled}
        onChange={(event) => { game.setAudioOption('enabled', event.target.checked); refresh((n) => n + 1); }}/> Audio aktiv</label>
      <label><input type="checkbox" checked={settings.muted}
        onChange={(event) => { game.setAudioOption('muted', event.target.checked); refresh((n) => n + 1); }}/> Stumm</label>
    </div>
    {channels.map(([channel, label]) => <label key={channel}>{label}
      <input type="range" min={0} max={100} value={Math.round(settings[channel] * 100)} aria-label={`Lautstärke ${label}`}
        onChange={(event) => { game.setVolume(channel, Number(event.target.value) / 100); refresh((n) => n + 1); }}/>
      <span>{Math.round(settings[channel] * 100)}</span></label>)}
  </fieldset>;
}

export function App() {
  const surface = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const damageHud = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [quality, setQuality] = useState(initialQuality);
  const qualityRef = useRef(quality);
  const [fault, setFault] = useState('');
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(roomFromUrl);
  const [, refreshBindings] = useState(0);
  const [telemetry, setTelemetry] = useState(false);
  const [mode, setMode] = useState<GameMode>('mission');
  const [session, setSession] = useState<AccountSession>();
  const [accountChecked, setAccountChecked] = useState(false);
  const [accountNotice, setAccountNotice] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [lobbyView, setLobbyView] = useState<'lobby' | 'record' | 'arsenal' | 'account'>('lobby');
  const [privacy, setPrivacy] = useState(false);
  /** Nach dem Raumbeitritt direkt einsteigen; das Raummenü (Raumcode, Einladung) erscheint erst mit Esc. */
  const [entering, setEntering] = useState(false);
  const [audioLive, setAudioLive] = useState(false);
  const enterAttempt = useRef(false);
  const wasActive = useRef(false);
  useEffect(() => { game.current?.setTelemetry(telemetry); }, [telemetry]);
  const [copied, setCopied] = useState(false);
  const active = Boolean(status.roomId);
  const mission = status.mission;
  const inCarrier = status.missionRoom && (!mission || isCarrierScene(mission.state, mission.phase));
  const result = mission?.result;
  const cinematic = mission?.state === 'DEPLOYMENT' ||
    (mission?.extraction?.phase === 'LIFT' && mission.extraction.securedIds.includes(status.ownId));
  const reward = result?.rewards.find(({ operatorId }) => operatorId === status.ownId);
  const objectivesCompleted = result?.objectives?.filter(({ state }) => state === 'complete').length;
  const own = status.players.find((player) => player.id === status.ownId);
  // TAB (held) shows mission intel and the team's equipment; ESC releases the pointer and opens the pause menu.
  const [intel, setIntel] = useState(false);
  const showIntel = intel && status.locked && !result;

  useEffect(() => {
    if (!surface.current) return;
    try {
      game.current = new Game(surface.current, setStatus, setFault, qualityRef.current, reticle, damageHud);
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
      if (event.code === 'F4' && !event.repeat) {
        game.current?.toggleWeather();
      }
      if (event.code === 'F2' && !event.repeat) {
        event.preventDefault();
        setTelemetry((show) => !show);
      }
    };
    const tab = (event: KeyboardEvent) => {
      if (event.code !== 'Tab') return;
      if (event.type === 'keyup') { setIntel(false); return; }
      if (!document.pointerLockElement) return;
      event.preventDefault();
      setIntel(true);
    };
    const release = () => setIntel(false);
    window.addEventListener('keydown', toggle);
    window.addEventListener('keydown', tab);
    window.addEventListener('keyup', tab);
    window.addEventListener('blur', release);
    document.addEventListener('pointerlockchange', release);
    return () => {
      window.removeEventListener('keydown', toggle);
      window.removeEventListener('keydown', tab);
      window.removeEventListener('keyup', tab);
      window.removeEventListener('blur', release);
      document.removeEventListener('pointerlockchange', release);
      game.current?.dispose();
      game.current = null;
    };
  }, []);

  // Gespeicherte Sitzung beim Start prüfen.
  useEffect(() => {
    let cancelled = false;
    restoreSession().then((restored) => { if (!cancelled) setSession(restored); }, (error: unknown) => {
      if (!cancelled) setAccountNotice(error instanceof AccountError ? error.message : 'Anmeldung konnte nicht geprüft werden.');
    }).finally(() => { if (!cancelled) setAccountChecked(true); });
    return () => { cancelled = true; };
  }, []);

  // Titelmusik, solange kein Raum offen ist. Der Start wird sofort versucht; blockiert der Browser Ton ohne
  // Nutzergeste, startet die Musik mit dem ersten Klick oder Tastendruck.
  useEffect(() => {
    game.current?.setTitleMusic(!active);
    if (active) return;
    const wake = () => game.current?.wakeAudio();
    wake();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    const poll = window.setInterval(() => setAudioLive(game.current?.audioLive ?? false), 300);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      window.clearInterval(poll);
    };
  }, [active]);

  // Direkter Einstieg, sobald der Raum synchron ist. Gelingt die Mauserfassung nicht (Nutzergeste abgelaufen),
  // bleibt das Raummenü mit „Carrier betreten“ sichtbar.
  useEffect(() => {
    if (!entering) { enterAttempt.current = false; return; }
    if (!active || status.locked) { setEntering(false); return; }
    if (enterAttempt.current || !status.ready || (status.missionRoom && !mission)) return;
    // Genau ein Versuch; die Antwort des Browsers kommt über pointerlockchange oder pointerlockerror.
    enterAttempt.current = true;
    if (!game.current?.lock(true)) { setEntering(false); return; }
    window.setTimeout(() => setEntering(false), 1500);
  }, [entering, active, status.ready, status.locked, status.missionRoom, mission]);
  useEffect(() => {
    if (!entering) return;
    const timeout = window.setTimeout(() => setEntering(false), 10_000);
    return () => window.clearTimeout(timeout);
  }, [entering]);
  useEffect(() => { setSoundOn(!(game.current?.audio.settings.muted ?? false)); }, []);

  // Nach dem Verlassen eines Raums Level und EP neu laden (Gutschriften aus dem Einsatz).
  useEffect(() => {
    if (active) { wasActive.current = true; return; }
    if (!wasActive.current) return;
    wasActive.current = false;
    restoreSession().then((restored) => { if (restored) setSession(restored); }, () => { /* Anzeige bleibt beim letzten Stand. */ });
  }, [active]);

  function toggleSound() {
    game.current?.wakeAudio();
    // Blockiert der Browser noch, aktiviert der erste Klick den Ton, statt stummzuschalten.
    const next = !soundOn || !audioLive;
    game.current?.setAudioOption('muted', !next);
    setSoundOn(next);
  }

  async function signOut() {
    if (!session) return;
    await logout(session.token);
    setSession(undefined);
    setLobbyView('lobby');
  }

  async function connect(joinMode: JoinMode) {
    if (!game.current || busy || !session) return;
    // Mauserfassung und Vollbild noch im Klick anfordern, vor dem asynchronen Raumbeitritt (Reihenfolge wichtig:
    // die Vollbild-Anforderung verbraucht die Nutzergeste).
    game.current.preLock();
    enterFullscreenIfWanted();
    setFault('');
    setCopied(false);
    setBusy(true);
    try {
      await game.current.connect(joinMode, code.trim(), mode, session.token);
      setEntering(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      game.current?.releaseLock();
      if ((error as { code?: number }).code === 401) {
        forgetSession();
        setSession(undefined);
        setAccountNotice(message);
        return;
      }
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

  const missionName = mission?.plan?.displayName ?? BODENBRUCH.displayName;
  return <main data-reduced-motion={cameraPreferences.reducedMotion} className={`freefall ${status.locked ? 'in-game' : 'in-menu'} ${(own?.motion ?? 0) & PLAYER_MOTION.aim ? 'aiming' : ''}`}>
    <div ref={surface} className="surface"/>
    <div className={`vignette ${status.hurt && status.locked && !cinematic && !result ? 'hurt' : ''}`}/>

    {telemetry && <Metrics status={status}/>}
    {status.locked && mission && <MissionHud mission={mission} status={status} intel={showIntel}/>}
    {status.locked && !result && status.notice && <div className="combat-notice" role="status"><div>{status.notice}</div></div>}
    {!active && <TitleScreen brand={<Brand />} sound={{ on: soundOn, live: audioLive, toggle: toggleSound }} onPrivacy={() => setPrivacy((open) => !open)}
      compact={privacy || (!!session && lobbyView !== 'lobby')}
      account={session && <div className="title-account">
        <span>{session.account.handle}</span>
        <LevelMeter experience={session.account.experience} compact/>
        <nav className="title-account-nav" aria-label="Konto">
          {([['record', 'Dienstakte'], ['arsenal', 'Arsenal'], ['account', 'Konto']] as const).map(([view, label]) =>
            <button key={view} className="title-link" type="button" aria-pressed={lobbyView === view}
              onClick={() => { setPrivacy(false); setLobbyView((current) => current === view ? 'lobby' : view); }}>{label}</button>)}
          <button className="title-link" type="button" onClick={() => void signOut()}>Abmelden</button>
        </nav>
      </div>}>
      {privacy ? <PrivacyNotice onBack={() => setPrivacy(false)}/>
        : !accountChecked ? <div className="title-card" role="status"><p>Verbindung zur Einsatzleitstelle …</p></div>
        : !session ? <LoginPanel notice={accountNotice} onSession={(next) => { setAccountNotice(''); setSession(next); }}/>
        : lobbyView === 'record' ? <ServiceRecord token={session.token} account={session.account} onBack={() => setLobbyView('lobby')}/>
        : lobbyView === 'arsenal' ? <Arsenal token={session.token} account={session.account} onBack={() => setLobbyView('lobby')}/>
        : lobbyView === 'account' ? <AccountSettings token={session.token} account={session.account} onBack={() => setLobbyView('lobby')}
          onDeleted={() => { setSession(undefined); setLobbyView('lobby'); setAccountNotice('Konto gelöscht.'); }}/>
        : <div className="title-card title-lobby">
          <div className="title-card-head"><span>Einsatzleitstelle</span></div>
          <div className="mode-picker" aria-label="Spielmodus">
            <button type="button" aria-pressed={mode === 'mission'} onClick={() => setMode('mission')}>Planeteneinsätze</button>
            <button type="button" aria-pressed={mode === 'arena'} onClick={() => setMode('arena')}>Boreal Relay</button>
          </div>
          <p>{mode === 'mission' ? 'Plant euren Einsatz auf dem Skyfall Carrier und stellt die Verbindung nach Dev’ Ault wieder her.' : 'Testarena mit einstellbarer Hordengröße für Kampftraining und Benchmarks.'}</p>
          <button className="primary" type="button" onClick={() => void connect('create')} disabled={busy || fatal}>Raum erstellen<span aria-hidden="true">↗</span></button>
          <form className="join" onSubmit={join}>
            <input maxLength={64} aria-label="Raumcode" placeholder="Raumcode" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" spellCheck={false}/>
            <button className="secondary" type="submit" disabled={!code.trim() || busy || fatal}>Beitreten</button>
          </form>
          <button className="title-link quick" type="button" disabled={busy || fatal} onClick={() => void connect('quick')}>Schnellbeitritt</button>
          {busy && <small className="joining" role="status">Verbindung wird aufgebaut …</small>}
          <details className="title-settings">
            <summary>Einstellungen</summary>
            <label className="graphics-choice">Grafikqualität
              <select value={quality} onChange={(event) => changeQuality(event.target.value as QualityName)} disabled={fatal}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <FullscreenSettings/>
            <ControlSettings onChange={() => refreshBindings((n) => n + 1)}/>
            <AudioSettings game={game.current}/>
          </details>
          {fault && <div className="fault" role="alert">{fault}</div>}
        </div>}
    </TitleScreen>}

    {active && entering && !status.locked && <div className="entering" role="status">Verbinde mit dem {mode === 'mission' ? 'Skyfall Carrier' : 'Boreal Relay'} …</div>}
    {!status.locked && active && !entering && <section className={result ? 'operations results' : status.atLocker && mission ? 'operations loadout-open' : 'operations'}
      aria-label={result ? 'Einsatzergebnis' : 'Einsatzsteuerung'}>
      <div className="eyebrow"><span />{active ? inCarrier ? 'Skyfall Carrier · Deck 03' : status.missionRoom ? missionName : 'Boreal Relay · Testarena' : 'KOOP · 1–4 SPIELER'}</div>
      {active ? <>
        <h1 className="room-heading">{result ? result.extractionSucceeded ? 'Einsatz erfolgreich' : 'Einsatz gescheitert'
          : status.atConsole ? 'Einsatzplanung' : status.atLocker && mission ? 'Ausrüstung' : inCarrier ? 'Mannschaftsdeck' : 'Einsatz bereit'}</h1>
        {result && <div key={result.id} className="mission-result">
          <p>{result.extractionSucceeded ? `Extraktion bestätigt · ${result.extractedOperatorIds.length} Operator · ${result.extractionMethod === 'balloon' ? 'Rettungsballon' : 'Albatross 02'}`
            : result.outcome === 'objective-unavailable' ? 'Missionsziel nicht verfügbar · Einsatz abgebrochen'
            : 'Trupp ausgefallen · Keine Operatoren extrahiert'}</p>
          {result.procedural && <p>{missionName} · Seed {result.procedural.seed}
            {objectivesCompleted !== undefined && ` · ${objectivesCompleted} ${objectivesCompleted === 1 ? 'Ziel' : 'Ziele'} erfüllt`}</p>}
          <p>Convicts im Statusbericht {result.convictsSurvived}/{result.convictsDeployed} lebend.
            Albatross {result.albatrossSurvived ? 'erhalten' : 'zerstört'}.</p>
          {reward && <div className="result-reward">{reward.baseExperience} Basis-EP + {reward.extractionBonusExperience} Extraktions-EP
            <strong>{reward.totalExperience} EP</strong></div>}
          {status.progress?.resultId === result.id && <div className="result-progress" role="status">
            {status.progress.level > status.progress.previousLevel && <strong className="level-up">Level {status.progress.level} erreicht</strong>}
            <LevelMeter experience={status.progress.experience} compact/>
            <small>Deinem Account gutgeschrieben: {status.progress.gained} EP</small>
            {!!status.progress.unlocked?.length && <small>Neu freigeschaltet: {status.progress.unlocked
              .map((id) => UNLOCKS.byId.get(id)?.displayName ?? id).join(', ')}</small>}
          </div>}
          <button className="primary" type="button" onClick={() => game.current?.action('return-vote')}
            aria-pressed={mission.operators.some(({ id, endVote }) => id === status.ownId && endVote)}>
            Rückkehr bestätigen <span>{seconds(mission.resultUntil, status)} s</span>
          </button>
        </div>}
        {!result && <div className="room">
          <div><span>RAUMCODE</span><strong>{status.roomId}</strong></div>
          <button className="text-button" type="button" onClick={() => void copyLink()}>{copied ? 'Kopiert' : 'Einladungslink kopieren'}</button>
        </div>}
        {mission && status.atConsole && !result && <CarrierConsole mission={mission} status={status}
          select={(selection) => game.current?.select(selection)} start={() => game.current?.startMission()}/>}
        {mission && status.atLocker && !result && <LoadoutPanel status={status} apply={(selection) => game.current?.setLoadout(selection)}/>}
        {mission?.state === 'BOARDING' && <>
          {mission.plan && <p>{mission.plan.briefing}</p>}
          {mission.fallback && <p>Ersatzauftrag · Operation Bodenbruch</p>}
          <OperatorManifest mission={mission} status={status}/>
        </>}
        {mission?.state === 'BOARDING' && status.host && <button className="secondary" type="button"
          onClick={() => game.current?.cancelBoarding()}>Boarding abbrechen · zurück zur Missionskonsole</button>}
        {!result && <button className="primary" type="button" onClick={() => { setFault(''); enterFullscreenIfWanted(); game.current?.lock(); }}
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
        {mission && !inCarrier && !result && <div className="session-difficulty">{DIFFICULTY_REGISTRY.get(mission.difficultyId)?.displayName}</div>}
        {mission?.debug && status.host && !result &&
          <div className="debug-controls">
            {([
              ['patrol', 'Patrouille'], ['alert', 'Alarm'], ['breach', 'Durchbruch'], ['nest', 'Nest'],
              ['destroy-nest', 'Nest zerstören'], ['objectives', 'Relais abschließen'], ['horde-wave', 'Welle anstoßen'],
              ['board', 'Boarding simulieren'], ['deploy', 'Deployment starten'], ['land', 'Direkt landen'],
              ['damage-thruster', 'Düse beschädigen'], ['destroy-albatross', 'Albatross zerstören'],
              ['balloon', 'Ballon auslösen'], ['fighter', 'Rettungsjäger rufen'],
            ] satisfies [MissionDebugAction, string][]).map(([action, label]) =>
              <button className="secondary" key={action} type="button" onClick={() => game.current?.debug(action)}>{label}</button>)}
            {!inCarrier && mission.plan?.world && <label>Testwetter
              <select value="" onChange={(event) => {
                if (event.target.value) game.current?.debug(`weather:${event.target.value}`);
              }}>
                <option value="">Wetter wählen</option>
                {planetWeather(mission.plan.world.planetId).map(({ id }) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>}
            <button className="secondary" type="button" onClick={() => game.current?.toggleWeather()}>Wetterdarstellung · F4</button>
            <button className="secondary" type="button" onClick={() => game.current?.toggleRoutes()}>Routen · F3</button>
            {mission.convicts.length > 0 && <ul className="debug-convicts">{mission.convicts.map((convict) =>
              <li key={convict.id}>Convict {convict.slot + 1} · {convict.state} · {convict.hp}/{convict.maxHp} · {convict.equipmentId} · {convict.weaponId}</li>)}</ul>}
          </div>}
      </> : null}
      <label className="graphics-choice">Grafikqualität
        <select value={quality} onChange={(event) => changeQuality(event.target.value as QualityName)} disabled={fatal}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <FullscreenSettings/>
      <ControlSettings onChange={() => refreshBindings((n) => n + 1)}/>
      <AudioSettings game={game.current}/>
      {fault && <div className="fault" role="alert">{fault}</div>}
    </section>}

    {status.locked && !inCarrier && !cinematic && !result && own && own.hp > 0 && <>
      <div ref={reticle} className={`reticle ${status.hit ? 'hit' : ''} ${status.eliminated ? 'kill' : ''} ${status.allyHit ? 'ally' : ''}`} aria-hidden="true">
        <i/><i/><i/><i/><span className="reticle-blocked"/><span className="reticle-confirmation"/>
      </div>
      <div ref={damageHud} className="damage-directions" aria-hidden="true">
        {DAMAGE_DIRECTIONS.map((i) => <span key={i} hidden/>)}
      </div>
    </>}
    {status.locked && !result && !cinematic && status.friendlyNotice && <div className="friendly-notice" role="status">{status.friendlyNotice}</div>}
    {status.locked && !cinematic && own && own.hp > 0 && own.posture?.standBlockedAt !== undefined &&
      status.serverTick - own.posture.standBlockedAt < 30 && <div className="posture-notice" role="status">Kein Platz zum Aufstehen</div>}
    {active && status.respawn > 0 && <div className="respawn" role="status"><strong>Außer Gefecht</strong><span>Respawn in {status.respawn.toFixed(1)} s</span></div>}

    {!result && <footer className="bottom">
      {active && own && (!status.locked || !cinematic) && <TeamPanel status={status} mission={mission} expanded={showIntel}/>}
      {active && !status.locked && !cinematic && <div className="controls">
        <span><kbd>{(['MOVE_FORWARD', 'MOVE_LEFT', 'MOVE_BACKWARD', 'MOVE_RIGHT'] as const).map((action) => bindings.label(action)).join(' ')}</kbd> Bewegen</span>
        <span><kbd>{bindings.label('CROUCH')}</kbd> Ducken</span><span><kbd>{bindings.label('DIVE')}</kbd> Hechtsprung</span>
        <span><kbd>{bindings.label('STAND_UP')}</kbd> Aufstehen</span><span><kbd>{bindings.label('AIM')}</kbd> Zielen</span>
        <span><kbd>{bindings.label('FIRE')}</kbd> Feuern</span><span><kbd>Esc</kbd> Menü</span>
      </div>}
      {active && own && status.locked && !inCarrier && !cinematic && <CombatLoadout player={own} tick={status.serverTick}
        dryFireTick={status.dryFireTick} resupply={status.missionRoom}/>}
    </footer>}
  </main>;
}

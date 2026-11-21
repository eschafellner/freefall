# Freefall · Technische Abnahme 7.4E

**Gesamtstatus BLOCKED.** Prüfstand 20. November 2026, Arbeitsstand auf `4daf04e`, Node 24.18.0, Balance `db47ff7931b5847c`. Lokale Hardwaremessungen auf einer Radeon RX 9070 XT liegen vor. Die Freigabe für festgelegte Zielgeräte und Budgets sowie die menschliche Koop-Spielabnahme stehen aus.

## Integrationsaudit

Der Server simuliert Gegner, Treffer, Spawn-Aufträge und Missionsübergänge mit 30 Hz. Bodenbruch nutzt Patrouillenwahrnehmung und lebensgebundene Ziele, geteilte Distanzfelder, lokale Separation, gebundene Angriffszustände und einen missionsgeführten Horde Director. Boreal Relay verwendet dieselbe Kampf- und Schwarm-KI mit lokalem Targeting und einem separaten Spawnring. Clients interpolieren autoritative Zustände. [Architektur und Tick-Reihenfolge](ENEMY_AI_ARCHITECTURE.md)

| Funktion und Eigentümer | Datei und ausgeführte Prüfung | Status | Befund und Maßnahme |
| --- | --- | --- | --- |
| 7.4A · Acquisition, Commitment, Wechsel, Zielverlust, vier Operatoren | `enemyTargeting.ts`, `PatrolManager.ts` · `enemy-ai.test.ts`, `multiplayer.test.ts` | VERIFIED | Vergleichbare Ziele bleiben gebunden. Große Distanzvorteile erlauben den Wechsel. Tod, Lebens-ID, Slotwechsel und getrennte Operatoren wurden geprüft. Hysterese in der Registry. |
| 7.4A · Wahrnehmung über Haltung und Geometrie | `PatrolManager.ts`, `MissionInstance.ts` · `enemy-ai.test.ts`, `mission.test.ts` | VERIFIED | Patrouillen nutzen Ton, Sicht, Konnektivität und Kontaktgedächtnis. Test mit niedriger unpassierbarer Wand, Bodenkampf und erneuter Erfassung. |
| Lebenszyklus und Gruppenbereinigung | `HordeManager.ts`, `PatrolManager.ts`, `MissionInstance.ts` · `enemy-ai.test.ts`, `simulation.test.ts`, `mission.test.ts` | VERIFIED | P2 behoben. Alte Slotzuordnungen beim Beaufsichtigen der Patrouille entfernen. Prüfung auf neue Entity-ID, wiederverwendeten Slot, Massensterben und Carrier-Cleanup. |
| 7.4B · Direkte Korridore, Pathfinding, Obstacle Avoidance | `GroundNavigation.ts`, `EnemyNavigation.ts`, `horde.ts` · `enemy-ai.test.ts`, CPU-Matrix | VERIFIED | Geometrische Korridore, geteilte Distanzfelder und Tickbudgets geprüft. Die existierende Karte verwendet planaren Boden. Geneigte oder begehbare Höhen und bewegte Navigationsblocker stehen in dieser Karte nicht zur Verfügung. |
| 7.4B · Separation, Angriffsräume, Stuck Recovery | `UniformGrid.ts`, `EnemyApproach.ts`, `EnemyNavigation.ts` · `enemy-ai.test.ts`, Engstellen- und Konzentrationsprofil | VERIFIED | Rotierende Nachbarschaftssuche, Sektoren und begrenzte Ausweichversuche. Bei Überlast wartet ein Teil der Horde auf freie Zugänge. Die Durchsatzmessung für 1,2 m breite Engstellen steht im Performancebericht. |
| 7.4C · Windup, Active, Recovery, Cooldown, Koordination | `EnemyCombat.ts`, `EnemyApproach.ts` · `enemy-combat.test.ts`, `enemy-ai.test.ts` | VERIFIED | Ein Angriff bindet Gegner-ID, Starttick, Ziel und Lebens-ID. Mehrere freie Sektoren können gleichzeitig angreifen. Treffer werden vor der Schadensbuchung verbraucht. |
| 7.4C · Deckung, Volumen, Reichweite, Winkel und Postures | `EnemyCombat.ts`, `postureGeometry.ts` · `enemy-combat.test.ts`, `tactical-movement.test.ts`, `mission.test.ts` | VERIFIED | P1 behoben. Sekundärziele verwenden tatsächliche Schlaghöhe. Treffer vom ersten bis zum letzten Active-Tick, Stagger, Tod und Dives wurden geprüft. PRONE und SUPINE nutzen orientierte Trefferzonen. |
| 7.4C · Replikation und Telegraph-Zeitachse | `snapshots.ts`, `Timeline.ts`, `EnemyAttackPose.ts` · `enemy-telegraph.test.ts`, `multiplayer.test.ts` | VERIFIED | Wire- und Interpolationsphase sowie Abbruch sind automatisiert geprüft. |
| 7.4C · Telegraph-Erkennbarkeit in dichter Horde | `EnemyAttackPose.ts`, `EnemyVisualLOD.ts` · manuelle Sichtprüfung | IMPLEMENTED BUT UNVERIFIED | Erkennbarkeit und Reaktionszeit während einer durch Menschen gespielten dichten Welle bleiben zu prüfen. |
| 7.4D · Zustände, Druck, Budget, Wellenende und Recovery | `HordeDirector.ts` · `horde-director.test.ts`, Missionsbenchmark, Vier-Peer-Test | VERIFIED | Seed-Replay über fünf Phasen. Start- und Pausenschwelle haben Hysterese. Recovery stoppt dynamische Reservierungen und lässt bestehende Gegner weiterleben. |
| 7.4D · Fairness, Spawnposition, Reservierung und Cap | `SpawnManager.ts`, `EncounterDirector.ts` · `horde-director.test.ts`, Missionsbenchmark | VERIFIED | Prüfungen für ungültiges Gelände, Geometrie, Sicht jedes aktiven Operators, Posture-Footprint, Belegung, Erreichbarkeit und Tickbudget. Ein sichtbar austretendes Nest verwendet seinen angekündigten Ausgang. |
| Boreal Relay · Initialisierung und Lastgrenze | `Arena.ts`, `ArenaEncounter.ts`, `horde.ts` · `simulation.test.ts`, `schabe.test.ts`, Golden Trace | VERIFIED | P2 behoben. Maximal 100 Erzeugungen pro Tick, auch beim Sprung von 0 auf 1.000. Die Arena verwendet den offenen Ring, Bodenbruch die missionsspezifische Verdeckungsprüfung. |
| 7.4D · Vorrang und Nest-Aufträge | `EncounterDirector.ts`, `SwarmNestManager.ts`, `MissionInstance.ts` · `horde-director.test.ts`, `mission.test.ts`, `multiplayer.test.ts` | VERIFIED | Verteidigung, Nachschub, Nestzerstörung, lebender Trupp und Extraktion steuern die Freigabe. Zerstörte Nester erzeugen keine weitere Garnison. MissionResult beendet die Welle und gibt alle reservierten Plätze frei. |
| Reconnect und Produktionsautorität | `FreefallRoom.ts`, `MissionInstance.ts`, `EnemyCombat.ts` · WebSocket- und Serverregressionen | VERIFIED | P1 behoben. Ein Drop invalidiert offene Impacts auch bei Wiederverbindung vor dem nächsten Tick. Zwei Drops am Cap lassen dieselbe Mission weiterlaufen. Produktionsraum blockiert Debug-Aufträge. |
| Mission und Ressourcen | `MissionInstance.ts`, `ObjectiveManager.ts`, `Convicts.ts`, `ResupplySystem.ts`, `ExtractionSystem.ts` · `mission.test.ts`, `multiplayer.test.ts`, Browser-Harness | VERIFIED | Carrier, Albatross, Relais, Nester, Convicts, Nachschub und MissionResult geprüft. Beide Extraktionssysteme führen zurück zum Carrier. |
| Separater Nachschubflug | `ResupplySystem.ts` und `Albatross.ts` · Bestandsprüfung | MISSING | Der vorhandene Nachschub läuft über die Container am gelandeten Albatross. Ein eigener Anflug und Abflug für den Nachschub sind im angeforderten Bestand nicht vorhanden. |
| Laufzeitbetrieb auf Zielgeräten | Server-, Browser- und Netzbudgets · [Messbericht](ENEMY_AI_PERFORMANCE.md) | IMPLEMENTED BUT UNVERIFIED | Radeon RX 9070 XT lokal gemessen. Freigabe der Zielgeräte, WAN und formale Budgetfreigabe stehen aus. |

## Fehlerliste

| Priorität | Fehler oder Grenze | Status |
| --- | --- | --- |
| P0 | Kein reproduzierter P0 in den ausgeführten Profilen | Kein offener Befund |
| P1 | Konvikt und Albatross konnten hinter Deckung zwischen Schlaghöhe und bisheriger Sichttesthöhe getroffen werden | Behoben und getestet |
| P1 | Wiederverbindung im selben Tick konnte einen früher gebundenen Schlag weiterlaufen lassen | Behoben und getestet |
| P2 | Tote Gegner ließen alte Patrouillenreferenzen zurück | Behoben und getestet |
| P2 | Sprung auf 1.000 Gegner konnte den gesamten Arena-Refill in einen Tick legen | Behoben und getestet |
| P2 | Engstelle begrenzt den Zufluss großer Horden. Auswirkung auf Gefechtsfluss und Druck unter realer Gegenwehr bleibt offen. | OFFEN |
| P2 | Sichtprüfung für Bodenbruch nähert die Schulterkamera an. Sichtbare Spawn-Kandidaten bei Extremformaten und Kamerabewegung sind in der menschlichen Spielabnahme zu prüfen. | OFFEN |
| P3 | Keine neue kosmetische Regression in den Stichproben erfasst | Sichtprüfung offen |

## Balance-Review

| Registry-Wert | Zuvor | Jetzt | Grund und Nachweis |
| --- | --- | --- | --- |
| `swarm.hordeAi.targeting` | 30 Ticks Commitment, 2 m absolute und 0,8 relative Wechselgrenze im Code | Identische Werte in der Registry | Arena und Mission verwenden dieselben validierten Defaults. Legacy-Config- und Zielwechseltest. |
| `swarm.arena.maxSpawnsPerTick` | Bis zu 1.000 initialisierbar | 100 Schaben je Tick | Begrenzt Erzeugungsarbeit. Der Kapazitätstest prüft jeden Schritt von 0 bis 1.000. Nur der Arena-Golden-Trace ändert sich. |
| `enemies[].gameplay.hitHeight` | 0,72 m, zusätzliche sekundäre Deckungsprüfung auf 1 m | 0,72 m als gemeinsame Schlaghöhe | Korrigiert Treffer durch niedrige Deckung. Keine Datenänderung. |

Die Navigation nutzt Meter, normierte Faktoren und Tick-Budgets in `hordeAi`. `meleeAttack` besitzt 11/3/8 Ticks für Windup, Active und Recovery, einen Halbwinkel von 60° und ein Entscheidungsintervall von zwei Ticks. `director` validiert Zeitgrenzen, Hysterese, Gruppen- und Kandidatenbudgets. Die Limits der sieben Schwierigkeiten liegen zwischen 120 und 1.000. Bei Missionsstart werden aufgelöste Werte für den Lauf eingefroren. Waffen-, Ausrüstungs- und Schabenwerte entsprechen dem Ausgangsstand. [Performance und Kampfdaten](ENEMY_AI_PERFORMANCE.md)

## Durchläufe und Regression

Die serverseitigen Bodenbruch-Durchläufe mit regulären Bewegungs- und Missionsaktionen liefen mit einem Operator per Albatross, zwei per Ballon und vier über beide Systeme. Die Tests prüfen beide Relais, Extraktionsberechtigung, MissionResult, Rückkehr und aufgeräumte Gegner. Ergänzende Regressionen prüfen Nestalarm, Zerstörung, Convict Defense, Luftfahrzeugschaden und Nachschub. Der vierköpfige FREEFALL-Ballon-Stresstest nutzt Platzierung und Last-Setup des Harness. Der Chromium-Durchlauf nutzt eine gerenderte Ansicht und drei SDK-Peers. Er startete am Carrier, führte über Deployment und Ballonrettung zurück zum Carrier und testete Tactical Movement und Ausrüstung. Für die Missionsziele verwendete er eine Debug-Abkürzung. [Spieltest und offene manuelle Abnahme](ENEMY_AI_PLAYTEST.md)

Die Tests decken Gunplay, Nachladen, Friendly Fire, Granaten, Nahkampf und Stims ab. Die Browser-Partie erfasste 13 Primär- und zwei Sekundärschüsse, zwei verbrauchte Magazine, drei Granaten und zwei geskriptete Stim-Anwendungen. Für Balancing zählen zusätzlich die Treffer- und Schadensmessungen der CPU-Matrix. Geschützte Testoperatoren und die nachgeladenen Kohorten eignen sich nicht zur Bewertung der gewünschten Schwierigkeit oder Casualty-Rate. [Kampfmessung](ENEMY_AI_PERFORMANCE.md)

**251 von 251 automatisierten Tests bestanden.** `npm run build`, `npm run typecheck`, `npm run balance:check` und `sha256sum -c docs/enemies/schabe/baseline.sha256` liefen erfolgreich. Der Build meldete die Vite-Warnung für das Hauptbundle über 500 kB minifiziert. Alle drei Dateien der Schaben-Baseline bestanden die Prüfsumme. [Netzwerkprofile](MULTIPLAYER_HORDE_STRESS_TEST.md)

## Release-Gates

| Gate | Status | Evidenz |
| --- | --- | --- |
| A · Enemy AI Correctness | PASS | Ziele, Invalidierung, Ablaufgrenzen, Tod, Slotrecycling und Cleanup |
| B · Navigation & Swarm Behavior | PASS | Korridor-, Deckungs-, Kontakt-, Recovery- und Lasttests. Engstellen-Durchsatz ist ein dokumentierter P2. |
| C · Combat Validation | NOT TESTED | Autoritative Treffer- und Replikationsprüfungen grün. Menschliche Sichtprüfung des Telegraphs unter echter Koop-Last steht aus. |
| D · Horde Director | PASS | Fünf Phasen, Druck, Recovery, Spawnregeln, Cap, Nest- und Missionsprioritäten |
| E · Multiplayer | PASS | Vier reale Peers, Angriff über emulierte RTT, zwei Wiederverbindungen mit 1.000 aktiven IDs und separater Netem-Lauf mit Jitter und TCP-Paketverlust. WAN-Profile sind separat offen. |
| F · Mission Integration | PASS | Reguläre simulierte Missionsdurchläufe über beide Extraktionen, ergänzende Browser- und Netzwerkverifikation |
| G · Performance | BLOCKED | 1.000 Gegner in CPU-, Netzwerk-, SwiftShader- und Radeon-Profilen gemessen. Budgetfreigabe, Zielgeräte-Matrix und längere Browser-/WAN-Soaks stehen aus. |
| H · Regression & Build | PASS | Build, TypeScript, automatisierte Regressionen, Balance und geschützte Schaben-Dateien |
| I · Documentation | PASS | Audit, Befunde, Messmethoden, Reproduktion und Abnahme liegen vor. |

Offene Punkte der Definition of Done sind 18 für die manuelle Telegraph-Sichtprüfung, 56 für freigegebene Budgets, 58 für einen Langzeitbetrieb über mehrere Räume mit Reconnects, 59–60 für Encounter-Pacing und Bedrohung unter menschlicher Gegenwehr sowie 68 für die abschließenden Release-Gates. Die 1.000er-Kohorte war auf dem Server aktiv und über vier Chromium-Ansichten repliziert. Der CPU-Test mit bewegten Operatoren erreichte 1,472 ms Tick-P95. Auf der RX 9070 XT lagen vier gleichzeitig gerenderte Ansichten bei 60 FPS und höchstens 16,8 ms Frame-P95. [Messreihen und Methodik](ENEMY_AI_PERFORMANCE.md)

Für den Abnahmelauf denselben Missionsseed, denselben Balance-Hash und dieselbe Hardware für Vergleichsprofile verwenden. Vier Spieler sollten sowohl gemeinsam am Relay als auch verteilt spielen und mindestens einen vollständigen Lauf je Extraktionssystem durchführen. Danach Clientmessungen und Budgets freigeben und Gates C und G erneut bewerten. [Zielhardware- und Netzprofil](MULTIPLAYER_HORDE_STRESS_TEST.md)

## Geänderte Dateien in 7.4E

- Laufzeit in `apps/server/src` · `ecs/EnemyCombat.ts`, `ecs/UniformGrid.ts`, `mission/MissionInstance.ts`, `mission/PatrolManager.ts`, `simulation/ArenaEncounter.ts`, `simulation/Battlefield.ts`, `systems/enemyTargeting.ts` und `systems/horde.ts`
- Balance · `packages/shared/src/balance/definitions.ts` und `packages/shared/src/balance/data/swarm.json`
- Prüfharness · `apps/server/src/mission/benchmarkEnemyAI.ts`, `apps/server/src/mission/benchmarkMission.ts` und `scripts/playtest-horde-director.mjs`
- Tests in `apps/server/test` · `balance.test.ts`, `enemy-ai.test.ts`, `enemy-combat.test.ts`, `mission.test.ts`, `multiplayer.test.ts`, `schabe.test.ts` und `simulation.test.ts`
- Dokumentation · `ENEMY_AI_ARCHITECTURE.md`, `ENEMY_TARGET_SELECTION.md`, `ENEMY_NAVIGATION.md`, `ENEMY_SWARM_BEHAVIOR.md`, `ENEMY_COMBAT_BEHAVIOR.md`, `ENEMY_ATTACK_VALIDATION.md`, `ENEMY_AI_PERFORMANCE.md`, `ENEMY_AI_PLAYTEST.md`, `HORDE_DIRECTOR.md`, `HORDE_SPAWN_MANAGEMENT.md`, `HORDE_ENCOUNTER_PACING.md`, `MULTIPLAYER_HORDE_STRESS_TEST.md` und diese Abnahme

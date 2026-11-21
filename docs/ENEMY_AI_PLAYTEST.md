# Verifikation und Playtest · 7.4A

## Automatisiert

209 von 209 Tests bestanden, darunter 14 neue KI-Regressionen. TypeScript-Prüfung, Produktionsbuild und Balance-Check waren erfolgreich. Der Produktionsbuild meldete eine Vite-Warnung zur Chunk-Größe.

- Lokale Zielverteilung auf vier Operatoren, Hysterese, deutlicher Distanzvorteil, Tod, Slotrecycling, neue Lebens-ID und erreichbarer Ersatzkontakt.
- Vier real simulierte Missionoperatoren erhalten im selben Tick je einen autoritativen Schlag in unterschiedlichen Haltungen. Der getrennte Operator nimmt keinen weiteren Schabenschaden. Seine zurückkehrende Session wird ohne zusätzliche Alarmanweisung wieder gefunden.
- Alle sieben Haltungen werden auf Treffer, Fehlschlag und Cooldown geprüft. Zusätzliche Fälle prüfen hohe oder zu niedrige Kontaktzonen, Deckung, Stagger und Tod.
- Navigationstests prüfen einen Umlauf, einen engen freien Korridor, durch eine niedrige Wand getrennte Regionen, ungültige Zielpunkte, Wegpunktauswahl, Stuck-Zählung und Rückführung.
- Die realen Colyseus-Loopback-Tests prüfen vier Verbindungen, Ablehnung einer fünften, Host-Übergabe, Missionszustände, Reconnect in Bodenhaltungen und Debug-Metrics. Die vollständigen Missionsregressionen spielen Bodenbruch regulär über beide Extraktionsmethoden und prüfen Convicts, Nester, Nachschub, MissionResult und Rückkehr.
- TypeScript, Produktionsbuild, Balance-Check, die neu aufgezeichneten Golden Traces aller Schwierigkeitsstufen und die geschützten Schaben-Prüfsummen gehören zur Abnahme.

## Manuelle Prüfschritte

1. Mit `FREEFALL_MISSION_DEBUG=1 npm run dev` lokal starten. Bodenbruch mit vier Operatoren eröffnen und zu verschiedenen Seiten einer Patrouille gehen. In F2 wechseln Ziel und Distanz nur bei deutlich besserer Gelegenheit, Kontaktverlust oder einem ungültigen Ziel. F3 blendet die vorhandenen Patrouillenrouten ein.
2. Je eine Person bleibt stehen, duckt sich, taucht ab oder kriecht. Einen Schabenangriff neben einer niedrigen Deckung abwarten. Abstände, Trefferzonen und Cooldowns in F2 kontrollieren. Einen Operator während der Verfolgung trennen und wieder verbinden.
3. Engstellen an Deckung und am Albatross prüfen. Bei einem unbeweglichen Gegner ID, Wegpunkt, Ziel, Zählerdifferenz und beteiligte Geometrie festhalten. Danach beide Extraktionsarten mit noch aktiver Horde abschließen.
4. Auf Zielhardware vier getrennte Browserperspektiven und den Hordenlauf mit echter zusätzlicher Netzlatenz messen. Diese Hardware- und Netzwerkmessung bleibt offen.

## 7.4B · Durchgeführte Abnahme

Die vollständige Testsuite bestand **216 von 216 Tests** mit Node 24.18.0. Build, TypeScript-Prüfung, Balance-Validierung und Golden Traces bestanden ebenfalls. Der Produktionsbuild meldete die Vite-Warnung zur Größe des Haupt-Chunks.

- Grid-Suche mit leerer Nachbarschaft, Grenzzellen, Zellwechseln und rotierender Stichprobe. Separation bei überlappenden Gegnern, an Deckung und an der Kartenkante. Deterministische Wiederholung und begrenzte Schritte.
- 40 gleichzeitig anlaufende Gegner verteilen sich um einen Operator über vier Quadranten. Die separaten Ziel- und Nahkampftests decken vier Operatoren, Zielwechsel, alle sieben Haltungen, Bodenkontakt, Deckung, Cooldown und Stagger ab.
- Eine kleine Horde passiert einen geknickten 1,2-m-Durchgang. Weitere Fälle decken freie Wege, niedrige Hindernisse, getrennte Regionen, ungültige Ziele, kleine und große Zielversätze sowie Cache, Eviction und Abfragebudgets ab.
- Recovery prüft blockierten Fortschritt, erfolgreiche Wiederaufnahme, begrenzte Versuche, absichtliches Halten und Reparatur eines ungültigen Ursprungs mit Slotrecycling. Gültige Gegnerpositionen bleiben in der Bewegungsintegration.
- Vier echte Colyseus-Verbindungen. Ein Reconnect erhält einen Hordensnapshot, dessen Bytes für denselben Tick mit dem Snapshot des Hosts identisch sind. Die Testsuite deckt Client-Interpolation, Operator-Reconnect und Missionszustände ab.
- Operation Bodenbruch wurde regulär mit 1, 2 und 4 Operatoren abgeschlossen, einschließlich Albatross- und Ballon-Extraktion. Nest-, Convict-, Nachschub-, Missions- und Tactical-Movement-Regressionen bestanden. Der SHA-256-Test bestätigt die geschützten Schaben-Dateien.
- CPU-Lastmatrix bis 1.000 gleichzeitig aktive Gegner auf leerem Gelände, in Bodenbruch, mit getrenntem und konzentriertem Team, bewegten Operatoren und einer künstlichen Engstelle. Ergebnisse und Einschränkungen stehen in der [Performance-Dokumentation](ENEMY_AI_PERFORMANCE.md).

Für 7.4C sind ein Wiedereinstiegstest mit aktiven Spielern an einem dicht gedrängten Durchlass, der Durchsatz sehr enger Zuführungen und GPU-Messungen mit vier gerenderten Ansichten sinnvoll. Höhenprofile und bewegte Nav-Blocker benötigen eine Erweiterung des planaren Weltmodells.

## 7.4B · Dateien

| Bereich | Dateien |
| --- | --- |
| Simulation und Grid | `apps/server/src/systems/horde.ts`, `apps/server/src/simulation/Battlefield.ts`, `apps/server/src/ecs/UniformGrid.ts`, `apps/server/src/ecs/EnemyApproach.ts`, `apps/server/src/ecs/EnemyNavigation.ts` |
| Missionsnavigation | `apps/server/src/mission/GroundNavigation.ts`, `apps/server/src/mission/PatrolManager.ts`, `apps/server/src/mission/MissionInstance.ts` |
| Balance und Debug | `packages/shared/src/balance/data/swarm.json`, `packages/shared/src/balance/definitions.ts`, `packages/shared/src/balance/resolver.ts`, `packages/shared/src/contracts/messages.ts`, `apps/client/src/ui/App.tsx` |
| Tests und Benchmarks | `apps/server/test/enemy-ai.test.ts`, `apps/server/test/multiplayer.test.ts`, `apps/server/test/mission.test.ts`, `apps/server/test/schabe.test.ts`, `apps/server/test/balance.test.ts`, `apps/server/src/benchmark.ts`, `apps/server/src/mission/benchmarkEnemyAI.ts`, `scripts/perf-browser.mjs` |
| Dokumentation | `docs/ENEMY_AI_ARCHITECTURE.md`, `docs/ENEMY_NAVIGATION.md`, `docs/ENEMY_SWARM_BEHAVIOR.md`, `docs/ENEMY_SPATIAL_PARTITIONING.md`, `docs/ENEMY_STUCK_RECOVERY.md`, `docs/ENEMY_AI_PERFORMANCE.md`, `docs/ENEMY_AI_PLAYTEST.md`, `docs/BALANCE_WORKFLOW.md` |

## 7.4C · Abnahme

236 von 236 Tests bestanden. TypeScript, Produktionsbuild, Balance-Validierung, Golden Traces und SHA-256-Prüfung waren erfolgreich. Der Produktionsbuild meldete die Vite-Warnung zur Größe des Haupt-Chunks.

| Prüffall | Ergebnis und Testart |
| --- | --- |
| A · Einzelangriff | Die Server-Suite prüft Windup ohne HP-Verlust, Active-Grenzen, Recovery, einen Treffer pro ID und die Folgeattacke nach 39 Ticks. Im gerenderten Chromium-Client zeigte das HUD nach dem Einzeltreffer einen Abfall von 100 auf 92 HP. |
| B · Ausweichen | Reguläre Server-Eingaben prüfen frühe Dives in beide Richtungen und einen gültigen Treffer im späten Luftzustand. Im Chromium-Lauf begann der Windup in Tick 44, der per Tastatur ausgelöste Seitwärtshechtsprung in Tick 46 und das aktive Fenster in Tick 55. Nach dem Fenster hatte der Operator 100 HP. Ein früherer Browserlauf mit einer anderen Startposition traf den Operator beim Dive und ließ 92 HP übrig. |
| C / D · Bauch- und Rückenlage | Die Suite prüft Orientierung von Kopf, Torso und Beinen, Deckung, Höhe, Waffenaktionen, Kamera und tatsächliche Verwundbarkeit. Im Browser wurde die Landung in PRONE mit 100 HP auch visuell geprüft. Ein menschlicher SUPINE-Kampf steht aus. |
| E · Mehrfachangriffe | Sektorkonkurrenz, getrennte gleichzeitige Treffer, Neuplatzierung nach einem Fehlschlag und Freigabe bei Slot-Recycling sind automatisiert. Die Lastmatrix enthält einen einzelnen stark bedrängten Operator und ein konzentriertes Viererteam. |
| F · Vierer-Koop | Vier Colyseus-Clients erhielten bei simulierten 140 ms RTT dieselben Startticks und je vier eindeutige Trefferereignisse für STANDING, CROUCHING, PRONE und SUPINE. Ein Reconnect erhielt den unveränderten Starttick eines laufenden Angriffs. Der Clienttest prüft Jitter, einen ausgelassenen Frame und die Ablehnung einer verspäteten älteren Nachricht. |
| G · Große Horde | Vier Kohortengrößen bis 1.000 Schaben auf dem virtuellen Server-Tick plus ein gerenderter Chromium-Client und drei SDK-Verbindungen im größten Browserlauf. CPU, Trefferhäufigkeit, Replikation und Framezeiten sind separat erfasst. |

Weitere Tests decken den ersten und letzten gültigen Treffer-Tick, Ziel- und Gegnertod in mehreren Phasen, Unterbrechung durch den vorhandenen Stagger, neue Lebens-ID, Wechsel des Zielobjekts, Winkel, Entfernung, Höhenüberlappung, Deckung, GETTING_UP und SLIDING ab. Die Sekundärzieltests decken Convict-Tod, Schiffs-Nozzles und Wechsel von Convict zu Schiff ab. Die regulären Bodenbruch-Regressionen decken Deployment, Nester, Ziele, Convict Defense, Albatross-Nachschub, beide Extraktionen, MissionResult und Rückkehr zum Carrier ab. Die Movement-, Kamera-, Eingabe-, Friendly-Fire-, Waffen- und Ausrüstungstests liefen mit. [Messwerte](ENEMY_AI_PERFORMANCE.md)

Vier gleichzeitig gerenderte menschliche Perspektiven auf Zielhardware, subjektive Lesbarkeit im dichten Schwarm, reale WAN-Verbindungen und vergleichbare mittlere Überlebenszeiten stehen aus. Die Browser-Stichproben nutzten SwiftShader. Der Browserlauf belegt anhand zweier Positionen, dass ein Dive dem Schlag ausweichen und bei Kontakt Schaden nehmen kann.

Für die Spielabnahme Bodenbruch mit vier Operatoren starten, F2 öffnen und vom sichtbaren Windup aus auf beiden Seiten ausweichen. Danach jeweils in Bauch- und Rückenlage schießen und aufstehen, während sich die Schaben neu positionieren. Am Albatross und an einem schmalen Durchlass die Angriffsdichte und wartende Zuführung beobachten. Für vergleichbare Überlebenszeiten sollte jede Gruppe denselben Seed und dieselbe Route aus dem Audit spielen.

### 7.4C · Geänderte Dateien

| Bereich | Dateien |
| --- | --- |
| Simulation und taktische Positionierung | `apps/server/src/ecs/EnemyCombat.ts`, `apps/server/src/ecs/EnemyApproach.ts`, `apps/server/src/ecs/EnemyNavigation.ts`, `apps/server/src/systems/combat.ts`, `apps/server/src/systems/horde.ts`, `apps/server/src/simulation/Battlefield.ts` |
| Registry und Treffergeometrie | `packages/shared/src/balance/data/swarm.json`, `packages/shared/src/balance/definitions.ts`, `packages/shared/src/balance/resolver.ts`, `packages/shared/src/config/postureGeometry.ts` |
| Replikation und Darstellung | `packages/shared/src/contracts/horde.ts`, `packages/shared/src/contracts/messages.ts`, `apps/server/src/networking/snapshots.ts`, `apps/server/src/rooms/FreefallRoom.ts`, `apps/client/src/rendering/EnemyAttackPose.ts`, `apps/client/src/rendering/EnemyVisualLOD.ts`, `apps/client/src/ui/App.tsx` |
| Benchmarks | `apps/server/src/benchmark.ts`, `apps/server/src/mission/benchmarkEnemyAI.ts`, `apps/server/src/mission/benchmarkMission.ts`, `scripts/perf-browser.mjs` |
| Tests | `apps/server/test/enemy-combat.test.ts`, `apps/server/test/support/enemy-combat.ts`, `apps/client/test/enemy-telegraph.test.ts`, `apps/server/test/enemy-ai.test.ts`, `apps/server/test/multiplayer.test.ts`, `apps/server/test/mission.test.ts`, `apps/server/test/balance.test.ts`, `apps/server/test/simulation.test.ts`, `apps/server/test/tactical-movement.test.ts`, `apps/server/test/review-fixes.test.ts` |
| Dokumentation und Schaben-Prüfsumme | `docs/ENEMY_AI_ARCHITECTURE.md`, `docs/ENEMY_COMBAT_BEHAVIOR.md`, `docs/ENEMY_ATTACK_TELEGRAPHS.md`, `docs/ENEMY_ATTACK_VALIDATION.md`, `docs/ENEMY_TACTICAL_RESPONSES.md`, `docs/ENEMY_SWARM_BEHAVIOR.md`, `docs/ENEMY_AI_PERFORMANCE.md`, `docs/ENEMY_AI_PLAYTEST.md`, `docs/ENEMY_COMBAT_VALIDATION.md`, `docs/BALANCE_WORKFLOW.md`, `docs/enemies/schabe/baseline.sha256` |

### Übergabe an 7.4D

Für das Encounter-Pacing Angriffsdichte, gültige Treffer und tatsächlich verfügbare Anmarschsektoren über Zeit erfassen. Am einzelnen 1,2-m-Durchlass passieren nur Teile der Horde. Alternative Zuführungen und Spawnverteilung können Druck um den Engpass herum verteilen. Die deutliche Differenz zwischen stehenden und bewegten Zielen sollte in der Vierer-Spielabnahme über aufeinanderfolgende Encounters bewertet werden, bevor die Schwierigkeit neu abgestimmt wird. [Performance und Vergleich](ENEMY_AI_PERFORMANCE.md)
## 7.4E · Spiel- und Regressionstests

- **Bodenbruch mit regulären Aktionen.** Simulierte Durchläufe mit 1, 2 und 4 Operatoren. Vier Operatoren schlossen beide Extraktionen ab. Die Operatoren benutzen dieselben Server-Eingaben wie im Spiel. Mit MissionResult und Carrier-Rückkehr endeten alle Durchläufe.
- **Chromium mit Ballon unter hoher Last.** Eine gerenderte Perspektive und drei verbundene SDK-Operatoren. Carrier, Flug, Touchdown, Ballon, Rettungsjäger, Ergebnis und Carrier-Rückkehr liefen durch. Der Test nutzte regulären Carrier-Weg und Boarding, eine Debug-Abkürzung für die Relais und eine auf 1.000 Gegner aufgefüllte Lastkohorte. Die getesteten Eingaben umfassen Crouch, Vorwärts- und Rückwärtsdive, Bewegung und Feuer in PRONE und SUPINE, Getting Up, Waffenwechsel, Nachladen, Stim und Granate. Ein Operator wurde extrahiert. Vier Operatoren extrahierten im separaten CPU-Ballon-Harness.
- **Offene Spielabnahme.** Vier Menschen spielen einen vollständigen Lauf je Extraktionssystem auf Zielgeräten. Am Relay mit verschiedenen Postures gegen eine aktive Welle kämpfen, dann den Trupp aufteilen. An einer Tür und an niedriger Deckung die Annäherung, Wartezeiten und den sichtbaren Windup prüfen. Die Route mehrfach mit demselben Seed und Schwierigkeitsgrad spielen. Angriffe, HP-Verlust, Operator-Todesfälle, Stims, Munition, Missionsdauer und subjektive Angriffserkennbarkeit protokollieren.

```sh
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  node --conditions=development scripts/playtest-ms6.mjs tactical stress
```

[Vier-Spieler- und Netzwerkprofile](MULTIPLAYER_HORDE_STRESS_TEST.md) · [Technische Abnahme](MILESTONE_7_4_FINAL_ACCEPTANCE.md)

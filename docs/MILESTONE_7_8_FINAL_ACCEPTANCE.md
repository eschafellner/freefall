# FREEFALL 7.8 · Finale Abnahme

**NOT ACCEPTED** · Die Combat-Presentation-Integration wurde umgesetzt und verifiziert. Im nativen 1080p-Waldtest hielt die kontrolliert nachgefüllte Lastprobe 1.000 tatsächlich simulierte Schaben in 899 von 901 Ticks und erreichte 60,0 FPS. Das freigegebene Rendering-Budget, die Langzeitstabilität und die vollständige Vier-Spieler-Sicht- und Hörabnahme bleiben offen.

## Umsetzung am 21. November 2026

| Bereich | Geänderte Dateien | Ergebnis |
| --- | --- | --- |
| Combat und Reconnect | `apps/client/src/networking/CombatPresentation.ts`, `EventHistory.ts`, `ShotHistory.ts`, `Match.ts`, `apps/client/src/game/Game.ts`, `apps/server/src/rooms/FreefallRoom.ts` | Gemeinsame Zulassung für Schüsse und Combat-Events, Schutz frischer Identitäten, Tickreihenfolge für Posen, spätes Wurfaudio nach Blast unterdrückt, Basis-Snapshots bei Join und Reconnect. |
| Mission und Audio | `apps/client/src/game/MissionPresentation.ts`, `apps/client/src/audio/MissionAudio.ts` | Ein akzeptiertes Missionsereignis steuert Meldung, Ton und Kamera. Reconnect stellt den laufenden Zustand wieder her. |
| Rendering und Telemetrie | `apps/client/src/rendering/mission/MissionEnvironment.ts`, `MissionMarkers.ts`, `apps/client/src/ui/App.tsx` | Gemeinsam genutzte statische HUD-Zustände werden nur bei Änderung geschrieben. F2 zeigt relative Ereignisalter und lokale Posenwartezeit. Netzwerk-Sampling in `Match.ts` läuft bei geöffnetem F2. |
| Tests | `apps/client/test/combat-presentation.test.ts`, `apps/server/test/procedural-mission.test.ts`, `scripts/playtest-combat-presentation.mjs`, `scripts/playtest-weapon-vfx.mjs`, `scripts/playtest-horde-director.mjs` | Regressionen für wiederholte und umsortierte Events sowie Wiederanlauf, durchgehende Simulations- und native Vier-Browser-Missionen, präzisere Erfassung real aktiver Schaben und stabilere Browser-Eingaben. |
| Dokumentation | `README.md`, `docs/COMBAT_PRESENTATION_ARCHITECTURE.md`, `docs/MILESTONE_7_8_FINAL_ACCEPTANCE.md`, `docs/MILESTONE_7_8E_BUG_REPORT.md`, `docs/MILESTONE_7_8E_TEST_MATRIX.md`, `docs/MILESTONE_7_8E_PERFORMANCE_REPORT.md`, `docs/playtest/7-8e/` | Audit, Autorität, Prioritäten, Reproduktion, Messwerte und Rohbelege. |

7.8A–D waren als Spielpfade vorhanden. Ihr Umfang umfasst Waffen-VFX und Audio, bestätigte Treffer und materialabhängige Impacts, Granaten und Nahkampf sowie taktische Kamera, Combat HUD und Missionsinszenierung. Der Audit beschreibt die vorgefundenen Integrationslücken. Die wesentlichen Fixes betreffen Reconnect-Basis, Deduplizierung, verspätetes Wurfaudio und redundante HUD-/Netzwerkarbeit. Die drei hinterlegten Schaben-Quellprüfsummen stimmen. Die acht Gameplay-Fingerabdrücke und der Balance-Hash `01855759529dd588` sind unverändert. Zusätzliche Kosten 0 €.

[Audit und Prioritäten](MILESTONE_7_8E_BUG_REPORT.md) · [Ereignisarchitektur und Prediction](COMBAT_PRESENTATION_ARCHITECTURE.md) · [Testmatrix](MILESTONE_7_8E_TEST_MATRIX.md) · [Messungen und Limits](MILESTONE_7_8E_PERFORMANCE_REPORT.md)

## Prüfnachweise

- **339 automatisierte Tests bestanden**, einschließlich lokaler WebSocket-Tests. Typecheck, Produktionsbuild, Balance-Check, Balance-Trace und Schaben-Prüfsummen erfolgreich. Vite meldet die bestehende Chunkgrößenwarnung. [Testrun](playtest/7-8e/verification.txt) · [Schaben-Prüfsummen](playtest/7-8e/schabe.txt)
- **Vier vollständige Simulationsmissionen mit je vier Operatoren.** Eis 48/0 in 1:05,3, Wüste 31/0 in 1:05,9, Grüne Ebene 76/20 in 3:23,6 und Wald 63/0 in 2:02,8. Seeds sind als Welt/Mission angegeben. Albatross auf Eis, Wüste und Wald, Ballon in der Grünen Ebene. Beide Extraktionen wurden zusätzlich im Browser mit vier WebSockets geprüft. Die schnell geskripteten Routen belegen die Zielzeit von 20–30 Minuten nicht. [Simulationsmatrix](MILESTONE_7_8E_TEST_MATRIX.md) · [Missionsbrowser](playtest/7-8e/mission/report.json)
- **Missionsbrowser.** Skyfall-Deployment, Albatross-Touchdown, Bauch- und Rückenlage, taktischer Magazinverlust, positive Nachschubaktion, Eigenbeschuss von rechts, Nestmeldung bei beweglichem Operator, Reconnect, beide Extraktionen und gescheiterter Ausgang. Der Browser setzt für gezielte Prüfphasen Positionen und nutzt die lokale Debug-Steuerung. Reguläre Nestzerstörung, Convict-Defense, bestehende Extraktionsbedingungen und Cleanup sind zusätzlich über serverseitige Tests belegt. [Deployment](playtest/7-8e/mission/deployment.jpg) · [Bodenlage](playtest/7-8e/mission/supine.jpg) · [Schadensanzeige](playtest/7-8e/mission/damage.jpg)
- **Kampf und Oberflächen.** Neun bestätigte Materialkontakte mit Positions-/Normalenprüfung auf vier Planeten. Detonationsduplikate sowie Nahkampf-Miss, Hit und wiederholte Echos im Browser. Tests der Autorität decken Friendly Fire, geschützte Ziele, Melee, Munition, Granaden-Detonation, Hitmarker und Eliminierung ab. [Browser- und Lastmatrix](playtest/7-8e/matrix/report.json)
- **Waffenbrowser.** Beide Waffen, fünf Waffen-/Haltungskombinationen, Remote-Hülsen und Blitzregler. Ein 175 ms zurückgehaltener Schuss erzeugte Trefferfeedback erst nach Lieferung. Die Wiederholung einer Eliminierung erzeugte keinen zweiten Killmarker. Friendly Fire, unbeschädigtes Schutzziel und Miss wurden getrennt geprüft. Umgeordnete World-Impact-Ticks 989 und 986 wurden je einmal dargestellt. [Waffen und Trefferrückmeldung](playtest/7-8e/weapon.json)
- **Server-Langlauf.** Feste Kohorte von 1.000 Schaben und vier Operatoren über 36.000 Messticks. Tick-P95 0,316 ms. Der Lauf verifiziert die isolierte Simulationslast. Der kombinierte Waldtest verzeichnete eine abnehmende Population. [Server-Langlauf](playtest/7-8e/server-soak.txt) · [Wald mit gezieltem Feuer](playtest/7-8e/max-final/report.json)
- **Netzwerk.** Bestehender Vier-Peer-Test mit 140 ms simuliertem RTT, tatsächlicher Drop während Kampf und Nestsequenz, aktueller Missionszustand nach Reconnect sowie 160 ms verzögerter Blast und ein am Sender ausgelassenes Blast-Event. Variierender Jitter und verspätete Snapshots sind in den Timeline-Tests enthalten. Netzwerk-Paketverlust auf Transportebene und systematisches Trennen während jeder Missionsphase wurden nicht geprüft. [Vier-Peer-Tests](playtest/7-8e/verification.txt) · [Browser-Netzprobe](playtest/7-8e/matrix/report.json)
- **Vier native Koop-Perspektiven.** Vier Operatoren erreichten auf Eis, Wüste, Grüner Ebene und im Wald jeweils das Ballon-MissionResult. Der Waldlauf hielt mit einer festen 1.000er-Kohorte beim Spiel gegen die Hordenangriffe über 30 Sekunden 60,0 FPS auf allen vier Browsern. Der Reconnect stellte laufenden Angriff, Wetterübergang und Ballon-Countdown wieder her. Während der Nachschubinteraktion brach der Disconnect die Aktion ab und erhielt die Containerladung. Die Browserläufe nutzten lokale Platzierungs-/Landungs-Fixtures und kamen auf 1:54 bis 2:22 Spielzeit. [Eis](playtest/7-8e/native-coop/ice.txt) · [Wüste](playtest/7-8e/native-coop/desert.txt) · [Grüne Ebene](playtest/7-8e/native-coop/green-plains.txt) · [Wald](playtest/7-8e/native-coop/forest.txt)
- **Visuelle Stichprobe.** Die generierten Screenshots für Rückenlage, Eigenbeschuss und Wald-HUD wurden gesichtet. Haltungs- und Ausrüstungszustand, Schadensrichtung und Ziele blieben im jeweiligen Standbild getrennt lesbar. Die Prüfung umfasst keine menschliche Vier-Operatoren-Spielsession oder subjektiven Audiomix. [Wald-HUD](playtest/7-8e/matrix/forest-forest-floor.jpg)

## Release Gates

| Gate | Status | Beleg und Grenze |
| --- | --- | --- |
| A · Waffenpräsentation | PASS | Waffen- und Pooltests sowie Browserprüfung von Gewehr, Pistole, Stand, Hocke, Bauch- und Rückenlage, Remote-Hülsen und Blitzregler. |
| B · Server-validiertes Hit Feedback | PASS | Servertests zu Damage, geschützten Zielen, bestätigtem Treffer, Miss, Friendly Fire und Eliminierung; Browser prüft verzögerten Kontakt und einmaligen Killmarker. |
| C · Oberflächen | PASS | Neun bestätigte Materialkontakte im Browser und Normalen-/Oberflächentests. |
| D · Granaten und Explosion | PASS | Zünder, Position, Radius, Damage-Regression, Duplikate und VFX-Cleanup. |
| E · Nahkampf | PASS | Bestätigter Treffer, Swing, Miss, Sperren und Duplikate im Client-/Serverpfad. |
| F · Taktische Kamera | PASS | Haltungs- und Kollisionsmatrix, Kameraimpulse und gezielte Browser-Dives. |
| G · Combat HUD | PASS | HUD- und Browserregressionen zu Trefferformen, Reload, Nachschub, Schadensrichtung und priorisierten Meldungen. |
| H · Cinematic Mission Events | PASS | Browser- und Simulationsergebnisse für Skyfall, Touchdown, Nachschub, Nest, Convicts und MissionResult. |
| I · Beide Extraktionen | PASS | Beide Mechaniken mit vier Verbindungen; Ballon-Countdown in der vollständigen Simulation regulär. |
| J · Multiplayer | PASS | Vier WebSocket-Verbindungen, Prediction/Reconciliation-Regression, deduplizierte Echos und echter Reconnect. |
| K · Gameplay-Regression | PASS | 339 Tests, acht Fingerabdrücke und Balance-Check. |
| L · Planeten | PASS | Je eine vollständige serverseitige Mission und ein Vier-Browser-Lauf pro Planet. Separate Materialkontakte sowie Combat VFX, Wetter, Soundscape und HUD im Browser. |
| M · Rendering | BLOCKED | Software-Vergleich, vier native 720p-Ansichten und nativer 1080p-Referenzlauf mit 60,0 FPS und Frame-P95/P99 16,8 ms auf der Radeon RX 9070 XT. Freigegebenes Client-Budget und breitere Zielgeräteabdeckung offen. |
| N · Audio-Performance | NOT TESTED | Caches und Voice-Budget wurden unter kombinierter Last geprüft. Subjektive Hörbarkeit und Priorisierung mit vier unabhängigen Hörperspektiven auf Zielhardware offen. |
| O · 1.000 aktive Schaben | PASS | Kontrollierter 30-s-1080p-Waldlauf mit 1.000 Schaben in 899 von 901 Messticks, vier feuernden Operatoren, bestätigtem Treffer-HUD, Explosionen, Wetter, Audiomix und Nestmeldung. Ersatzgegner wurden ausschließlich über die vorhandene Spawn-Validierung der Test-Fixture erzeugt. Der separate 720p-Lauf ohne Ersatz endete bei 911 Schaben. |
| P · Ressourcenstabilität | NOT TESTED | Pool-, Cleanup- und Heap-Kurzstichproben. Langzeit-GPU-, Audio- und Heap-Verläufe über mehrere Missionen fehlen. |
| Q · Accessibility | PASS | Reduzierte Bewegung, Shake-Dämpfung, Blitzregler und bestätigte HUD-Information in niedriger Qualität geprüft. |
| R · Compliance | PASS | Schaben-Prüfsummen, 0 € Zusatzkosten, Gameplay-Fingerabdrücke. |
| S · Dokumentation und Evidenz | PASS | Arbeitsstand, Testgrenzen, Seeds, Messergebnisse und Reproduktionsbefehle verzeichnet. |

Offene Arbeit für die Freigabe sind längere native Vier-Spieler-Missionen im vorgesehenen Spielrhythmus, die Bestätigung von Zielgeräte- und Rendering-Budgets, die Hörabnahme und ein Ressourcenprofil über mehrere Planetwechsel. Priorisierte Befunde und verbleibende P1–P3 stehen im Audit.

<details>
<summary>Historische Teilabnahme 7.8A</summary>

## Abnahme · Milestone 7.8A

Die erste Stufe implementiert die Waffenpräsentation für Primärwaffe und Dienstpistole. Der lokale Schuss nutzt die vorhandene Prediction für Audio, Waffenreaktion und Mündungsfeuer. Bei Remote-Operatoren werden Audio, Laufblitz, Waffenpose und Tracer gemeinsam auf dem interpolierten Tick ausgelöst. Tracer und Trefferfeedback folgen dem Serverresultat. Die Tracerdaten enthalten einen separaten Start, wenn der validierte Strahl auf flachen Karten vom sichtbaren Lauf abweicht.

## Geänderte Bereiche

| Bereich | Dateien |
| --- | --- |
| Autoritative Schussdaten | `packages/shared/src/contracts/messages.ts`, `apps/server/src/systems/combat.ts`, `apps/server/src/rooms/FreefallRoom.ts` |
| Client und Netzwerkerfassung | `game/Game.ts`, `networking/Match.ts` unter `apps/client/src` |
| Waffen, Posen und VFX | `rendering/ArenaView.ts`, `Agents.ts`, `VisualEffectsManager.ts`, `GraphicsQuality.ts`, `characters/PlayerVisualController.ts`, `mission/ConvictView.ts`, `weapons/WeaponVisualController.ts` und `weapons/WeaponFireEffects.ts` unter `apps/client/src` beziehungsweise dessen Rendering-Verzeichnis |
| Einstellungen und Telemetrie | `rendering/CameraPreferences.ts`, `ui/ControlSettings.tsx`, `ui/App.tsx` unter `apps/client/src` |
| Regression und Browser-Test | `apps/client/test/weapon-vfx.test.ts`, `presentation.test.ts`, `tactical-movement.test.ts`, `apps/server/test/combat.test.ts`, `apps/server/test/support/balance-trace.ts`, `scripts/playtest-weapon-vfx.mjs` |

Der neue Tracer-Start wurde als Präsentationsfeld aus dem Gameplay-Fingerprint herausgenommen. Die acht gepinnten Fingerprints für Arena und Missionen blieben identisch. Reichweite, Munition, Treffer, Friendly Fire, Schaden, Rückstoßwerte, Moves und Gegnerlogik folgen denselben Regeln. Die Modelle, Rigs, Materialien und Animationsassets der Schabe wurden nicht bearbeitet. Die drei hinterlegten Schaben-Quellprüfsummen stimmen. Die Mündungsmaske und Hülsen werden prozedural erzeugt. Assetkosten **0 €**.

309 automatisierte Tests bestanden. Typecheck, Produktionsbuild und Balance-Check liefen erfolgreich durch. Der Browserlauf prüfte fünf Waffen-/Haltungskombinationen, zwei absichtlich wiederholte Pakete, Remote-Hülsen, die Flash-Option und das Lauflicht auf High. Die Arena-Stichprobe hielt 1.000 aktive Schaben während 93 replizierter Schüsse von vier Operatoren.

## Gates

| Gate | Ergebnis für 7.8A | Nachweis |
| --- | --- | --- |
| A · Weapon Presentation | PASS | Socket, Tracer, Lauflicht, Hülsen, Recoil-Integration, automatisierte Haltungs- und Waffentests sowie Browser-Playtest. |
| B · Hit Feedback | NOT TESTED | Der vorhandene bestätigte Pfad ist regressionsgeprüft. Die vollständige Trefferfeedback-Abnahme gehört zu 7.8B. |
| C · Surface Impacts | NOT TESTED | Materialtests auf allen vier Welten gehören zu 7.8B. |
| D · Explosions & Melee | NOT TESTED | Die komplette Präsentationsabnahme gehört zu 7.8C. |
| E · Camera & HUD | NOT TESTED | Bestehender FOV-Impuls und F2-Telemetrie sind in 7.8A integriert. Die vollständige Abnahme gehört zu 7.8D. |
| F · Cinematic Mission Events | NOT TESTED | Deployment, Albatross, Nachschub und Extraktionsinszenierung werden in 7.8D abgenommen. |
| G · Multiplayer | PASS | Echter Vier-Client-Verkehr, Remote-Schusspräsentation, Deduplication sowie vorhandene Reconnect- und Latenzregressionen für die 7.8A-Integration. |
| H · Gameplay Regression | PASS | Bestehende Testmatrix und unveränderte Gameplay-Fingerprints. |
| I · Performance | NOT TESTED | Messwerte aus SwiftShader liegen vor. Die Bildrate der Stichprobe reicht für eine visuelle Abnahme nicht aus. Zielhardwarevergleich offen. |
| J · Horde Compatibility | NOT TESTED | Kurzlauf bei 1.000 aktiven Schaben bestanden. Kombinierter Wald- und Explosionslauf offen. |
| K · Resource Stability | NOT TESTED | Pool-, Timeout-, Dispose- und Browser-Cleanup geprüft. Langzeitmessung offen. |
| L · Accessibility & Comfort | PASS | Browserprüfung des Blitzreglers bei 0 und 100 Prozent. Kamera- und übrige Flash-Quellen sind Teil der späteren Gesamtabnahme. |
| M · Documentation | PASS | Audit, Architektur, Playtest, Rohdaten und die noch offenen Abnahmeschritte liegen vor. |

7.8A ist implementiert und funktional geprüft. Die vollständige Abnahme von 7.8 folgt nach 7.8B–E. Als nächster Teilschritt folgen serverbestätigte Oberflächen- und Trefferimpacts. Die Performance-Abnahme benötigt den Vergleich auf Zielhardware bei gleicher Szene, Qualität und Schusslast.

- [Audit und Prioritäten](COMBAT_PRESENTATION_ARCHITECTURE.md)
- [Waffenpräsentation](WEAPON_VFX.md)
- [Playtest und Wiederholung](MILESTONE_7_8_PLAYTEST.md)
- [Budgets und Messwerte](COMBAT_VFX_PERFORMANCE.md)
- [Fortsetzung · Abnahme 7.8B](MILESTONE_7_8B_FINAL_ACCEPTANCE.md)

</details>

# FREEFALL

Serverautoritatives Third-Person-Koop-Spiel für bis zu vier Personen im Desktop-Browser. **Operation Bodenbruch** führt den Trupp durch Schwarmgebiet zu zwei Kommunikationsanlagen und zur Extraktion. **Boreal Relay** ist die Testarena mit einstellbarer Hordengröße bis 1.000.

## Lokal starten

Voraussetzungen sind Node.js 24 oder neuer, npm und ein Desktop-Browser mit WebGL 2 und Pointer Lock.

```bash
npm ci
npm run dev
```

Öffne die [Einsatzleitstelle](http://127.0.0.1:5173/) und melde dich an. Für einen neuen Operator genügt ein Name ohne `#`; der Server vergibt einen Tag wie `Name#0412`, mit dem du dich danach anmeldest ([Accounts](docs/ACCOUNTS.md)). Erstelle dann einen Raum für **Operation Bodenbruch**. Du startest direkt auf dem Carrier; **Esc** öffnet das Raummenü mit Raumcode und Einladungslink. Geh zum holografischen Tisch in der Mitte der Messe und öffne ihn mit **E**. Wähle als Host **Dev’ Ault**, **Operation Bodenbruch** und eine der sieben Schwierigkeiten. Gib das Boarding frei. Geht gemeinsam durch die vordere Luftschleuse in den Albatross 02 und bestätigt jeweils mit **E**.

Für einen generierten Einsatz wählst du an derselben Konsole **Grüne Ebene**, **Wüste**, **Eiswelt** oder **Wald**. Optional kannst du einen Welt-Seed angeben. Wähle danach **Neuen Auftrag erzeugen** und gib das Boarding für den angezeigten Auftrag frei. [Planeten und Profile](docs/PLANET_PROFILES.md) · [Planet Art Bible](docs/PLANET_ART_BIBLE.md) · [Abnahmestand 7.7](docs/MILESTONE_7_7_FINAL_ACCEPTANCE.md)

In Operation Bodenbruch aktiviert ihr nach der Landung die Relais Alpha und Bravo. Danach stehen Albatross und Extraktionsballon zur Wahl. Der Einsatz endet mit erfolgreicher Extraktion oder vollständigem Teamwipe. **Esc** gibt die Maus frei und öffnet das Menü. **Boreal Relay** bietet weiterhin **Arena betreten** und die Hordensteuerung.

Server und Client lassen sich auch in zwei Terminals starten.

```bash
npm run dev:server   # Colyseus auf 127.0.0.1:2567
npm run dev:client   # Vite auf 127.0.0.1:5173
```

| Eingabe | Aktion |
| --- | --- |
| WASD | Bewegen |
| Maus | Kamera und Ziel ausrichten |
| Shift | Sprinten |
| Rechte Maustaste halten | Über die Schulter zielen |
| Linke Maustaste halten | Automatisch feuern |
| R | Nachladen (taktisch: Restmunition des Magazins wird verworfen) |
| V | Nahkampf (Kolbenstoß) |
| E | Konsole öffnen, Bereitschaft melden, Relais aktivieren, Nachschub am Albatross-Container aufnehmen oder Extraktion sichern |
| 1 / 2 | Kestrel / P-01 auswählen |
| G / H | Sprenggranate werfen / persönlichen Heilstim anwenden |
| B | Extraktionsballon nach den Hauptzielen aktivieren |
| Esc | Maus freigeben und Menü öffnen |
| F2 | Live-Telemetrie ein- oder ausblenden |

**Vollbild:** Beim Raumbeitritt und bei **Carrier betreten** wechselt das Spiel automatisch in den Vollbildmodus (abschaltbar unter Einstellungen bzw. im Esc-Menü, Schalter auch unten rechts im Startbildschirm). In Chrome und Edge öffnet ein kurzes **Esc** nur das Spielmenü; zum Verlassen des Vollbilds **Esc** gedrückt halten oder **Vollbild beenden** wählen. In Firefox und Safari verlässt **Esc** Vollbild und Mauserfassung gemeinsam; **Carrier betreten** stellt beides wieder her.

Serverbestätigte Weltkontakte erzeugen materialabhängige Partikel und räumliche Einschlaggeräusche. Bestätigte Schabentreffer und Eigenbeschuss haben eigene Fadenkreuzmarker. Friendly Fire ist mit 30 % Schaden aktiv. [Trefferpräsentation 7.8B](docs/MILESTONE_7_8B_FINAL_ACCEPTANCE.md). Kampfsystem und Werte: [Combat Balance 7.2B](docs/COMBAT_BALANCE_7_2B.md). In Boreal Relay setzt der Server ausgeschaltete Spieler nach drei Simulationssekunden zurück. Bei einem vollständigen Truppausfall endet Bodenbruch. Bereits erfüllte Hauptziele sichern die Basis-EP.

## Vier Spieler testen

1. Erstelle im ersten Browserfenster einen Raum und kopiere dessen Raumcode oder Einladungslink.
2. Öffne drei weitere Fenster oder Tabs mit derselben Client-Adresse. Jedes Fenster braucht einen eigenen Operator; ein Account kann nur in einem Fenster verbunden sein. Für getrennte Anmeldungen eignen sich private Fenster oder verschiedene Browserprofile. Gib überall denselben Raumcode ein und wähle **Beitreten**. Ein Einladungslink füllt das Feld aus.
3. Prüfe die vier Spielerslots im HUD. Betretet jeweils den Carrier. Der Host gibt das Boarding an der Konsole frei. Jeder Operator meldet sich mit **E** im Schiff bereit. In Boreal Relay wählt jeder Spieler **Arena betreten**. Das aktive Fenster steuert die Maus.
4. Prüfe in Operation Bodenbruch den gemeinsamen Relais- und Extraktionsfortschritt. Wähle für den Arena-Lasttest im Host-Menü **1.000** und öffne mit **F2** die Telemetrie.
5. Ein fünfter Beitritt per Raumcode wird abgewiesen. Wenn der Host geht, übernimmt der verbleibende Spieler mit der längsten Zugehörigkeit die Host-Rolle.

## Prüfung und Benchmark

```bash
npm run typecheck
npm run build
npm test
npm run balance:check
npm run benchmark
npm run benchmark -- 3600 421337
npm run benchmark -- 5400 421337 1 burst
npm run benchmark -- mission 1800 421337 4
node --conditions=development scripts/motion-bench.ts 60,144 lan,wan,jitter
```

`scripts/motion-bench.ts` misst die Bewegungsglätte reproduzierbar: lokale Figur, Kamera, Remote-Operator, Korrekturen, Animationstempo und Eingabelatenz. Dafür laufen echte Server-Simulation und Client-Vorhersage gegen simulierte Display-, Server- und Netzwerkuhren. `scripts/perf-browser.mjs` misst Frametimes im gebauten Client mit Chromium und fester Bewegungsfolge. [Messprotokoll 7.1](docs/PERFORMANCE_BASELINE_7_1.md)

Der Multiplayer-Test startet automatisch einen Colyseus-Server auf einem freien Loopback-Port. Der Benchmark misst Arena-Hordengrößen oder Missionsszenarien in einem Node-Prozess. Im HUD zeigt **F2** die Live-Telemetrie inklusive FPS, Draw Calls und Server-Ticks.

Der Registry-Audit meldete einen offenen `picomatch`-Befund in Vites Entwicklungsabhängigkeiten. `npm audit --omit=dev` meldete zum Prüfzeitpunkt keine Befunde.

## Gebauten Prototyp starten

```bash
npm run build
npm run start:server
```

Starte in einem zweiten Terminal `npm run preview -w @freefall/client` und öffne [die Build-Vorschau](http://127.0.0.1:4173/). Das Client-Artefakt liegt in `apps/client/dist`. Der Gameserver liest optional `FREEFALL_HOST`, `FREEFALL_PORT` und `FREEFALL_DATA_DIR` (Ablage der Account-Datenbank). Mit `VITE_FREEFALL_SERVER` lässt sich die Server-URL beim Start von Vite oder beim Bauen des Clients festlegen.

Der Prototyp ist für lokale Tests ausgelegt. Spieler-Accounts mit Name#Tag und Passwort, EP-Gutschrift, Level, Ressourcen (Sektor-Kredits, Einsatzmarken, Proben, Artefakte), Dienstakte, Kontoverwaltung (Export, Löschung) und das Freischaltungssystem sind vorhanden. Neue Ausrüstungsinhalte, Loadout-Auswahl, Schiffsupgrades und mobile Steuerung sind spätere Meilensteine.

[Architektur](docs/ARCHITECTURE.md) · [Performance und Messprotokoll](docs/PERFORMANCE.md) · [Boreal Relay und Rendering](docs/VISUAL_STYLE.md) · [Spielercharakter](docs/CHARACTER_SYSTEM.md) · [Fraktionen](docs/FACTIONS.md) · [Missionssystem](docs/MISSION_SYSTEM.md) · [Operation Bodenbruch](docs/MISSIONS/OPERATION_BODENBRUCH.md)

[Spieler-Accounts](docs/ACCOUNTS.md) · [Skyfall Carrier](docs/SKYFALL_CARRIER.md) · [Game Flow](docs/GAME_FLOW.md) · [Extraktion](docs/EXTRACTION_SYSTEM.md) · [Missionsbelohnungen](docs/MISSION_REWARDS.md) · [Ressourcen](docs/RESOURCES.md) · [Points of Interest](docs/POINTS_OF_INTEREST.md)

## Integration und Release-Abnahme · 7.9E

Der Waldlasttest erreichte 1.000 serverseitig simulierte Schaben. Die Release-Freigabe bleibt wegen der Missionsdauer und ausstehender Spiel-, Hör- und Zielgeräteprüfungen offen. [Abnahmebericht](docs/MILESTONE_7_9E_FINAL_ACCEPTANCE.md) · [Messdaten und Reproduktion](docs/playtest/7-9e/README.md)

## Waffenaufnahmen · 7.9A.1

Kestrel und P-01 verwenden lizenzgeprüfte Aufnahmen für Schüsse und Handhabung. Die Integration folgt bestätigten Zuständen und der lokalen Schussvorhersage. [Abdeckung und Prüfergebnisse](docs/WEAPON_AUDIO_7_9A.md)

## Kampf- und Ressourcenbalance · 7.9A.2

Die Kestrel beginnt die Rückstoßerholung ab ihrem nächsten regulären Schusstakt. [Vorher-Nachher-Messungen und Regression](docs/COMBAT_BALANCE_7_9A_2.md)

## Combat Presentation und Multiplayer-Abnahme · 7.8E

Waffen-, Treffer-, Explosions-, Nahkampf- und Missionsereignisse verwenden gemeinsame Regeln für Deduplizierung und Wiederverbindung. **F2** zeigt Ereignisalter und Posenwartezeit. Die finale Freigabe steht aus. [Abnahmebericht](docs/MILESTONE_7_8_FINAL_ACCEPTANCE.md) · [Testmatrix](docs/MILESTONE_7_8E_TEST_MATRIX.md) · [Performance](docs/MILESTONE_7_8E_PERFORMANCE_REPORT.md)

## Milestone 7.8D

Die taktische Kamera verwendet geglättete Haltungsanker, Terrain- und Deckungsprüfung. Das Combat-HUD zeigt bestätigte Treffer, Schadensrichtung und taktischen Magazinverlust. Deployment, Nachschub, Schwarmnester und beide Extraktionen nutzen priorisierte Missionsmeldungen und bestehende audiovisuelle Effekte. [Audit](docs/MILESTONE_7_8D_AUDIT.md) · [Playtest](docs/MILESTONE_7_8D_PLAYTEST.md) · [Abnahme](docs/MILESTONE_7_8D_FINAL_ACCEPTANCE.md)

## Milestone 7.8C

Serverbestätigte Granaten und Kolbenstöße lösen materialabhängige Partikel, räumliches Audio und kurze Kameraimpulse aus. **F2** zeigt aktive Granaten, Explosionspools und bestätigte Nahkampftreffer. [Abschlussbericht und Release Gates](docs/MILESTONE_7_8C_FINAL_ACCEPTANCE.md) · [Playtest auf vier Planeten](docs/MILESTONE_7_8C_PLAYTEST.md)

## Milestone 7.2A

Alle wichtigen Gameplay-Werte liegen zentral, validiert und versioniert in `packages/shared/src/balance/data/`. Jede Mission läuft mit einem festen Balance-Snapshot. Die Migration ist wertgleich: Simulations-Fingerabdrücke aller sieben Stufen und der 1.000-Gegner-Arena sind bitgenau unverändert. [Balance-Architektur](docs/BALANCE_ARCHITECTURE.md) · [Katalog](docs/BALANCE_CATALOG.md) · [Workflow](docs/BALANCE_WORKFLOW.md)

## Milestone 7.1

Bewegung, Kamera und Darstellung laufen jetzt stetig. Die lokale Figur interpoliert zwischen den 30-Hz-Schritten. Der Server verarbeitet jede Eingabe genau einmal, deshalb gibt es keine Reconciliation-Korrekturen mehr. Die Remote-Interpolation passt sich an Jitter an. Die Kamerakollision gibt gedämpft frei. **F2** zeigt zusätzlich das Panel „Bewegung“ und Positionsmarker. [Bewegungsqualität](docs/MOVEMENT_SMOOTHNESS.md) · [Netzwerk](docs/NETWORK_INTERPOLATION.md) · [Kamera](docs/CAMERA_SYSTEM.md)

## Milestone 6

Der Playtest-Build umfasst Kestrel, P-01, zwei Sprenggranaten und fünf persönliche Heilstims. Der technische Prüfbericht enthält Laufzeitbilder, Animationsvergleich, Multiplayer-Nachweise und Servermessungen. [Playtest-Bericht](docs/PLAYTEST_READINESS.md) · [Ausrüstungsregeln](docs/EQUIPMENT_SYSTEM.md)
# freefall

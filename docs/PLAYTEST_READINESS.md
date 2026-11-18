# Milestone 6 · Prüfprotokoll

## A · Ausgangsstand

Gesicherter Quellstand unter /tmp/freefall-ms6-source-before.tgz. Im Arbeitsverzeichnis ist keine nutzbare Git-Historie verfügbar. Node 24.18, npm Workspaces, Three.js 0.187, React und Colyseus. Der Server simuliert mit 30 Hz, der Client interpoliert Remote-Snapshots und nutzt lokale Prediction. Der Raum behält den SimPlayer bei einem temporären Verbindungsabbruch.

AssetRegistry enthält keinen registrierten Soldaten- oder Waffen-GLB. SoldierRig, Kestrel und die starren Zweiknochenglieder sind projekterzeugte Ersatzmodelle. CharacterClipPlayer ist der optionale Importpfad. Es gibt keine gelieferten Bewegungsclips oder fremden Modelllizenzen. Vorhandene Bildreferenzen liegen in docs/character und docs/visual-style. Maßstab Meter, +Y oben, -Z vorne. Die geschützten Schaben-Dateien haben eine separate Prüfsummenliste.

Ursachen im aktiven Pfad: Die alte Phase läuft im Stand und nach dem Tod. Harmonische Schritte mit festem Hub berücksichtigen die Geschwindigkeit des Standfußes nicht. Die fast gestreckte Beinlänge begrenzt Reichweite. Drehung und Bewegungszerlegung verwenden verschiedene Blickwinkel. Der Oberkörper hat keine Beschleunigungsreaktion. Kleinster Eingriff: den vorhandenen Bewegungsfilter, dieselbe Pose und dieselben Hand-Sockets weiterverwenden.

Gate A: npm run typecheck, npm run build, npm test (38/38, lokale WebSockets), npm run benchmark. Der Benchmark mit vier simulierten Spielern erreichte 1.000 Gegner. Die Kamera- und Socket-Tests, Extraktionen, MissionResult, Respawn, Nestzerstörung und Schabe bilden die Regressionsbasis. G und H sind bereits mit Ballon und Endabstimmung belegt.

## B · Bewegung

CharacterAnimation berechnet Schrittweite, Standzeit, Beschleunigungsneigung und Drehschritt aus gefilterter Bewegung. SoldierRig führt den Standfuß linear zurück, hebt den Schwungfuß und verlagert das Becken. PlayerVisualController zerlegt die Bewegung im geglätteten Körperwinkel. Der Controller und die autoritative Position bleiben eigenständig. Der vorhandene Ein-Mixer-Importpfad ist optional. npm run typecheck, npm run build, npm test mit zusätzlichem Standfuß-/Stillstandstest. Vorher lief der Chromium-Pfad Carrier → Ballon → Ergebnis. Sichtprüfung von Start/Stopp, Reload und Remote unter Netzlatenz bleibt gesondert erforderlich.

## C · Ausrüstung am Rig

Kestrel, WeaponVisualController, SoldierRig, PlayerVisualController, Agents und ConvictView: separat instanzierte Dienstpistole mit eigenem Magazin-, Mündungs- und Stützhandpunkt, Holsterposition am rechten Becken, markierte Sanitätstasche, kontrastierende Receiverkante und strukturierter Schaft. Die neuen Teile entstehen mit dem vorhandenen ModelParts-System. Keine extern beschafften Inhalte. Produktionsmodell, Texturatlas und autorisierte Bewegungsclips fehlen. Gate C mit TypeScript, Build und Präsentations-/Gesamtsuite. Ein zuerst fehlgeschlagener Standfußtest führte zur Anpassung der Kadenz an die anatomisch erreichbare Schrittlänge.

## D · Equipment und Netzwerk

Shared Combat-Definitionen, validierte Input-Nachrichten, Battlefield, SimPlayer und PlayersSnapshot tragen das Loadout. MissionInstance integriert Nestschaden und Geräusch. DesktopInput, Agents, SoldierRig und GrenadeView bilden das Ergebnis ab. Gate D: Typecheck, Build und 42/42 Tests. Vier echte lokale WebSocket-Clients wechseln die Waffe. Der Gast stellt nach Reconnect Slot und Magazin wieder her. Drei simultane Würfe zerstören ein Normal-Nest. Vier individuelle Stim-Anwendungen, Tod, Disconnect, Cap und neuer Einsatz sind automatisiert geprüft. Details in EQUIPMENT_SYSTEM.md.

## E · HUD

App, EquipmentHud, MissionHud und styles.css zeigen Vitalstatus, 5er-Stim-Bestand, aktive Waffe samt Reserve, inaktives Magazin, Wurfbestand und zeitgebundene Aktionsbalken. Squadeinträge unterscheiden Offline, Gefallen und individuellen Sicherungsstatus. Ziel- und Nestmarker werden weiterverwendet. Der Chromium-Lauf mit drei SDK-Peers prüfte 1280×800 und 760×460, P-01, Nachladen, 31 HP, laufenden Stim, bestätigte Heilung auf 71 HP, leeren Granatenbestand und Ballonextraktion. Alle vier HUD-Bereiche lagen im kleinen Viewport. Gate E: Typecheck, Build, 42/42 Tests und vollständiger Browserlauf. Echte Mobilgeräte sind offen.

## F · Carrier, Albatross und Figuren

Carrier verwendet entsättigte Leuchtflächen, zwei Kontrollkameras aus den vorhandenen Panel-Batches, Zugangskontrolle und ein Verlustregister an der Luftschleuse. Im Albatross kennzeichnet die Transfersprache die Sitzordnung. ConvictView versieht die vier Rückenplatten mit individuellen Gewahrsamsnummern. Die Operatoren tragen eine separate Holsterschale und Granatenhalterung. Die Schaben-Prüfsummen bestehen. Die Materialien, Geräteprofile und Schattenpipeline bauen auf dem vorhandenen Renderer auf. Typecheck und Produktionsbuild erfolgreich. Die finale Sichtprüfung erfolgt in G.

## G · Missionsende und Gesamtprüfung

Die beiden Relais sichern den Missionserfolg. Ein Resultat entsteht nach erfolgreicher Extraktion oder vollständigem Teamwipe. Alte Abstimmungs- und Debug-Abschlussbefehle können keinen laufenden Einsatz beenden. Der leere Albatross wartet auf einen neuen Start. Der Rettungsjäger fliegt denselben Ballon erneut an, falls bei der ersten Abholung niemand gesichert ist. Der Kurzweg zur Hub-Rückkehr im Debug-Modus setzt ein gültiges Ergebnis voraus. Regressionstests prüfen diese Randfälle sowie Basis-EP und individuelle Rettungsboni. Die Rückkehrabstimmung im Ergebnisbildschirm bleibt verfügbar.

Combat-Feedback nutzt bestätigte Schüsse, Mündungssockets, eine kurze synthetische Audiowiedergabe und die vorhandenen Trefferpartikel. Wurfpose und Projektil trennen sich am serverseitigen Freigabetick. Gepoolte Staubflächen und ein auslaufender Druckring visualisieren die Explosion. Der Low-Modus begrenzt die Staubflächen auf drei pro Explosion. Nahe Explosionen erzeugen einen kurzen FOV-Impuls. Die Einstellung für reduzierte Bewegung unterdrückt den Kameraimpuls bei Schüssen und Explosionen.

| Prüfung | Ergebnis |
| --- | --- |
| npm run typecheck und npm run build | Shared, Server, Tests und Client kompilieren. Vite meldet weiterhin einen großen JavaScript-Chunk. |
| npm test | 45/45 bestanden. Enthält vier Verbindungen, Reconnect, geschützte Schabe, sieben Stufen, beide Rettungsmethoden, Teamwipe, Munitionsrennen, Stim-Abbruch und drei Würfe gegen ein Normal-Nest. |
| Simulationslast | Vier gleichzeitige Explosionen in einem mit 1.000 Gegnern belegten Grid. 500 Ziele hinter Deckung überleben, 500 offene Ziele werden je einmal für Kills gewertet. |
| Regelpfad ohne Debug | Ein Operator läuft vom Carrier über beide Relais zum Albatross und kehrt nach erfolgreicher Extraktion in den Hub zurück. |
| Browserfahrt | Chromium 153, 1280×800 Medium, ein WebGL-Client und drei SDK-Peers. Laufweg, Konsole, Boarding, Flug, P-01, Reload, Stim, Grenade, beobachtete Remote-Aktionen, zerstörter Albatross, Einzelsicherung, Abholung und Rückkehr. Geprüft auch mit 760×460 und 390×844. Positionen der Gäste, Verletzungen, Relaisabschluss und Jägerankunft wurden im Prüfaufbau gesteuert. |
| Vier WebGL-Clients | Vier Chromium-Kontexte mit eigenem Renderer bei 800×560 und Low in demselben Raum. Jeder wählte die P-01, heilte von 39 auf 79 HP, warf eine Granate und sicherte sich über die Oberfläche am selben Ballon. Alle vier Ergebnisansichten erschienen. Der Server bestätigte vier Rettungen und je 500 EP. Hier wurden Landung, Verletzung, Positionierung, Relaisabschluss und Jägerankunft für den Test vorbereitet. [Vier Ansichten](playtest/vier-operatoren.jpg) |
| Designschutz | sha256sum -c docs/enemies/schabe/baseline.sha256 bestätigt alle drei Prüfsummen. |
| Visueller Vergleich | 144 Bildpaare in einer 9,6-s-Sequenz. Vergleichsrigs aus gesichertem Ausgangscode und geändertem Projekt, identische Bewegungs- und Kameradaten. Kein Motion-Capture oder externes Art-Signoff. |

### Servermessung

Node 24.18.0, Linux x64, AMD Ryzen 7 9700X, vier virtuelle Operatoren, Seed 421337, 30 Hz, 360 Warm-up- und 1.800 Messticks. Je ein Lauf mit npm run benchmark. Alle fünf Szenarien hatten vor und nach dem Umbau dieselben Schuss- und Killzahlen für das bestehende Gewehr.

| Gegner | Mittel vorher / nachher (ms) | P95 vorher / nachher (ms) |
| ---: | ---: | ---: |
| 0 | 0,001 / 0,002 | 0,003 / 0,004 |
| 100 | 0,013 / 0,016 | 0,020 / 0,032 |
| 250 | 0,038 / 0,036 | 0,049 / 0,042 |
| 500 | 0,089 / 0,084 | 0,113 / 0,098 |
| 1.000 | 0,218 / 0,210 | 0,268 / 0,236 |

npm run benchmark -- mission 1800 ergab für die leere Mission 0,002 ms P95 und für die gesättigte L7-Mission 0,361 ms P95. Die separate Ballonsequenz extrahierte vier Operatoren und kehrte zum Carrier zurück. In 2.822 von 2.850 simulierten Ticks lag sie am Gegnerlimit. Der Prüfaufbau verwendet geschützte Akteure und füllt Gegner nach.

### Browser und Belege

Chromium mit SwiftShader-Softwarerendering bei 1280×800, Medium und Geräte-Pixelfaktor 1. Im Carrier mit einem Operator betrug der Stichprobenmedian vor dem Umbau 16 FPS bei 87 Draw Calls und danach 15 FPS bei 91 Draw Calls. In der finalen Ballonfahrt mit vier verbundenen Operatoren ergaben sich 14 FPS und 39 Draw Calls. Nach Auffüllen bis zur Gegnergrenze zeigte die letzte Probe 999 aktive Gegner. Diese kurzen lokalen Messungen liefern keine Hardware-GPU-Prognose. GPU-Framezeit-Perzentile und die Netzwerklatenz eines Internetspiels wurden nicht gemessen.

[Bewegungsvergleich](character/bewegungsvergleich-ms6.mp4) · [Carrier vorher](character/carrier-ms6-vorher.png) · [Carrier nachher](playtest/carrier.jpg) · [Stim](playtest/stim.jpg) · [Remote-Operator](playtest/remote-stim.jpg) · [Kompaktes HUD](playtest/compact.jpg) · [Hochformat](playtest/narrow.jpg) · [Ballonrettung](playtest/balloon.jpg)

Der Browserlauf ist nach npm run build mit node --conditions=development scripts/playtest-ms6.mjs stress wiederholbar. Er erwartet die optionale Testumgebung Playwright mit Chromium. PLAYWRIGHT_MODULE und CHROMIUM_EXECUTABLE erlauben die Auswahl lokaler Installationen. Die Aufnahmen werden in ein eigenes temporäres Verzeichnis geschrieben. Der Spielserver bindet für die Dauer des Tests an 127.0.0.1:2567.

### Noch offen

Für die gestalterische Abnahme fehlen ein geskinntes Produktionsmodell, autorisierte In-Place-Clips einschließlich Fingerkontakt, separate Oberkörperaktionen und aufgenommene Waffensounds. Das starre Rig, die Modelle und das Audio sind projektinterne Fallbacks. Der nächste Playtest sollte mit vier Menschen auf den Ziel-PCs Bewegung, Lesbarkeit bei Schwarmdruck, Stim-Abbruch sowie Eingabe- und Netzwerklatenz bewerten.

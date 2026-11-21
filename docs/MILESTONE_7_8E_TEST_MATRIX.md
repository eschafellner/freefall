# FREEFALL 7.8E · Testmatrix

## Reproduktion

Node 24, installierte Workspace-Abhängigkeiten sowie Playwright und ein passendes Chromium verwenden. Die WebSocket- und Browsertests öffnen temporäre Loopback-Ports. Die Browser starten den bestehenden lokalen Debug-Server für Platzierungs-, Wetter- und Last-Fixtures.

```bash
npm run typecheck
npm run build
npm test
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256
npm run benchmark -- enemy-ai 36000 77 4 director

export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
# Optional CHROMIUM_EXECUTABLE auf ein passendes lokales Chromium setzen.
FREEFALL_HIT_ACCEPTANCE=1 node --conditions=development scripts/playtest-weapon-vfx.mjs /tmp/78e-weapon.json
node --conditions=development scripts/playtest-tactical-presentation.mjs /tmp/78e-mission
FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_DELAY_MS=160 FREEFALL_COMBAT_DROP=1 FREEFALL_COMBAT_LOAD=250,500,750 node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/78e-matrix
FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_SAMPLE_MS=30000 node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/78e-max
FREEFALL_COMBAT_PLANET=forest FREEFALL_COMBAT_SOLO=1 FREEFALL_COMBAT_LOAD=0,100 node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/78e-solo
FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_SAMPLE_MS=30000 node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/78e-native
FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_WIDTH=1920 FREEFALL_BROWSER_HEIGHT=1080 FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 FREEFALL_COMBAT_STEADY_POPULATION=1 FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_SAMPLE_MS=30000 node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/78e-native-steady
```

Für vier gleichzeitig gerenderte native Browser-Clients mit Hordenangriff, Nachschub- und Extraktions-Reconnect:

```bash
export FREEFALL_GENERATED_SEED=0 FREEFALL_OPERATORS=4 FREEFALL_BROWSER_PEERS=4
export FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_AUDIO=1 FREEFALL_BROWSER_COOP_ACCEPTANCE=1
export FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 FREEFALL_BROWSER_QUALITY=medium
FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63 FREEFALL_TIME_OF_DAY=dawn FREEFALL_WEATHER=ground-mist \
  FREEFALL_BROWSER_THREAT=1 FREEFALL_BROWSER_RECONNECT_LIFECYCLE=1 FREEFALL_BROWSER_ENEMIES=1000 \
  FREEFALL_BROWSER_SAMPLE_MS=30000 node --conditions=development scripts/playtest-horde-director.mjs
```

Die vier durchgehenden Skriptmissionen verwenden den echten `MissionInstance`-Gameplaypfad mit Bewegungs-, Interaktions-, Kampf- und Extraktionseingaben. Die Debug-Freigabe beim Selektieren erlaubt gepinnte Seeds. Missionsfortschritt, Ortswechsel, Ziele, Extraktionen und Rückkehr laufen über normale Simulationspfade. Die Zeiten sind Spielzeit bei 30 Hz aus `MissionResult.durationTicks`. Die gezielten Browsersequenzen für beide Extraktionsarten verwenden einen gerenderten Operator und drei SDK-Operatoren. Die native Koop-Automation rendert alle vier Perspektiven.

| Planet | Welt / Mission | Auftrag | Operatoren | Extraktion | Spielzeit |
| --- | --- | --- | ---: | --- | ---: |
| Eis | 48 / 0 | Relaisverteidigung, Normal | 4 | Albatross | 1:05,3 |
| Wüste | 31 / 0 | Relaisverteidigung, Normal | 4 | Albatross | 1:05,9 |
| Grüne Ebene | 76 / 20 | Relaiskette, Leicht | 4 | Ballon | 3:23,6 |
| Wald | 63 / 0 | Relaisverteidigung, Normal | 4 | Albatross | 2:02,8 |

Die Läufe prüfen alle vier extrahierten IDs, genau ein `MissionCompleted`, den Auftrags-ID-Bezug, die Rückkehr auf den Carrier, geräumte Hordeninstanzen und reproduzierbare Selektion. Weitere Simulationsfälle decken Bodenbruch, Nestjagd, Nachschub, gescheitertes Resultat, Ballon-Neuanflug sowie Operatorenverlust und Disconnect ab. Die schnelle Ein- bzw. Zwei-Ziel-Route ist ein offener Befund für die Abnahme des Designziels von 20–30 Minuten.

## Vier gerenderte Browser je Planet

Die native Koop-Automation wählt Welt und Auftrag im UI, verwendet für Landung und Positionswahl die lokalen Test-Fixtures, aktiviert das Relais per Eingabe und wartet die reguläre Relaisverteidigung, den Ballon-Countdown und die Abholung ab. Alle vier Clients überprüften Wetter und Audiobudget. Die Tests bestätigen vier extrahierte Operatoren in jeder Mission. Die separate, gesteuerte Albatross-Sequenz bleibt im [Missionsbrowser](playtest/7-8e/mission/report.json) belegt.

| Planet | Welt / Mission | Wetter | Laststufe | Spielzeit | Rohprotokoll |
| --- | --- | --- | ---: | ---: | --- |
| Eis | 48 / 0 | Windy Snow | 100 | 1:55,0 | [Eis](playtest/7-8e/native-coop/ice.txt) |
| Wüste | 31 / 0 | Light Dust Gusts | 100 | 1:54,6 | [Wüste](playtest/7-8e/native-coop/desert.txt) |
| Grüne Ebene | 76 / 0 | Clear | 100 | 1:54,3 | [Grüne Ebene](playtest/7-8e/native-coop/green-plains.txt) |
| Wald | 63 / 0 | Ground Mist | 1.000 | 2:21,6 | [Wald](playtest/7-8e/native-coop/forest.txt) |

Für Eis, Wüste und Grüne Ebene im vorherigen Befehl Planet, Welt-Seed und Wetter gemäß Tabelle setzen. `FREEFALL_BROWSER_ENEMIES=100` und `FREEFALL_BROWSER_SAMPLE_MS=4500` verwenden und die beiden Wald-Optionen `FREEFALL_BROWSER_THREAT` und `FREEFALL_BROWSER_RECONNECT_LIFECYCLE` weglassen. Der first-wave-Schritt lief auf Eis-Seed 48 an den fixen Positionen ins 12-s-Zeitlimit. Die Wiederholung verwendet `FREEFALL_BROWSER_REQUIRE_WAVE=0` für einen explizit kontrollierten Lastaufbau; Tests der Spawn-Sicherheit und Wellenlogik laufen separat. [Erster Eis-Lauf](playtest/7-8e/native-coop/ice-wave-attempt.txt)

## Manuelle Matrix

Vier menschliche Operatoren und Zielhardware stehen für diese Matrix aus. Jede Zeile steht manuell auf **NOT TESTED**. Vorhandene automatisierte Belege sind in der letzten Spalte genannt. Verwende die Seeds oben und danach je einen zweiten Welt-Seed. Erfasse getrennt für jede Ansicht Build, Wetter, Grafikstufe, Auflösung, Audioeinstellungen, Start/Ende, Ergebnis und F2-Profil. Starte am Carrier und verwende reguläre Eingaben durch die Rückkehr.

| ID | Ablauf und Beobachtung | Automatischer Beleg |
| --- | --- | --- |
| A | Gewehr und Pistole in Stand und Bodenlagen abfeuern. Socket, Lauflicht, Auswurf, Tracer, Remote-Pose und Ton prüfen. | Waffenbrowser und Komponenten |
| B | Schabe treffen und eliminieren. Bestätigten Hitmarker und einmaligen Kill prüfen. | Waffenbrowser und Servertests |
| C | Danebenschießen und Schutzfall treffen. Auf neutrale HUD-Form achten. | Waffenbrowser, HitFeedback |
| D | Teamtreffer aus verschiedenen Blickrichtungen. HP, Richtung und Team-HUD vergleichen. | Missionsbrowser und Combat-Suite |
| E | Schnee, Eis, Sand, Fels, Gras, Erde, Waldboden, Holz und Metall bei Wetter beschießen oder mit Granate treffen. | Neun Browser-Detonationen, Material- und Normalentests |
| F | Nahe und entfernte Granaten mehrerer Operatoren. Blast, Audio, Rauch, Impuls und identisches Serverergebnis prüfen. | Lastbrowser und Grenadensuite |
| G | Nahkampfschwung, Treffer, Fehlschlag und gesperrte Bodenlagen. | Lastbrowser und Servertests |
| H | Bauch- und Rückenlage mit Feuer, Reload und Stim, dann ausdrücklich aufstehen. | Waffen-/Missionsbrowser und Haltungsregression |
| I | Vorwärts, seitlich, rückwärts und diagonal in Deckungsnähe und über Hang. Kamera auf Überdeckung und Zielausrichtung prüfen. | 4-Welten-Kameratests und Missionsbrowser |
| J | HUD auf Schnee, Sand, Gras und Wald bei Low/Medium/High und kleiner Auflösung lesen. Shake und Flash von 0 bis 100 prüfen. | HUD- und Komforttests, Browserstichproben |
| K | Skyfall-Boarding, Bremsschub, Touchdown und Eingabefreigabe beobachten. | Missionsbrowser |
| L | Albatross ab Anflug, Motoren und biomspezifischen Downwash beobachten und Nachschub normal aufnehmen. | Missionsbrowser und Resupply-Regression |
| M | Nest im Kampf zerstören. Weltreaktion, Meldung und Zielstatus vergleichen. | Missionsbrowser-Fixture und regulärer Nest-Simulationstest |
| N | Convicts während Relaisverteidigung beobachten. Verlust, Fire States und HUD prüfen. | Convict-/Missionsregression |
| O | Albatross anfordern, getrennt sichern, abheben und Resultat bei allen vier bestätigen. | Missionsbrowser und Vollsimulation |
| P | Ballon am Sammelpunkt setzen, Countdown und Anflug abwarten, sichern und Resultat prüfen. | Missionsbrowser mit verkürztem Countdown, Vollsimulation mit regulärem Countdown |
| Q | Erfolg und Teamwipe, Statistik, einzelnes Ergebnis und Rückkehr prüfen. | Missionsbrowser und Simulationssuite |
| R | Vier Operatoren mit unabhängigen Perspektiven und Qualitätseinstellungen durch vollständigen Auftrag spielen. | Vier native Browser je Planet, unabhängige Qualitätseinstellungen beim Reconnect |
| S | Stabile und schwankende Latenz sowie durch den Transport hinzugefügten Verlust testen. Marker und gelieferten Snapshot vergleichen. | 140 ms simuliertes RTT, 160 ms Blast-Verzögerung, umsortierter Shot und ein gezielt ausgelassenes Event |
| T | Während Feuer, Granate, Nahkampf, Objective, Nachschub und Lift kurz trennen. Zustand und kurzlebige Cues kontrollieren. | Browser-Reconnect während Kampf/Nest, Angriffswindup, Nachschub, Wetterübergang und Ballon-Countdown |
| U | 0/100 solo, danach 250/500/750/1.000 mit vier Verbindungen. Tickanzahl bei Zielpopulation und Frequenz von Treffer-/Damage-Cues erfassen. | Lastmatrix und Server-Cap-Tests |
| V | Je eine durchgehende Mission auf allen vier Planeten spielen. Dauer und Verlauf pro Auftrag messen. | Vollständige serverseitige Simulation und vier gerenderte Browser auf jedem Planeten |
| W | Wald mit Dunst, Wind, Wald-Soundscape, vier feuernden Operatoren, Nestmeldung und 1.000 aktiven Schaben; native Frame- und Audiostabilität messen. | Kombinierter Software-Renderer-Lauf |
| X | Mehrere Planeten und Missionen über eine durchgehende Sitzung spielen. Heap, GPU-Objekte, Audiostimmen und Cleanup nach jeder Rückkehr messen. | Kurzzeit-Pool-/Dispose-Tests und einzelne Heap-Stichproben |

Der Blast-Verlusttest lässt eine Nachricht an der Anwendungsgrenze aus. Er misst absichtlich keine Verlustrate auf TCP-/Netzwerkebene. Ein fehlendes Event darf aus Snapshots kein neues Explosionsaudio oder einen Hitmarker erzeugen. Die nächste reguläre Momentaufnahme stellt den persistenten Zustand wieder her.

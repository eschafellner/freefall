# FREEFALL · Spieltest 7.7C

## Reproduktion

```sh
FREEFALL_WEATHER_PLAYTEST=1 FREEFALL_BROWSER_WIDTH=800 FREEFALL_BROWSER_HEIGHT=500 \
  PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  node --conditions=development scripts/playtest-planet-atmosphere.mjs
```

`FREEFALL_VISUAL_PLANET` beschränkt den Lauf auf ein Biom. Der Harness baut den Produktionsclient, startet den Loopback-Server und verwendet Tastatur und Maus im echten Renderer. Die Kamera ist über Welt-Seed, Standort, Blickrichtung und Haltung reproduzierbar. Die Originalaufnahmen entstehen in einem temporären Verzeichnis. Der Wettertest zeichnet feste Referenzansichten, Übergänge, Bodenkampf, Qualitätswechsel und Missionsresultate auf.

| Planet / Welt-Seed | Tageszeit | Wetterabfolge |
| --- | --- | --- |
| Grüne Ebene / 17 | Bedeckter Tag | `clear` → `windy` → `light-mist` |
| Wüste / 31 | Tag | `dry-clear` → `light-dust-gusts` → `dust-haze` |
| Eis / 48 | Abenddämmerung | `clear-cold` → `windy-snow` → `light-snow` |
| Wald / 63 | Morgendämmerung | `forest-calm` → `ground-mist` → `windy-forest` |

Die Durchläufe stellen die Operatoren an Testpositionen. Die Waffe, Eingaben für Crouch, Dive, Prone, Supine, Aufstehen, Missionsfortschritt, Relaisverteidigung und Extraktion laufen über die normalen Spielpfade. Der Waldlauf benutzt die bestehende Deployment-Sequenz. Der übrige Einstieg benutzt den Debug-Befehl zum Landen. Die Läufe ersetzen keine durchgehende manuelle 20–30-Minuten-Mission mit Spielern.

[Wetterlesbarkeit](WEATHER_COMBAT_READABILITY.md) · [Lastmatrix](WEATHER_PERFORMANCE.md)

## Aufnahmen und abgeschlossene Läufe

In jedem Wettervergleich zeigt die obere Reihe den Ausgangszustand und die laufende Überblendung. Unten folgen zwei Aufnahmen des stabilen Hauptwetters an derselben Stelle.

- Grüne Ebene mit bedecktem Licht, Kräutern und Gras. [Wettervergleich](playtest/7-7c/green-plains-weather.jpg)
- Wüste mit warmgrauem Dunst und bodennaher Staubzone. [Wettervergleich](playtest/7-7c/desert-weather.jpg)
- Eis mit kalter Dämmerung und windgetragenen Schneepartikeln. [Wettervergleich](playtest/7-7c/ice-weather.jpg)
- Wald mit dem Bodendunst des Fog-Pfads und Bewegung im Kronenbestand. [Wettervergleich](playtest/7-7c/forest-weather.jpg)

| Lauf | Relais verteidigt | Extraktionsmethode | Ergebnis | Dauer in Simulationsticks |
| --- | --- | --- | --- | ---: |
| Grüne Ebene | Ja | Albatross | extrahiert | 1.172 |
| Wüste | Ja | Albatross | extrahiert | 1.155 |
| Eis | Ja | Ballon | extrahiert | 4.033 |
| Wald | Ja | Ballon | extrahiert | 4.293 |

Crouch, Dive, Prone, Supine, Schussabgabe aus beiden Bodenlagen und Get-up wurden für alle vier Planeten bestätigt. HUD und Objective-Marker bleiben in den betrachteten Bildern lesbar. Low, Medium und High wurden im Eis- und Waldeinsatz verwendet. Die beiden Ballonläufe warteten auf den regulären Countdown. Ein früherer Eisversuch brach ab, weil der Harness nur 90 s auf die 95-s-Abfolge wartete. Die wiederholten Läufe nutzten die konfigurierten Phasendauern.

[Bodenkampf-Aufnahmen](playtest/7-7c/ground-combat.jpg) · [MissionResult auf vier Planeten](playtest/7-7c/mission-results.jpg)

Der Browserlauf prüfte jedes Tagespreset mit einem repräsentativen Planeten. Der automatisierte Lichttest deckt alle 16 Kombinationen ab. Eine manuelle Vollmatrix aus Tageszeit, Gegenlicht, Gegnerdichte und allen Bodenhaltungen sowie die 20–30-minütigen menschlichen Koop-Partien sind **NOT TESTED**.

Der native High-Lauf auf Eis stellt Schneetreib und Abendlicht mit 1.000 aktiven Schaben und vier Operatoren dar. Gegner, Fadenkreuz, Objective-Marker und Ausrüstung sind in der Stichprobe erkennbar. [Eis unter 1.000er-Last](playtest/7-7c/ice-1000.jpg)

Im nativen Koop-Lauf im Wald trennt der Harness einen Browser während des Übergangs von `ground-mist` zu `windy-forest`. Nach Reconnect meldeten alle vier Ansichten Revision 3, dieselben Wetter-Endpunkte, denselben Seed und `day`. Bei 3,33 % Serverfortschritt lagen die Clientwerte in der Telemetrie zwischen 2,68 % und 3,37 %. Der alte Operator-Slot blieb erhalten. Drei verschiedene Grafikstufen bewahrten denselben gemeinsamen Zustand. [Messdaten für die vier Ansichten](playtest/7-7c/performance.json)

Der Qualitätslauf auf Eis lieferte 64 Punkte auf Low und 320 auf High. Medium zeigte im separaten Browserlauf 176 Punkte. Mit der Browserpräferenz für Reduzierte Bewegung meldete der Client trotz aktivem Schneetreib 0 Partikel. Im High-Lauf löste der Harness `webglcontextlost` und `webglcontextrestored` aus. Danach renderte derselbe Einsatz wieder und meldete denselben Wetterzustand mit 320 Punkten.

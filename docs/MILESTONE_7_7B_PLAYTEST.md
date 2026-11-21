# FREEFALL · 7.7B Playtest

Aufgenommen mit Chromium 153.0.8010.12, ANGLE GL auf Radeon RX 9070 XT, 1280 × 720 CSS-Pixel, DPR 1. Medium rendert mit 90 % Auflösung (1152 × 648), ACES Filmic, sRGB und 1024²-PCF-Schatten. Beide Seiten verwenden dieselben 7.7A-Planetenlichter, den Mission Seed 0, die normale Schwierigkeit und Relaisverteidigung. Low und High wurden für Eis und Wald separat im Einsatz umgeschaltet. Referenz ist die eingefrorene 7.7A-Arbeitskopie, Stand vor der ersten 7.7B-Rendereränderung.

| Planet · World Seed | Welt-ID-Suffix | Lighting | Vorher/Nachher |
| --- | --- | --- | --- |
| Grüne Ebene · 17 | `68c909076155c5e5` | `green-plains.daylight.v1` | [Vergleich](playtest/7-7b/green-plains-vergleich.jpg) |
| Wüste · 31 | `728819ca01df0109` | `desert.dry-day.v1` | [Vergleich](playtest/7-7b/desert-vergleich.jpg) |
| Eis · 48 | `b9ec957f0a62f9c4` | `ice.overcast-day.v1` | [Vergleich](playtest/7-7b/ice-vergleich.jpg) |
| Wald · 63 | `acdc7ec0c04dd3da` | `forest.filtered-day.v1` | [Vergleich](playtest/7-7b/forest-vergleich.jpg) |

Die Bilder zeigen die reguläre Spielfigur und GUI. Die Asset-Baseline umfasst Farbterrain mit gemeinsamer Erdtextur, einfachem Fels und Eis, älteren Kronen und optional Gras. Die Vergleichsseite enthält die Texturen und Assets aus dem [7.7B-Katalog](ENVIRONMENT_ASSET_CATALOG.md).

## Kamerapunkte

Koordinaten sind Operator-Anker in X/Z, Y folgt dem Höhenfeld. Die Kamera verwendet den normalen Third-Person-Rig mit Standing-FOV 62°, normalem Pitch −0,12 rad und eingedrehter Perspektive. Der Landschaftsblick verwendet den höchsten offenen Rasterpunkt mit Blick zur Weltmitte. Stand und Crouch blicken vom identischen Punkt in Richtung Landmarke, Yaw −0,6435 rad. Crouch nutzt zwei Mausschritte mit 120 px zum Boden. Im Relaisumfeld steht der Operator 3 m östlich und 6 m südlich des Ziels. Für Prone/Supine startet er im Landebereich mit Yaw 0 und löst per W/X oder S/X die entsprechende Landung aus. Bei Bodenkampf ist die Zielansicht aktiv.

| Planet | Landschaft X/Z | Stand und Crouch X/Z | Relais X/Z | Prone und Supine Start X/Z |
| --- | --- | --- | --- | --- |
| Ebene | −208 / 192 | −3 / 15 | 135 / 30 | −121 / 152 |
| Wüste | 80 / 0 | −108 / −53 | −107 / −11 | −134 / 149 |
| Eis | 96 / −96 | 15 / 0 | −115 / −9 | −122 / 157 |
| Wald | −96 / 0 | 118 / 189 | 93 / −122 | −130 / 162 |

## Prüfabdeckung

- **PASS** · Browseraufnahmen und visuelle Sichtprüfung aller vier Biome. Im Eis sind Risse und Schneeübergänge erkennbar, die Wüste zeigt differenzierte Rippel, die Ebene erhält sichtbare Vegetationscluster und Erdflecken, der Wald Rinde, gegliederte Kronenzweige und ein mattes Mosaik aus Laub und Moos.
- **PASS** · Im Browser auf jedem Planeten Crouch, Vorwärts- und Rückwärts-Dive mit Landung in Prone/Supine, ADS, Schuss (Munition sinkt) und Aufstehen. Im Wald läuft die Flugphase bis zur Landung, bei den drei anderen Referenzmissionen setzt der lokale Test den Startzustand per Debug-Landung.
- **PASS** · Die Suite prüft identische und abweichende Seeds, Chunk-Wiederaufbau, Collider und Deckung, aktiven Spawn, taktische Bewegung, Muzzle/Hitscan, Ziele und Extraktion. Die Tests enthalten auf allen vier Planeten komplette prozedurale Missionen mit Spieleingaben in der Serversimulation und Vierergruppen über echte WebSockets.
- **PASS** · Vier Browser im Wald, ein echter WebSocket-Abbruch und automatischer Reconnect desselben Clients, anschließend Relais und Ballonextraktion. Alle vier Operatoren wurden extrahiert. Der gestellte Lauf dauerte 4.253 Ticks.
- **NOT TESTED** · Je Planet eine durchgehend manuell gespielte 20–30-Minuten-Mission mit vier Menschen. Der Browser-Benchmark verwendet reproduzierbare Fixture-Teleports und kontrollierte Gegnerzahlen. Ergebnisse zur Browser-Koop-Mission stehen in der [Abnahme](MILESTONE_7_7B_FINAL_ACCEPTANCE.md).

Das Browser-Skript `scripts/playtest-planet-atmosphere.mjs` erzeugt die Original-PNGs und protokolliert Koordinaten und Welt-IDs. `PLAYWRIGHT_MODULE` und `CHROMIUM_EXECUTABLE` können auf eine vorhandene Installation zeigen. Browserstart und Testserver benötigen Zugriff auf Loopback. Browser und lokale GPU-Unterstützung können mit `FREEFALL_BROWSER_ANGLE` gewählt werden.

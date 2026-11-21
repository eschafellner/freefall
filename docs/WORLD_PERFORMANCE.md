# World Performance

## Seed-Matrix

Welt-Seeds 0–99 je Profil. Der Missionsgenerator rotiert die drei Vorlagen auf Normal, Missions-Seed ist jeweils Welt-Seed + 13. 400 von 400 Welten lieferten einen gültigen Plan. Die Messung umfasst Heightfield, Platzierung, Standortgraph und Missionsvalidierung. Die Einzelkosten von Mesh-Erzeugung und Asset-Platzierung wurden nicht separat erfasst.

| Profil | Höhenumfang im Mittel | Welt + Auftrag P95 / P99 | Standortvalidierung P95 |
| --- | ---: | ---: | ---: |
| Grüne Ebene | 21,27 m | 10,46 / 10,99 ms | 1,66 ms |
| Wüste | 16,41 m | 9,32 / 9,90 ms | 1,39 ms |
| Eiswelt | 19,30 m | 9,12 / 9,66 ms | 1,47 ms |
| Wald | 21,34 m | 15,88 / 16,11 ms | 2,55 ms |

Der Wald nutzt bis zu 500 physische Proxies. Ein räumlicher Index für kurze Kollisionstests hält lokale Abfragen und benachbarte Kanten des Navigationsgraphen unabhängig von der Gesamtzahl. Lange Sicht- und Schusslinien prüfen die Hindernisse der geladenen Welt.

```sh
node --conditions=development --test --test-isolation=none apps/server/test/procedural-world.test.ts apps/server/test/procedural-mission.test.ts
```

## Browserlast

Der Harness verwendet Chromium bei 1280 × 720 Medium, vier Ansichten und den tatsächlich aktiven Director. Nach einem echten Director-Spawn füllt die Fixture die Population auf die Obergrenze. Sie hält 1.000 laufende Gegner über das Messfenster und misst Frameverteilung, Tickverteilung, Kollision, Navigation, Bandbreite und Prozessspeicher. Die Operatoren werden für die Lastmessung platziert und geschützt. Danach entfernt der Harness die künstlich hinzugefügten Gegner und prüft per Browser-Eingabe Relais, Extraktion und Resultat. [Abnahme](MILESTONE_7_6_FINAL_ACCEPTANCE.md)

```sh
npm run build -w @freefall/shared
env PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/to/chromium \
  FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63 \
  FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_SAMPLE_MS=12000 \
  node --conditions=development scripts/playtest-horde-director.mjs
```

Das Serverbudget für die 30-Hz-Schleife beträgt 33,33 ms pro Tick. Im Browserlauf erfasst Three.js die sichtbare Gesamtgeometrie und die Texturanzahl. GPU-Speicher in Byte, isolierte Terrain-GPU-Zeit und Produktionsspeicher lassen sich aus diesen Zählern nicht ableiten. RSS enthält beim lokalen Lauf den Harness und die Preview.

### 1.000 Gegner im Wald

Welt-Seed 63, Missions-Seed 0, Relaisverteidigung auf FREEFALL. World Plan `world.generated.acdc7ec0c04dd3da`, Mission Plan `generated.1df7f7561fcb275f`. Chromium 153 mit ANGLE/OpenGL auf AMD Radeon RX 9070 XT. Das Messfenster dauerte 12,03 Sekunden. Danach erreichten alle vier Ansichten die Resultat-Anzeige mit einem per Ballon extrahierten Operator. Dieser gestellte Browserlauf dauerte 3.496 Einsatz-Ticks (1:57).

| Kennzahl | Messwert |
| --- | --- |
| Frames, langsamste Ansicht | Rund 60 FPS, P95 16,8 ms, P99 16,8 ms |
| Server-Tick | P95 1,76 ms, P99 1,98 ms, 0 verworfene Schritte |
| Navigation mit Bewegung/Kollision | P95 1,62 ms, P99 2,06 ms |
| Kollisionsabschnitt | P95 0,60 ms, P99 0,70 ms |
| Three.js-Telemetrie pro Ansicht | 32–79 Draw Calls, 19.563–103.474 Dreiecke, 44–45 Texturen |
| Sichtbarkeit | 0–224 sichtbare Gegner in den Render-Stichproben, 1.000 aktive Gegner im Server und in allen gemessenen Hordenpaketen |
| Horden-Nutzdaten | 100.971 Byte/s pro Empfänger |
| Missionsdaten | 1.330 Byte für den Plan einmalig, danach 13.925 Byte/s für Zustand und 938 Byte/s für Ereignisse im Messfenster |
| Node RSS | 711,2 → 719,6 MiB inklusive Browser-Harness und Vite, ohne Chromium-Prozesse |

Der separate, beschleunigte Servertest verwendet vier Operatoren, 1.000 aktive Gegner und 360 Ticks bis über die Extraktionsfreigabe hinaus. Der Lauf im Wald erreichte P95/P99 von 2,26/2,38 ms, das Kollisionssegment P95 0,38 ms. Node RSS stieg im Lauf von 123,4 auf 130,1 MiB. Beide Messungen dokumentieren Einzelraum-Betrieb. Hardwarefreigabe und längere Last mit mehreren Räumen sind offen.

Die visuelle Stichprobe lud alle vier Planeten über die Carrier-Auswahl in Chromium und renderte jeweils Terrain und Landmarken. Sie misst keine menschliche Spielzeit. [Vollständige Eingabeläufe](MILESTONE_7_6_FINAL_ACCEPTANCE.md)

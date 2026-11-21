# Playtest · Milestone 7.8C

## Ausgeführt

| Probe | Beobachtung |
| --- | --- |
| Eisplanet | Schnee mit Hangnormale und Eis am Hindernis. Serverposition, Explosion und Material-Audio im gebauten Browser. |
| Wüste | Sand und Fels mit unterschiedlichem Partikelprofil. |
| Grüne Ebene | Gras und Erde mit Terrain-Normalen aus dem Höhenfeld. |
| Wald | Waldboden, Baumstamm und Metall. Wetterprofil Ground Mist. |
| Granate | Remote-Release und Detonation im Viererraum. In Solo zusätzlich lokaler Wurf über **G**. Löschung bei Fusetick, Pool-Auslauf und Kontakt-/Lichtwerte überprüft. |
| Kolbenstoß | **V** im Browser. Miss mit 0 Schaden, danach Treffer mit 50 Schaden, Kontaktpunkt und Stagger. Der Client zählt eine Trefferbestätigung. Doppelte Pakete lösen keine zweite Bestätigung aus. |
| Verzögerung | Autoritative Blast-Pakete wurden um 140 ms später als im normalen lokalen Lauf weitergeleitet. Der Client verarbeitet sie trotz weiterlaufender Snapshots und verwirft zusätzliche Echos. Ein separater Test schickt ältere, eindeutige Events nach neueren an den Empfangsfilter. |
| Reconnect | Browserverbindung während der Waldmission getrennt, ursprünglicher Sitz wiederhergestellt, vorherige Detonation und vorheriger Treffer erneut zugestellt. Keine neue Darstellung. |
| Simulierter Ereignisverlust | Die vier Verbindungen erhielten absichtlich ein Blast-Ereignis weniger. Der Server detonierte Nr. 4 bei Tick 655. Die Snapshots liefen bis mindestens Tick 685 weiter und der Browserzähler blieb bei drei bestätigten Effekten. |
| Haltung und Kamera | Stand, Hocke, PRONE, SUPINE, Aufstehen, deaktivierte Bewegung, Flash aus und begrenztes Impuls-Stacking per Test. |
| Hohe Last | 0/100 echte Schaben solo sowie 250/500/1.000 im Viererraum. Browser mit Wetter und laufendem Web Audio. |
| LOW | Der Vierer-Waldtest wiederholte Reconnect, Hit/Miss und drei gleichzeitige Detonationen mit 1.000 aktiven Schaben zu Beginn. Explosionslicht blieb bei null. |
| Missionen | Die Regressionen prüfen prozedurale Aufträge, Landung, Objectives, beide Extraktionswege und MissionResult. Die 7.8C-Browserläufe verwenden kontrollierte Kampfausschnitte. |

Die Bilder zeigen verschiedene Phasen der Detonation. Die Dauer des Primärblitzes liegt unter der HUD-Abtastperiode. Sichtbarkeit und Detailstufe wurden daher zusätzlich mit den Instanz- und Materialzählern geprüft. Die Fixture setzt Positionen und Wetter über den lokalen Debug-Raum. Ausrüstung wird über echte Eingaben mit Lebens-ID ausgelöst. Netzwerkausfall wird durch Abbrechen der Browserverbindung geprüft. Physischer Paketverlust, subjektiver Lautsprechervergleich, vollständige manuelle Missionen auf allen Planeten und längere VRAM-/GC-Messungen bleiben offen.

[Schneeblitz](playtest/7-8c/ice-snow.jpg) · [Eis](playtest/7-8c/ice-ice.jpg) · [Sand](playtest/7-8c/desert-sand.jpg) · [Fels](playtest/7-8c/desert-rock.jpg) · [Gras](playtest/7-8c/green-plains-grass.jpg) · [Erde](playtest/7-8c/green-plains-dirt.jpg) · [Waldstreu](playtest/7-8c/forest-forest-floor.jpg) · [Holz](playtest/7-8c/forest-wood.jpg) · [Metall](playtest/7-8c/forest-metal.jpg)

## Reproduktion

Playwright und Chromium lokal installieren oder aus bestehenden Pfaden verwenden. Der Server und die Web-Vorschau öffnen nur Loopback-Ports. Die Tests nutzen die vorhandenen Projektassets.

```bash
npm run typecheck
npm test
npm run build
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256

export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium
FREEFALL_COMBAT_DELAY_MS=140 FREEFALL_COMBAT_LOAD=250,500,1000 \
  node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8c
FREEFALL_COMBAT_SOLO=1 FREEFALL_COMBAT_PLANET=forest FREEFALL_COMBAT_LOAD=0,100 \
  node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8c/solo
FREEFALL_COMBAT_DROP=1 FREEFALL_COMBAT_QUALITY=low FREEFALL_COMBAT_PLANET=forest \
  FREEFALL_COMBAT_DELAY_MS=140 FREEFALL_COMBAT_LOAD=1000 \
  node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8c/low
```

Für den Ausgangsstand den Harness in die vor der Änderung erstellte Quellkopie übernehmen, das Shared-Paket bauen und mit `FREEFALL_COMBAT_BASELINE=1` starten. Der Modus misst dieselben Lastfälle mit den alten Events und überspringt die Prüfungen der neuen Präsentationsfelder. `FREEFALL_BROWSER_ANGLE=gl` wählt auf einer verfügbaren GPU den nativen ANGLE-Pfad. Die Ausgangsmessung wurde aus einer Kopie des tatsächlich vorgefundenen Worktrees gebaut.

[Rohdaten und Messgrenzen](EXPLOSION_PERFORMANCE.md) · [Release Gates](MILESTONE_7_8C_FINAL_ACCEPTANCE.md)

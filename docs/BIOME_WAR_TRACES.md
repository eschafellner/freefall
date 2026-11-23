# FREEFALL · Biom-Phase D: Spuren von Krieg und Schwarm

Die Einsatzgebiete erzählen jetzt, was dort passiert ist. Alles läuft im Client und deterministisch aus Welt-Hash und `WAR_TRACE_VERSION`. Server, Kollision, Navigation und Netzwerk bleiben unverändert.

| Datei | Inhalt |
| --- | --- |
| `environment/WarTraceAssets.ts` | Katalog `WAR_TRACES` und prozedurale Geometrie |
| `environment/WarTracePlacement.ts` | `placeWarTraces`: Gefechtsstellen, Außenposten, Schwarmbewuchs, umgewandelte Felsen |
| `environment/TerrainDecals.ts` | Auf das Gelände gelegte Decals (Brandspuren, Harzkruste) mit prozeduralen DataTextures |
| `mission/PlanetWarTraces.ts` | Instanz-Batches, Einwachsen mit der Distanz, Schatten auf High |

## Inhalt pro Karte (etwa 200 Objekte, 45 Decals)

- **Gefechtsstellen (6):** 2–4 Krater (Brandspur und Erdwall in Planetfarbe), Trümmerplatten, Granathülsen.
- **Außenposten (jede zweite Gefechtsstelle):** drei Sandsackbögen nach außen, Munitionskisten, Signalbake mit orange leuchtender Lampe, umgestürzter Gittermast.
- **Streuung:** 16 einzelne Krater, 10 Trümmer- oder Kistenhaufen.
- **Schwarm:** Um jedes Anfangsnest liegen eine Harzkruste von 22 m mit Adern, Kokons, Chitinstacheln, Harzbeulen und leere Chitinhüllen. Jede Einbruchszone bekommt Harz am Rand, Hüllen und Stacheln. Spieler erkennen Schwarmgebiet so schon vor dem ersten Gegner.
- **Wracks und Ruinen:** Drei bis vier mittelgroße Felsen nahe den Gefechtsstellen werden als Landungskapsel-Wrack, Rumpfsegment oder Betonruine dargestellt. Ihr Kollider bleibt unverändert, das Modell füllt die vorhandene Kollisionsbox.

## Regeln

Kleine Spuren halten Abstand zu allen Missionsreservierungen und Patrouillenwegen. Ihr Mittelpunkt liegt nie in einem Solid, und die Steigung ist höchstens 0,4. Schwarmbewuchs darf in die äußere Hälfte von Nest- und Einbruchsflächen reichen, nie in deren Mitte.

## Bekannte Grenzen

- Sandsäcke (0,5 m) und Kisten haben keine Kollision, man kann durch sie hindurchlaufen.
- Umgewandelte Felsen klingen bei Treffern weiterhin wie Fels, weil die Oberfläche des Kolliders vom Server stammt.
- Bodendetails und mittelgroße Objekte ignorieren Krater und Außenposten. Gras kann also im Krater stehen.

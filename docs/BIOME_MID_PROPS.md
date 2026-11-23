# FREEFALL · Biom-Phase B: Objekte mittlerer Größe

Eine neue Ebene liegt zwischen den Bodendetails (0,1–0,4 m) und den physischen Solids. Sie umfasst Büsche, Hochgras, Felsgruppen, Schneewehen, Stämme, Jungbäume und Ähnliches von 0,2 bis 2,2 m. Die Ebene existiert nur im Client und hat keine Kollision. Server, Navigation und Netzwerk bleiben unverändert.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `environment/MidPropAssets.ts` | Katalog `MID_PROPS` (Radius, Höhe, maximale Steigung, Material, Tönung) und prozedurale Geometrie mit Farbe in den Vertices. Jede Form wird auf Katalogradius und -höhe normiert. |
| `environment/MidPropPlacement.ts` | Deterministische Platzierung pro 60-m-Chunk (`placeChunkMidProps`) und Biomprofile `MID_PROFILES` |
| `mission/PlanetMidProps.ts` | Instanz-Batches pro 120-m-Region und Objekttyp, Wind für Pflanzen, Einwachsen am Rand der Sichtweite, Grafikstufen |

## Biome

| Planet | Freie Streuung | Am Solid angelagert |
| --- | --- | --- |
| Grüne Ebene | Hochgrasfelder, Wiesenblumen, Büsche, Feldsteine | Felsen: Steine und Gras; Bäume: Wurzelanlauf, Busch, Gras |
| Wüste | Dünengras, Trockenbüsche, Säulensukkulenten, Sandsteinplatten | Felsen und Bogenpfeiler: Platten, Dünengras im Windschatten, Trockenbusch |
| Eiswelt | Schneewehen, Eissplitter, bereifte Felsen | Schneewehe im Windschatten, Eissplitter und Felsbrocken am Fuß |
| Wald | Farninseln, Sträucher, Jungbäume in Lücken, Pilze am Stamm, Totholz, Stümpfe, Moosfelsen; Gras und Blumen auf Lichtungen | Bäume: Wurzelanlauf, Farne; Felsen: Moosbrocken, Farne |

Die Streuung folgt Fleckenrauschen, den Oberflächenschichten und (im Wald) dem Abstand zum nächsten Stamm. Windschattenobjekte liegen in der vorherrschenden Windrichtung des Planeten hinter dem Solid. Ihre Längsachse folgt dem Wind. Reservierte Missionsflächen, Patrouillenwege (mindestens 1,6 m plus Radius frei) und Solids bleiben frei. Die einzige Ausnahme ist der Wurzelanlauf direkt am Stamm.

## Fairness

Hochgras ist höchstens etwa 1 m hoch, Felsgruppen, Stämme und Wehen bleiben unter 0,9 m. Die Pflanzen sind bewusst nur weiche Deckung. Gegner-KI und Treffer ignorieren sie. Jungbäume (bis 2,2 m) sind schlank und stehen nur in Kronenlücken.

## Grafikstufen

| Stufe | Dichte | Sichtweite | Schatten |
| --- | ---: | ---: | --- |
| Low | 45 % | 58 m | aus |
| Medium | 82 % | 92 m | aus |
| High | 100 % | 125 m | bis 64 m |

Pro Karte: Ebene etwa 15.000 Objekte, Wald etwa 4.000, Wüste etwa 2.600, Eis etwa 1.700. Sichtbar ist nur der Kreis der Sichtweite (Medium etwa 12 % der Karte). Die Bildrate wurde bisher nur mit SwiftShader geprüft. Eine GPU-Messung steht noch aus.

Prüfung: `environment-detail.test.ts` (Replay, Reservierungen, Maße, Grafikstufen) und `scripts/playtest-biome-horizon.mjs`.

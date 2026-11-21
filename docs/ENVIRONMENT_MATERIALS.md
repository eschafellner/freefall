# FREEFALL · Umgebungsmaterialien

## Audit der 7.7A-Baseline

Geprüft wurde die Arbeitskopie von 7.7A auf Basis von `4daf04e`. Die Arbeitskopie enthielt bereits uncommittete Implementierung aus den vorigen Meilensteinen und wurde vor den Änderungen für den Vergleich eingefroren.

| Priorität | Status vor 7.7B | Bestand und Befund |
| --- | --- | --- |
| 1 | FUNCTIONAL FALLBACK | Alle generierten Planeten bezogen dieselbe 256²-Erdalbedo und -normalen aus `SurfaceMaterials.ts`. Planetentöne, interpolierte Steigungsfarbe und UVs mit 4,8 m Wiederholung prägten den Boden. Die Erd-Roughnessmap war beim generierten Terrain ungenutzt. |
| 1 | MISSING | Schichtspezifische Roughness, Eisrisse, Sandrippel, Moos und Blattstreu. Rinde, Kronen, Felsen und Eisblöcke verwendeten untexturierte Standardmaterialien. Das Eisbiom hatte keine instanzierten Bodendetails. |
| 1 | PERFORMANCE RISK | Wald mit 500 Platzierungsslots für physische Objekte. Je Chunk gab es eine Nah- und Fernkrone, die Umschaltung lag auf Medium bei 105 m. Felsen wurden planetenweit pro Material gebündelt. Deren große Batch-Bounds trieben die unnötige Geometrieverarbeitung im Kamerafrustum und im Schattenpass. |
| 2 | NEEDS POLISH | Drei Dreiecke pro Grasbüschel, Rohbudget pro Chunk bis 780 in der Ebene und 580 im Wald. Einheitliche Detailreichweite pro Low bzw. Medium/High. Die grasbezogene Freihaltung erfasste Teile der Landezone und vorhandene Collider. |
| 2 | PRODUCTION READY | Vier unterschiedliche Biome, 480 m Kantenlänge, 8 × 8 Chunks, 4 m Gitter. Welt-Hash und Seed bestimmen Höhen, Großobjekte und Missionskandidaten. Kollisionsfläche und Nahmesh verwenden dieselben Höhendaten und dieselbe Diagonale. Beide Gelände-LODs erhalten die feinen Chunkränder. |
| 2 | PRODUCTION READY | Vier 7.7A-Atmosphärenprofile im regulären Renderer. Directional und Hemisphere Light, generierter Himmel, optional HDR-Umgebungslicht, FogExp2, ACES Filmic, sRGB-Ausgabe und lokale PCF-Schatten. Grafikstufen einschließlich High-FXAA sind aktiv. |
| 3 | PRODUCTION READY | `SurfaceMaterials` erstellt Projekteigenes für Erde, Beton, Lack, Metall, Canvas und Lampen einmal pro Ansicht. `AssetLoader` cached GLB/glTF und Texturen nach Pfad bzw. Farbraum. KTX2 ist über die Asset Registry optional. |
| 3 | MISSING | Binäre Environment-GLB/glTF-Dateien und gebackene Texturdateien für die Oberfläche. Die Dateien unter `docs/` sind Referenzbilder. Die vier Planeten nutzen lokale prozedurale Assets. Welt-Streaming wird in 7.6/7.7A durch LOD und Sichtbarkeit bei vollständig residenten Terrain-Chunks abgedeckt. |

[7.7A-Audit](ENVIRONMENT_AUDIT_7_7.md) · [Beleuchtung](ENVIRONMENT_LIGHTING.md) · [Vergleichsaufnahmen](MILESTONE_7_7B_PLAYTEST.md)

## Geländeschichten in 7.7B

| Planet | Vier Schichten | Basis-Roughness |
| --- | --- | --- |
| Eiswelt | Schnee, Gletschereis, Reif auf Gestein, frei liegender Fels | .93 / .29 / .62 / .88 |
| Wüste | Rippelsand, verdichteter Sand, Kies und verwitterter Fels | .90 / .84 / .94 / .91 |
| Grüne Ebene | Gras, Erde, steiniger Grund und Fels | .94 / .91 / .91 / .90 |
| Wald | Erdiger Waldboden, Moos, Laubauflage und Fels | .94 / .90 / .95 / .89 |

`PlanetSurfaces.ts` berechnet normierte Schichtgewichte aus der relativen Höhe und Steigung, zwei Landschaftsrauschen und dem Welt-Seed. Niedrige, flache Eisregionen begünstigen Eis. Steile Flächen öffnen den Gesteinsanteil. Rauheit und Relief variieren innerhalb jeder Schicht. Die gleiche Gewichtsberechnung steuert die Eignung von Detail-Props. Chunkränder teilen Gewichte, Normalen und exakte Höhen.

`PlanetMaterials.ts` erweitert den vorhandenen `MeshStandardMaterial`-Shader an Farbe, Roughness und Normalen. Die vier 256²-Kacheln liegen in einem `DataArrayTexture`. R speichert lineare Helligkeitsvariation, G Roughness und B/A die tangentielle Normalabweichung. Die Geländeschichten verwenden je 2,65–5,20 m große Wiederholungen, einen seedabhängigen Winkel und leicht verzerrte Weltkoordinaten. Dadurch setzen sich Sandrippel und feine Strukturen über Chunkgrenzen fort. Geordnete Mipmaps, explizite UV-Gradienten, trilineare Filterung und hardwareabhängig bis 4× Anisotropie erhalten die Schrägsicht. Unbedeutende Materialgewichte und ferne Pixel überspringen die Textursamples.

Alle natürlichen Oberflächen sind dielektrisch. Die sRGB-Farbwerte der Paletten werden beim Aufbau in den linearen Three.js-Arbeitsfarbraum umgerechnet. Die Datentexturen bleiben linear. Die Materialtönung von Fels, Eisblock und Rinde verwendet je ein gemeinsam genutztes 128²-Albedo-/Normalpaar. Kronen und Bodendetails verwenden opake Geometrie mit Vertex- und Instanzfarbe. Die Beleuchtung und Exposition stammen aus 7.7A.

Terrain-Texturarray inklusive Mipmaps rechnerisch **1,33 MiB**, jedes 128²-Paar rund **0,17 MiB**. Das zusätzliche aktive Planetenset liegt bei etwa **1,50–1,67 MiB**, ohne Sky, Schattenkarten und vorhandene Texturen. Die Arrays brauchen weder eingebundene Bilddateien noch einen Transcoder. AO ist bei diesen prozeduralen Oberflächen ungebacken. Aufgestellte Großobjekte verwenden die vorhandene Szenenbeleuchtung und Schatten.

[Asset-Katalog](ENVIRONMENT_ASSET_CATALOG.md) · [Texturbudget und Laufzeit](ENVIRONMENT_PERFORMANCE.md)

## Prüfung 7.7E

In Sand und Hardpan unterbricht eine zweite periodische Störfunktion die Rippen im Texturtile. Farb- und Höhenausschlag sind schwächer. Der Shader nutzt dieselben Texturzugriffe und Kollisionsproxies. [Vorher/Nachher](playtest/7-7e/desert-ab.jpg)

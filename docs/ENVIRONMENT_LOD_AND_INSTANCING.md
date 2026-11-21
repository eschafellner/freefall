# FREEFALL · LOD und Instancing 7.7B

| Grafikstufe | Anteil im Dekokatalog | Deko-Ausblenddistanz | Terrain-Samples bis | Baumkronen Nah-LOD am Chunkzentrum |
| --- | ---: | ---: | ---: | ---: |
| Low | 30 % | 21 m | 52 m | 45 m |
| Medium | 72 % | 40 m | 100 m | 69 m |
| High | 100 % | 57 m | 142 m | 92 m |

Dichte und Reichweite sind Teil von `GRAPHICS_QUALITY`. Dekoration nutzt nach Chunk und Asset gruppierte Instanzen. Größendämpfung im Vertex-Shader setzt bei 72 % der maximalen Reichweite ein. Batch- und Frustum-Culling verwenden vollständige konservative Bounds. Die Allocations und Positionen sind unabhängig von der gewählten Grafikstufe. Distanzwechsel behalten dieselben Meshes und Matrixdaten.

Fels- und Eisinstanzen werden in Gruppen von 120 m nach Material gebündelt und haben zwei Geometrie-LODs. Deren Auswahl nutzt den Abstand zum Batch-Bounds und 7 m Hysterese. Bäume bleiben in 60-m-Gruppen, nah und fern teilen sich das Kronenmaterial. Stämme und physische Felsen behalten bei allen Stufen ein sichtbares Mesh im Frustum. Terrain-LOD verwendet weiterhin gemeinsame Randvertices für angrenzende Chunks. Das Höhenfeld, Terrain-Kollision und Spawn- und Missionslogik sind unabhängig von diesen Renderregeln.

Kleine Deko wirft keine dynamischen Schatten. Nahkronen und Nahfelsen werfen in erreichbarer Entfernung Schatten gemäß dem 7.7A-Schattenfenster. Low deaktiviert den Schattenpass wie zuvor. Blatt-, Nadel- und Farnformen verwenden opake geschnittene Geometrie mit Tiefenschreibzugriff. Dies vermeidet transparente Gras- und Kronenkarten.

Beim Planwechsel entfernt `disposeMissionMeshes` die Missionsgruppe. Es gibt Instanzpuffer, eindeutige Geometry- und Materialobjekte sowie die pro Mission erzeugten DataTextures einschließlich des im Shader gebundenen Terrain-Arrays frei. Gemeinsam genutzte Szenenmaterialien und ihre Texturen leben bis zum Ende des Renderers. Der Finalizer sammelt die Missionstexturen und direkt referenzierten Materialmaps zusammen, bevor er sie dedupliziert freigibt.

[Messwerte](ENVIRONMENT_PERFORMANCE.md) · [Asset-Katalog](ENVIRONMENT_ASSET_CATALOG.md)

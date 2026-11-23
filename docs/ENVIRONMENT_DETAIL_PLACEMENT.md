# FREEFALL · Deterministische Bodendetails

`EnvironmentDetailPlacement.ts` erweitert die Chunk-Schleife der 7.6-Welt im Client. Die über Colyseus synchronisierte Weltidentität umfasst Planet und Seed. Katalogversion 1 und Welt-Hash bilden zusammen den Startwert. Aus Chunk-Koordinaten, Kategorie, Kandidatenindex und Zufallskanal werden Position, Variante, Winkel, Maßstab, Helligkeit und Dichterang abgeleitet. IDs haben das Format `<world>/<chunkX>/<chunkZ>/<catalogVersion>/<density>/<index>`. Ein Chunk lässt sich in beliebiger Reihenfolge rekonstruieren. Grafikstufen zeigen Präfixe der nach Dichterang sortierten Listen.

| Kandidaten pro 60-m-Chunk | Klein/Geröll | Vegetation | Oberflächendetail | Landmarkendetail | Cluster-Schwelle |
| --- | ---: | ---: | ---: | ---: | ---: |
| Eis | 150 | 0 | 170 | 34 | .41 |
| Wüste | 270 | 150 | 0 | 52 | .50 |
| Ebene | 175 | 1050 | 0 | 34 | .40 |
| Wald | 150 | 440 | 320 | 130 | .42 |

Seit Katalogversion 2 (Biom-Phase B) sind die Dichten höher, und die Sichtweite der Bodendetails beträgt 26/48/66 m (Low/Medium/High). Die Versionsänderung erzeugt auch das Muster der Oberflächenschichten neu. Server und Client bleiben dabei synchron, weil beide `detailSeed` aus `@freefall/shared` verwenden. Mittelgroße Objekte beschreibt [Biom-Phase B](BIOME_MID_PROPS.md).

Die Kandidaten stammen aus pro Kategorie gestaffelten Rastern. Große und mittlere physische Props stammen gemeinsam aus `WORLD_PROFILES.solidCount` und den vorhandenen Größenregeln im 7.6-Generator. Seit Weltgenerator v2 haben Eis, Wüste, Ebene und Wald ein Startbudget von 70, 66, 60 und 500 Solids. Dazu kommen benannte Landmarken ([Biom-Phase C](BIOME_LANDMARKS.md)). Die Logik für drei erste größere Platzierungsslots, die Waldcluster und den Sandsteinbogen liegt weiterhin dort.

Ein Terrain-Sample bestimmt die tatsächliche Kontakthöhe. Die Platzierung prüft Grad und Materialgewicht, setzt Höhe und Ausrichtung anhand der Terrain-Tangente und hält anhand des Assetradius Abstand von physischen Hindernissen. Landmarkenkandidaten werden im Umkreis von 7 m einer physischen Formation gewertet. Die Pflanzen reagieren auf mehrskaliges Rauschen. Moderate Dichten und die festen Kandidatenraster halten Lichtungen und Abstände lesbar.

Der Client übernimmt Relais- und Ballonkandidaten aus der rekonstruierten Welt sowie Albatross/Nachschub und den gewählten Ballonpunkt aus dem Plan. Deployment, Anfangsnest, Spawn-/Breach-Regionen und Patrouillenregionen sind reserviert. Die Hauptwege der vorhandenen Patrouillen sind zusätzlich mindestens 1,4 m plus Asset-Radius frei. Missionsstand, Navigation, Horde-Spawns, Kollisionsdaten und Netzwerkpakete werden von der dekorativen Platzierung nicht geschrieben.

Die aktuellen Chunks sind resident. Der Sichtbarkeitswechsel aktualisiert die bestehenden Instanzbatches. Er fügt keine neuen Meshes hinzu. Ein neu aufgebauter Chunk liefert dieselben IDs und Matrizen. Änderungen an Kandidatenregeln oder Katalogmaßen erfordern eine neue Katalogversion. Physisch relevante Versionsänderungen bleiben Teil der bestehenden Weltversionsregeln.

[Assetmaße](ENVIRONMENT_ASSET_CATALOG.md) · [LOD und Grafikstufen](ENVIRONMENT_LOD_AND_INSTANCING.md)

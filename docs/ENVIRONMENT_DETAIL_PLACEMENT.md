# FREEFALL · Deterministische Bodendetails

`EnvironmentDetailPlacement.ts` erweitert die Chunk-Schleife der 7.6-Welt im Client. Die über Colyseus synchronisierte Weltidentität umfasst Planet und Seed. Katalogversion 1 und Welt-Hash bilden zusammen den Startwert. Aus Chunk-Koordinaten, Kategorie, Kandidatenindex und Zufallskanal werden Position, Variante, Winkel, Maßstab, Helligkeit und Dichterang abgeleitet. IDs haben das Format `<world>/<chunkX>/<chunkZ>/<catalogVersion>/<density>/<index>`. Ein Chunk lässt sich in beliebiger Reihenfolge rekonstruieren. Grafikstufen zeigen Präfixe der nach Dichterang sortierten Listen.

| Kandidaten pro 60-m-Chunk | Klein/Geröll | Vegetation | Oberflächendetail | Landmarkendetail | Cluster-Schwelle |
| --- | ---: | ---: | ---: | ---: | ---: |
| Eis | 112 | 0 | 112 | 20 | .41 |
| Wüste | 230 | 85 | 0 | 38 | .52 |
| Ebene | 155 | 705 | 0 | 20 | .42 |
| Wald | 125 | 330 | 245 | 104 | .44 |

Die Kandidaten stammen aus pro Kategorie gestaffelten Rastern. Große und mittlere physische Props stammen gemeinsam aus `WORLD_PROFILES.solidCount` und den vorhandenen Größenregeln im 7.6-Generator. Die Biome erstellen je 42, 40, 34 und 500 Solids als Startbudget. Die Logik für drei erste größere Platzierungsslots, die Waldcluster und den Sandsteinbogen liegt weiterhin dort.

Ein Terrain-Sample bestimmt die tatsächliche Kontakthöhe. Die Platzierung prüft Grad und Materialgewicht, setzt Höhe und Ausrichtung anhand der Terrain-Tangente und hält anhand des Assetradius Abstand von physischen Hindernissen. Landmarkenkandidaten werden im Umkreis von 7 m einer physischen Formation gewertet. Die Pflanzen reagieren auf mehrskaliges Rauschen. Moderate Dichten und die festen Kandidatenraster halten Lichtungen und Abstände lesbar.

Der Client übernimmt Relais- und Ballonkandidaten aus der rekonstruierten Welt sowie Albatross/Nachschub und den gewählten Ballonpunkt aus dem Plan. Deployment, Anfangsnest, Spawn-/Breach-Regionen und Patrouillenregionen sind reserviert. Die Hauptwege der vorhandenen Patrouillen sind zusätzlich mindestens 1,4 m plus Asset-Radius frei. Missionsstand, Navigation, Horde-Spawns, Kollisionsdaten und Netzwerkpakete werden von der dekorativen Platzierung nicht geschrieben.

Die aktuellen Chunks sind resident. Der Sichtbarkeitswechsel aktualisiert die bestehenden Instanzbatches. Er fügt keine neuen Meshes hinzu. Ein neu aufgebauter Chunk liefert dieselben IDs und Matrizen. Änderungen an Kandidatenregeln oder Katalogmaßen erfordern eine neue Katalogversion. Physisch relevante Versionsänderungen bleiben Teil der bestehenden Weltversionsregeln.

[Assetmaße](ENVIRONMENT_ASSET_CATALOG.md) · [LOD und Grafikstufen](ENVIRONMENT_LOD_AND_INSTANCING.md)

# FREEFALL · Environment Asset Catalog 7.7B

Katalogversion 1. Ursprung ist lokaler FREEFALL-Projektcode. Die Assets werden zur Laufzeit als Three.js-`BufferGeometry` und `DataTexture` erstellt, ohne bezogene Modelle oder Texturen. Das Repository enthält keine separate öffentliche Lizenz für diese neuen Ressourcen. Es gelten die projektspezifischen Rechte. Der dekorative Pivot sitzt am Bodenkontakt, die Längeneinheit ist Meter, Y zeigt nach oben. Die exakten Maße stehen in `DETAIL_ASSETS`.

| ID | Kategorie | Biome | Radius × Höhe m | Dreiecke | Material |
| --- | --- | --- | --- | ---: | --- |
| `drift` | Surface Detail | Eis | .52 × .10 | 80 | Matter Schnee |
| `ice-chip` | Biome Decoration | Eis | .24 × .22 | 40 | Eisbruch |
| `scree` | Rock Detail | Eis, Wüste, Ebene | .28 × .15 | 80 | Mattes Geröll |
| `pebble` | Small Ground Prop | Wüste, Ebene, Wald | .15 × .09 | 40 | Matter Stein |
| `scrub` | Vegetation | Wüste | .32 × .28 | 56 | Trockene Blätter |
| `grass` | Vegetation | Ebene | .30 × .31 | 22 | Grashalme |
| `forb` | Vegetation | Ebene, Wald | .26 × .26 | 56 | Bodenkräuter |
| `fern` | Vegetation | Wald | .53 × .41 | 144 | Gefiederte Wedel |
| `litter` | Surface Detail | Wald | .29 × .05 | 28 | Laub |
| `deadwood` | Landmark Decoration | Wald | .56 × .14 | 20 | Holzreste |

Alle Tabellen-Props sind `Instanced Details` mit Vertex-/Instanzfarbe, pro Typ einer Geometrie, ohne Bildtextur oder Kollisionsproxy. Entfernungsabhängiger Dichteverlust ersetzt für diese kleinen Formen einen zusätzlichen Topologie-LOD.

| Renderer-Asset | Kategorie | Maßstab und Pivot | Material und LOD | Physik |
| --- | --- | --- | --- | --- |
| `planet-rock` · Fels und Bogenpfeiler | Reusable Prop | Normiertes zentriertes Mesh, Maßstab aus Welt-AABB | 128² Albedo/Normal, bis 180 Nahdreiecke und 20 Ferndreiecke | 7.6-AABB |
| `planet-ice` · Eisblöcke | Reusable Prop | Normiertes zentriertes Mesh, Maßstab aus Welt-AABB | 128² Albedo/Normal, 80 / 20 Dreiecke | 7.6-AABB |
| `sandstone-arch` · Sandsteinbogen | Hero Asset | Ursprungsposition des Bogen-Spans, Radius 4,3 m und Rohrstärke 1,05 m | Gemeinsames Steinmaterial, 280 Dreiecke | Vorhandener Span und Pfeiler, Öffnung bleibt begehbar |
| `tree-trunk` · Baumstamm | Reusable Prop | Vertikale Achse am Collider, Stammfuß 0,24 m eingelassen | 128² Rinde, gemeinsame Geometrie | Vorhandener Stamm-Proxy |
| `forest-conifer` / `plains-crown` · Baumkronen | Reusable Prop | Ursprung am Baum, Krone aus Höhe und Breite skaliert | Opake Nadelzweige im Wald mit 870 / 102 Dreiecken, instanzierte Blattvolumen in der Ebene | Kosmetisches Kronendach |

`PlanetMaterials.ts` erzeugt die vier Oberflächenschichten je Planet. Die vollständig lokale Quelle dieser Materialien und der obigen Assets liegt unter `apps/client/src/rendering/environment/` und in `GeneratedTerrain.ts` und `Conifer.ts`.

[Technische Prüfung](ENVIRONMENT_ASSET_PIPELINE.md) · [Herkunft und Higgsfield](HIGGSFIELD_ENVIRONMENT_ASSETS.md)

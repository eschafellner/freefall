# FREEFALL · Biom-Phase A: Horizont und Bodenfarbe

Phase A des Biom-Verbesserungsvorschlags. Sie betrifft nur die Darstellung im Client. Server, Kollision, Navigation, Weltversion und Netzwerk bleiben unverändert.

## Horizont-Ring

`PlanetHorizon.ts` erzeugt Gelände außerhalb des spielbaren Quadrats bis 1.250 m hinter der Kartengrenze. Es besteht aus 28 konzentrischen Quadratringen mit je 480 Vertices. Der innere Ring übernimmt die Randvertices des Heightfields exakt, deshalb entsteht an der Grenze keine Naht. Das Gelände verwendet das Bodenmaterial des Planeten mit denselben Schichtgewichten, Tönen und Makrofarben und wirft keine Schatten.

| Planet | Silhouette |
| --- | --- |
| Grüne Ebene | Sanfte Hügel, flache blaue Bergkette am Horizont |
| Wüste | Tafelberge mit Steilflanken und Terrasse, niedrige Dünen davor |
| Eiswelt | Gletscherwände und zackige Gipfel bis etwa 250 m |
| Wald | Bewaldete Kämme: Kronendach-Tönung ab 120 m und ein Gürtel aus Fernkronen bis 165 m (ein Instanz-Draw, auf Low 45 %) |

Bodennebel: Ab 260 m Sichtentfernung wächst die Nebeldistanz nur noch mit 20 %, und der Nebelanteil bleibt höchstens 0,82 (`GROUND_HAZE` in `PlanetMaterials.ts`). Terrain und Horizont teilen diese Kurve. Der Dunst nimmt mit der Entfernung stetig zu, und ferne Kämme bleiben als Silhouette lesbar. Die Kamerasichtweite auf generierten Planeten reicht bis zur äußersten Horizontecke.

## Großflächige Bodenfarbe

`TerrainMacro.ts` färbt jeden Terrain-Vertex zusätzlich mit einem Multiplikator (`surfaceMacro`). Rauschen auf 150 m und 48 m Skala mischt zwischen einer „üppigen“ und einer „trockenen“ Tönung. Das lokale Relief (Höhe gegen das Mittel der Nachbarn im Abstand von 12 m) dunkelt Senken ab und hellt Kuppen auf. Die gemeinsamen Oberflächengewichte für Schritte und Detailplatzierung bleiben unverändert.

## Prüfung

`scripts/playtest-biome-horizon.mjs [outDir]` nimmt auf jedem Planeten vier Ansichten auf: Kartenrand, Ecke, Blick nach innen und Mitte.

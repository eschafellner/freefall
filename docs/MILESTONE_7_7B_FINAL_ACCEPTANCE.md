# FREEFALL · Abnahme 7.7B

Die Implementierung baut und läuft mit den bisherigen Weltidentitäten, den 7.7A-Atmosphären, den bestehenden Missionen und der autoritativen Schabe. Der visuelle Vergleich nutzt vier feste Planetenseeds. Die Medium-Messung umfasst 0, 250, 500 und 1.000 simulierte Gegner im Wald. Der separate High-Vergleich prüft vier Clients bei 1.000 Gegnern.

| Gate | Status | Nachweis |
| --- | --- | --- |
| A · Material Quality | PASS | Vier differenzierte PBR-Schichtsätze, Shader im GL-Browserpfad, geprüfte Normalen und Roughness, Sichtvergleich. |
| B · Environmental Detail | PASS | Vier wiedererkennbare Biome, zehn Detail-Meshes, vier Bildvergleiche mit Gelände-Nahaufnahme und Bodenhaltungen. |
| C · Deterministic Placement | PASS | Gleicher Seed und rekonstruierte Welt liefern dieselben Detailtransforms und IDs. Andere Seeds variieren. Freihaltung und Chunk-Aufbau geprüft. |
| D · Asset Pipeline | PASS | Projektinterne Herkunft, gültige Geometrie und Maße, LOD, keine erforderlichen Downloads. GLB-Import mit synthetischer Datei geprüft. Keine Higgsfield-Generierung oder Credits. |
| E · Gameplay Compatibility | PASS | Vier Browserläufe mit Crouch, Dive, Prone, Supine, Schuss und Get-up. Komplette Eingabesimulation je Planet, Deployment, Missionsziele und Extraktion. |
| F · Multiplayer | PASS | Vier Chromium-Clients im Wald. Nach einem erzwungenen WebSocket-Abbruch nahm der Client denselben Platz wieder ein. Low, Medium und High im selben Raum, danach vier Operatoren per Ballon extrahiert. |
| G · Performance | BLOCKED | Medium und High hielten auf der Radeon RX 9070 XT lokal 60 FPS und 0 verworfene Server-Ticks. Das 33,33-ms-Tickbudget wurde eingehalten. Freigegebene Renderbudgets und repräsentative Zielgeräte für die Produktionsabnahme fehlen. |
| H · Documentation | PASS | Inventar, Platzierung, Katalog, Texturen, Asset-Pipeline, Higgsfield-Prüfung, LOD, Messwerte, Spieltest und offene Punkte verlinkt. |

**Gesamtabnahme offen.** Die lokalen Ergebnisse belegen die Funktion auf der getesteten Konfiguration. Eine Freigabe aller verpflichtenden Gates setzt die Produktionsabnahme voraus.

## Befunde und Änderungen

- Die grobe, auf allen Planeten wiederholte Erdtextur wurde durch biomspezifische PBR-Gewichte aus Terrainhöhe, Neigung und Masken mit einem pro Planet wiederverwendeten Texture Array ersetzt. Vier Schichten verändern Farbe, Rauheit und Normale. Metermessung, verschiedene Maßstäbe, Seed-Rotation und verzerrte Welt-UVs reduzieren Wiederholung. [Audit und Inventar](ENVIRONMENT_MATERIALS.md)
- Eis erhält Schnee, Eisrisse, Reif, Geröll und Eisbruch. Die Wüste erhält matte Rippel, Hartboden, Kies und Verwitterung. Die Ebene erhält Grasvarianten, Erdflecken und niedrige Kräuter. Der Wald erhält Laub, Moos, Farne, Totholz, Rinde und gegliederte Nadelzweige. [Planetendetails](PLANET_SURFACE_DETAILS.md)
- Kosmetisches Placement baut auf 7.6 auf. Verwendet werden World-ID, Katalogversion und deterministische Chunk-Kandidaten. Missionsflächen, Spawnregionen, Kollisionsflächen und Patrouillenwege bestimmen den freien Raum. [Placement](ENVIRONMENT_DETAIL_PLACEMENT.md)
- Alle 7.7B-Meshes und -Texturen entstehen lokal. Instancing, LOD-Gruppen, Distance- und Frustum-Culling, opake Vegetation und Shadow-Regeln reduzieren unnötige Arbeit. Der Katalog und die geprüften Quellen decken die Herkunft ab. [Asset-Katalog](ENVIRONMENT_ASSET_CATALOG.md) · [Asset-Pipeline](ENVIRONMENT_ASSET_PIPELINE.md) · [Higgsfield](HIGGSFIELD_ENVIRONMENT_ASSETS.md) · [LOD und Instancing](ENVIRONMENT_LOD_AND_INSTANCING.md)
- 288 automatisierte Tests, TypeScript, Build, Balancecheck und drei Schabe-Prüfsummen liefen erfolgreich. Vite meldet weiterhin das Hauptbundle über 500 kB. [Browseransichten und Testumfang](MILESTONE_7_7B_PLAYTEST.md) · [Performance](ENVIRONMENT_PERFORMANCE.md)

## Geänderte Dateien für 7.7B

- Rendering-Einstiege und Grafikstufen. `apps/client/src/game/Game.ts`, `apps/client/src/rendering/ArenaView.ts`, `apps/client/src/rendering/GraphicsQuality.ts`.
- Material- und Detailcode in `apps/client/src/rendering/environment/`. `SurfaceMaterials.ts`, `PlanetSurfaces.ts`, `PlanetMaterials.ts`, `EnvironmentDetailPlacement.ts`, `EnvironmentDetailAssets.ts`.
- Terrain, Instanzen und Lebensdauer in `apps/client/src/rendering/mission/`. `MissionEnvironment.ts`, `GeneratedTerrain.ts`, `Conifer.ts`, `PlanetGroundDetails.ts`, `disposeMissionMeshes.ts`.
- Tests und Browser-Harnesses. `apps/client/test/environment-detail.test.ts`, `scripts/playtest-planet-atmosphere.mjs`, `scripts/playtest-horde-director.mjs`.
- Zehn 7.7B-Dokumente inklusive dieses Berichts und die visuellen und technischen Nachweise in `docs/playtest/7-7b/`.

## Offene Punkte vor der vollständigen Freigabe

| Priorität | Befund | Status |
| --- | --- | --- |
| P0 | Im ausgeführten Prüfumfang kein Fehler gefunden. | — |
| P1 | Im ausgeführten Prüfumfang kein Fehler gefunden. | — |
| P2 | Die Abnahme der Renderbudgets auf repräsentativen Zielgeräten sowie längere Memory-, Shadow- und GPU-Pass-Messungen stehen aus. | BLOCKED für die Produktionsbudgets, NOT TESTED für die übrigen Messungen |
| P2 | Durchgehende manuelle Mission von 20–30 Minuten pro Planet mit vier Menschen. | NOT TESTED |
| P3 | Bei sehr naher Betrachtung bleiben die prozeduralen Kronen facettiert. Ein freigegebenes hochwertiges Baum-/Fels-Hero-Asset ist noch offen. | NEEDS POLISH im Asset-Inventar |
| P3 | Bestehende Vite-Warnung für das große Client-Bundle. | Offen |

Für 7.7C lassen sich die bestehenden Materialien und Vertexfarben unter wechselndem Licht, Wettermustern und Wind prüfen. Sinnvoll sind Messungen für Vegetationsbewegung und Schattenupdates zuerst im Wald. Zielgeräte und Renderbudgets sollten vor einer gemeinsamen Produktionsfreigabe festgelegt werden. Der jeweilige Zustand der 7.7B-Release-Gates gilt unabhängig vom Start weiterer Entwicklungsarbeit.

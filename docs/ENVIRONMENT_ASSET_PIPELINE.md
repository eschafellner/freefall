# Umgebung und Asset-Herkunft

## Bestand aus 7.6

| Asset | Herkunft | Einsatz |
| --- | --- | --- |
| Gelände, Paletten, Gras und Bodendetails | Lokaler Projektcode in `GeneratedTerrain.ts` und `SurfaceMaterials.ts`. | Chunk-Meshes mit Mipmaps, Steigungsfarben und instanzierten Details. |
| Felsen, Eis, Sandsteinbogen | Lokale modulare Three.js-Geometrie. | Instanzen pro Material, separate Server-Proxies, Bogen als Einzelobjekt. |
| Stämme und Laub | Lokale Three.js-Geometrie. | Stämme und Baumkronen in Chunk-Batches. Grobe Kronen in der Ferne. |
| Relais, Landepad, Albatross und Extraktionsausrüstung | Bestehende Projektmaterialien und -geometrie sowie lokaler Code für die Relaisbaugruppe. | Missionsinhalte ohne externe Laufzeitdateien. |

Die Umgebungsmodelle entstehen aus dem Projektcode unter dessen Nutzungsbedingungen. Es wurden keine Drittanbieter-Modelle importiert. Die drei Schabe-Ressourcen bleiben lokal. Die Prüfsumme des Schabe-Renderers berücksichtigt die Aufsetz- und Culling-Höhe auf den neuen Oberflächen. Mesh, Farben und bestehende Animation bleiben erhalten.

Die Baum- und Felsmodelle sind prozedurale Platzhalter für eine spätere Detailrunde. Sie verwenden wenige wiederverwendete Meshes. Hochauflösende Hero-Assets, Blender-Retopologie und GLB-Import waren für die lokale Implementierung nicht erforderlich. [Higgsfield-Audit](HIGGSFIELD_ENVIRONMENT_ASSETS.md)

## Herkunft in 7.7A

Die vier neuen Himmelsvarianten entstehen im vorhandenen lokalen Texturgenerator `Lighting.ts` aus Paletten, Rauschen und dem Sonnenvektor. Das Laufzeit-Asset ist eine equirektangulare DataTexture. Der Projektcode ist die vollständige Quelle. Externe Assets, zu prüfende Drittlizenzen, Higgsfield-Aufrufe und Credit-Verbrauch für 7.7A ergeben jeweils null. [Renderer-Integration](ENVIRONMENT_LIGHTING.md)

## Produktionspfad 7.7B

- Der [Asset-Katalog](ENVIRONMENT_ASSET_CATALOG.md) verknüpft die stabilen Local-Asset-IDs mit Kategorie, Biom, Abmessungen, Bodenpivot, Material, LOD und Kollisionsanforderungen. `EnvironmentDetailAssets.ts` erzeugt die kleineren Meshes und berechnet Normalen und Bounds. `PlanetMaterials.ts` hält die gemeinsamen Texturen. Die Produktions-Assets haben keine herunterzuladenden Pflichtdateien.
- `AssetLoader` und `AssetRegistry` bleiben der Einstieg für projektseitig bereitgestellte GLB/glTF-Modelle und Texturen. Der Browser-Build enthält den Unterstützungspfad für KTX2. Ein binäres Environment-Paket war weder im Inventar noch zur Laufzeit erforderlich. Ein synthetischer GLB-Importtest prüft Three.js-Import, Metermaß, AABB, PBR-Werte und Ablehnung ungültiger Daten.
- Für spätere hochwertige Fels- oder Baumimporte werden realistische Maße, aufrechte Y-Achse, der Bodenpivot, glatte bzw. harte Normalen passend zur Form, saubere UVs, geschlossene Bounds, Materialien und kompatible LODs vor dem Einbau geprüft. Der Collider wird gegen die sichtbare Deckung validiert. Die vorhandene prozedurale Darstellung liefert bei optionalen externen Assets den lokalen Bestand. Blender war in der Prüfumgebung nicht installiert.
- Offen für eine spätere Asset-Runde sind detailliertere Fels- und Baum-Hero-Modelle, gebackene und lizenzierte Texturen und eine gegebenenfalls sinnvolle KTX2-Konvertierung tatsächlich importierter Maps.

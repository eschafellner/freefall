# Oberflächenklassifikation

`PlanetSurfaces.ts` enthält die vorhandenen Rendergewichte jetzt im Shared-Paket. Renderer und Server verwenden dieselben Layer, denselben aus der Welt-ID abgeleiteten Seed sowie dieselben zentralen Höhendifferenzen für die Vertex-Gewichte. Der Server interpoliert die Gewichte der drei Dreiecksecken. Bei einem Gewichtsvorsprung unter 2,5 Prozentpunkten behält die frühere Schicht Vorrang. Der Nah-LOD verwendet dieselbe Triangulierung. Im Fern-LOD kann die optische Mischung durch gröbere Dreiecke abweichen.

Der vorhandene World-Ray-Limit-Aufruf merkt optional, ob das Höhenfeld oder welcher Collider die Reichweite begrenzt hat. Die Geländenormale stammt aus dem getroffenen Dreieck. Props verwenden die getroffene AABB-Fläche. Damit folgen Position und Normale der gültigen Kollisionsfläche. Optisch gerundete Felsen und Stämme können am Rand vom vereinfachten Collider abweichen.

| Quelle | Material |
| --- | --- |
| Schneedecke, Eisflächen, Frost | Schnee, Eis, gefrorener Fels |
| Sand, harter Boden, Schotter | Sand, Erde, Fels |
| Gras, offene Erde, Fels | Gras, Erde, Fels |
| Waldstreu, Moos, Waldboden | Waldboden |
| Baum, Eisprop, Fels, Arches | Holz, Eis, Fels oder gefrorener Fels |
| Bunker und Barrieren | Beton |
| Container, Albatross-Hülle und Carrier | Metall |
| Arena-Landeplatte, Straßenplatten, übrige Fläche | Beton, Metall, Erde |
| Legacy-Bodenbruch-Gelände | Erde |
| Unbekannte Welt oder Collider-Oberfläche | Neutraler kurzer Aufwurf |

Das Material-Metadatum der Albatross-Hülle gehört zu den vorhandenen Collidern. Kleine Missionsgeräte, Relaisdetails, Deckaufbauten und dekorative Pflanzen folgen ihren vorhandenen Kollisionsregeln. Die Klassifikation erzeugt keine eigenen Treffervolumina.

# World Generation

`packages/shared/src/world/WorldGenerator.ts` erzeugt eine begrenzte Oberfläche von 480 × 480 m. Drei per Seed gemischte Rauschskalen formen das Relief. Verzerrte Koordinaten brechen das Raster. Die Wüste kombiniert dazu ausgerichtete Dünen mit einer verzweigten Senke und Plateaus. Die Eiswelt erhält eine Gletscherzunge und eine angehobene Geländestufe. Der Wald verwendet ein stärkeres Hügelprofil und dichteabhängige Baumverteilung.

Die Welt enthält 121 × 121 Höhenwerte in Zentimetern. Jede 4-m-Zelle verwendet dieselbe Dreiecksdiagonale für Render-Mesh, Kollision und Strahlabfragen. Höhen werden vor der Quantisierung so skaliert, dass jedes Dreieck die Profilgrenze einhält. Die Landefläche wird auf Höhe null abgeflacht. Relais, Startnest und Ballonzonen erhalten ebene Innenflächen mit weichem Übergang.

Der Generator reserviert zuerst Einsatzorte, Patrouillenwege und Durchbruchregionen. Anschließend verteilt er Felsen, Stämme und Eisformationen mit Freiraum und Mindestabständen. X/Z-Koordinaten der Standorte werden innerhalb breiter Einsatzsektoren variiert. Die 60-m-Chunks folgen einem stabilen Raster. [Biomprofile](BIOME_PROFILES.md) · [Kollision](TERRAIN_COLLISION.md)

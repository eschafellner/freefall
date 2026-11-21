# Vegetation Wind Animation · 7.7C

Die bestehenden Standardmaterialien erhalten `onBeforeCompile`-Erweiterungen für Gras, Kräuter, Büsche, Farne und Waldkronen. Das Terrain- und Detail-Instancing sowie feste Baumstämme behalten ihre bisherigen Geometrien und Transformmatrizen. Jede Wurzelphase entsteht aus der Weltposition der Instanz. Quadratgewichtete lokale Höhe hält den Fuß fest und gibt Spitzen mehr Ausschlag. Instanzachsen berücksichtigen Hangneigung, Rotation und Maßstab. Die Verkleinerung durch die Distanzblende der Bodendetails wird vor der Windverformung ausgewertet.

Nahe Koniferen erhalten zusätzlich eine kleine Bewegung an Zweigspitzen. Ferne Kronen verwenden dieselbe Grundbewegung mit kleinerem Ausschlag. Culling-Bounds enthalten den möglichen visuellen Ausschlag. Qualitätswechsel ändern den gemeinsamen Uniformwert und die bestehenden LOD-Grenzen. Der Material-Cache-Key hängt von der Geometrievariante ab. Die Windwerte erzeugen keine zusätzlichen Shaderprogramme.

Bodenkleinstvegetation wirft weiterhin keine eigenen Schatten. Kronen behalten den statischen Depth-Pass aus 7.7B. Bei bis zu rund 0,32 m Kronenausschlag und gefilterten Schatten reduziert das die Kosten der Shadow-Updates. Der Schattenrand folgt der statischen Kronengeometrie. Die bestehende Szenenbeleuchtung aktualisiert die Schatten bei Änderungen am Lichtrig und am nachgeführten Schattenbereich. Die Stämme und alle autoritativen Baumkollisionen stehen fest.

[Instancing in 7.7B](ENVIRONMENT_LOD_AND_INSTANCING.md) · [Wind](PROCEDURAL_WIND_SYSTEM.md)

## Prüfung 7.7E

Wald und Grüne Ebene wurden im Standardclient mit autoritativem Windzustand aufgenommen. Der Wind wird am Resultat, beim Planetenwechsel und bei reduzierter Bewegung auf null gesetzt. Die Kronenschatten entsprechen einer vereinfachten Annäherung. [Visuelle Abnahme](MILESTONE_7_7_VISUAL_ACCEPTANCE.md)

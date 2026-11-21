# Mündungsfeuer und Tracer · 7.8A

## Lauftransform

`WeaponVisualController` bindet den `Muzzle`-Socket an das Waffenmodell. Ein gleichnamiger Marker im GLB liefert Position und Ausrichtung. Für prozedurale Waffen stammen die Werte aus deren jeweiliger Geometrie. `WeaponFireEffects` übernimmt den Welttransform aus der gerenderten Schussanimation und orientiert zwei gekreuzte, weich maskierte Flächen entlang der lokalen negativen Z-Achse. Das Gewehr erhält einen 46-ms-Impuls. Die Pistole erhält einen kleineren, schwächeren 38-ms-Impuls.

Kollisionsprüfung und Abstandsgrenzen unterdrücken Mündungsfeuer an verdeckten Punkten, unter dem Boden und direkt vor der Kamera. High verfügt über einen einzelnen schattenlosen Lichtimpuls für den lokalen Lauf. Seine Intensität fällt gemeinsam mit dem Flash ab.

## Hitscan-Pfad

Der Positionsbezug eines Tracers kommt aus dem bestätigten `ShotEvent`. In Haltungen und Welten, in denen der Server ab der Laufposition prüft, enthält das vorhandene `from` den Start. Stehende Schüsse auf flachen Karten nutzen den Schulterstrahl. In diesem Fall enthält `traceFrom` den validierten Start des Strahls. Der vorhandene Endpunkt bleibt die tatsächliche Serverposition des Treffers beziehungsweise des Reichweitenendes.

Der Client zeichnet höchstens 72 ms lang einen kurzen ausblendenden Abschnitt auf diesem Segment. Ein blockierter Nullstrecken-Schuss erzeugt keinen Tracer. Für ältere Pakete und Convicts ohne separate Strahlkoordinaten begrenzt die Präsentation die Linie bei Bedarf mit der gemeinsamen Weltabfrage. Der Endpunkt des Simulationsereignisses und der Einschlag bleiben dabei unverändert.

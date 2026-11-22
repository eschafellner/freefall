# Schabe

**Freigegebenes Basisdesign. Änderungen an Design, Animation, Grundverhalten oder Kampfwerten erfordern eine explizite Anforderung.**

> **Designrevision 2026-11-22 (explizite Anforderung):** Modell überarbeitet und Beinanimation ergänzt. Silhouette, Maßstab, Ausrichtung, Farbfamilie, Trefferkugel, Treffer-Aufhellung, Farbvariation und alle Gameplay-Werte sind unverändert. Die Prüfsummen unten gelten für den neuen Stand. Die Aufnahmen des vorherigen Stands liegen als `vorher-*.jpg` daneben.

Die Schabe gehört zu **Der Schwarm** (`swarm`). Ihr Archetyp heißt `swarm.schabe`. Die ursprüngliche interne Netzwerk-ID `0` und der Alias `RUNNER_TYPE` bleiben gültig.

## Visuelle Baseline

Die Schabe besitzt eine gedrungene, niedrig gebaute Silhouette mit drei erd- und kupferbraunen Panzersegmenten, Flankenplatten, Kieferzangen und kleinen helleren Augen. Die drei Distanzstufen nutzen denselben Maßstab und dieselbe Ausrichtung (+Y oben, −Z vorwärts).

| Stufe | Inhalt | Dreiecke |
| --- | --- | ---: |
| Nah | Glatte Panzersegmente mit Chitinglanz, drei überlappende Rippen am Hinterleib, zwei Flügeldecken, sechs gegliederte Beine (Ober-, Unterschenkel, Fuß), zwei zweigliedrige Fühler, Kieferzangen, leicht schimmernde Augen | 1.612 |
| Mittel | Panzersegmente, Flankenplatten, sechs gegliederte Beine in weniger Segmenten, Augen und Kieferansätze | 384 |
| Fern | Grundsilhouette aus drei Segmenten und Bodenkörper | 120 |

Die Beine laufen im Dreifußgang: linkes Vorder-, rechtes Mittel- und linkes Hinterbein bewegen sich gemeinsam, die anderen drei gegenphasig. Der Vertex-Shader verschiebt jeden Beinvertex abhängig von seinem Abstand zur Hüfte nach vorn und hinten und hebt den Fuß in der Schwungphase an (`SCHABE_GAIT`: 0,11 m Schritt, 0,075 m Hub, Takt wie das bestehende Wippen). Die Phase pro Schabe kommt aus ihrer ID, die Bewegung nur bei laufender Schabe. Roll-, Nick- und Hubbewegung des Körpers bleiben bestehen. Eine Vertex-Schattierung dunkelt Fugen und Unterseiten ab. Die Trefferaufhellung, die Farbvariation pro Spawn und die vereinfachte Geometrie für gefallene Schaben gehören zur Baseline. Gefallene Schaben nutzen eine eigene Geometrie ohne Laufdaten und bewegen ihre Beine nicht.

| Referenz | Stand 2026-11-22 | Vorheriger Stand (vor Milestone 3 bis 7.9E) |
| --- | --- | --- |
| Front, 15° | [front.jpg](schabe/front.jpg) | [vorher-front.jpg](schabe/vorher-front.jpg) |
| Seite, 95° | [seite.jpg](schabe/seite.jpg) | [vorher-seite.jpg](schabe/vorher-seite.jpg) |
| Rücken, 162° | [ruecken.jpg](schabe/ruecken.jpg) | [vorher-ruecken.jpg](schabe/vorher-ruecken.jpg) |

Die Aufnahmen zeigen eine einzelne Schabe (Instanz-ID 5, Detailstufe 0, neutrale Pose) in Chromium. Kameraradius 2,6 m, Höhe 1,25 m. Die vorherigen Aufnahmen stammen aus der Boreal-Relay-Szene, die neuen aus einer Vorschauszene mit Hemisphären- und Sonnenlicht. Globale Änderungen an Beleuchtung oder Postprocessing sind möglich, solange Silhouette und Lesbarkeit erhalten bleiben.

| Ressource | Implementierung |
| --- | --- |
| `enemy.swarm.schabe.procedural` | `apps/client/src/rendering/EnemyVisualLOD.ts`. Geometrie, Material (Rauheit 0,83, Metallanteil 0,08, Chitin mit Rauheitsfaktor 0,35–0,6), Farben, Beinanimation, Bewegungsdarstellung, LOD und Instancing. |
| Geometrie-Helfer | `apps/client/src/rendering/AgentMeshes.ts` und `apps/client/src/rendering/ModelParts.ts`. Vertexfarben, Oberflächenattribut (Rauheit, Leuchten), eingebrannte Fugenschattierung, Grundformen und Zusammenführung der Teilgeometrien. |
| ECS | `apps/server/src/ecs/HordeManager.ts`. Typ, Position, Leben, Ziel, Attack-Timer und Slotvergabe. |

Die visuellen Ressourcen entstehen aus bestehendem Projektcode. Es gibt keine separaten Modelle, Texturen oder externen Lizenzen für diesen Archetyp. Die Prüfsummen der Implementierungsdateien stammen aus dem Stand der Designrevision.

```bash
sha256sum -c docs/enemies/schabe/baseline.sha256
```

## Gameplay-Baseline

| Wert | Baseline |
| --- | ---: |
| Lebenspunkte | 48 |
| Geschwindigkeit | 3,55 m/s |
| Trefferkugelradius | 0,68 m |
| Trefferkugelzentrum über Boden | 0,72 m |
| Nahkampfreichweite | 1,45 m |
| Nahkampfschaden | 8 |
| Nahkampf-Cooldown | 1,3 s |
| Zielprüfung | Alle 6 Ticks, phasenversetzt |
| Steering | Alle 2 Ticks, phasenversetzt |
| Separation | 1,65 m, höchstens 12 Nachbarn pro Zelle |
| Arena-Spawns | Radius 40–51 m, Auffüllpause 9 Ticks nach einer Eliminierung |

`apps/server/test/schabe.test.ts` prüft Fraktion, Wire-ID, Gameplay-Werte, Spawn-Konfiguration, den tatsächlichen Hordenframe und die Quellprüfsummen. Die vorhandenen Simulationstests decken Zielwahl, Separation, Treffer und Cooldown ab. Der Testschutz läuft außerhalb des Spiels.

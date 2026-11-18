# Schabe

**Freigegebenes Basisdesign. Änderungen an Design, Animation, Grundverhalten oder Kampfwerten erfordern eine explizite Anforderung.**

Die Schabe gehört zu **Der Schwarm** (`swarm`). Ihr Archetyp heißt `swarm.schabe`. Die ursprüngliche interne Netzwerk-ID `0` und der Alias `RUNNER_TYPE` bleiben gültig.

## Visuelle Baseline

Die Schabe besitzt eine gedrungene, niedrig gebaute Silhouette mit drei erd- und kupferbraunen Panzersegmenten, seitlichen Kiefer- und Beinstrukturen und kleinen helleren Augenpartien. Die drei Distanzstufen nutzen denselben Maßstab und dieselbe Ausrichtung (+Y oben, −Z vorwärts). Im Nahbereich erzeugen Roll-, Nick- und Hubbewegungen den Lauf. Mittlere Distanz vereinfacht Geometrie und Bewegung, die Fernstufe reduziert die Figur auf ihre Grundsilhouette. Die Trefferaufhellung, die Farbvariation pro Spawn und die vereinfachte Geometrie für gefallene Schaben gehören zur Baseline.

| Referenz | Ausgangszustand vor Milestone 3 |
| --- | --- |
| Front, 15° | [front.jpg](schabe/front.jpg) |
| Seite, 95° | [seite.jpg](schabe/seite.jpg) |
| Rücken, 162° | [ruecken.jpg](schabe/ruecken.jpg) |

Die Aufnahmen zeigen eine einzelne Schabe (Instanz-ID 5, Detailstufe 0, neutrale Pose) aus der unveränderten Boreal-Relay-Szene in Chromium. Kameraradius 2,6 m, Höhe 1,25 m, Medium-Profil. Globale Änderungen an Beleuchtung oder Postprocessing sind möglich, solange Silhouette und Lesbarkeit erhalten bleiben.

| Ressource | Implementierung |
| --- | --- |
| `enemy.swarm.schabe.procedural` | `apps/client/src/rendering/EnemyVisualLOD.ts`. Geometrie, Material (Rauheit 0,83, Metallanteil 0,08), Farben, Bewegungsdarstellung, LOD und Instancing. |
| Geometrie-Helfer | `apps/client/src/rendering/AgentMeshes.ts`. Vertexfarben und Zusammenführung der Teilgeometrien. |
| ECS | `apps/server/src/ecs/HordeManager.ts`. Typ, Position, Leben, Ziel, Attack-Timer und Slotvergabe. |

Die visuellen Ressourcen entstehen aus bestehendem Projektcode. Es gibt keine separaten Modelle, Texturen oder externen Lizenzen für diesen Archetyp. Die Prüfsummen der drei Implementierungsdateien stammen aus dem Ausgangszustand.

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

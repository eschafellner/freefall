# Schabe

**Freigegebenes Basisdesign. Änderungen an Design, Animation, Grundverhalten oder Kampfwerten erfordern eine explizite Anforderung.**

> **Designrevision 2026-11-23b (explizite Anforderung „Alien-Käfervariante, Arbeiter des Schwarms"):** Die Schabe ist kein erdähnliches Insekt mehr, sondern ein außerirdischer Arbeiterkäfer. Sie hat eine geteilte Flügeldecke mit glühender Naht, einen gehörnten Halsschild, eine Grabschaufel über dem Kopf, Augengruppen, zwei Mandibelpaare, Sensorstiele mit Leuchtspitzen, Harzblasen und gedornte Beine mit Doppelkrallen. Die Farbfamilie wechselt von Erd- und Kupferbraun zu pflaumenschwarzem Chitin mit Ölfilm-Schimmer, fleischfarbenen Häuten und glutroten Adern wie bei den Schwarmnestern. Maßstab, Ausrichtung, Trefferkugel, Gelenkpunkte und Dreifußgang, Treffer-Aufhellung, Farbvariation und alle Gameplay-Werte bleiben unverändert. Die Prüfsummen unten gelten für diesen Stand. Die Aufnahmen des Zwischenstands liegen als `vorher-*.jpg` daneben, die des Stands vom 2026-11-22 in der Git-Historie.
>
> Zwischenstand 2026-11-23 („organischere Optik"): durchgehende gelaftete Hülle, Chitin- und Hautshader, Atmung und Fühlerbewegung, noch als erdähnliche Schabe in Erd- und Kupferbraun (3.170/677/180 Dreiecke).
>
> Revision 2026-11-22: gegliederte Beine mit Dreifußgang, Fühler, Kieferzangen und Panzerrippen (1.612/384/120 Dreiecke).

Die Schabe gehört zu **Der Schwarm** (`swarm`). Ihr Archetyp heißt `swarm.schabe`. Die ursprüngliche interne Netzwerk-ID `0` und der Alias `RUNNER_TYPE` bleiben gültig.

## Visuelle Baseline

Die Schabe ist der Arbeiter des Schwarms: ein gedrungener, niedrig gebauter Alien-Käfer. Ihre Leuchtadern haben dieselbe Glutfarbe wie die Schwarmnester, aus denen sie kommt. „Schabe" ist nur der Name. Alle drei Distanzstufen nutzen denselben Maßstab und dieselbe Ausrichtung (+Y oben, −Z vorwärts).

**Körper.** Kopf, Brust und Hinterleib bilden eine gelaftete Hülle (Catmull-Rom-Profil, abgeflachter Querschnitt). Am Bauch und hinter der Flügeldecke ist der Hinterleib in sechs Ringe mit fleischfarbenen Zwischenhäuten gegliedert. Darüber liegt eine gewölbte Flügeldecke. Sie hat eine Mittelfurche und einen ausgestellten Rand mit drei Dornen je Seite, hinten sitzt ein Dornenpaar. In der Furche verläuft eine glühende Naht. Der breite Halsschild trägt einen Mittelgrat mit drei Stacheln, eine Kerbe über dem Kopf, zwei nach vorn gebogene Hörner an den Ecken und zwei glimmende Schwarmmale. Unter dem Rand der Flügeldecke hängen je Seite zwei durchscheinende, geäderte Harzblasen.

**Kopf und Anhänge.** Über dem Kopf liegt eine Grabschaufel mit gezahnter Vorderkante. Je Seite sitzen drei leuchtende Augen in einer Gruppe. Dazu kommen zwei Mandibelpaare: ein äußeres sichelförmiges mit Innenzähnen und ein kurzes inneres. Zwei Sensorstiele mit glühenden Spitzen ersetzen die Fühler.

**Beine.** Gelenkpunkte und Dreifußgang sind unverändert (`SCHABE_LEGS`). Jedes Bein besteht aus einem muskulösen Femur mit Kniestachel, einer Tibia mit drei Zähnen (an den Vorderbeinen größere, nach vorn gerichtete Grabzähne), einem zweigliedrigen Tarsus und einer Doppelkralle. Linkes Vorder-, rechtes Mittel- und linkes Hinterbein bewegen sich gemeinsam, die anderen drei gegenphasig. Der Vertex-Shader verschiebt jeden Beinvertex abhängig von seinem Abstand zur Hüfte und hebt den Fuß in der Schwungphase an (`SCHABE_GAIT`: 0,11 m Schritt, 0,075 m Hub).

**Lebendige Bewegung.** Der Hinterleib samt Flügeldecke und Harzblasen atmet langsam (`SCHABE_IDLE`: Periode etwa 4 s, 3,5 % seitliche und 5 % vertikale Weitung). Die Sensorstiele schwingen zur Spitze hin zunehmend. Die Adern in Häuten und Harzblasen pulsieren mit dreifacher Atemfrequenz. Alles läuft per Instanz phasenversetzt und nur bei lebenden Schaben. Gefallene Schaben haben kein `gait`-Attribut, bleiben still, und ihre Adern glimmen nur schwach.

**Oberfläche.** Das Material liest pro Vertex Farbe, Rauheitsfaktor und Leuchten (`surface`) sowie `tissue` (Atmung, Sensorstiele, Hautanteil, Adern). Im Fragment-Shader entstehen aus 3D-Rauschen im Objektraum:

- fleckiges, pflaumenschwarzes Chitin mit Längsrillen auf der Flügeldecke und Punktgruben auf dem Halsschild
- Bump-Relief für Chitin, Rillen und faltige Haut, ab 9–26 m ausgeblendet
- ein Ölfilm-Schimmer von Violett über Türkis bis Gold am Rand harter Flächen
- warmes Durchscheinen der Häute
- glutrote, pulsierende Adern in Häuten und Harzblasen

Schimmer und Durchscheinen richten sich nach der Helligkeit am Fragment. Die Adern, Augen, Sensorspitzen, die Naht und die Schwarmmale leuchten selbst und bleiben auch nachts sichtbar.

| Stufe | Inhalt | Dreiecke |
| --- | --- | ---: |
| Nah | Hülle (27 Ringe × 16), Flügeldecke mit Naht, Randdornen und Heckdornen, Halsschild mit Grat, Stacheln und Hörnern, Grabschaufel, sechs Augen, zwei Mandibelpaare mit Zähnen, Sensorstiele, vier Harzblasen, Beine mit Kniestachel, Gelenkknoten, Tibiazähnen, Tarsus und Doppelkralle | 3.220 |
| Mittel | Hülle (15 Ringe × 10), Flügeldecke mit Naht, Halsschild mit Hörnern, Grabschaufel, zwei Augen, Mandibeln, Sensorstiele, zwei Harzblasen, Beine mit Femur, Tibia und Tarsus | 686 |
| Fern | Hülle (10 Ringe × 6) und gespreizte Stummelbeine ohne Gang | 180 |

Die Budgets im Test liegen bei 3.300/700/180. Die Nahstufe gilt nur bis `enemyNear` (High 31 m, Medium 21 m). Bei 1.000 Schaben in Boreal Relay liegt die große Mehrheit in der Mittel- und Fernstufe.

| Referenz | Stand 2026-11-23b (Alien-Käfer) | Zwischenstand 2026-11-23 |
| --- | --- | --- |
| Front, 15° | [front.jpg](schabe/front.jpg) | [vorher-front.jpg](schabe/vorher-front.jpg) |
| Seite, 95° | [seite.jpg](schabe/seite.jpg) | [vorher-seite.jpg](schabe/vorher-seite.jpg) |
| Rücken, 162° | [ruecken.jpg](schabe/ruecken.jpg) | [vorher-ruecken.jpg](schabe/vorher-ruecken.jpg) |

Die Aufnahmen zeigen eine einzelne Schabe (Instanz-ID 5, Detailstufe 0, neutrale Pose) in Chromium (SwiftShader). Kameraradius 2,6 m, Höhe 1,25 m. Die Vorschauszene hat Hemisphären- und Sonnenlicht, Schattenwurf und das Spiel-Tonemapping. Globale Änderungen an Beleuchtung oder Postprocessing sind möglich, solange Silhouette und Lesbarkeit erhalten bleiben.

| Ressource | Implementierung |
| --- | --- |
| `enemy.swarm.schabe.procedural` | `apps/client/src/rendering/EnemyVisualLOD.ts`: Material, Beinanimation, Atmung, Sensorstiele und Aderpuls im Vertex-Shader, Bewegungsdarstellung, LOD und Instancing. Der Renderer zeichnet nur Wire-Typ 0; `SwarmVisuals` verteilt die Kriegerkasten auf eigene Renderer. |
| Mesh-Baukasten | `apps/client/src/rendering/SwarmOrganism.ts`: `Organism`, Profilkurve und Farbhilfen, gemeinsam mit Jäger und Durchbruchskäfer. Die Auslagerung am 2026-11-23 lässt die Schabengeometrie byteweise unverändert. |
| Modell und Oberfläche | `apps/client/src/rendering/SchabeModel.ts`: gelaftete Hülle, Schalen (Flügeldecke, Halsschild, Grabschaufel), Anhänge, Vertexdaten, Gewebe-Shader (`applySchabeTissue`) und das gemeinsame GLSL-Rauschen (`ORGANIC_GLSL`, auch von Schwarmnestern und dem Verschleiß-Shader genutzt). |
| Oberflächenattribut | `apps/client/src/rendering/AgentMeshes.ts` (`applySurface`): Rauheitsfaktor und Eigenleuchten aus dem Vertexattribut. |
| ECS | `apps/server/src/ecs/HordeManager.ts`. Typ, Position, Leben, Ziel, Attack-Timer und Slotvergabe. |

`ModelParts.ts` baut die Schabe nicht mehr und steht deshalb nicht mehr in der Prüfsummenliste. Operator und Convicts nutzen die Datei weiter.

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

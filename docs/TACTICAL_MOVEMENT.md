# Taktische Bewegung in Freefall

| Eingabe | Wirkung |
| --- | --- |
| C | Zwischen Stehen und Ducken wechseln. Beim Sprinten in aufrechter Haltung rutschen, sobald das Anlauftempo erreicht und der Cooldown abgelaufen ist. |
| X | In die Richtung von WASD oder des linken Analogsticks hechten. Ohne Bewegung geht der Sprung bei Standardbalance in die aktuelle Vorwärtsrichtung des Operators. |
| Leertaste | Aus Ducken, Bauchlage oder Rückenlage aufrichten, sofern Platz frei ist. |
| WASD | Kamerarelativer Gang im Stand und in der Hocke. Am Boden bewegt sich der Operator entlang seiner Körperachsen. |
| F2 | Haltung, Übergang, Kollider, Animationszeit, Kamera, Eingabe und Prediction-Telemetrie anzeigen. |

Der kamerarelative Dive akzeptiert beliebige analoge Zwischenrichtungen. Die Landung richtet sich nach dem Körper-Yaw beim Start. Seitliche und vorwärts gerichtete Sprünge landen in Bauchlage, rückwärts gerichtete in Rückenlage. Der Spieler kann im Flug frei schauen. Bei Wand- oder Deckungskontakt stoppt der Vortrieb und der Operator landet auf der Anlaufseite. Er bleibt liegen, bis der Spieler aktiv aufsteht. Der Server prüft Ausführung, Geometrie und Treffer bei 30 Hz.

Die Startwerte stehen in [movement.json](../packages/shared/src/balance/data/movement.json). Die Registry validiert und hasht die Datei. Ihr validiertes Profil ist Bestandteil des unveränderlichen Missions-Snapshots. Client und Server sollten mit derselben Balance-Version gebaut werden, damit Prediction, Kamera und Kollider zusammenpassen.

| Einstellung | Standard |
| --- | ---: |
| Tempo geduckt / Bauchlage / Rückenlage | 55 % / 25 % / 20 % des Gehtempos |
| Blendzeit beim Ducken | 0,20 s |
| Hechtsprung | 5 m in 0,75 s, am Server auf 23 Ticks aufgerundet |
| Vorbereitung und Scheitelhöhe | 0,09 s (3 Ticks) / 0,62 m |
| Cooldown Hechtsprung ab Beginn | 1,20 s |
| Rutschen | 4,5 m in 0,60 s (18 Ticks) auf freier Bahn |
| Mindesttempo und Cooldown beim Rutschen | 7 m/s / 1,20 s ab Beginn |
| Abklingfaktor beim Rutschen | 0,80, Tempo sinkt linear |
| Aufstehen aus Bauchlage / Rückenlage | 0,80 s / 1,00 s |
| Körperdrehung in Bauchlage / Rückenlage | 5 / 4 rad/s |
| Kriechbeschleunigung | 8 m/s² bei einsetzender Bewegung und Richtungswechsel |
| Interpolation des Aufstehkolliders | Fortschritt hoch `getUpColliderExponent`, standardmäßig linear |

Für den Rutschstart Shift und eine Bewegungsrichtung halten und nach dem ersten ausreichend schnellen Sprintschritt C drücken. Die Bahn folgt der erreichten Bewegungsrichtung bis zum Ende oder bis zur ersten Blockade. Danach bleibt der Operator geduckt. Eine niedrige Decke kann das Aufstehen blockieren. Feuern ist erlaubt, die übrigen Aktionsfreigaben entsprechen denen beim Ducken.

Die fünf Rutschwerte unter `movement.json › slide` sind Operator-Werte. Der Resolver kann sie für spätere Rüstungen über `equipment` und die Stat-Schlüssel `operator.slide.*` anpassen. Waffenwechsel und Waffenmodifikatoren beeinflussen sie nicht.

Beim Kriechen begrenzt ein Sweep des gedrehten Körperprofils die Schritte entlang beider Weltachsen. Der akzeptierte Weg bestimmt die tatsächliche Geschwindigkeit. Der Drehschritt prüft die Zwischen- und Zielpose auf Freiraum. Beim Auslassen der Achsen stoppt die Bodengeschwindigkeit. Eine Gegenbewegung bei weiter gedrückter Eingabe bremst und beschleunigt über die eingestellte Änderungsrate. Die Kamera bleibt bei eingeschränkter Körperdrehung frei.

Die [taktische Schulterkamera](TACTICAL_CAMERA.md) blendet Blickhöhe und Kollisionsanker über die Haltungen. Mausbewegung steuert Blickrichtung und Neigung direkt. Unter **Steuerung und Kamera** lassen sich Mausempfindlichkeit, Haltungsreaktion, Glättung und Wackeln einstellen. Das räumliche Audio verwendet kurze synthetische Kleidung- und Landegeräusche aus bestätigten Zustandsübergängen, auch beim Rutschstart und beim Wechsel in die Hocke.

## Animationen und Asset-Integration

Das prozedurale Soldaten-Rig erzeugt die Posen aus der tatsächlichen Bewegung und den Serverphasen. Der Dive hat eine Gewichtsverlagerung bis zum Absprung, seitliche Rumpf- und Beinführung anhand der echten Richtung und eine kurze Landepose ab dem bestätigten Landetick. Beinbewegung, Waffenhaltung, Nachladen, Rückstoß und Stim-Anwendung laufen über das vorhandene IK- und Waffen-Rig. Beim Aufrichten aus Rückenlage dreht sich der Rumpf stärker zur Seite.

Der [Clip-Vertrag](../apps/client/src/rendering/characters/animation/ClipLibrary.ts) ordnet jede ID einer Ebene, Taktung und Fallback-Pose zu. Das [Asset-Inventar](ANIMATION_ASSET_INVENTORY.md) führt ausstehende Produktionsclips und verfügbare Posen auf. Details zu Playback und Retargeting stehen in der [Charakteranimation](CHARACTER_ANIMATION.md). Der [Higgsfield-Pilot](HIGGSFIELD_ASSET_PIPELINE.md) dokumentiert die geprüften Exportwege und Kosten. Das [Tactical Movement Audit](TACTICAL_MOVEMENT_AUDIT.md) dokumentiert den Stand von Rutschen, Klettern und Überspringen.

Weitere Details stehen in [Posture State Machine](POSTURE_STATE_MACHINE.md), [Directional Dive](DIRECTIONAL_DIVE.md), [Ground Combat](PRONE_SUPINE_COMBAT.md), [Character Collision](CHARACTER_COLLISION.md), [Input Rebinding](INPUT_REBINDING.md) und [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md).

Für Albatross-Start, Balloneinsatz, Sichern und den Beginn des Lifts muss der Operator mit Bodenkontakt stehen oder ducken. Während des Countdowns bleibt die Bewegung frei. Der Server prüft beim Pickup erneut Haltung, Lebenszustand und Reichweite. Testprotokoll und offene Freigaben stehen in der [Abnahme 7.3E](MILESTONE_7_3_FINAL_ACCEPTANCE.md).

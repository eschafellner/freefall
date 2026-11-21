# Taktische Kamera

Die Schulterkamera verwendet die gerenderte Position aus Prediction. Maus-Yaw und Pitch wirken im selben Frame. Beim Rückwärts- oder Seitwärts-Dive bleibt die Ausrichtung der Kamera an diese Eingaben gebunden. Der Kameracontroller verwendet die autoritative Flughöhe und die Blickhöhe des aktuellen Kolliders. [Kamera und Smoothness 7.1](CAMERA_SYSTEM.md)

| Haltung | Kameraführung |
| --- | --- |
| Stehen | Schulterversatz 0,86 m, Abstand 4,8 m, Sichtfeld 62°. Zielmodus schiebt die Kamera bis zu 0,98 m vor und verengt das Sichtfeld auf 48°. |
| Ducken | Die Blickhöhe sinkt geglättet. Der Kollisionsanker rückt teilweise zur Körpermitte, damit die Kamera unter Überhängen stabil bleibt. |
| Rutschen und Dive | Der Kollisionsanker bewegt sich zur Mitte. Der Dive folgt der gerenderten Bahn und bleibt ohne Kamerarolle. |
| Bauch- und Rückenlage | Die jeweilige Blickhöhe und ein körpernaher Anker halten die Sicht tief. Das Fadenkreuz wird aus den zulässigen Zielwinkeln und der bestehenden Mündungsprüfung projiziert. |
| Aufstehen | Blickhöhe und Anker folgen dem Fortschritt des Aufstehkolliders. Bei Abbruch fällt der Sollwert wieder auf die gültige Bodenhaltung. |

Die Kollisionsprüfung verwendet dieselbe geglättete Blickhöhe für den Strahl und den Anker. Sie erfasst den Weg vom Operator zum Schulteranker und von dort zur gewünschten Kameraposition, einschließlich des aktuellen Wackelversatzes. Auf prozeduralen Welten nutzt sie die vorhandenen lokalen Hindernisgruppen und den Terrain-Höhenschnitt. Die Box-Polster betragen horizontal 0,15 m und vertikal 0,08 m. Der Terrainabstand beträgt 0,19 m. Die Kamera zieht bei Kontakt sofort ein und fährt mit einer Dämpfung von 7/s aus. In sehr enger Geometrie blendet die Darstellung den eigenen Körper aus.

Beim Eintritt in die Feld-, Carrier- oder Transportkamera startet die Folge mit der aktuellen Haltung. Im Feld läuft der Blick weiter direkt mit der Maus. Beim Zielen dämpft die Kamera ausschließlich FOV und Blickhöhe, und setzt Positionsimpulse aus. Das Fadenkreuz verwendet das projizierte Ende des bestehenden Ziel- und Mündungsstrahls. Auf prozeduralem Terrain gilt das auch im Stand. Eine sehr nahe oder außerhalb der sichtbaren Fläche liegende Schusslinie erhält ein Sperrsymbol. Berechnet wird die geometrische Zielhilfe ohne Suche nach Gegnern oder Streuungsprognose.

## Einstellungen

| Einstellung | Wertebereich |
| --- | ---: |
| Wackeln | 0–100 % |
| Glättung für Höhe, Aim und Sprint | 50–200 % |
| Reaktion auf Haltungswechsel | 50–200 % |
| Mausempfindlichkeit | 25–300 % |
| Reduzierte Bewegung | Sprintzoom, FOV-Impuls und Positionswackeln aus. Die Systempräferenz gilt als Voreinstellung. |

Die Höhen-, Zoom- und Freigabeübergänge verwenden exponentielle, framerate-unabhängige Glättung. Die horizontale Standardfolge verwendet die kontinuierliche 7.1-Renderposition direkt. F2 zeigt Kameraposition, Blickziel, Kollisionsrückzug und mittlere CPU-Kosten für Kamerafolge und Reticle. [Testergebnisse 7.8D](MILESTONE_7_8D_PLAYTEST.md)

7.3E hat die Kameratests bei engen Überhängen, beim Rückwärts-Dive, bei variabler Framezeit und mit reduzierter Bewegung erneut ausgeführt. Die reproduzierbare 60-/144-Hz-Messung der aufrechten Bewegung lief mit LAN, WAN und Jitter. Für die verbleibende Sichtprüfung die Kamera beim Wechsel in Bodenlage parallel an einer Wand führen, die Rückwärts-Dive-Blickrichtung halten und den sanften Rückweg aus vollem Kollisionsrückzug beobachten. [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md#73e--integration-und-wiederholung)

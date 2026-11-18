# Charakteranimation

`CharacterAnimation` löst drei Zustände unabhängig auf. Der Controller bekommt Renderposition, Blickwinkel, Sprint und Aim, HP, Lebensnummer sowie den serverseitigen Reload-Endtick. Vorzeichen und Tempo der gerenderten Bewegung werden im lokalen Blickkoordinatensystem ausgewertet. Zustandswechsel verändern nur Posen.

| Ebene | Zustände und Übergänge |
| --- | --- |
| Locomotion | Idle, Walk, Run, Sprint, Strafe Left, Strafe Right, Backward. Die Geschwindigkeit wird vor der Zustandswahl aus geglätteten Bewegungsvektoren ermittelt, die Schrittphase bleibt beim Wechsel kontinuierlich. Das laufende Standardtempo der Arena bleibt erhalten. Walk greift bei niedriger Rendergeschwindigkeit. |
| Combat | Ready, Aim, Fire, Reload. Der serverseitige Schuss löst einen kurzen Impuls aus. Bei aktivem Aim setzt die Pose anschließend den Zielmodus fort. Reload hat Vorrang vor Fire. |
| Reaction | None, Hit, Death. Sinkende HP lösen einen Nachgiebigkeitsimpuls aus. Bei null HP fällt der Charakter, bis die nächste Lebensnummer eintrifft. |

Der Fallback besitzt artikulierte Knie und Ellenbogen. Eine begrenzte Zweigelenk-Lösung positioniert die Hände am Griff, am Handschutz und beim Nachladen am Magazin. Der obere Körper richtet sich teilweise nach dem Blickwinkel aus, der Lauf richtet sich im Aim-Modus auf einen Punkt des bestehenden Zielstrahls. Die Bewegung der Beine läuft unabhängig weiter.

## Importierte Clips

`CharacterClipPlayer` verwendet einen `AnimationMixer` pro sichtbarem Rig-Slot. Zustand und Clipname lassen sich in der Registry zuordnen. Die Basisbewegung blendet über 150 ms. Fehlende Richtungsclips verwenden Walk oder Run. Optionale Aim-, Fire-, Reload-, Hit- und Death-Clips dienen als passende Vollkörper-Overrides. Aim allein verdrängt die Bewegungsclips nur im Stand. Bei bewegter Figur bleibt die lokale Waffenanpassung aktiv. Bei fehlendem Reload-Clip bleiben Magazin- und Waffenbewegung sichtbar. Ohne Death-Clip fällt das Modell als Ganzes.

Neue Clips müssen In-Place exportiert werden. Für den unbenannten Mixer-Root und einen optional benannten `motionRoot` fixiert der Import horizontale Translation und entfernt Rotationsspuren. Ein Beckenknochen mit beabsichtigter Drehung und Seitbewegung gehört unter einen separaten Root-Knoten. Animationspakete brauchen dieselben Bone-Namen und dieselbe Bind-Pose. Reload läuft über normierten Fortschritt vom Server und passt die Abspielposition an die Clipdauer an.

Für geskinntes Rig, Fingerkontakte und vollständiges Layering werden abgenommene Oberkörperclips benötigt. Der GLB-Pfad enthält derzeit einen Waffen-Pivot und Vollkörperübergänge. Additive Clip-Layer und IK auf beliebigen importierten Skeletten stehen noch aus. Die Fallback-Gelenke lösen nur die bekannten prozeduralen Gliedmaßen.

## Multiplayer und Kamera

`input` übernimmt optionale Bool-Felder für Aim und Reload. Bestehende `players`-Nachrichten tragen Pitch, Sprint/Aim-Bits, Munition und `reloadUntil`. Andere Spieler leiten das Tempo aus dem gepufferten Snapshot-Verlauf ab. HP und Leben bestimmen Trefferreaktion und Tod. Zusätzliche Animationsnachrichten und Knochenmatrizen werden nicht gesendet. Der Schussimpuls kommt über das bestehende autoritative `shot`-Ereignis und bleibt getrennt vom Positionspuffer.

Die Schulterkamera schiebt sich beim Zielen entlang der bestehenden Zielachse näher heran und blendet das Sichtfeld von 62° auf 48°. Sprint weitet das Sichtfeld leicht. Der Rückstoß verändert kurz das Sichtfeld um höchstens 0,63°. Schussrichtung und Fadenkreuz bleiben auf der bestehenden Zielachse. Bodennähe ist wie in der Ausgangskamera begrenzt. Die flache Testarena verwendet dabei dieselben Sicht- und Kollisionsannahmen wie zuvor. Für eine variable Schulterseite oder Kamerakollision in späteren Leveln brauchen Client und Server ein gemeinsames Zielkonzept. [Missionsarchitektur](ROADMAP_MISSION_GAMEPLAY.md)

## Milestone 6

Die gefilterte Geschwindigkeit bestimmt Standzeit und Schrittweite. Die lineare Standphase führt den Fuß mit der zurückgelegten Strecke zurück. Der Schwungfuß hebt ab, während das Becken seitlich Gewicht verlagert. Drehschritte reagieren auf die geglättete Körperdrehung. Beschleunigung und Bremsen kippen den Oberkörper. Stopps und Tod beenden den Schrittzyklus. Die starre Segmentgeometrie und die Reichweite der Zweiknochenglieder begrenzen die Bodenhaftung.

Dieselbe Pose verarbeitet lokale und interpolierte Figuren. Das aktive Waffenmodell liefert seine eigenen Hand-, Magazin- und Mündungssockets. Wechsel, Wurf und Injektion folgen der replizierten Start- und Endzeit. Nachladen verwendet die Dauer der aktiven Waffe. Fehlende Produktionsclips werden durch diesen prozeduralen Pfad überbrückt.

Die Vergleichsaufnahme verwendet beide Controller mit derselben Folge von Positionen, Zieldrehungen, Reload-Zeiten und derselben Kamera. Die beiden Hälften zeigen Ruhe, Anlaufen, Sprint, Abbremsen, seitliches Zielen sowie Nachladen im Stand und in Bewegung. Bei Anlaufen und Sprint sind die stärkere Kniebeugung und größere Schrittlänge sichtbar. Die starren Hände und das begrenzte Abrollen der Stiefel bleiben erkennbar. [Bewegungsvergleich, 9,6 Sekunden](character/bewegungsvergleich-ms6.mp4)

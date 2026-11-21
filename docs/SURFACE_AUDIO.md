# Oberflächen- und Bewegungsaudio

Die Materialzuordnung liest dieselben Gewichte aus `PlanetSurfaces.surfaceSample`, die Freefall für das sichtbare Gelände verwendet. Sie nimmt die dominante Schicht anhand von Terrainhöhe, -neigung und Weltseed. Schneeschichten verwenden zwei Klanggruppen für Schnee und Eis. Sand bleibt von verdichtetem Boden und Kies unterscheidbar. Das grüne Profil verwendet Gras, Erde und Fels, der Wald primär Blattstreu und Fels. Legacy-Terrain und der Träger nutzen die harte Materialfamilie.

`MovementAudio` sammelt nur plausible, gerenderte Bewegung je Operator und Leben. Walk, Sprint, Crouch und Crawl folgen unterschiedlichen Wegintervallen und Pegeln. Dive-Start, Slide und Get-Up nehmen den bestehenden Posture-Wechsel als Ereignis. Dive-Landungen werden einmal pro bestätigtem `landedDive` ausgelöst und verwenden eine tiefer und lauter abgespielte Materialvariante. Prone und Supine nutzen die tatsächliche Bewegung auf dem Boden. Vier Takes und kleine Pitch-/Pegelvariation vermeiden unmittelbare Wiederholung. Sprünge durch Spawn, alte Landungen beim Reconnect und Stillstand erzeugen keine Schrittserie.

Der Operator hört das eigene Foley direkt. Remote-Foley nutzt die interpolierte Position und den 3D-Panner. Die Bewegung bleibt kosmetisch.

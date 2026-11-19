# Bauch- und Rückenlage im Kampf

| Aktion | Verhalten unter Standardbalance |
| --- | --- |
| Zielen und Schießen | Primär- und Sekundärwaffe sind verfügbar. |
| Waffenwechsel und taktisches Nachladen | Vorhandene Waffen- und Magazintransaktionen bleiben aktiv. |
| Heilstim | Erlaubt. Die Anwendung verbraucht erst bei erfolgreichem Abschluss eine Ladung. |
| Bodenbewegung | Kamerarelativ mit 25 % Gehtempo in Bauchlage und 20 % in Rückenlage. |
| Granate, Nahkampf und Sprint | Gesperrt. Abgelehnte Requests ändern weder Ressourcen noch den Nahkampf-Cooldown. |
| Aufstehen | Eigene Aktion. Während Flug und Aufrichten ist das Waffenhandling gesperrt. |

Vorhandene Stims gelten weiterhin pro Operator. Der Standardvorrat umfasst fünf Anwendungen. Das Nachschubsystem und die Interrupt-Regeln bleiben aktiv. Sprint-Input in einer Haltung ohne Sprintfähigkeit unterbricht einen Stim nicht.

Der Körper dreht sich begrenzt in Richtung des Blicks und prüft den Platz für die Drehung. Die Waffe hat einen körperrelativen Schwenkbereich und eine begrenzte Absenkung. In Bauchlage liegt die Mündung vor dem Oberkörper. In Rückenlage liegt sie höher und näher am Oberkörper. Die Kamera bleibt frei beweglich. Insbesondere bei einem schnellen Blickwechsel nahe einer Wand kann die Waffe der Kamerarichtung erst folgen, wenn der Körper genug Platz zum Nachdrehen hat.

Der Server übernimmt Streuung und Rückstoß aus der vorhandenen Waffenlogik. Der Schulterstrahl bestimmt den Zielpunkt. Von der Haltungsmündung prüft ein eigener Strahl Welt, Boden, Gegner und Verbündete. Deckt die Geometrie die Mündung ab oder würde die Schusslinie durch den eigenen Rumpf oder die Beine laufen, endet der Strahl am Ursprung. Die gerenderte Waffe nutzt dieselben Mündungsparameter und das vorhandene IK-Rig. Die autoritativen Schussspuren beginnen am vom Server bestätigten Ursprung. Das prozedurale Waffenposing kann in engen Räumen, bei raschem Umschwenken und im Übergang von Nachladen zu Feuern sichtbar nachlaufen.

Ein gegnerischer Angriff muss Reichweite, vertikale Überlappung und freie Sicht erfüllen. Die Schabe kann Operatoren auch am Boden angreifen. Der Art- und Archetypenstand der Schabe ist durch den vorhandenen Regressionstest abgedeckt.

# Bauch- und Rückenlage im Kampf

Ein gerichteter Hechtsprung endet abhängig von der beim Absprung gespeicherten Körperausrichtung in `PRONE` oder `SUPINE`. Am Boden bleibt die Figur in ihrer Haltung, bis Leertaste einen gültigen Aufstehvorgang startet. Treffer verursachen auch während des Aufstehens regulären Schaden.

| Aktion | Verhalten unter Standardbalance |
| --- | --- |
| Zielen und Schießen | Primär- und Sekundärwaffe sind verfügbar. |
| Waffenwechsel und taktisches Nachladen | Vorhandene Waffen- und Magazintransaktionen bleiben aktiv. |
| Heilstim | Erlaubt. Die Anwendung verbraucht erst bei erfolgreichem Abschluss eine Ladung. |
| Bodenbewegung | Körperrelativ vorwärts, rückwärts und seitlich. Maximal 25 % Gehtempo in Bauchlage und 20 % in Rückenlage. |
| Granate, Nahkampf, Sprint und Hechtsprung | Die Freigabematrix weist diese Aktionen vor Ressourcenverbrauch, Cooldown und Aktionsstart ab. |
| Aufstehen | Eigene Aktion. Während Flug und Aufrichten ist das Waffenhandling gesperrt. |

Die Primärwaffe verwendet 45 Schuss und acht Reservemagazine, die Sekundärwaffe vier Reservemagazine. Beide nutzen ihre bestehenden Werte für Schaden, Rückstoß, Streuung und Nachladedauer. Beim Einsetzen wird genau ein Reservemagazin abgezogen. Restpatronen im alten Magazin gehen verloren. Friendly Fire läuft über denselben serverseitigen Schadenspfad wie im Stand.

Heilstims heilen über den bestehenden Ausrüstungstimer. Der Standardvorrat umfasst fünf Anwendungen pro Operator und lässt sich per Albatross-Nachschub auffüllen. Eine Anwendung heilt und verbraucht einmalig am Abschluss. Abgewiesene Wiederholungen sowie blockierte Sprint- und Nahkampfbefehle lassen die laufende Anwendung weiterlaufen. Der Operator bleibt nach der Heilung liegen.

Waffen- und Ausrüstungsaktionen behalten ihren Fortschritt bei Haltungswechseln, falls die Zielhaltung sie erlaubt. Ein Wechsel nach `DIVING` oder `GETTING_UP` bricht sie ab. Beim Nachladen bleibt die Munition vor dem Einsetzen erhalten. Nach dem Einsetzen bleibt das neue Magazin geladen. Ein vor dem Abschluss unterbrochener Stim behält seine Ladung.

Der Körper dreht sich in Richtung des Blicks, sofern für die Drehung Platz ist. Die Waffe schwenkt horizontal bis 60° zu jeder Seite. Der vertikale Standardbereich beträgt −0,48 bis +0,48 rad in Bauchlage und −0,27 bis +0,55 rad in Rückenlage. In Bauchlage liegt die Mündung vor dem Oberkörper. In Rückenlage liegt sie höher und näher am Oberkörper. Die Maus und der rechte Analogstick bewegen die Kamera weiter direkt. Die Ansicht verwendet in beiden Bodenhaltungen dieselbe Blickrichtung. Das Fadenkreuz folgt der projektierten Schusslinie zur Welt und zeigt eine vollständig blockierte Mündung farblich an. Liegt der Zielpunkt außerhalb des Bildes, blendet das Fadenkreuz aus.

Der Server berechnet die Mündung aus Position und Haltung. Der Schulterstrahl bestimmt den Zielpunkt. Ein zweiter Strahl startet an der tieferen Mündung und prüft Welt, Boden, Gegner und Verbündete. Bei blockierter Mündung oder einer Schusslinie durch den eigenen Körper endet der Strahl am Ursprung. Die Client-Projektion berücksichtigt lokale Haltung, Rückstoß und Weltgeometrie. Serverseitige Streuung und die Zielauflösung auf nahe Figuren können die tatsächliche Einschlagstelle verschieben. Die autoritativen Schussspuren beginnen am vom Server bestätigten Ursprung. Das prozedurale Waffenposing kann in engen Räumen, bei raschem Umschwenken und beim Übergang von Nachladen zu Feuern sichtbar nachlaufen.

Die Schabe behält liegende Operatoren als gültige Ziele. Ihre Angriffe brauchen Reichweite, Höhenüberlappung und eine freie Linie zu derselben Kopf-, Torso- oder Beinzone, die ein Schuss treffen kann. Das Schabe-Modell und sein Rig sind durch den vorhandenen Baseline-Test abgedeckt. F2 zeigt Körperwinkel, Kriechtempo, Waffen-/Ausrüstungsaktion, Aufstehfortschritt und Trefferzonen.

Der 7.3E-Vier-Socket-Test prüft vier gleichzeitige Schüsse und Reloads in Bodenhaltung. In den virtuellen Netzprofilen kosten vier Reload-Befehle genau vier Ersatzmagazine und vier Stim-Befehle genau vier Ladungen. Für ein anstehendes Sichern zur Extraktion muss der Operator stehen oder ducken. [Multiplayer-Stresstest](MULTIPLAYER_STRESS_TEST.md) · [Tactical Movement](TACTICAL_MOVEMENT.md)

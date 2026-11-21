# Operator-Treffer und Eigenbeschuss

Der Server speichert eine Operator-Bestätigung erst nach positivem Rückgabewert von `damagePlayer`. Geschützte Verbündete blockieren weiterhin den Strahl. Der Waffenschütze erhält beim beschädigten Verbündeten einen blauen Ally-Marker, der Getroffene seinen bestehenden HP-Impuls und den aus dem Serverereignis abgeleiteten Eigenbeschuss-Hinweis. Die Autorität über reduzierte Team-Schäden bleibt beim bestehenden `DamagePolicy`-Pfad.

Ein Operator-Impact trägt das Ziel-Leben für den Abgleich mit Snapshots. Weitere Operatoren sehen die externe Treffergruppe und können sie im Audio-Radius hören. Der Schützenmarker ist lokal. Der Team-Hinweis identifiziert den Angreifer beim getroffenen Operator.

7.8D ergänzt die horizontale Richtung in den vorhandenen bestätigten Ereignissen. Gegner- und Nahkampftreffer verwenden den Versatz vom Ziel zum Angreifer, Explosionen den Versatz zum Detonationspunkt und Kugeln die umgekehrte Richtung des validierten Schussstrahls. Die Richtung stammt vom Trefferzeitpunkt. Der Client filtert nach Ziel, Leben, Ereignis-ID und Tick. Abzüglich Kamerayaw ergibt der Weltwinkel den HUD-Winkel. Der Winkel folgt beim Drehen der Kamera, die Richtung bleibt in der Welt verankert.

Maximal drei Pfeile leben je 625 ms. Nahe Richtungen verwenden denselben Pfeil. Fehlende oder horizontal uneindeutige Richtungsdaten ergeben HP-Anzeige und Schadensreaktion ohne Pfeil. Eigenexplosionen können einen Richtungspfeil auslösen. Der Hinweis „Getroffen von OP“ gilt für andere Operatoren. Kamerawackeln wird im Zielmodus ausgesetzt. Reduzierte Bewegung deaktiviert zudem die Treffer-Vignette.

- [Gemeinsame Bestätigungsregeln](SERVER_VALIDATED_HIT_FEEDBACK.md)

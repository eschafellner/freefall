# Zielgraph und Laufzeit

Der Plan enthält stabile Ziel-IDs, die konkreten Definitionen, Location-Referenzen sowie Pflichtstatus und Abhängigkeiten. Der Validator prüft Einzigartigkeit, fehlende oder doppelte Voraussetzungen, Pflichtabhängigkeiten von optionalen Zielen und Zyklen. Er gleicht Zieltyp, Position, Verteidigungsdauer und Schrittfolge mit Profil und Vorlage ab.

- `locked` bis alle eingetragenen Voraussetzungen erfüllt sind.
- `available` nach Freischaltung. Der Server prüft bei der Interaktion Phase, Lebensstatus, Position, Bodenberührung für generierte Relais und Interaktionsrate.
- `defending` nach Beginn der zeitgebundenen Verbindung. Die Zeit des generierten Ziels pausiert bei leerer Zone. Ein anderer lebender, verbundener Operator kann die Verbindung innerhalb des Radius weiterhalten.
- `complete` nach gültiger Aktivierung, vollendeter Verteidigung oder bestätigter Zerstörung des Zielnests.
- `failed` für offene Hauptziele bei Einsatzabbruch, `cancelled` für offene optionale Ziele am Einsatzende.

Wenn ein gebundenes Zielnest vor der Freischaltung zerstört wurde, merkt sich die Laufzeit das Ereignis. Die Anrechnung erfolgt erst nach erfüllten Abhängigkeiten. Mehrfachinteraktionen und wiederholte Nestereignisse verbrauchen keine zusätzlichen Ziele. Fehlendes Pflichtnest beim Deployment führt zu einem terminalen Ergebnis. Ein Teamwipe beendet ebenfalls den Einsatz. Ende, Belohnung und die erste Extraktionsfreigabe werden je Einsatz einmal erzeugt. Eine abgebrochene Albatross-Extraktion darf bei erfüllten Hauptzielen erneut angefordert werden.

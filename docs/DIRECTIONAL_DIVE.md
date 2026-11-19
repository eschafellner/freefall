# Gerichteter Hechtsprung

Die Eingabe erfasst Vorwärts- und Seitwärtsachse sowie Kamera-Yaw bei Betätigung. Der Server akzeptiert endliche Achsenwerte von −1 bis +1. Beim Start normalisiert er beide Achsen gemeinsam und transformiert sie in die XZ-Ebene der Welt. Jeder Winkel ist möglich. Die Auswahl des Animationsclips verwendet bei Bedarf Richtungsbereiche und beeinflusst den Bewegungsvektor nicht.

Der normalisierte Vorwärtsanteil entspricht dem Skalarprodukt mit der anfänglichen Blickrichtung. Werte unter −0,000001 ergeben Rückenlage. Seitwärts und der Vorwärtsbereich führen in Bauchlage. Die kleine Toleranz schützt die Grenze bei exakt seitlichen Eingaben. Die Landung und die Körperausrichtung stehen ab dem Start fest. Die Kamera kann währenddessen frei gedreht werden.

Der Server verlangt einen lebenden, bewegungsberechtigten Operator im Stand oder in der Hocke, freien Platz für Flug und Landung sowie einen abgeschlossenen Cooldown. `movement.noDirection` steuert, ob eine Neutraleingabe einen Vorwärtssprung erzeugt oder abgelehnt wird.

Nach der Vorbereitung folgt eine parabelförmige Höhenkurve mit 0,62 m Scheitelhöhe. Die horizontale Kurve startet mit höherem Tempo und nimmt bis zur Landung ab. Die Summe der horizontalen Schritte erreicht ohne Hindernis exakt die konfigurierte Gesamtdistanz. Bei Kontakt stoppt der horizontale Vortrieb und der Operator beendet die Höhenkurve auf der Anlaufseite. Die Sweep-Prüfung reserviert die Landefläche entlang des Weges und behandelt niedrige Deckung als horizontalen Blocker. Der Hechtsprung kann dadurch nicht als Sprung über Deckung verwendet werden.

Schaden nutzt die normale Treffer-, Friendly-Fire- und Schutzlogik. Der Hechtsprung fügt weder Schadensreduktion noch eine Schutzzeit hinzu.

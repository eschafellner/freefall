# Schabentreffer

Der Server speichert den Weltkontakt am bestehenden Trefferkörper und verwendet die Normale der Trefferkugel. Der Client zeichnet chitinfarbene, kurzlebige externe Partikel und spielt den räumlichen Trefferklang an diesem Kontakt. Hitscan verwendet denselben Endpunkt für Tracer und Impact. Die Position wird auch beim interpolierten Gegner aus der autoritativen Koordinate abgeleitet. Bei schneller Bewegung können Serverkontakt und verzögertes sichtbares Modell kurz auseinanderliegen.

Normale Kugeltreffer verwenden keine Änderung der Schabenfarbe. Die bestehende Todesdarstellung greift beim atomar bestätigten Despawn auf die bisherige interpolierte Pose zurück. Das Modell, seine Ressourcen und die hinterlegten Schaben-Quellprüfsummen bleiben identisch. Nahkampf und Gegnerangriffe bleiben bei ihren vorhandenen Reaktionen.

- [Serverresultat und Kill-Marker](SERVER_VALIDATED_HIT_FEEDBACK.md)

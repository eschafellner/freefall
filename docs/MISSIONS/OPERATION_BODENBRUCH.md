# Operation Bodenbruch

Registrierte ID `mission.operation_bodenbruch`. Ein abgelegener Außenposten hat den Funkkontakt zur Flotte verloren. Der Trupp stellt beide Relais wieder her. An der Konsole im Skyfall Carrier wählt der Host einen der sieben Schwierigkeitsgrade. Der Raumcode gilt für bis zu vier Spieler.

| Abschnitt | Ablauf |
| --- | --- |
| Deployment | Boarding und synchronisierter Fallflug. Der Albatross 02 setzt an der südwestlichen Landezone auf und vier Convicts sichern den Umkreis. |
| Alpha | Am markierten Terminal mit **E** aktivieren. Der Verbindungsaufbau dauert acht Sekunden und erhöht den Schwarmdruck. Die Übertragung läuft nach Aktivierung selbstständig. |
| Bravo | Nach Freigabe das zweite Terminal im Osten mit **E** aktivieren. Die Extraktion wird freigeschaltet. |
| Extraktion | Der Trupp kann zum Albatross zurückkehren oder den Extraktionsballon einsetzen. |

Das optionale Nebenziel verlangt ein zerstörtes Nest. Ein Nest ist am Rand der westlichen Senke vorplatziert. Weitere entstehen nur durch das Bedrohungssystem. Ein vollständiger Truppausfall vor den Hauptzielen führt zum Fehlschlag. Nach den Hauptzielen bleiben die Basis-EP erhalten. Ausgeschaltete Spieler bleiben bis zum Ergebnis außer Gefecht.

Die zusammenhängende 420 × 420 m große Welt führt von der Landezone über Versorgungswege, Felsen, die Relaisanlagen und ein offenes Becken zum nördlichen Vorfeld. Felsformationen und militärische Deckung haben sichtbare Höhen und gemeinsame Kollisionsdaten. Der begehbare Boden ist flach. Albatross und Rettungsjäger verwenden austauschbare prozedurale Modelle.

Das Live-HUD zeigt Zone, Distanz, Missionsfortschritt und verbleibende Zeit. Während eines Rufs markiert ein Balken den Alarmgeber. Drei Sekunden Vorwarnzeit geben dem Trupp Gelegenheit, ihn auszuschalten. Die Bewegung außerhalb der Landezone, Deckung und Waffenlärm bestimmen, wie viele Patrouillen reagieren. [Missionssystem](../MISSION_SYSTEM.md)

## Nächster Meilenstein

- Spieltests mit vollständigen Vierertrupps auf allen Stufen. Sichtweite, Startdichte, Alarmhäufigkeit und Extraktionsdruck anhand realer Routen abstimmen.
- Produktionsmodelle, Sprecher-/Triebwerksaudio und Sitzanimationen integrieren.
- Beobachteransicht, Rückkehr nach Browser-Neuladen und Rettung ausgeschalteter Truppmitglieder festlegen. Ergebnisse als Grundlage für die spätere Progression versionieren.
- Netzlast bei WAN-Latenz und mehrere parallele Rooms messen. Distanzbasierte Relevanzfilter vorbereiten, falls der volle Hordenframe den Durchsatz begrenzt.

# Deployment

Der Host legt die Mission an der Konsole fest und gibt das Boarding frei. Alle aktuell verbundenen Operator müssen innerhalb der Kabinenfläche stehen und mit **E** ihre Bereitschaft bestätigen. Sobald das Boarding vollständig ist, startet ein Drei-Sekunden-Countdown. Verlassen der Kabine, Widerruf oder neu beigetretene, noch nicht bereite Operator werden pro Tick berücksichtigt.

Die Missionszustandsmaschine bleibt während des Fluges in `DEPLOYMENT`. Die Darstellung liest einen zweiten Wert für die aktuelle **Flugphase** und deren Start- und Endtick.

| Flugphase | Darstellung und Gameplay |
| --- | --- |
| `DOCKED`, `BOARDING` | Offene Rampe. Operator können in die Kabine laufen. |
| `LOCKED` | Türschlag, Verriegelung, Warnlicht und Sirene. Die Teilnehmerliste wird eingefroren. |
| `DROPPING` | Außenkamera, Ablösung und simulierte Fallbewegung. |
| `ATMOSPHERIC_ENTRY` | Farbwechsel, Hitze, Partikel und Turbulenz. |
| `BRAKING` | Bremsschub aus vier Düsen. |
| `TOUCHDOWN` | Szenenwechsel, Schutzfenster, erster Bodenkontakt, Staub und Rampenöffnung. |
| `DEPLOYED` | Convicts beginnen den Ausstieg. Die Feldsimulation und die Hauptziele werden freigegeben. |

`AlbatrossTouchdown` wird je Einsatz einmal ausgelöst. Der Director setzt lokale Alarmhitze und sendet ein Geräusch an den bestehenden PatrolManager. Spawnabstand, Routen, Missionsbudgets und das sechssekündige Schutzfenster ab Touchdown begrenzen den Erstkontakt. Die Wahrnehmung am Landeplatz öffnet nach dem Schutzfenster. Start- und Endticks der Sequenz sind serverautoritativ. Die Fallbewegung, Kameras und Web-Audio-Synthese laufen im Client.

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

## Drop-Sequenz und Aufschlag

Die Flugphasen dauern zusammen 606 Ticks, also rund 20 Sekunden statt bisher 8,3 Sekunden. Der Server bestimmt Beginn und Ende jeder Phase. `DropChoreography.ts` leitet daraus im Client Höhe, Neigung, Erschütterung, Hitze, Schub, Fahrwerk und Federung ab. Lander, Kamera und Hintergrund lesen dieselbe Pose.

| Phase | Ticks | Darstellung |
| --- | ---: | --- |
| `LOCKED` | 75 | Rampe schließt, Sirene, drei Andockklammern lösen nacheinander, die Kabine beginnt zu vibrieren. |
| `DROPPING` | 105 | Außenkamera über dem Lander. Der Carrier-Rumpf entfernt sich nach oben, der Planet wächst, das Fahrwerk fährt ein. |
| `ATMOSPHERIC_ENTRY` | 180 | Kamera unter der Bugkante. Der Hitzeschild glüht, ein zweischichtiger Plasmamantel liegt vor dem Bauch, der Himmel wechselt von Schwarz über Plasmarot in Dunst, am Ende rauschen Wolkendecken vorbei. |
| `BRAKING` | 150 | Bremsschub ab 140 m über dem Landeplatz mit abklingender Sinkrate bis zu einem kurzen Schweben auf 4 m. Das Fahrwerk fährt aus, die Triebwerke drosseln, der Lander fällt auf sein Fahrwerk. Abwind wirbelt ab 30 m Staub auf. |
| `TOUCHDOWN` | 96 | Der Aufschlag liegt exakt auf dem Phasenwechsel und damit auf `AlbatrossTouchdown`. Die Federung taucht 0,42 m ein und schwingt gedämpft aus, die Füße bleiben am Boden. Es folgen ein Kamerastoß, ein Druckwellenring, geworfene Trümmer, eine dichte Staubwolke und danach die Rampe. |

Kamera-Erschütterung und Federung folgen der Einstellung „Wackeln“. Reduzierte Bewegung schaltet Erschütterung, Ring und Trümmer ab. Die Flugeffekte sind gefilterte Rausch- und Oszillatorschichten (`FlightAudio.ts`): Klammern, Fallrumpeln, Eintrittsdröhnen, Bremsschub und der Aufschlag mit Abschalten der Triebwerke. Dazu kommt das bestehende `hull-impact`-Sample. Spawnabstand und Schutzfenster ab Touchdown sind unverändert.

## Musik

Sobald alle Operatoren an Bord ihre Bereitschaft gemeldet haben und der Boarding-Countdown läuft, beginnt „L'Arrée Triomphale“. Das Stück begleitet den Drop. 15 Sekunden nach dem Aufschlag des Albatross blendet es über 6 Sekunden aus. Bricht der Countdown ab, blendet es ebenfalls aus. Wer später beitritt oder sich neu verbindet, hört das Stück an der passenden Stelle. `Music.ts` streamt die Datei über ein Media-Element in den Musikbus, statt sie als PCM zu dekodieren. Die Lautstärke regelt der neue Kanal **Musik** in den Audio-Einstellungen. [Quellen](music-sources.json) · [Ballonextraktion](EXTRACTION_BALLOON.md) · [Ablauf](visual-style/drop-sequenz.jpg)

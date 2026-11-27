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

**Derzeit stumm** (`DEPLOYMENT_SOUND` in `MissionAudio.ts`): Während der Drop-Sequenz spielt sonst nur die Musik. Klammern, Rumpeln, Eintrittsdröhnen, der Triebwerks-Loop des Landers und der Aufschlag sind abgeschaltet.

**Triebwerke nur bei der Landung:** Auf dem Carrier (Hangar, Boarding) und im freien Fall (`LOCKED`, `DROPPING`, `ATMOSPHERIC_ENTRY`) laufen keine Triebwerke. Erst mit `BRAKING` zündet der Bremsschub (`landing-burn`, räumlich am Albatross, Pegel 0,95). Beim Übergang zu `TOUCHDOWN` wird er über 0,45 s abgeschaltet. Wer während des Bremsschubs beitritt, hört die Aufnahme an der passenden Stelle. Der gelandete Albatross hat keinen Triebwerks-Leerlauf. Außer dem Bremsschub ist nur das Triebwerk beim Abflug der Albatross-Extraktion zu hören.

Kamera-Erschütterung und Federung folgen der Einstellung „Wackeln“. Reduzierte Bewegung schaltet Erschütterung, Ring und Trümmer ab. Die Flugeffekte sind gefilterte Rausch- und Oszillatorschichten (`FlightAudio.ts`): Klammern, Fallrumpeln, Eintrittsdröhnen, Bremsschub und der Aufschlag mit Abschalten der Triebwerke. Dazu kommt das bestehende `hull-impact`-Sample. Spawnabstand und Schutzfenster ab Touchdown sind unverändert.

## Musik

Sobald der Host an der Missionskonsole einen Auftrag ausgewählt hat (`MISSION_SELECTION`), läuft „Briefing Silence“ in Schleife und bewusst leise mit 30 % des Masterpegels. Das Stück bleibt während des Boardings und wird vom Drop-Stück abgelöst, sobald der Countdown beginnt. Kehrt der Trupp in den Hub zurück, blendet es aus. Auf dem Start- und Loginbildschirm läuft „Silent Watch“ als eigener Cue `title` in Schleife mit 40 % der Originallautstärke. Es startet nach der ersten Nutzergeste und blendet beim Raumbeitritt aus.

Sobald alle Operatoren an Bord ihre Bereitschaft gemeldet haben und der Boarding-Countdown läuft, beginnt „L'Arrée Triomphale“. Das Stück begleitet den Drop. 15 Sekunden nach dem Aufschlag des Albatross blendet es über 6 Sekunden aus. Bricht der Countdown ab, blendet es ebenfalls aus. Wer später beitritt oder sich neu verbindet, hört das Stück an der passenden Stelle. `Music.ts` streamt die Datei über ein Media-Element in den Musikbus, statt sie als PCM zu dekodieren. Die Lautstärke regelt der neue Kanal **Musik** in den Audio-Einstellungen. [Quellen](music-sources.json) · [Ballonextraktion](EXTRACTION_BALLOON.md) · [Ablauf](visual-style/drop-sequenz.jpg)

**Missionsabschluss.** Mit dem Ergebnis beginnt die Ergebnismusik. Wer seine Hauptziele erfüllt hat, hört „Victory at the Edge“, egal ob die Extraktion gelang. Wer sie verfehlt hat, hört „The Final March“. Die Überschrift folgt derselben Regel: „Einsatz erfolgreich“ heißt Hauptziele erfüllt. Laufende Drop- oder Ballonmusik blendet dabei in 1,5 Sekunden aus. Beide Stücke dauern 30 Sekunden, der Ergebnisbildschirm höchstens 12 Sekunden plus 1 Sekunde Rückkehr. Deshalb läuft die Musik bis an Bord weiter und blendet dort aus: der Sieg über 5 Sekunden, die Niederlage über 6, weil sie leise beginnt und sich steigert. Wer später ins Ergebnis kommt, hört das Stück an der passenden Stelle (Cues `victory`/`defeat` in `Music.ts`).

**Rückkehr an Bord.** „Rückkehr bestätigen“ und der Ergebnisbildschirm bleiben. Ist der Trupp wieder im Hub, fordert der Client die Mauserfassung sofort wieder an, ohne Raummenü und ohne „Carrier betreten“. Das klappt ohne neue Nutzergeste: Das Spiel hat die Erfassung beim Ergebnis selbst gelöst (Pointer Lock 2.0), und der Klick auf „Rückkehr bestätigen“ liegt meist nur Sekunden zurück. Lehnt ein Browser trotzdem ab, erscheint statt des Menüs nur der Hinweis „Zurück an Bord · Klicken, um weiterzuspielen“. Das Raummenü gibt es weiterhin mit Esc. Prüfung: `scripts/playtest-result.mjs` (Sieg mit Bestätigung, Niederlage nach Ablauf des Timers, verweigerte Erfassung).

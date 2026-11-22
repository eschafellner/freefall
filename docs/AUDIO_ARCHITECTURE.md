# Audioarchitektur 7.7D

## Priorisierte Bestandsaufnahme vor der Änderung

| Priorität | Befund |
| --- | --- |
| P0 | Keine Audiodateien im Client. Die planetaren Audio-IDs aus 7.7C dienten der Anzeige. Wetter, Oberfläche, feindliche Windups und Missionsevents hatten keine Sample-Wiedergabe. |
| P0 | Ein nativer Web-Audio-Context pro Game, Aktivierung beim ersten Einsatz-Klick. Weder Three.js AudioListener noch PositionalAudio. Der Waffenpfad nutzt Stereo-Pan, Distanzfilter, Schalllaufzeit und vorhergesagte Operatorposition. |
| P0 | 28 nominelle Ereignisstimmen, vier pro Schütze. Prioritätsstimmen umgingen die Grenzen, Reservierungen liefen über Wall-Clock-Timer und Flug-Cues umgingen die Zählung. Große Horden hatten keine eigene Auswahl für Gegnergeräusche. |
| P1 | Master, Weapons, Environment und UI mit lokalen Reglern und Compressor am Ausgang. Hall und Echo wurden als Web-Audio-Sends pro Umgebung generiert. Kein Musiksystem. |
| P1 | Eigener Schuss aus Prediction mit unterdrücktem Serverecho, fremde Schüsse aus Netzwerk. Blast, Melee, Wechsel und Haltung waren in der Game-Schicht verdrahtet. Reload- und Resupply-Synthese waren vorhanden, aber im Combat-Routing nicht aufgerufen. Flug-Cues aus Deployment und Extraktion. |
| P1 | Kein Laden oder Caching von Audiodateien. Context beim Dispose geschlossen. Match-Reconnect nutzte denselben Context, die Flug-Cue-Erkennung und Sound-Timer waren nicht an einen eigenen Wiedereinstiegszyklus gekoppelt. |
| P2 | UI-Bus ohne Klangzuordnung. F2 zeigte aktive, Spitzen- und verworfene Stimmen. Hör- und Speicherabnahme stand aus. |

## Wiedergabe

Der vorhandene `AudioEngine` besitzt weiterhin einen nativen Web-Audio-Context je Client. Der bestehende Klick zum Einsatz entsperrt den Context. Das Aktivieren im Audio-Menü kann ihn ebenfalls innerhalb einer Benutzerinteraktion starten. Ein Stummschalten blendet den Master aus. Das Deaktivieren räumt Stimmen ab und suspendiert den Context. Ein erneutes Aktivieren verwendet dieselbe Instanz.

| Bus | Quellen |
| --- | --- |
| Master | Summenpegel, Mute, bestehender Peak-Schutz |
| Kampf | Waffen, Explosionen, Nahkampf, Gegner und Schwarmdetails |
| Welt | Operator-Foley, Nester, Fahrzeuge, Umwelt-One-Shots und Hallrücklauf |
| Ambience | Planetare Stereo-Betten, Technikbett auf dem Skyfall Carrier |
| Wetter | Separate planetare Stereo-Windebene |
| Interface | Lokale UI- und geschützte Missionssignale |

Die Audio-IDs werden als lokale Dateien unter `public/audio` ausgeliefert. Der Buffer-Cache teilt laufende Requests und Dekodierung pro ID. Die bevorzugte Kodierung folgt dem Browser und wechselt bei HTTP- oder Decode-Fehlern zum zweiten Format. Kann keine Variante geladen werden, bleibt die betroffene Stimme aus. Kurzfristige Kampfereignisse verfallen während des Ladevorgangs. Missionssignale können bis zu 800 ms auf ihre Datei warten. Laufende Low-Level-Loop-Ladevorgänge werden spätestens beim Dispose abgebrochen.

Der Match-Lifecycle beendet beim Verbindungsabbruch Stimmen und Positionsverfolgung. Er behält Context, Einstellungen und den begrenzten Buffer-Cache. Beim Wiederbeitritt werden Mission, Wetter und Sichtposition aus aktuellen Snapshots aufgebaut. Die zuletzt vor dem Abbruch gesehene Tickgrenze unterdrückt alte Ereignisse, der erste Zustand setzt die Basis für Landungen und Missionsphasen. Planetenwechsel mischen Layer über ihre Fade-Zeit und beenden den auslaufenden Source-Node. Dispose schließt den Context und leert Cache und Graph.

Seit 7.9A.1 spielen Waffen Aufnahmen über denselben Mixer, die lokale Schuss-Prediction und die bestehenden Hall- und Echo-Sends. Magazin- und Wechselgeräusche folgen bestätigten Operator-Snapshots. Resupply wird aus dem autoritativen Grant gespielt, mit Weltposition des Containers und einem Signal für den versorgten Operator. Der gelandete Albatross stellt seine Container stationär bereit. Anflug und Abflug folgen dem vorhandenen Deployment und den Extraktionsphasen.

Siehe [Waffen-Audio](WEAPON_AUDIO.md), [Mischung](AUDIO_MIXING.md), [räumliches Audio](SPATIAL_AUDIO.md) und [Audio-Asset-Katalog](AUDIO_ASSET_CATALOG.md).

## Prüfung 7.7E

Reconnect setzt die Audio-Session zurück und lässt Horden-Audio erst am frischen Wiedergabe-Tick wieder zu. Die Voice-Diagnostik zählt angenommene Windups und Impacts. Resultat und Raumaustritt wurden mit null Stimmen nach Fade beobachtet. [Audioabnahme](MILESTONE_7_7_AUDIO_ACCEPTANCE.md)

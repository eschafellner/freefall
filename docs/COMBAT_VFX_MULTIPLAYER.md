# Combat VFX im Multiplayer · 7.8A

| Ereignis | Abfolge |
| --- | --- |
| Lokale Prediction | Vorhandene Prüfung von Haltung, Aktion, Munition und Kadenz. Schussaudio und bestehender Sichtfeldimpuls starten sofort. Animation, Laufblitz und Hülse verwenden die aktuelle gerenderte Pose. |
| Lokale Bestätigung | Echos werden für dieselbe Waffenart und dasselbe Leben in Abfeuerreihenfolge zugeordnet. Ein zugeordnetes Echo ergänzt Tracer und bestätigte Trefferreaktionen. Ein unzugeordnetes Echo startet auch die Schusspräsentation. |
| Anderer Operator | Die Präsentation wartet auf den interpolierten Server-Tick der betreffenden Figur. Animation, Flash, Sound und bestätigter Tracer werden dann in einem Frame ausgelöst. Ein Rückfall nach maximal 300 ms erhält Sound und bestätigte Effekte, wenn die passende Pose fehlt. |
| Convict | Der Server sendet ebenfalls einen Schuss-Tick. Die Convict-Ansicht stellt ihn auf dem Missionstick dar. Die vorhandene Waffenpräsentation verwendet das Gewehrprofil. |

Je Schütze kann der Server höchstens einen Schuss pro Tick bestätigen. Die Verbindung verwirft wiederholte oder ältere Ticks vor Verarbeitung von Audio, VFX und HUD. Die Historie umfasst die letzten 64 Schützen. Legacy-Pakete ohne Tick haben keine zuverlässige Identität. Der Server sendet keine einzelnen Partikel, Hülsen oder Lichter.

Bei Verbindungsabbruch werden ausstehende Pose-Cues, aktive Waffen-VFX und lokale Trefferanzeigen geräumt. Die Verbindungshistorie bleibt beim automatischen Reconnect erhalten. Bis zum ersten gültigen Snapshot sowie für getickte Ereignisse bis zur vorherigen Empfangsgrenze verwirft der Client transiente Schüsse. Eine volle Sitzungskündigung entfernt die Raumsitzung mitsamt Ereignishistorie.

# Charakteranimation in FREEFALL 7.3D

Die Operatoren werden lokal und remote durch denselben `PlayerVisualController` dargestellt. Seine Welttransformation kommt von Prediction oder Snapshot-Interpolation. Das Skelett, die Kamera und die Waffenanimation schreiben keine Simulationstransformationen. Im aktuellen Asset-Stand liefert das artikulierte `SoldierRig` sämtliche sichtbaren Posen. [Systemübersicht](ANIMATION_SYSTEM.md) · [Asset-Inventar](ANIMATION_ASSET_INVENTORY.md)

| Schicht | Eingaben und Ergebnis |
| --- | --- |
| Posture | `TacticalAnimation` liest Haltung, Übergangsfortschritt und Dive-Parameter. Sie liefert Basisclip, mögliche Alternative, Oberkörperaktion und prozedurale Gewichte. |
| Locomotion | `CharacterAnimation` filtert Ist-Geschwindigkeit in lokalen Körperachsen. Richtung, Geschwindigkeit und Schrittphase bleiben beim Zielen und während Oberkörperaktionen verfügbar. |
| Ausrüstung und Kampf | Waffenslot, Reload-Intervall und Ausrüstungsaktion stammen aus dem Serverzustand. Der Wechsel übergibt die sichtbare Waffe zur Mitte. Der Schussimpuls stammt aus dem bestätigten Schussereignis. |
| Blick und Körper | Körperdrehung folgt der gültigen Haltungsachse. Der prozedurale Mündungspunkt und Zielwinkel in niedrigen Haltungen folgen den gemeinsamen Spielregeln. |
| Playback | `CharacterClipPlayer` verwendet vorbereitete Clips und gecachte Actions je Modell. Aktionen überlagern nur die betreffenden Oberkörper-Tracks. |

## Dives und Bodenhaltungen

Die Auswahl der acht Dive-Varianten verwendet die Projektionen der bestätigten Richtung auf die Vorwärts- und Seitenachse des Körpers am Start. Die Wahl der Bodenhaltung kommt aus dem Dive-State. Die prozedurale Pose wertet die Seitenkomponente kontinuierlich aus. Links und rechts spiegeln Rumpfneigung, Hüftversatz und Schwerpunkt. Der Rückwärts-Dive setzt von der Gewichtsverlagerung über das Anwinkeln der Beine zur Rückenlage über. Der Absprung und die Landung verwenden `takeoff` und `until`. Nach einer Blockierung liefert der bestehende Dive-State zusätzlich die Kontaktzeit für das Abstützen. Die getrennte Landepose umfasst fünf Serverticks ab `landedDive.until`.

In Bauchlage bleiben Brust und Rumpf niedrig. In Rückenlage sind Rumpfachse, Knie und Waffenhaltung umgekehrt zur Bauchlage. Bewegungsrichtung und Geschwindigkeit treiben die Beine auch beim Zielen und Nachladen. Knie und Ellenbogen verwenden die vorhandene Zweigelenk-Lösung. Handziele liegen an den Waffensockets oder am Magazin. Beim Stim löst sich die Stützhand für die Injektion. Beim Aufstehen aus Rückenlage rollt die Figur zur Seite, aus Bauchlage richtet sie sich über die Knie auf. Ein serverseitig abgebrochener Versuch blendet in die bestätigte Bodenhaltung zurück.

## GLB-Vertrag

- Die Basisebene umfasst Gangart, Übergänge, Ducken, Rutschen, Dive, Landung, Bodenbewegung, Aufstehen und Tod. Die Oberkörperebene deckt die zulässigen Kampfaktionen ab. Sparse Overlays wie ein Schussclip mit wenigen Hand-Tracks lassen unberührte Tracks in der Basisebene.
- Gangartwechsel blenden über 220 ms mit übernommener Phase, reguläre Wechsel über 150 ms und servergetaktete Wechsel über 80 ms. Der Oberkörper blendet über 120 ms ein und 200 ms aus. Gewicht null beendet abgelöste Actions. Servertaktete ausblendende Clips halten die zuletzt gültige Zeit.
- Haltung und Ausrüstung verwenden lokale oder interpolierte fraktionale Serverticks. Ausbleibende Clips für diagonale Dives führen zur seitengerichteten prozeduralen Pose. Für eine fehlende Landungs- oder Einstiegspose kann ein passender Ground-Loop übernehmen. Ein Wechsel zwischen ganzem prozeduralem Rig und GLB-Modell ist ein Sichtwechsel. Durchgehende Überblendungen zwischen diesen Darstellungen benötigen eine vollständige kompatible Lieferung.
- Der Mixer entfernt Positions-, Rotations- und Skalierungstracks der Modellwurzel. Für einen separat angegebenen `motionRoot` wird der horizontale Versatz auf der Ruheposition fixiert und die Rotation bzw. Skalierung entfernt. Beim Dive entfällt dessen Translationskanal vollständig. Relative Posen unterhalb der Wurzel, etwa die Beckenneigung, bleiben wirksam.
- Retargeting benutzt Humanoid-Rollen, Ruheposen und relative Orientierungen. Die Hüfttranslation wird auf die Zielproportionen skaliert. Synthetische Three.js-Rigs prüfen Binding, Taktung und Retargeting. Handkontakt und Fußposition externer Clips benötigen die Abnahme am Produktionsrig. [Asset-Vertrag](CHARACTER_ASSET_REQUIREMENTS.md)

## Multiplayer

`players` liefert Haltung, Position, Leben, Ausrüstung sowie wirksame Ziel- und Sprintflags. Der lokale Operator verwendet die vorhandene Prediction und Reconciliation. Remote-Operatoren rekonstruieren die Pose im verzögerten Snapshot-Takt. Die Reconnect-Snapshots rekonstruieren laufende Übergänge aus Start- und Endtick. Für Schüsse ergänzt der Room das vorhandene Ereignis um `tick` und `life`. Der Client dedupliziert per Schütze und Tick. Der Remote-Rückstoß wartet auf den Tick der gerenderten Pose. Stale Impulse werden bei abweichender Lebens-ID oder mehr als sechs Ticks Verspätung verworfen. F2 zeigt Pose, Abspielzeit, Oberkörperaktion und Gewicht sowie Kamera- und Prediction-Werte.

7.3E prüft zusätzlich die Remote-Pose, wenn zwischen zwei Snapshots Landung und Aufstehen liegen. Die Kriechbewegung endet am autoritativen Get-up-Tick. Der lokale Chromium-Lauf zeigte die integrierten prozeduralen Posen mit sichtbaren Tracern in Bauch- und Rückenlage. Für Produktionsclips stehen Root-Motion-, Lizenz-, Fußkontakt- und Handkontakt-Prüfung mit den tatsächlichen Dateien aus. [Asset-Inventar](ANIMATION_ASSET_INVENTORY.md) · [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md#73e--integration-und-wiederholung)

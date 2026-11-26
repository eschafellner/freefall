# Charakteranimation

`CharacterAnimation` löst drei Zustände unabhängig auf. Der Controller bekommt Renderposition, Blickwinkel, Sprint und Aim, HP, Lebensnummer sowie den serverseitigen Reload-Endtick. Vorzeichen und Tempo der gerenderten Bewegung werden im lokalen Blickkoordinatensystem ausgewertet. Zustandswechsel verändern nur Posen.

| Ebene | Zustände und Übergänge |
| --- | --- |
| Locomotion | Idle, Walk, Run, Sprint, Strafe Left, Strafe Right, Backward. Die Geschwindigkeit wird vor der Zustandswahl aus geglätteten Bewegungsvektoren ermittelt, die Schrittphase bleibt beim Wechsel kontinuierlich. Das laufende Standardtempo der Arena bleibt erhalten. Walk greift bei niedriger Rendergeschwindigkeit. |
| Combat | Ready, Aim, Fire, Reload. Der serverseitige Schuss löst einen kurzen Impuls aus. Bei aktivem Aim setzt die Pose anschließend den Zielmodus fort. Reload hat Vorrang vor Fire. |
| Reaction | None, Hit, Death. Sinkende HP lösen einen Nachgiebigkeitsimpuls aus. Bei null HP fällt der Charakter, bis die nächste Lebensnummer eintrifft. |

Der Fallback besitzt artikulierte Knie und Ellenbogen. Eine begrenzte Zweigelenk-Lösung positioniert die Hände am Griff, am Handschutz und beim Nachladen am Magazin. Der obere Körper richtet sich teilweise nach dem Blickwinkel aus, der Lauf richtet sich im Aim-Modus auf einen Punkt des bestehenden Zielstrahls. Die Bewegung der Beine läuft unabhängig weiter.

## Hybrid-Animation (GLB-Clips mit prozeduralem Fallback)

Ziel: hochwertige GLB-Clips für Bewegung und Aktionen, prozedurale Ergänzungen für alles, was vom Spielzustand abhängt, und das bestehende prozedurale Rig als Fallback für jeden Zustand ohne Clip. Asset-Vertrag und Clipliste: [Character Asset Requirements](CHARACTER_ASSET_REQUIREMENTS.md).

| Schicht | Inhalt | Datei |
| --- | --- | --- |
| Clip-Vertrag | ID, Gruppe, Ebene (base/upper), Taktung (free/speed/server), Priorität, Fallback | `characters/animation/ClipLibrary.ts` |
| Humanoid-Zuordnung | Rollen, Presets FREEFALL/Mixamo/Unreal, Oberkörpermaske | `characters/animation/HumanoidSkeleton.ts` |
| Retargeting | Übertragung zwischen Skeletten mit anderen Namen, Ruheposen und Proportionen | `characters/animation/Retargeting.ts`, `CharacterClipSet.ts` |
| Clip-Player | Basis- und Oberkörperebene, lineares Blending, Serverfortschritt | `characters/CharacterClipPlayer.ts` |
| Prozedurale Ergänzung | Blick und Zielneigung über die Wirbelsäule, Rückstoß, Foot IK | `characters/animation/SkeletonOverlay.ts` |
| Fallback | prozedurales Skelett-Rig pro Zustand ohne Clip | `characters/PlayerVisualController.ts`, `characters/operator/OperatorRig.ts` |

**Ebenen.** Die Basisebene spielt Locomotion, Ducken, Hechtsprung, Landung, Bauch- und Rückenlage, Aufstehen und Tod. Die Oberkörperebene spielt Haltungsvarianten für Nachladen, Waffenwechsel, Stim und Schuss über der laufenden Grundpose. Mit Humanoid-Zuordnung blendet der Mixer pro Track, sodass ein Clip für die Waffenhand die übrige Haltung erhält. Weitere Details stehen in der [7.3D-Charakteranimation](CHARACTER_ANIMATION.md).

**Übergänge.** Die Gewichte werden linear im Player geblendet: Gangart zu Gangart 220 ms mit übernommener Schrittphase, allgemein 150 ms, servergetaktete Übergänge 80 ms, Tod 100 ms, Oberkörper ein 120 ms und aus 200 ms. Laufende Überblendungen werden bei Unterbrechung normiert. Das erste Bild eines frisch angehängten Modells zeigt sofort die Zielpose.

**Taktung.** `speed`-Clips folgen dem gerenderten Tempo über `clipSpeeds` (0,6–1,6×). `server`-Clips laufen nie frei: Haltungsübergänge folgen `postureProgress`, Nachladen dem Reload-Fortschritt, Stims dem Fortschritt der Ausrüstungsaktion. Lokale und fremde Figuren sehen dadurch dieselbe Phase.

**Prozedurale Ergänzungen.** Nach dem Mixer verteilt `SkeletonOverlay` Blickneigung und Gierabweichung zum Körper (begrenzt auf ±60°) auf Wirbelsäule, Brust, Hals und Kopf. Sprint reduziert den Anteil, Bodenhaltungen und Tod schalten ihn ab. Der Schussimpuls kippt die Brust kurz. Die Waffe hängt am `PrimaryWeapon`-Knoten und richtet sich beim Zielen weiterhin auf den Zielpunkt aus. Der prozedurale Nachlade- und Stim-Knick der Waffe wird mit dem Gewicht eines vorhandenen Clips ausgeblendet. Foot IK (`footIK` in der Registry) hebt einen Fuß, den ein Clip unter den Boden drückt, mit einer Zweigelenk-Lösung auf seine Ruhehöhe. Es ist standardmäßig aus, bis eine Clip-Lieferung abgenommen ist.

**Fallback.** Ohne Idle und Walk oder Run wird das GLB nicht verwendet. Fehlt der Clip eines Haltungszustands (Ducken, Hechtsprung, Bauch-/Rückenlage, Aufstehen), zeigt die Figur für diesen Zustand das prozedurale Rig und wechselt danach zurück. Fehlende Locomotion-Richtungen nutzen Walk oder Run, fehlende Oberkörperclips die prozedurale Waffenhandhabung. Beim Laden meldet die Konsole die fehlenden Kern-Clips je Gruppe.

**Retargeting.** Pakete aus `animationPacks` mit anderem Skelett werden einmal beim Laden übertragen: Drehung jedes Humanoid-Knochens relativ zur eigenen Ruhepose im Wurzelraum, Hüftversatz skaliert mit der Hüfthöhe. Pakete mit gleichem Skelett und `animationPaths` werden unverändert verwendet.

**Grenzen.** Hand-IK am Waffengriff für retargetete Clips, Finger-Retargeting und Bodenanpassung an Gelände fehlen noch; das Spielfeld ist derzeit flach. Ohne registriertes GLB läuft weiterhin ausschließlich das prozedurale Rig.

Neue Clips werden in-place exportiert. Der Mixer entfernt Transformationsspuren der Modellwurzel. Bei einem separaten `motionRoot` fixiert er die horizontale Translation auf der Ruheposition und entfernt Rotation und Skalierung. Beim Dive entfernt er auch die vertikale Wurzeltranslation. Beckenpose und lokale Gelenkbewegung bleiben unterhalb der Wurzel erhalten. Nachladen folgt dem normierten Fortschritt des autoritativen Reload-Intervalls.

Für Produktionsqualität fehlen ein geskinntes Modell, abgenommene Clips und Fingerkontakte. Die Integrationsstruktur für Ebenen, Retargeting und Overlays ist vorhanden.

## Multiplayer und Kamera

Lokale und fremde Operatoren teilen den Playback-Controller. `players` trägt Haltung, Leben, Ziel- und Sprintflags sowie das vorhandene Timing für Ausrüstung und Magazin. Der Room ergänzt bestätigte Operator-Schüsse um Tick und Lebensnummer. Der Remote-Rückstoß wird bei diesem gerenderten Tick verarbeitet. Alle Posen entstehen auf den Clients. [Charakteranimation](CHARACTER_ANIMATION.md)

Die Schulterkamera nutzt lokale Bewegungsinterpolation und die Blickhöhe der Haltung. Kollisionsanker, Sichtfeld und Komfortoptionen sind in der [taktischen Kamera](TACTICAL_CAMERA.md) beschrieben.

## Operator-Rig 2026-11-26

Das prozedurale Rig ist ein Skelett mit geskinntem Körper. Gangzyklus mit Fersenaufsatz und Abrollen, Beckenbewegung, Hüftsteuerung beim Seitwärtslauf, Wirbelsäulenverteilung, Gewehrhaltung mit eingedrehtem Oberkörper, Federn und Schrittkorrektur im Stand sind in [Operator: Modell, Rüstungen und Animation](OPERATOR_MODELL.md#animation) beschrieben. Die folgenden Abschnitte dokumentieren frühere Stände.

## Milestone 6

Die gefilterte Geschwindigkeit bestimmt Standzeit und Schrittweite. Die lineare Standphase führt den Fuß mit der zurückgelegten Strecke zurück. Der Schwungfuß hebt ab, während das Becken seitlich Gewicht verlagert. Drehschritte reagieren auf die geglättete Körperdrehung. Beschleunigung und Bremsen kippen den Oberkörper. Stopps und Tod beenden den Schrittzyklus. Die starre Segmentgeometrie und die Reichweite der Zweiknochenglieder begrenzen die Bodenhaftung.

Dieselbe Pose verarbeitet lokale und interpolierte Figuren. Das aktive Waffenmodell liefert seine eigenen Hand-, Magazin- und Mündungssockets. Wechsel, Wurf und Injektion folgen der replizierten Start- und Endzeit. Nachladen verwendet die Dauer der aktiven Waffe. Fehlende Produktionsclips werden durch diesen prozeduralen Pfad überbrückt.

Die Vergleichsaufnahme verwendet beide Controller mit derselben Folge von Positionen, Zieldrehungen, Reload-Zeiten und derselben Kamera. Die beiden Hälften zeigen Ruhe, Anlaufen, Sprint, Abbremsen, seitliches Zielen sowie Nachladen im Stand und in Bewegung. Bei Anlaufen und Sprint sind die stärkere Kniebeugung und größere Schrittlänge sichtbar. Die starren Hände und das begrenzte Abrollen der Stiefel bleiben erkennbar. [Bewegungsvergleich, 9,6 Sekunden](character/bewegungsvergleich-ms6.mp4)

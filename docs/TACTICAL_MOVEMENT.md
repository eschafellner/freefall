# Taktische Bewegung in Freefall

| Eingabe | Wirkung |
| --- | --- |
| C | Zwischen Stehen und Ducken wechseln. |
| X | In die gehaltene Bewegungsrichtung hechten. Ohne Bewegung geht der Sprung bei Standardbalance nach vorn. |
| Leertaste | Aus Ducken, Bauchlage oder Rückenlage aufrichten, sofern Platz frei ist. |
| WASD | Kamerarelativer Gang, geduckter Gang oder langsame Bodenbewegung. |
| F2 | Haltung, Übergang, Kollider, erlaubte Aktionen und Prediction-Telemetrie anzeigen. |

Seitliche und vorwärts gerichtete Sprünge landen in Bauchlage. Rückwärts gerichtete Sprünge landen in Rückenlage. Die Bodenhaltung hält an, bis der Spieler aktiv aufsteht. Der Server prüft Ausführung, Geometrie und Treffer bei 30 Hz.

Die Startwerte stehen in [movement.json](../packages/shared/src/balance/data/movement.json). Die Registry validiert und hasht die Datei. Ihr validiertes Profil ist Bestandteil des unveränderlichen Missions-Snapshots. Client und Server sollten mit derselben Balance-Version gebaut werden, damit Prediction, Kamera und Kollider zusammenpassen.

| Einstellung | Standard |
| --- | ---: |
| Tempo geduckt / Bauchlage / Rückenlage | 55 % / 25 % / 20 % des Gehtempos |
| Blendzeit beim Ducken | 0,20 s |
| Hechtsprung | 5 m in 0,75 s, am Server auf 23 Ticks aufgerundet |
| Cooldown ab Beginn | 1,20 s |
| Aufstehen aus Bauchlage / Rückenlage | 0,80 s / 1,00 s |

Die Schulterkamera blendet zwischen den Höhen. Mausbewegung steuert Blickrichtung und Neigung weiterhin direkt. Kameraeffekte lassen sich im Menü einstellen. Das räumliche Audio verwendet kurze synthetische Kleidung- und Landegeräusche aus bestätigten Zustandsübergängen.

## Animationen und Asset-Integration

Im aktuellen Repository ist kein Soldaten-GLB mit Animationsclips registriert. Das vorhandene prozedurale Soldaten-Rig erzeugt die Posen aus der tatsächlichen Bewegung und den Serverphasen. Es beugt beim Ducken die Knie, nimmt die seitliche Sprungkomponente in die Rumpfneigung auf und blendet in Bauch- oder Rückenlage. Beinbewegung, Waffenhaltung, Nachladen, Rückstoß und Stim-Anwendung laufen über das vorhandene IK- und Waffen-Rig. Beim Aufrichten aus Rückenlage dreht sich der Rumpf stärker zur Seite.

Für die nächste Asset-Runde werden folgende In-Place-Clips benötigt.

- Crouch Enter, Idle, Walk und Exit, möglichst mit gerichteten Schrittvarianten.
- Dive Forward, Backward, Left, Right und vier Diagonalen mit erkennbarer Vorbereitung, Flugpose und Landung.
- Prone Idle, Aim, Fire, Reload, Crawl, Get Up und Stim.
- Supine Idle, Aim, Fire, Reload, Ground Movement, Get Up und Stim.

Die Clip-IDs sind in [TacticalAnimation.ts](../apps/client/src/rendering/characters/TacticalAnimation.ts) definiert. Das SoldierAsset-Mapping ordnet IDs den GLB-Clipnamen zu. Der Mixer hält horizontale Root Motion aus der Weltposition heraus und bindet zeitgesteuerte Übergänge an Serverfortschritt. Fehlt ein Clip, übernimmt das prozedurale Rig. Die aktuell ausgelieferten taktischen Animationen und Geräusche entstehen aus Code im Repository. Für externe Assets sind Quelle, Lizenz zur Weitergabe und etwaige Credits bei der Integration zu erfassen.

Weitere Details stehen in [Posture State Machine](POSTURE_STATE_MACHINE.md), [Directional Dive](DIRECTIONAL_DIVE.md), [Ground Combat](PRONE_SUPINE_COMBAT.md), [Character Collision](CHARACTER_COLLISION.md), [Input Rebinding](INPUT_REBINDING.md) und [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md).

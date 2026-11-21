# Missionsinszenierung 7.8D

## Carrier und Albatross 02

Die Missionskonsole und Truppübersicht auf dem Skyfall Carrier zeigen Freigabe, Briefing und Bereitschaft. Die tatsächliche Deployment-Phase mit serverbasiertem Countdown steht am Bildschirmrand. Die vorhandene Außenkamera während des gesperrten Flugs bleibt an die autoritative Phase gebunden. Flugstimmen und räumliche Triebwerke laufen über `FlightAudio` und `MissionAudio`.

`AlbatrossView` nutzt den vorhandenen Instanzpuffer für den Aufwurf beim Landen und unmittelbar beim Abheben. Eis verwendet hellen Schnee, Wüste sandfarbenen Staub, Grüne Ebene kleinere Erdpartikel und Wald niedrigeren blattfarbenen Abrieb. Profil, Bodenhöhe und Zahl intakter Triebwerke beeinflussen die Optik. LOW verwendet 14, MEDIUM 22 und HIGH maximal 32 Instanzen. Reduzierte Bewegung verwendet 8 und dämpft die Deckkraft. Die Darstellung verwendet vorhandene Düsen- und Signallampenmaterialien ohne zusätzliche Lichtquelle. Für Blätter und Gras dient prozeduraler, farblich abgestimmter Aufwurf als Fallback. Die Partikel deaktivieren sich nach dem kurzen Phasenfenster, bei Fahrzeugzerstörung und beim Resultat.

## Nachschub, Nester und Convicts

Die Nachschubstation befindet sich an den gelandeten Containern von Albatross 02. Deren autoritativer Zustand steuert Leuchtanzeigen, Reichweitenhinweis und Verbrauch. Der bekannte Aufsetzvorgang kündigt die Ankunft an. Ein aufgenommener Nachschub meldet die vom Server gewährten Mengen. Die aktuelle Mission hat keinen separat anforderbaren Nachschubflug.

Ein bestätigtes zerstörtes Nest liefert Position, Status und Tick. Die bestehende Nestkollaps-Darstellung zeigt Staub und den kollabierenden Bau anhand des Snapshots. Derselbe Vorgang wird über den Missions-Ereignisfilter als HUD-Hinweis, räumlicher Klang und schwacher Nahimpuls präsentiert. Der Modellbestand der Schabe bleibt außerhalb dieses Pfads.

Verteidigungsstart, Verlauf, Abschluss und Fehlschlag folgen dem Relaisziel. Die Convict-Verluste stammen aus der vorhandenen Truppliste. Ihre Navigation, Ziele und Fraktion laufen weiter im Missionsserver.

## Extraktion und Ergebnis

Albatross-Countdown, Ballon, Rettungsjäger-Anflug und Lift lesen die vorhandenen Extraktionszustände. Der Lift verwendet die Transportkamera ausschließlich für bereits gesicherte Spieler. Die übrigen Operatoren behalten Feldkamera, Reticle und Ausrüstung. Alle Informationen zur gesicherten Gruppe und zum Countdown stammen aus replizierten Zuständen. Beide Methoden enden mit demselben autoritativen `MissionResult`.

Der Ergebnisblock verwendet die Result-ID als Anzeigeidentität. Erfolg, Fehlschlag, verwendetes Fahrzeug, bestätigte Extraktionen, Convicts, Albatross und EP kommen aus dem autoritativen Ergebnis. Das Combat-HUD endet beim Ergebnis, während temporäre Kämpfeffekte und Transportaudio abgeräumt werden. MissionAudio verwendet vorhandene Bestätigungs- und Funksignale. Ein Reconnect zur Ergebnisphase zeigt den aktuellen Ergebnisblock. Es gibt keine neue Eingabesperre oder lokale Überspringfunktion.

- [Ereignisidentität, Warteschlange und Reconnect](MISSION_NOTIFICATION_SYSTEM.md)
- [Autoritative Extraktionssysteme](EXTRACTION_SYSTEM.md)
- [Browser-Nachweise](MILESTONE_7_8D_PLAYTEST.md)

# Weltinstanz und Koop

Der serverautoritative Raum behält Welt, Missionsplan, Balance und laufenden Missionszustand bis zur Rückkehr. Mission-State verweist auf die Plan-ID. Ein Client lädt den neuen Plan per bestehendem `mission-plan`-Kanal und prüft Versionen und Hash der lokalen Rekonstruktion. Die Planantwort führt Planet, Biom, Welt-Seed, Generator-, Profil- und Assetversion sowie World Plan ID, Missions-Seed und Mission Plan ID. Terrainvertices werden nicht pro Tick übertragen.

Die Spielersnapshots enthalten positive und negative Höhen. Horde-Snapshots bleiben X/Z mit der vorhandenen weiten Quantisierung von 1/128 m. Sie passen für die 480-m-Karte in den vorzeichenbehafteten Kanal. Der Client stellt Gelände-gebundene Gegner, Konvikte und Nester aus denselben Höhen dar. Reconnect erhält Session, Welt- und Missions-ID sowie Ziel- und Extraktionsfortschritt.

Der Test mit vier WebSocket-Peers prüft den vollständigen WorldPlan-Hash, getrennte Operatorpositionen, Höhenkonsistenz, gleichzeitige Interaktion, Reconnect und das gemeinsame Resultat. [Abnahme](MILESTONE_7_6_FINAL_ACCEPTANCE.md)

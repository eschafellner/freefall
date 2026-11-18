# Planet Registry

| Feld | Wert |
| --- | --- |
| `planetId` | `dev-ault` |
| `displayName` | Dev' Ault |
| Mission | `mission.operation_bodenbruch` |
| Weltdaten | `world.bodenbruch` |

`PLANET_REGISTRY` verknüpft Planeten mit Missions-IDs aus der bestehenden `MISSION_REGISTRY`. Der konsolengebundene UI-Selektor liest beide Registries und die sieben Einträge der `DIFFICULTY_REGISTRY`. Der Server prüft Planet, Zugehörigkeit der Mission, Schwierigkeit, Host-Rolle, Konsolenreichweite und Phase. `mission-selection` überträgt die vollständige Auswahl. Der Room sendet die bestätigte Auswahl an den ganzen Trupp.

Der Bodenbruch-Room akzeptiert seine zugeordnete Missionsdefinition. Weitere Einsätze benötigen einen Server-Einstieg und Renderdaten für die neue Welt. Das Konsolenformular kann weitere Registry-Einträge darstellen. Die aktuelle 3D-Projektion verwendet eine prozedurale Textur für Dev’ Ault. Ein späterer Registereintrag kann Planetentextur, Biome und Gefahrenbeschreibung referenzieren.

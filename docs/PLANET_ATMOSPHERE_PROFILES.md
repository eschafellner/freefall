# Atmosphärenprofile

`packages/shared/src/world/PlanetProfiles.ts` führt pro generiertem Planetprofil eine typisierte `atmosphere` mit stabiler ID. Sie bündelt Sonnenvektor und -leistung, Hemisphärenfüllung, Umgebungslicht, Belichtung, PCF-Radius und Schattenbereich, Himmelsfarben, Wolkenanteil und Horizontdunst. Die Oberflächenpalette bleibt separat im selben Planetprofil.

| Profil-ID | Sonne (X, Y, Z) | Sonne / Füllung / Umgebung | Exposure | FogExp2-Dichte |
| --- | --- | --- | --- | --- |
| `green-plains.daylight.v1` | −71, 73, 45 | 1,62 / 1,18 / 0,39 | 1,00 | 0,0035 m⁻¹ |
| `desert.dry-day.v1` | 76, 62, 44 | 1,94 / 1,08 / 0,28 | 0,98 | 0,0041 m⁻¹ |
| `ice.overcast-day.v1` | −38, 65, 81 | 1,08 / 1,38 / 0,29 | 0,92 | 0,0044 m⁻¹ |
| `forest.filtered-day.v1` | 64, 84, −40 | 1,36 / 1,36 / 0,35 | 1,05 | 0,0052 m⁻¹ |

Die von 7.6 validierte Planeten-ID aus dem Missionsplan bestimmt die Präsentation auf allen Clients mit demselben Build. Nach Reconnect ergibt sich aus derselben ID dasselbe Profil. Die ID des Atmosphärenprofils versioniert die Präsentation separat von der Weltgeometrie. Sie wird lokal aufgelöst. Der Welt-Hash und das Netzwerkformat entsprechen der 7.6-Weltidentität.

7.7A liefert eine feste Tageslichtstimmung je Planet. Das ist die Datenbasis für Wetterzustände, Übergänge und auswählbare Tageszeiten in 7.7C. Carrier, Boreal Relay und Dev’ Ault verwenden die vorhandenen Fallbacks für ihre jeweiligen Szenen. [Art Bible](PLANET_ART_BIBLE.md) · [Renderer-Integration](ENVIRONMENT_LIGHTING.md)

## Wetter und Tageszeit ab 7.7C

Die vier Profile oben bleiben die Basis für Sonne, Fülllicht, Umgebungsreflexion und Himmel. Prozedurale Einsätze ergänzen sie über eine unabhängige Wetterkonfigurationsversion und eine optionale Tageszeit im Missionsplan. `AtmosphereController` mischt Dunst, Lichtfaktoren, Himmelsfarbe und Wind aus den gültigen Wetter-Endpunkten. Der bestehende Licht-Rig erhält die Werte im gleichen Render-Update. Der World-Hash beschreibt weiterhin die prozedurale Geometrie.

[Wetterprofile und Audit](PLANET_WEATHER_SYSTEM.md) · [Tageszeiten](TIME_OF_DAY_PRESETS.md) · [Serverzustand und Reconnect](WEATHER_MULTIPLAYER_SYNC.md)

## Prüfung 7.7E

Das Resultat hält die zuletzt angewendete Licht- und Fog-Stimmung bis zum Szenenwechsel. Wind und lokale Partikel enden sofort. `day`, `overcast-day`, `dawn` und `dusk` sind in der Profilprüfung abgedeckt. [Aufnahmen und Metadaten](MILESTONE_7_7_VISUAL_ACCEPTANCE.md)

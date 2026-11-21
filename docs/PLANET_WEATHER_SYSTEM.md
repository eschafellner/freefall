# Planetary Weather · 7.7C

## Repository-Befund

| Bereich | Stand vor 7.7C |
| --- | --- |
| 7.7A | `PlanetProfiles.ts` enthält vier feste Atmosphärenprofile. `ArenaView` wählt mit dem wiederhergestellten Planetprofil. `Lighting.ts` erzeugt HDR/Linear-LDR-Himmel, IBL, Hemisphäre, Sonne und FogExp2. Das Profil wird bei Szenen-, Profil- oder Postprocessing-Wechsel übernommen. |
| 7.7B | `PlanetMaterials.ts` erweitert den Standardmaterial-Shader um biomspezifische PBR-Texturarrays. `PlanetGroundDetails` verwendet opake, vertexgefärbte Instanzen und Distance Fade. `GeneratedTerrain` verwaltet Terrain- und Objekt-LOD, gruppierte Baumstämme, separate Kronen und sichtabhängige Schatten. Terrain und Props werden vollständig aus der Welt aufgebaut und anschließend gecullt. |
| Partikel und Audio | `VisualEffectsManager` besitzt feste Pools für Waffen-/Treffereffekte. Schwarmdurchbrüche und Abstieg haben eigene Szeneneffekte. Es gab keinen dauerhaften Wetterpool. `WeaponAudio`, `VoicePool` und die Missions-Sound-Cues verwenden eine gemeinsame Web-Audio-Infrastruktur. |
| Renderer | Ein WebGL2-Renderer mit sRGB-Ausgabe, ACES, optional FXAA, HDR-Fähigkeitsprüfung und manuell aktualisierten PCF-Schatten. PBR-Arrays und Himmel sind pro Welt wiederverwendet und werden beim Wechsel entsorgt. |
| Multiplayer | 30-Hz-Simulation mit 20-Hz-Spielersnapshots, 10-Hz-Hordenpaketen und 5-Hz-Missionssnapshots. Der Client schätzt aus dem letzten Spielertick bis zu drei weitere Ticks. Missionsplanung repliziert den Plan separat. Generierte Welten werden aus World Seed, Planeten-ID und Versionsdaten rekonstruiert. Sitz-Reconnect ist möglich. Neue Spieler treten vor Deployment oder nach Rückkehr auf den Carrier bei. |
| Einstellungen und Budgets | Low, Medium, High, dazu Reduzierte Bewegung mit Betriebssystem-Default. F2 liefert CPU/GPU-Stichproben und Renderer-Zähler. Das Serverbudget beträgt 33,33 ms pro Tick. 7.7A/B dokumentieren Referenzläufe. Freigegebene Clientbudgets und eine Zielgerätematrix fehlen. |

Die bisherigen Abnahmen sind in [7.7A](MILESTONE_7_7_FINAL_ACCEPTANCE.md) und [7.7B](MILESTONE_7_7B_FINAL_ACCEPTANCE.md) dokumentiert. Der lokale 7.7C-Ausgangslauf auf SwiftShader steht im [Performancebericht](WEATHER_PERFORMANCE.md).

## Profile

| Planet | Wetter in Registry-Reihenfolge | Sichtbare Komponenten |
| --- | --- | --- |
| Eis | `clear-cold`, `overcast`, `light-snow`, `windy-snow` | Kühler Dunst, Schneefall, bei stärkerem Wind auch bodennaher Schneetreib |
| Wüste | `dry-clear`, `dust-haze`, `windy`, `light-dust-gusts` | Warmgrauer Dunst, niedrige horizontale Staubfahnen, Wind im Buschwerk |
| Grüne Ebene | `clear`, `cloudy`, `windy`, `light-mist` | Gras und Kräuter, bewölkte Beleuchtung und leichter Nebel |
| Wald | `forest-calm`, `windy-forest`, `ground-mist`, `overcast-forest` | Baumkronen, Farne, tiefer Dunst und gedämpftes Licht |

`PlanetWeather.ts` definiert Lichtprofil-Verweis, FogExp2-Dichte, Dunstfarbe, bodennahe Dunstzugabe, Bewölkung, Vegetationsantwort, Effektart, Partikelmenge und Geschwindigkeit, Wind, Übergangsdauer und Audio-Referenz. Die Registry validiert Planet und Lichtprofil, endliche Werte, Farbbereiche, Effektkompatibilität, Pflichtdaten und Übergangsdauer. Ein unbekannter Wettername löst das erste gültige Profil des Planeten auf. Bei einer inkompatiblen Wire-Version oder einem fehlenden Planetprofil greift der bestehende statische Szenenpfad.

## Laufzeit

1. `MissionAtmosphere` wird beim Deployment eines generierten Einsatzgebiets angelegt. World Seed, Mission Seed und Wetterkonfigurationsversion bestimmen den Atmosphären-Seed. Die Tageszeit stammt aus dem Plan.
2. Der Controller bleibt pro Wetterzustand 175–275 Sekunden stabil. Für den nächsten Zustand kommen die übrigen gültigen Profile desselben Planeten infrage. Der Übergang dauert je nach Zielprofil 28–40 Sekunden.
3. Der Server publiziert aktuelle und optional nächste Wetter-ID, beide Windparameter und den Übergangsbeginn in Simulationsticks. Der Client wertet denselben Übergang mit Smoothstep aus. Während eines aktiven Übergangs wartet ein weiterer Debug-Auftrag auf den vollständigen Endpunkt. Ein neuer Debug-Auftrag ersetzt einen wartenden Auftrag.
4. `AtmosphereController` wird aus dem vorhandenen `ArenaView.draw` aktualisiert. Die Instanz hält gemeinsam verwendete Wind-Uniforms, laufende Licht-/Nebeldaten und bei Bedarf einen Partikelbatch. `Lighting.ts` trägt die interpolierten Werte in den bestehenden Licht-Rig und die bestehende Szene ein.
5. Am Missionsende wird der Serverzustand entfernt. Partikel werden bei Ende, Welttausch oder Dispose freigegeben. Der Client prüft Einsatz- und Welt-ID bei jedem Bezug zum aktuellen Weltzustand. Historische Einsätze und Boreal Relay nutzen ihre bisherigen statischen Profile.

Alle Komponenten verändern ausschließlich die Darstellung. Raid-Pacing, Serverwahrnehmung, Navigation, Bewegung, Ballistik, Schaden, Collider und Objectives verwenden ihre bisherigen Regeln und Zeitbasen.

## Schnittstelle für 7.7D

Jeder Zustand hat eine Audio-Referenz `ambience.<planet>.<weather>`. `atmosphere-state` trägt Konfigurationsversion und Revision. Ein Target markiert den Übergangsbeginn, eine nachfolgende Revision ohne Target den stabilen Endpunkt. `sampleWind` liefert Richtung, Stärke, Böe und Turbulenz. Spätere Audio-Layer können Windgrundpegel, kurze Böen, Schneetreib, trockenen Sand oder Kronenrascheln über diese Werte einblenden. Gleiche Revisionen beim Reconnect sollen vorhandene Stimmen übernehmen. 7.7C enthält die Schnittstelle für die vorhandene Web-Audio-Infrastruktur.

[Wind](PROCEDURAL_WIND_SYSTEM.md) · [Partikel](ENVIRONMENT_PARTICLE_SYSTEM.md) · [Tageszeit](TIME_OF_DAY_PRESETS.md) · [Netzwerk](WEATHER_MULTIPLAYER_SYNC.md)

## Prüfung 7.7E

Die Vierer-Proben prüften den laufenden Übergang im Wald und in der Eiswelt während tatsächlicher Socket-Reconnects. Bei MissionResult werden Partikel und Wind gestoppt. Die dargestellte Lichtstimmung bleibt bis zur Rückkehr ins Carrier-Deck stehen. [Koop-Abnahme](MILESTONE_7_7_MULTIPLAYER_ACCEPTANCE.md)

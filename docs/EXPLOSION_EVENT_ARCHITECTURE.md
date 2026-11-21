# Autoritative Explosionsereignisse · 7.8C

`Battlefield` ruft die Granatensimulation auf. Auf dem Fusetick fragt `Grenades.update` die benachbarten Zellen des Gegnergrids ab, berechnet den vorhandenen radialen Schaden und wendet ihn an. Operatoren und Convicts durchlaufen die bestehende Schadenspolicy. `blastDamage` prüft Deckung über `clearGroundLine`. `MissionInstance.onBlast` nutzt `structureBlastDamage` für Schwarmnester, deren Multiplikator 2 beträgt. Objective-Fortschritt, Spawn-Stop, Extraktion, Statistik und Tod hängen am bestehenden Serverzustand.

| Daten | Herkunft |
| --- | --- |
| `id` | Fortlaufende Granaten-ID pro Battlefield. Teilt die Identität mit Release und Snapshots. |
| `tick` | Autoritativer Fusetick. Der Raum simuliert mit 30 Hz. |
| `x/y/z` und `radius` | Letzte Simulationsposition und Radius der aufgelösten Granatendefinition. |
| `owner`, `grenade` | Werfer und Balance-ID aus der gestarteten Granate. |
| `contact` | Optionale bestätigte Oberfläche samt Collider- oder Terrain-Normale. |

Der Raum überträgt die transienten Resultate über `combat`. Bei gesättigtem Event-Budget bleiben Blast, Release und Melee im Paket. Health und Missionsstatus laufen weiter über Snapshots. `CombatPresentation` filtert die bestätigten Ereignisse einmal vor Renderer, Audio, Kamera und HUD. `GrenadeView` verwendet einen gepoolten Effektzustand für die Laufzeit. Rauch und Splitter existieren nur im Renderer und haben weder Collider noch Schadenspfad.

Die acht gepinnten Gameplay-Traces vergleichen weiter dieselben Gameplay-Felder. Release-Cues, Materialkontakt, Audiohöhe und Granatentyp sind additive Präsentationsfelder. Der Trace projiziert diese aus den Ergebnissen heraus. Die dedizierten Tests prüfen die neuen Felder separat.

[Grenatenwurf](GRENADE_PRESENTATION.md) · [Oberflächenkontakt](BIOME_EXPLOSION_EFFECTS.md)

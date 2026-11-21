# FREEFALL 7.8E · Repository-Audit und Befunde

Audit des Arbeitsstands auf Basis von `4daf04e`. Der Checkout enthielt vor 7.8E umfangreiche laufende Änderungen aus den vorherigen Meilensteinen. Die Bewertung bezieht sich auf diese tatsächlich vorhandene Implementierung.

| System | Relevante Module | Befund vor 7.8E | Abdeckung und Maßnahme |
| --- | --- | --- | --- |
| Waffen, Munition, taktischer Reload, Recoil und Friendly Fire | `Battlefield`, `combat`, `equipment`, `handling` | VERIFIED | Waffen-, Balance-, Damage- und Posture-Regression. Gameplaypfade und Konfigurationswerte bleiben unverändert. |
| Mündungsfeuer, Tracer, Hülsen, Waffenanimation und Schussaudio | `Game`, `WeaponFireEffects`, `PlayerVisualController`, `WeaponAudio` | IMPLEMENTED BUT UNVERIFIED | Vorhandene Pools, Socket- und Timeline-Integration. Browser-Waffenmatrix sowie spät gelieferte und wiederholte Schussresultate erneut prüfen. |
| Treffer, Tod, Oberfläche und Damage Direction | `combat`, `HitFeedback`, `DamageFeedback`, `ImpactAudio`, `VisualEffectsManager` | PARTIALLY WORKING | Server liefert getickte Kontakte, Normalen und Eliminierungen. Die Altersgrenzen bei Schuss- und Damage-Echos unterschieden sich. Gemeinsame Zulassung und Reconnect-Sperre. |
| Granaten, Nahkampf und Stims | `grenades`, `combat`, `equipment`, `GrenadeView`, `CombatPresentation` | PARTIALLY WORKING | Autoritative Reichweite, Fuse, Occlusion, Haltung und Ausrüstungszustand sind getestet. Grenade-Release konnte nach der zugehörigen Detonation erscheinen. Die Detonation ersetzt ausstehende Freigabecues. |
| Kamera, Reticle und HUD | `ThirdPersonCamera`, `ArenaView`, `App`, `EquipmentHud`, `MissionHud`, `MissionMarkers` | IMPLEMENTED BUT UNVERIFIED | Bestehende Kameratests für Bodenlagen, Kollisionsursprung, reduzierte Bewegung und Impulse. Browser-Dives, Aim, Damage Direction und HUD prüfen. Wiederholte DOM- und Materialupdates reduziert. |
| Planeten, Trefferflächen, Gelände, Licht, Wetter, Wind und Audio | `GeneratedTerrain`, `PlanetSurfaces`, `AtmosphereController`, `MissionAtmosphere`, `Soundscape` | VERIFIED | Determinismus, Wetterreplikation, Weltkollision, Oberflächenklassifikation und Browser-Detonationen. Sicht und subjektiver Mix auf Zielhardware offen. |
| Bodenbruch, generierte Missionen, Convicts, Nester und Nachschub | `MissionInstance`, `MissionGenerator`, `ObjectiveManager`, `Convicts`, `SwarmNestManager` | VERIFIED | Simulationsabläufe und Browsersequenzen vorhanden. 7.8E ergänzt vollständige Simulationsläufe zu viert auf Eis, Wüste und Wald. |
| Skyfall, Albatross, Ballon, Ergebnis und Missionsmeldungen | `MissionPresentation`, `MissionAudio`, `FlightAudio`, `ExtractionSystem`, `AlbatrossView`, `RecoveryView` | PARTIALLY WORKING | Missionslogik und beide Extraktionen vorhanden. HUD und Missionsaudio führten konkurrierende Eventhistorien. Jetzt entscheidet die Missionspräsentation einmal für alle Empfänger. |
| Prediction, Interpolation und Reconnect | `Prediction`, `Timeline`, `Match`, `FreefallRoom`, `CombatPresentation` | PARTIALLY WORKING | Spielersnapshots konnten Präsentation aufwecken, während Plan oder Missionszustand nach dem Reconnect noch fehlten. Gezielt aktuelle Snapshots anfordern und kurzlebige Cues am neuen Zustand abgrenzen. |
| Horde und Angriffswahrnehmung | `HordeDirector`, `SpawnManager`, `EnemyCombat`, `EnemyNavigation`, `HordeAudio` | VERIFIED | Zielauswahl, Navigation, Spawn-Checks, Reconnect und Angriffsschaden sind automatisiert abgedeckt. Die kombinierte Lastprüfung verwendet die vorhandene Simulation. |
| Render-, Audio-, Netzwerk- und Zeitbudgets | `VisualEffectsManager`, `VoiceBudget`, `AudioAssets`, `RenderMetrics`, `FixedLoop`, `playtest-combat-presentation` | PARTIALLY WORKING | Bestandslimits und F2-Telemetrie vorhanden. Der frühere Lastlauf erfasste nur Anfang und Ende der Hordenpopulation. Die erweiterte Messung zählt Gegner pro tatsächlich ausgeführtem Schritt. |
| Native GPU- und Langzeitfreigabe | Browser-/QA-Umgebung | MISSING | Die native RX-9070-XT-Referenz liegt jetzt vor. VRAM-Profil, langes Multi-Mission-Profil und subjektive Sicht-, Hör- und Komfortprüfung stehen aus. |

## Priorisierte Befunde

| ID | Schwere | Zustand | Ursache und Änderung |
| --- | --- | --- | --- |
| FF78E-1 | P1 | Behoben | Combat-Cues und Mission-Audio konnten verschiedene Wiederanlaufgrenzen verwenden. Nach Drops werden Queues und transiente Cues beendet. Der Client holt aktuelle Spieler- und Missionssnapshots, wartet auf den passenden Missionsplan und sperrt Historie am Wiederanlauftick. |
| FF78E-2 | P1 | Behoben | Bei voller Eventhistorie wurde eine noch frische Identität verdrängt. Deren Wiederholung konnte dann erneut Schadenfeedback oder Effekte darstellen. Live-Identitäten werden bis zum Ablauf behalten. Kampffolgeereignisse haben Platz für die maximale 48er-Batchgröße pro Tick und ein eigenes Budget neben den Action-Cues. |
| FF78E-3 | P2 | Behoben | Action-Ergebnisse wurden bei Umordnung in Eingangsreihenfolge präsentiert. Die Pose-Queue hält Tickreihenfolge. Eine bestätigte Detonation unterbindet ausstehendes oder später geliefertes Wurfaudio derselben ID. Nach MissionResult werden transiente Combat-Cues verworfen. |
| FF78E-4 | P2 | Behoben | Die HUD- und Audio-Historien für Missionsereignisse bewerteten Sequenzen separat. Missionsaudio und Kamera verwenden jetzt das bereits zugelassene Ereignis. |
| FF78E-5 | P2 | Behoben | Der Client serialisierte Nachrichten für die Netzlastanzeige auch bei geschlossenem F2-Panel. Objektivlampen und Marker schrieben identische Zustände pro Frame. Netzwerkberechnung erfolgt bei aktivem F2, Marker und Lampen aktualisieren geänderte Werte. |
| FF78E-6 | P1 | Offen | Im kombinierten Waldtest ist der Software-Renderer der begrenzende Faktor. Die native Radeon-Referenz erreicht 60 FPS bei 720p Medium. Die formale Freigabe benötigt ein bestätigtes Client-Budget und die vorgesehene Zielgeräteabdeckung. |
| FF78E-7 | P2 | Offen | Ein vollständiger nativer Vier-Spieler-Playtest mit 20–30 Minuten pro Planet, Hör- und Komfortbewertung sowie längere Messungen über mehrere Missions- und Planetenwechsel stehen aus. |
| FF78E-8 | P3 | Offen | Vite meldet für den bestehenden Hauptbundle weiterhin die Chunkgrößenwarnung. |

In den nachgewiesenen Spielpfaden wurde kein offener P0 gefunden. Die ausstehenden Prüfumfänge und Gate-Ergebnisse stehen im [Abnahmebericht](MILESTONE_7_8_FINAL_ACCEPTANCE.md).

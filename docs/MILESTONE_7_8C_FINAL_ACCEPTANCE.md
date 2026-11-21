# Abschlussbericht · Milestone 7.8C

Granaten und Nahkampf verwenden die autoritativen Kampfresultate für Position, Material, Audio, Kamera und bestätigtes HUD-Feedback. Der Browser hat alle vier Planeten und den Wald mit bis zu 1.000 aktiven Schaben geprüft. Die Freigabe ist offen, weil die Messumgebung nur Software-Rendering bot und der native Leistungsnachweis fehlt.

## Audit des Ausgangsstands

| Prüffeld | Ausgangsstand | Befund |
| --- | --- | --- |
| Inventar, Wurf, Flug, Release, Fuse und Detonation | VERIFIED | Eine Frag mit zwei Ladungen. Freigabe durch die Ausrüstungslogik. Kontinuierliche Flugkollision, vorhandenes Stoppen am Kontakt und anschließender Fall. Fusetick und Radius waren serverautoritativ. |
| Explosion Damage | VERIFIED | Räumlich begrenzte Grid-Abfrage, lineares Falloff, Deckungsprüfung, bestehende Settings für Eigen- und Verbündetenschaden, Gegner und Convicts. Schwarmnest- und Missionslogik über den vorhandenen Server-Callback. |
| Explosion-ID, Projektil und Renderer | PARTIALLY WORKING | Die Projectile-ID war bereits im Blast. Der Client konnte den Effekt zusätzlich aus zeitlich interpolierten Snapshots starten. Es gab Instanzpools für Blitz, Druckwelle, Rauch, Staub, Splitter und Brandfleck. Der Staub begann auf einer festen globalen Y-Höhe und folgte dem Höhenfeld nicht. |
| Materialien | MISSING | 7.8B kannte Schnee, Eis, Sand, Erde, Gras, Fels, gefrorenen Fels, Waldboden, Holz, Metall, Beton und neutral. Blast-Pakete transportierten weder Kontaktmaterial noch Normale. |
| Melee Input, Window, Ziel, Cooldown und Restrictions | VERIFIED | Ein serverseitiger Kolbenstoß am Impact-Tick. Ein Ziel aus Schabe, Operator oder Convict. Miss über das vorhandene Resultat mit 0 Schaden. Geprüftes Deckungs- und Haltungsverhalten. |
| Operator- und Schabenanimation | VERIFIED | Vorhandene prozedurale Operatorposen für Wurf und Stoß, bestehende Schabenreaktion, Stagger und Death-Pfad. |
| Separater Melee-Clip | MISSING | Der Operator nutzte eine prozedurale Bewegung. Es gab keinen dedizierten Clip für den Kolbenstoß. |
| Melee-Kontakt und Deduplizierung | BROKEN | Das bestehende Event lieferte die Position des Angreifers für Impact-Audio. Ein wiederholtes Paket konnte Marker und Reaktion erneut auslösen. Ein geschützter Verbündeter konnte trotz null Schaden als Treffer präsentiert werden. |
| Spatial Audio und Kamera | VERIFIED | Prozedurale Explosion mit Druck- und Nachhallanteil im gemeinsamen Audiomixer, Voice-Prioritäten, Dämpfung und Kamerawackeln vorhanden. Der Blast zog auch den Waffen-FOV-Impuls heran. |
| Multiplayer, Prediction und Reconnect | VERIFIED | Autoritative Spielersnapshots, Zeitachsen, lokale Bewegungs- und Waffenprediction sowie Reconnect in der Mission. Grenaden und Melee hatten keine lokale Gameplay-Prediction. Die Haltungs- und 7.8A/B-Tests bleiben Teil der Regression. |
| Explosionsbudgets und Belastungsfreigabe | IMPLEMENTED BUT UNVERIFIED | Alte VFX waren gepoolt. Vor diesem Milestone fehlte eine separat instrumentierte kombinierte Explosion-/Melee-Lastmatrix. |

## Änderungen

| Bereich | Dateien |
| --- | --- |
| Event-Vertrag und Server | `packages/shared/src/contracts/messages.ts`, `apps/server/src/networking/snapshots.ts`, `apps/server/src/rooms/FreefallRoom.ts`, `apps/server/src/systems/combat.ts`, `apps/server/src/systems/grenades.ts` |
| Client und Empfangsfilter | `apps/client/src/game/Game.ts`, `apps/client/src/networking/CombatPresentation.ts`, `apps/client/src/ui/App.tsx`, `apps/client/src/ui/ControlSettings.tsx` |
| Rendering und Kamera | `apps/client/src/rendering/Agents.ts`, `ArenaView.ts`, `GraphicsQuality.ts`, `ThirdPersonCamera.ts`, `VisualEffectsManager.ts`, `characters/PlayerVisualController.ts`, `weapons/GrenadeView.ts` unter `apps/client/src/rendering/` |
| Audio | `apps/client/src/audio/WeaponAudio.ts`, `apps/client/src/audio/ImpactAudio.ts` |
| Tests und Nachweise | `apps/client/test/combat-presentation.test.ts`, `apps/server/test/combat-presentation.test.ts`, `apps/server/test/support/balance-trace.ts`, `scripts/playtest-combat-presentation.mjs`, `docs/playtest/7-8c/` |
| Dokumentation | Die verlinkten 7.8C-Fachseiten, Playtest und dieser Bericht. Einstieg im `README.md`. |

- [Granatentyp, Release und Flugbahn](GRENADE_PRESENTATION.md) · [Event-Identität, Radius und Schaden](EXPLOSION_EVENT_ARCHITECTURE.md) · [Deduplizierung, Interpolation und Reconnect](EXPLOSION_MULTIPLAYER.md)
- [Kern, Rauch, Splitter und Licht](EXPLOSION_VFX.md) · [Schnee, Eis, Sand, Erde, Gras, Wald, Fels und Metall](BIOME_EXPLOSION_EFFECTS.md)
- [Räumliches Audio und Prioritäten](EXPLOSION_AUDIO.md) · [Posture, Komfort und Waffenrecoil](COMBAT_CAMERA_IMPULSES.md) · [Melee-Schwung, Treffer und Miss](MELEE_PRESENTATION.md) · [Bestätigte Marker, Partikel und Tod](MELEE_HIT_FEEDBACK.md)
- [Pools und Qualitätsgrenzen](COMBAT_VFX_POOLING.md) · [Vorher/Nachher, Waldlast, CPU/GPU und Heap](EXPLOSION_PERFORMANCE.md) · [Playtest, Screenshots und offene Prüfungen](MILESTONE_7_8C_PLAYTEST.md)

## Release Gates

| Gate | Status | Nachweis oder offene Bedingung |
| --- | --- | --- |
| A · Grenade Integrity | PASS | Equipment-Sperren, Release, Fuse, Flug, Radius, Falloff, Deckung, Friendly Fire und Nestschaden durch Tests abgedeckt. |
| B · Explosion Presentation | PASS | Detonations-VFX und Materialstimmen aus bestätigten Serverevents. Ein sichtbarer Effekt pro Ereignis im Browser. |
| C · Biome Effects | PASS | Neun reale Kontakte über die vier Planeten, plus neutraler Fallback im Test. |
| D · Melee Presentation | PASS | Lokaler Treffer und Miss im Browser. Serverprüfungen für Reichweite, Abbruch, Schutz, Cooldown und Haltung. |
| E · Gameplay Authority | PASS | Acht unveränderte Gameplay-Fingerabdrücke, getrennte Prüfung neuer Präsentationsfelder, kein clientseitiger Schadenspfad. |
| F · Audio & Camera | PASS | Web-Audio-Kontext, Materialkontakte, Voice Budget und zeitliche Zuordnung geprüft. Kameraimpulse und Recoil-Unabhängigkeit per Komponententest geprüft. Subjektiver Hörvergleich offen. |
| G · Multiplayer | PASS | Vier WebSocket-Verbindungen, 140 ms zusätzliche Blast-Zustellzeit, ausgelassenes Blast-Ereignis, Echos, Reordering im Empfangsfilter und Browser-Reconnect. Physischer Paketverlust bleibt offen. |
| H · Performance | BLOCKED | Reproduzierbare SwiftShader-Werte und eingehaltene Simulationsbudgets. Die native Freigabe der FPS/Frametimes und ein längeres GPU-/Memory-Profil fehlen. |
| I · Horde Stress | PASS | 1.000 simulierte Schaben zu Beginn der Vierer-Waldprobe mit drei Detonationen, Melee und aktiven Gegnerangriffsphasen. Null verworfene Server-Steps. |
| J · Regression | PASS | 327 Tests inklusive 7.8A/B, Combat, Movement, prozeduralen Welten und Koop. Nach der abschließenden Snapshot-Bereinigung liefen 41 relevante Clienttests erneut erfolgreich. Typecheck, Build und Balanceprüfung erfolgreich. |
| K · Accessibility | PASS | Wackeln absenkbar/abschaltbar, Blitzstärke konfigurierbar und reduzierte Bewegung im Renderer und Kamerapfad geprüft. |
| L · Documentation & Compliance | PASS | Integritätsprüfung der drei Schabenquelldateien stimmt. Keine Assetgenerierung, keine Assetkäufe, Zusatzkosten 0 €. |

## Offene Punkte

- **P0/P1** · In den ausgeführten Prüfungen wurde kein offener Defekt dieser Prioritäten festgestellt.
- **P2** · Native Frametimes und Langzeitprofil, physischer Netzwerk-Paketverlust, subjektiver Audiovergleich und manuelle vollständige Planetendurchläufe.
- **P3** · Bei gerundeten Props folgt der Effekt dem vereinfachten Collider. Die sichtbare Mesh-Kante kann lokal abweichen.

7.8D kann den bestehenden Kamera- und HUD-Pfad weiterverwenden. Für die vollständige Freigabe von 7.8C bleiben eine Messung auf Zielhardware und die offenen manuellen Prüfungen zu dokumentieren.

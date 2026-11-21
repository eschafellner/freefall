# FREEFALL 7.8D – Abschluss und Abnahme

Die Kamera-, HUD- und Missionspräsentation ist im bestehenden Spielpfad integriert. Die vollständige Freigabe bleibt offen, bis die Performance auf Zielhardware und die manuelle Mehrspieler-Abnahme vorliegen.

## Änderungen und Nachweise

| Bereich | Dateien | Umsetzung |
| --- | --- | --- |
| Ausgangslage | `docs/MILESTONE_7_8D_AUDIT.md` | Bestehende Kamera, Tactical Movement, Gunplay, Missionslogik, Audio, VFX und Multiplayer vor der Änderung geprüft. |
| Kamera | `ThirdPersonCamera.ts`, `ArenaView.ts` | Gemeinsame interpolierte Blickhöhe für Anker und Strahl. Schulter-, Boom- und Terrainprüfung mit gedämpftem Freigeben. Blickrichtung bleibt an der Eingabe. Dive nutzt die gerenderte Flugbahn; Bauchlage, Rückenlage und Aufstehen übernehmen ihre jeweils replizierten Kolliderwerte. Beim Zielen entfallen kosmetische Positionsimpulse. |
| Aim und Impulse | `ThirdPersonCamera.ts`, `ArenaView.ts`, `Game.ts` | Projektion der bestehenden Mündungsprüfung. Waffenkick bleibt im FOV, und Vorhersage und Echo verwenden weiter den bestehenden Recoil-Pfad. Eine Positionshüllkurve behandelt bestätigten Schaden, nahe Explosionen, bestätigten Nahkampf und Nahimpulse am Nest. Wackeln ist stufenlos zwischen normal und aus einstellbar. |
| Kampf-HUD | `Game.ts`, `DamageFeedback.ts`, `App.tsx`, `EquipmentHud.tsx`, `styles.css` | Getrennte Formen für Treffer, Eliminierung, Eigenbeschuss und blockierte Sichtlinie. Kamerarelative Richtungsanzeige anhand bestätigter Treffer. Ammo, Reservemagazine, Ausrüstung, Nachladefortschritt und bestätigter Magazinverlust. |
| Meldungen, Sync und Audio | `MissionPresentation.ts`, `EventHistory.ts`, `MissionAudio.ts`, `MissionHud.tsx` | Ein Meldungsplatz mit Priorität und TTL. Frische Ereignisse mit Missionsinstanz und Sequenz, tolerierte Umordnung, Cleanup und Snapshot-Baseline nach Reconnect. Bestehende Busse und Audiolimits. |
| Mission und Fahrzeuge | `AlbatrossView.ts`, `ArenaView.ts`, `App.tsx`, `MissionHud.tsx`, `MissionAudio.ts` | Phasentimer ab Skyfall, räumliches Triebwerk, biomspezifischer Aufwurf in einem vorhandenen Pool, Nachschub, Nestkollaps, Relaisverteidigung, Convict-Verluste, Albatross- und Ballonbergung sowie Ergebnisblock aus autoritativen Daten. |
| Kompatible Ereignisfelder | `contracts/messages.ts`, `contracts/mission.ts`, `MissionInstance.ts`, `SwarmNestManager.ts`, `EnemyCombat.ts`, `combat.ts`, `grenades.ts` | Bestätigte Schadensrichtung und Ziel-Leben für Friendly Fire, Nestposition, Instanz-ID und Ereignisfolge. Die Fingerabdrücke für Gameplay erhalten die bestehenden Felder. |
| Tests und Daten | `tactical-presentation.test.ts`, `enemy-combat.test.ts`, `impact-feedback.test.ts`, `horde-director.test.ts`, `support/balance-trace.ts`, `scripts/playtest-tactical-presentation.mjs`, `scripts/playtest-combat-presentation.mjs`, `docs/playtest/7-8d/` | Neue Kamera- und Ereignistests, Browser-, Netzwerk- und Lastmessungen. Die drei Schaben-Quelldateien bestehen die vorhandene SHA-256-Prüfung. Zusatzkosten 0 €. |

Die Einsatzkamera bleibt bei flüchtigen Missionsmeldungen unter Spielerkontrolle. Die vorhandenen Flugszenen laufen während Deployment oder beim Lift der gesicherten Operatoren. Die übrigen Operatoren behalten ihre Kampfansicht. Eine neue Skip-Mechanik war für diese Übergänge nicht nötig. Die Missionslogik blockiert neue Beitritte im laufenden Einsatz. Late Join auf dem Carrier und Wiederbeitritt bestehender Operatoren sind über die vorhandene Replikation abgedeckt.

- [Repository-Audit](MILESTONE_7_8D_AUDIT.md) · [Kamera und Haltungen](TACTICAL_CAMERA.md) · [Kameraimpulse](COMBAT_CAMERA_IMPULSES.md)
- [Combat HUD](COMBAT_HUD_ARCHITECTURE.md) · [Schadensrichtung](OPERATOR_DAMAGE_FEEDBACK.md) · [Meldungen und Ereignisfilter](MISSION_NOTIFICATION_SYSTEM.md)
- [Missionsinszenierung](CINEMATIC_MISSION_EVENTS.md) · [Playtest und Screenshots](MILESTONE_7_8D_PLAYTEST.md) · [Messungen](CAMERA_HUD_PERFORMANCE.md)
- [Rechte des wiederverwendeten Audio-Bestands](AUDIO_ASSET_LICENSING.md)

## Release Gates

| Gate | Status | Nachweis |
| --- | --- | --- |
| A · Tactical Camera | PASS | Haltungen, Dives und Aufstehen automatisiert geprüft. Terrainabstand in acht Blickrichtungen auf den vier Planeten. |
| B · Aim & Gunplay Compatibility | PASS | Mündungs- und Nahdeckungsprüfung, Aim-Projektion, Recoil und identische Gameplay-Fingerabdrücke. |
| C · Camera Combat Feedback | PASS | Begrenzte Impulse, Priorität, Dämpfung beim Zielen und Cleanup im Komponententest. Bestätigte Detonationen, Treffer und Nahkampf im Browser. |
| D · Combat HUD | PASS | Waffen- und Ausrüstungszustände automatisiert geprüft. Bestätigter rechter Treffer, Magazinverlust und Nachschub im Browser. |
| E · Mission Notifications | PASS | Priorität, Deduplizierung und Lebensdauer per Unit-Test. Bestätigte Meldungen für Ziele, Nachschub und Extraktion im Browser. |
| F · Skyfall & Albatross | PASS | Replizierte Deployment-Phasen, vorhandenes Triebwerksaudio, sichtbares Aufsetzen und qualitätsabhängiger Partikelpfad. Subjektiver Audiovergleich steht aus. |
| G · Mission Events | PASS | Nestzerstörung, Convict-Ausfall, autoritative Relaisverteidigung und Ergebnis bei Erfolg und Fehlschlag geprüft. |
| H · Both Extraction Systems | PASS | Albatross und Ballon im Browser jeweils mit vier Verbindungen. Bestehende Tests decken Abbruch, Fehlanflug und erneuten Anflug ab. |
| I · Multiplayer | PASS | Vier WebSocket-Verbindungen, Browser-Reconnect, Ereigniskopie nach 450 ms, 160 ms Blast-Verzögerung und ausgelassenes Blast-Ereignis. |
| J · Accessibility | PASS | Impulsstufen, reduzierte Bewegung und HUD-Formen geprüft. Browser-Resultat im Modus „Reduzierte Bewegung“ verifiziert. |
| K · Performance | BLOCKED | Reproduzierbare SwiftShader-Messung. Kombinierte Waldlast bei 20,3 FPS. GPU-Freigabe und längeres Profil auf Zielhardware stehen aus. |
| L · Horde Stress | PASS | Kombinierte Probe startet mit 1.000 aktiven Gegnern. Wetter, Audio, Dauerfeuer, drei Explosionen, Schadenspfeil und Nestmeldung im gleichen Messfenster. Null verworfene Server-Steps. |
| M · Gameplay Regression | PASS | Typprüfung, Build, 333 automatisierte Tests, acht unveränderte Gameplay-Fingerabdrücke und Schaben-Prüfsummen. Vite meldet weiterhin die Größe des Client-Bundles. |
| N · Documentation & Compliance | PASS | Audit, Abnahme, Grenzen, reproduzierbare Messungen und vorhandene Asset-Quellen dokumentiert. |

## Offene Abnahme

- **P0** · In den ausgeführten Prüfungen wurde kein offener Blocker gefunden.
- **P1** · Die gemessene Software-Framerate reicht für eine flüssige Freigabe nicht aus. Zielhardware und Langzeitlauf müssen die clientseitige Freigabe belegen.
- **P2** · Sicht-, Hör- und Komfortprüfung mit vier menschlichen Operatoren über vollständige Missionen auf allen Planeten. Breitbild- und Kleinauflösungs-Matrix, Langzeit-Heap, GPU-Speicher und physischer Paketverlust sind NOT TESTED.
- **P3** · Biome-Aufwurf verwendet vorhandene geometrische Partikel und vereinfachte Bodenmaterialien. Eigenständige Blatt- und Vegetationsanimationen unter den Düsen gehören nicht zur Prüfung.

Die vollständige Abnahme von 7.8D setzt Gate K und die ausstehende manuelle Prüfung voraus. Das sind auch die noch offenen Voraussetzungen für eine darauf aufbauende Freigabe von 7.8E.

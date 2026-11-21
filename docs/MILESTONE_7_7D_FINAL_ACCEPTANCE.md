# Milestone 7.7D · Abnahme

Das Audiosystem ist im Client integriert. Der formelle Milestone-Abschluss bleibt bis zu den offenen Hör- und Langzeitprüfungen aus. Das Projekt enthält 62 CC0-Master in 124 lokal ausgelieferten Dateien. Kosten und Creditverbrauch betragen 0 €. Herkunft, Versionsnachweise und reproduzierbare Bearbeitung sind im [Asset-Katalog](AUDIO_ASSET_CATALOG.md) dokumentiert.

## Release Gates

| Gate | Status | Evidenz |
| --- | --- | --- |
| A · Assets | **PASS** | Audiodateien mit verifizierter CC0-Herkunft, SHA-256, bearbeiteten Loops, gemessenem Headroom und zwei dekodierbaren Formaten. |
| B · Planetare Soundscapes | **PASS** | Vier eigenständige Basis- und Wetter-Layer mit messbarem Ausgang. Wetterwechsel übernimmt den synchronisierten 7.7C-Tick. |
| C · Spatial Audio | **PASS** | Kanaltrennung und Distanzdämpfung gemessen. Fahrzeug- und Gegnerquellen folgen den Client-Transforms. Subjektive HRTF-Abnahme offen. |
| D · Bewegung | **PASS** | Oberflächenmapping, Schritte und bestätigte Dive-Landungen getestet. Bewegungs- und Haltungszustände auf vier Planeten im Browser durchlaufen. |
| E · Kampf | **PASS** | Windup und aktive Phase aus autoritativen Horde-Frames, priorisierte Sounds und Dedup bei hoher Ereignislast. |
| F · Dynamic Mixing | **PASS** | Reservierte Plätze für nahe Angriffe und UI-Missionssignale, zeitgesteuertes Ducking und Spitzenschutz. Schutz des Missionssignals unter Überlast geprüft. |
| G · Multiplayer | **PASS** | Vier Clients, Reconnect während laufendem Wetterübergang, identische Audio-Layer und keine Wiedergabefehler. Eine beschleunigte Vier-Client-Mission endete mit gemeinsamer Ballonextraktion. |
| H · Performance | **NOT TESTED** | Kurzzeit-Stimmen- und Cache-Budget bis 1.000 Gegner auf nativer Radeon bestanden. Freigabe der längeren kombinierten Audio-/Renderlast und Speichersoak stehen aus. |
| I · Dokumentation | **PASS** | Audit, Quellen, Pipeline, technische Dokumentation, Testnachweise und Restpunkte vorhanden. |

## Änderungen und offene Arbeit

- Der Mixer erweitert den bestehenden Web-Audio-Graphen. Neue Module unter `apps/client/src/audio` kümmern sich um Buffer-Cache, Soundscapes, Oberfläche, Horde, Missionsereignisse und Prioritäten. `Game.ts` verbindet sie mit Snapshot-Ticks und der vorhandenen Render-Timeline.
- `ArenaView.ts`, `RecoveryView.ts` und `FlightAudio.ts` liefern die bewegten Audio-Positionen und die vorhandenen Deployment-Cues. Die bisherige Waffensynthese und Schuss-Prediction werden im gemeinsamen Budget geführt. `App.tsx`, `AudioLab.tsx`, `main.tsx` und `styles.css` ergänzen Regler, F2-Diagnostik und lokale Hörvorschau.
- `apps/client/public/audio`, `scripts/prepare-audio.py`, die JSON-Kataloge und die Markdown-Dokumente decken die lokale Auslieferung ab. `apps/client/test/audio.test.ts`, `scripts/playtest-audio.mjs` und der erweiterte Horde-Playtest liefern die Tests. Die Änderungen greifen auf die bestehenden Gameplay-Ereignisse und visuellen Quellpositionen zu.
- Die Quellenabdeckung umfasst alle vorgesehenen Runtime-IDs. Fremde Original-Master in WAV/FLAC für die Freesound-Aufnahmen sowie dedizierte professionelle Waffentransienten stehen für spätere Quell-Upgrades aus. Das Fahrzeugdesign verwendet bearbeitete Einzelaufnahmen und gestaltete Effekte. Phase 7.7E kann die Kopfhörerabnahme, längere Belastung, Firefox-/WebKit-Einsatz und bei Bedarf eine begrenzte Abschattung abschließen.

Die Messergebnisse und ausgeführten Prüfungen stehen in [Audio-Performance](AUDIO_PERFORMANCE.md) und [Playtest 7.7D](MILESTONE_7_7D_PLAYTEST.md).

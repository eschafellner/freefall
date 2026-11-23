# Audio-Asset-Lizenzen

Alle in [audio-sources.json](audio-sources.json) aufgeführten Quellfassungen sind als CC0 1.0 ausgewiesen und für kommerzielle Spiele verwendbar. Die verlinkten Veröffentlichungen sind der Nachweis für Freesound und OpenGameArt. Die beiden Kenney-Pakete enthalten zusätzlich eine `License.txt` mit Paketname und CC0-Verweis. Das Spiel enthält bearbeitete Einzeldateien. Der Katalog nennt die Autoren freiwillig. [CC0 1.0 Rechtstext](https://creativecommons.org/publicdomain/zero/1.0/legalcode.de), [Kenney Support](https://kenney.nl/support).

- Freesound für Außenaufnahmen, sandiges und eisiges Foley. Die Downloads sind die öffentlichen HQ-Vorschauen. Die ursprünglichen WAV- und FLAC-Downloads sind auf Freesound an ein Konto gebunden. Bei der Beschaffung gab es CDN-HTTP-403 für weitere Kandidaten. Diese wurden durch einzeln lizenzgeprüfte Samples von OpenGameArt ersetzt.
- OpenGameArt für das Blattstreu-Foley von qubodup, den aus einer Meeresaufnahme gestalteten Carrier-Hintergrund, Kreaturen und den Triebwerksklang des Bergungsjägers. [Blattstreu](https://opengameart.org/content/20-rustles-dry-leaves), [Carrier-Quelle](https://opengameart.org/content/underwater-or-space-engine-rumble), [Creature SFX](https://opengameart.org/content/80-cc0-creature-sfx), [Monster Snarls](https://opengameart.org/content/monster-snarls), [Rocket Engine](https://opengameart.org/content/rocket-engine).
- Kenney für Interface und Albatross aus den unveränderten, von Kenney veröffentlichten Archivmitgliedern. [Interface Sounds](https://opengameart.org/content/interface-sounds), [Sci-Fi Sounds](https://opengameart.org/content/sci-fi-sounds).

Die kostenlose GDC-Sammlung und die Lizenz von Sonniss wurden geprüft. Die 2026er Komplettsammlung umfasst 7,47 GB. Es wurden keine Sonniss-Dateien übernommen oder als eigenständige Bibliothek verteilt. Alle Bearbeitungen liefen lokal mit gewöhnlicher Audiobearbeitung. Kosten und Creditverbrauch betrugen 0. [Sonniss 2026](https://gdc.sonniss.com/), [Sonniss Bundle License v2.0](https://sonniss.com/gdc-bundle-license/).

## Prüfung 7.7E

Der Bremsschub der Landung (`landing-burn`) stammt aus „Large Rocket Engine“ von Zovex auf Freesound (CC0 1.0, am 23. November 2026 geprüft). [Quelle](https://freesound.org/people/Zovex/sounds/237974/)

Am 21. November 2026 wurden alle 16 Freesound-Quellen einzeln gegen die CC0-Angabe der Anbieter geprüft. Die übrigen verwendeten Quellen sind CC0-Pakete von Kenney und die jeweils verlinkten Beiträge von OpenGameArt. Für Creature SFX und Rocket Engine waren die indexierten Originalbeiträge erreichbar. 7.7E ergänzt keine fremden Dateien. Das Projekt verwendet die bestehenden Bearbeitungen und nennt die Urheber freiwillig. [Quellsound-Inventar](audio-sources.json) · [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) · [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) · [Creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) · [Rocket Engine](https://opengameart.org/content/rocket-engine)

## Waffenaufnahmen 7.9A.1

Quellen, Lizenzen, Ausschnitte und Prüfsummen sind im [Waffen-Audiobericht](WEAPON_AUDIO_7_9A.md) und in den gemeinsamen JSON-Manifesten dokumentiert. Die ausgewählten Aufnahmen und Foley-Dateien stehen unter CC0 1.0. Das Spiel liefert die bearbeiteten Ausschnitte in Ogg und MP3 aus.

## Musik

„Silent Watch“ (Startmenü), „Briefing Silence“ (Briefing), „L'Arrée Triomphale“ (Drop) und „Last Stand“ (Ballonextraktion) sind eigene Werke, die der Projektinhaber bereitgestellt hat. Sie fallen nicht unter die CC0-Effektbibliothek und liegen deshalb getrennt in `apps/client/public/music` mit eigenem Manifest. Das Manifest enthält Prüfsummen der Quelle und beider Auslieferungsformate, Lautheit und Kodierung. Die MP3-Fassung ist der unveränderte Audiostrom ohne Metadaten und Cover, die Ogg-Fassung ist Vorbis q5. [Manifest](music-sources.json)

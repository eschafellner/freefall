# Audio-Asset-Katalog

Der Client liefert **75 hörbare Master** in je Ogg Vorbis und MP3 aus. Auf die 62 Master aus 7.7D entfallen 124 Dateien. Die 13 Waffen-Master aus 7.9A.1 ergänzen 26 Dateien. Jede ID bezeichnet lokale Dateien unter `apps/client/public/audio`. Die SHA-256-Werte beziehen sich auf die ausgelieferten Bytes. [Waffen-Zuordnung und Quellen](WEAPON_AUDIO_7_9A.md)

- [Quellen und Eingangsdateien](audio-sources.json) erfasst Originaltitel oder Archivpfad, Anbieter, Download-URL, Lizenznachweis, Abrufdatum, Eingangs-Hash, Kategorie und Planet.
- [Master und Bearbeitung](audio-masters.json) verbindet jede Asset-ID mit ihrer Eingangsdatei und protokolliert Ausschnitt, Kanäle, Filter, Überblendung, Pegel und die Hashes der beiden Zieldateien.

| Laufzeit-IDs | Einsatz | Herkunft |
| --- | --- | --- |
| `ice-bed`, `ice-wind`, `ice-crack-1…3` | Eiswelt, Schneewind und seltenes Eisbrechen | Blizzard- und Schneesturm-Aufnahmen von codgold2 und HECKFRICKER, Eis-Foley von JackMenhorn |
| `desert-bed`, `desert-wind`, `desert-grit-1…3` | Wüste, Wind und Sand | Felix Blumes Mojave-Aufnahme, Winddesign von dhallcomposer, Sand-Foley von thesynesthiser |
| `plains-bed`, `plains-wind`, `grass-rustle-1…3` | Grüne Ebene, Wiese und Rascheln | Garuda1982 und Wigglesworth |
| `forest-bed`, `forest-wind`, `wood-crack-1…3` | Wald, Baumkronen und Holz | Anya_Media, teadrinker und KieranKeegan |
| `snow`, `ice`, `sand`, `grass`, `dirt`, `rock`, `forest-floor` (je 4) | Bewegung und Körperkontakt | Vrymaa, SoundsLikeYukon, thesynesthiser, Fission9, aglinder und qubodup |
| `schabe-hiss-1…3`, `schabe-chitter-1…3`, `schabe-impact-1…2` | Windup, Bewegung, Nahkampf, Tod und Nester | Kreaturendesign von Darsycho und rubberduck |
| `carrier`, `lander`, `recovery`, `hull-impact` | Skyfall Carrier, Albatross 02, Bergungsjäger und Rumpf | gmason, Kenney und theMinesAreShakin |
| `landing-burn` | Bremsschub des Albatross bei der Landung | [Zovex, „Large Rocket Engine“](https://freesound.org/people/Zovex/sounds/237974/) |
| `radio`, `confirm` | Interface und Mission | Kenney Interface Sounds |

Felix Blumes Mojave-Wind ist eine professionelle Außenaufnahme mit Schoeps-Mikrofonen und Sound-Devices-Recorder. Anya_Media und Garuda1982 dokumentieren ebenfalls ihre Aufnahmegeräte. Freesound lieferte öffentlich zugängliche HQ-MP3-Fassungen dieser Aufnahmen. Die in der Quellenliste als gestaltet gekennzeichneten Windsounds, Kreaturen, Triebwerke und UI-Cues sind Sounddesign. [Mojave-Aufnahme](https://freesound.org/people/felix.blume/sounds/187756/), [Waldaufnahme](https://freesound.org/people/Anya_Media/sounds/523389/), [Wiesenaufnahme](https://freesound.org/people/Garuda1982/sounds/639459/).

## Prüfung 7.7E

Chromium und Firefox dekodierten je alle 124 ausgelieferten Dateien. Der Chromium-Lauf erfasste PCM-Sample-Peak, RMS, Dauer und bei Loop-Mastern die dekodierte Naht. Das Inventar einschließlich Quellen und Ausgangsdateien ist mit SHA-256 abgesichert. [Rohdaten 7.7E](playtest/7-7e/audio.json)

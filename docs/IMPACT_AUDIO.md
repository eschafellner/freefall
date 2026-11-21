# Räumliches Impact-Audio

`ImpactAudio` nutzt den Waffenbus, den 3D-Panner, die Distanzdämpfung und den gemeinsamen Voice-Budget-Dienst der bestehenden `AudioEngine`. Die Position ist der bestätigte Weltkontakt. Eigene Schüsse und eigene erlittene Treffer nutzen einen separaten Slot für den Cooldown. Andere Impacts werden nach Abstand begrenzt. Bei Überlastung haben Schüsse, unmittelbare Gegnerangriffe und Missionswarnungen im gemeinsamen Budget Vorrang.

| Material | Klangprofil |
| --- | --- |
| Schnee und Waldboden | Kurzer, gedämpfter Impuls mit weichem Ausklang. |
| Sand, Erde und Gras | Unterschiedlich gefiltertes Korn und dumpfe Resonanz. |
| Stein, gefrorener Stein, Beton | Harter transienter Impuls mit mittlerer Resonanz. |
| Eis | Hohes sprödes Knacken. |
| Holz | Tiefer, kurzer Splitterklang. |
| Metall | Heller Resonanzton mit kurzem Ausklang. |
| Operator, Convict | Gedämpfter Materialimpuls. |
| Schabe, Nest | Die gebündelten zwei Schaben-Samples. Ein Chitin-Synth dient als Fallback während Laden oder bei fehlender Datei. |

Die Synthese rendert drei kurze Mono-Takes pro Profil und begrenzt den Sample-Peak auf 0,85. Sie wiederverwendet die Buffers und variiert Tonhöhe und Pegel leicht. Die Cooldowns liegen bei 46 ms für lokal relevante Impacts, bei 78 ms für nahe und 132 ms für entfernte Remote-Impacts. Es gelten höchstens vier Stimmen je Lane innerhalb des 28-Stimmen-Mixes. Die Hördistanzen für lebende Ziele und Weltkontakte liegen bei 53 m lokal beziehungsweise 34 m remote. Der Todesklang reicht bis 48 m.

Die vorhandenen Samples `schabe-impact-1` und `schabe-impact-2` stammen aus rubberducks `spit-01/02` unter CC0 1.0 und sind weiterhin im 7.7D-Audiokatalog dokumentiert. Oberflächen und Operator-Kontakt nutzen projektnative Synthese. Zusätzliche Kosten **0 €**.

- [Assetkatalog](AUDIO_ASSET_CATALOG.md)
- [Lizenzen und Herkunft](AUDIO_ASSET_LICENSING.md)

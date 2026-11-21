# Biome und Materialkontakt · 7.8C

Der Server verwendet die Oberflächenklassifikation aus 7.8B. Ist die Granate noch unmittelbar am Hindernis ihres letzten blockierenden Kollisionspunkts, gewinnt dessen Material. Bodennah entscheidet die Terrainoberfläche am Detonationspunkt. Das Höhenfeld liefert die Normale des betroffenen Dreiecks. Auf dem Arena-Boden gelten die vorhandenen Beton-, Erd- und Metallzonen. Ohne Kontakt gibt es eine Luftdetonation mit Kern, Rauch und Fragmenten. Ein unbekannter Materialwert fällt auf das neutrale Profil zurück.

| Kontakt | Präsentation |
| --- | --- |
| Schnee | Heller Frostaufwurf, kühle Körnung und kleine helle Flocken |
| Eis | Dichter, kühler Splitterakzent mit geringer Staubdichte |
| Sand | Warmer Sandstaub, trockene Körner, stärkster Winddrift |
| Erde | Braune Bodenkörner und kurzer, gedämpfter Erdaufwurf |
| Gras | Erde mit einzelnen grünen, flachen Fragmenten |
| Waldstreu | Erdfarbener Staub und abgeflachte ockerfarbene Blätter |
| Holz | Schmale Holzsplitter mit zurückhaltendem Staub |
| Fels, gefrorener Fels, Beton | Kleinere kantige Bruchstücke und jeweils eigener Mineralton |
| Metall | Kurze glühende Funken mit geringer Staubdichte |

Wind kommt aus der bereits replizierten und für die Szene interpolierten Atmosphäre. Er bewegt leichte Partikel entlang der Oberfläche. Vegetation, Boden und Kollisionsmodell behalten ihre Simulationszustände. Wände und Props werden an ihren vorhandenen Kollisionsflächen ausgewertet. Runde sichtbare Modelle können von ihrer vereinfachten Kollisionsbox abweichen.

[Browserproben](MILESTONE_7_8C_PLAYTEST.md) · [Materialaudio](EXPLOSION_AUDIO.md)

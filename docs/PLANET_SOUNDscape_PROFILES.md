# Soundscape-Profile 7.7D

| Planet-ID | Grundbett | Wetter-Layer | Akzente | Wetter-IDs |
| --- | --- | --- | --- | --- |
| `ice` | `ice-bed` | `ice-wind` | Eisbruch | clear-cold, overcast, light-snow, windy-snow |
| `desert` | `desert-bed` | `desert-wind` | Sandbewegung | dry-clear, dust-haze, windy, light-dust-gusts |
| `green-plains` | `plains-bed` | `plains-wind` | Grasrascheln | clear, cloudy, windy, light-mist |
| `forest` | `forest-bed` | `forest-wind` | Holzknacken | forest-calm, windy-forest, ground-mist, overcast-forest |

`Soundscape.ts` nutzt Planet-ID, World-ID und bestehende Wetter-Endpunkte aus 7.7C. Die Mischung interpoliert die Lautstärkekurve mit dem Server-Tick und `weatherEase` und moduliert sie mit `sampleWind`. Die Windrichtung beeinflusst die Platzierung seltener One-Shots. Morgen- und Abenddämmerung senken das Grundbett leicht ab. Ältere feste Oberflächenmissionen ohne Planet-ID spielen das grüne Profil.

Die Grundbetten dauern rund 76–145 s und starten versetzt zum separaten Wetter-Layer. Seltene One-Shots liegen je Profil im Bereich 18–70 s mit zufälliger Variation. Beim Eintritt, Wechsel und Verlassen einer Oberfläche blenden die Betten in etwa 1,4–3,1 s ein oder aus. Ein Wetterwechsel verändert den Pegel des laufenden Wind-Layers. Kontextwechsel und Reconnect bauen Layer aus dem aktuellen Zustand auf.

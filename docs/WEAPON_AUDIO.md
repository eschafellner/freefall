# Waffen-Audio

## Architektur

```text
Gameplay-Events (shot, combat: reload/melee/blast/resupply, Waffenwechsel aus Snapshots)
        │                         keine Audiodaten im Netzwerk
        ▼
WeaponAudio (apps/client/src/audio/WeaponAudio.ts)   geschichtete Synthese pro Ereignis
        │
AudioEngine (apps/client/src/audio/AudioEngine.ts)
   Quellen → Bus (weapons | environment | ambience | weather | ui) → Master → Limiter → Ausgabe
        └─ Send → Faltungshall (Umgebungs-IR) + Echo mit Rückkopplung → environment-Bus
```

Eine gemeinsame `AudioContext`-Instanz für Waffen, Explosionen und die Flug-Cues (`FlightAudio` nutzt jetzt den Umgebungsbus). Jeder Client erzeugt die Klänge selbst aus synchronisierten Ereignissen und seiner Hörerposition.

## Klangschichten eines Schusses

| Schicht | Umsetzung | Sturmgewehr | Pistole |
| --- | --- | --- | --- |
| Schussimpuls (trocken) | Rauschen, Bandpass + Hochpass, wenige Millisekunden | 2,6 kHz, 45 ms | 3,6 kHz, 30 ms, schärfer |
| Tieffrequenter Druck | Sinus mit fallender Tonhöhe durch weiche Sättigung | 105 Hz, kräftig | 150 Hz, kürzer |
| Mechanik | resonanter Klick (Verschluss / Schlitten), nur nah | ein Klick | Schlitten vor und zurück |
| Hall / Echo | tiefpassgefiltertes Rauschen in den Umgebungs-Send | 0,42 s | 0,3 s |
| Hülse | kurzer metallischer Ping auf dem Boden | nur eigene Schüsse | – |

Pro Schuss variieren Tonhöhe und Pegel zufällig (`variation` 6–7 %), damit kein identisches Dauergeräusch entsteht. Nachladen (Magazin lösen, fallen lassen, einsetzen, Durchladen), Waffenwechsel, Nahkampf (Luftzug, Aufprall), Nachschub (Klappe, Rasseln) und Explosionen (Druck, Subbass, Erdreich, langer Hall) sind eigene Ereignisse.

## Räumliches Audio und Entfernung

- Verzögerung um `Entfernung / speedOfSound` (343 m/s): Ferne Schüsse kommen hörbar später.
- Pegelabfall `1 / (1 + d / 14)`, Hörweite 150 m.
- Überblendung nah → fern zwischen 22 und 95 m: Impuls und Mechanik verschwinden, ein dumpfer Knall und mehr Reflexionen bleiben, Tiefpass schließt bis ca. 1,6 kHz.
- Stereo-Panorama aus der Richtung relativ zum Kamerablick, leichte Dämpfung für Quellen hinter dem Hörer. Hörer = vorhergesagte eigene Position + Kamera-Yaw.

## Umgebungen (`combat.json › audio.environments`)

| Profil | Einsatz | Hall | Echo | Charakter |
| --- | --- | --- | --- | --- |
| `carrier` | Skyfall Carrier (Hangar, Boarding) | 0,9 s, Anteil 0,30 | 45 ms, Rückkopplung 0,32 | metallische Resonanzen (463 / 1187 Hz), kurzer Industriehall |
| `open-field` | Dev' Ault (Operation Bodenbruch) | 2,4 s, Anteil 0,16 | 0,42 s, Rückkopplung 0,22 | wenig direkter Raumhall, späte breite Geländereflexionen |
| `outpost` | Testarena Boreal Relay | 1,3 s, Anteil 0,2 | 0,18 s | gemischt |

Die Impulsantworten werden beim Start einmal prozedural erzeugt; der Wechsel blendet in 0,25 s über.

## Stimmen- und Pegelmanagement

- `maxVoices` 28 gleichzeitige Klangereignisse, `maxVoicesPerShooter` 4. Die Stimmeinteilung und Reservierung für nahe Angriffe und Missionssignale stehen in [Horde-Audio](HORDE_AUDIO_PRIORITIZATION.md). Zähler im F2-Panel (aktiv, Spitze, verworfen).
- Der Server sendet höchstens 48 `combat`-Events pro Tick.
- Limiter (`DynamicsCompressor`, −6 dB, Ratio 20, 2 ms Attack) am Master gegen Clipping und Spitzen.
- Das Menü regelt Master, Kampf, Welt, Ambience, Wetter und Interface. [Audio-Mischung](AUDIO_MIXING.md).

## Eigene Schüsse

Eigene Schüsse werden sofort beim vorhergesagten Abzug gespielt (siehe Recoil-Prediction in `Game.predictShot`), das Server-Echo spielt dann keinen zweiten Klang. Fremde Schüsse folgen dem Server-Event `shot`.

## Assets und Lizenzen

Waffenimpulse, Explosionen, Mechanik und Nachladen bleiben synthetisiert. 7.7D ergänzt lokale Aufnahmen und gestaltete Samples für Welt, Bewegung, Gegner und Missionsereignisse. [Audio-Asset-Katalog](AUDIO_ASSET_CATALOG.md).

Anforderungen für aufgenommene Assets (die Pipeline ist darauf vorbereitet: Busse, Raum-Sends, Distanzkette und Stimmenlimit gelten unverändert; ein Sample ersetzt die Impuls- und Druckschicht):

| ID (Vorschlag) | Inhalt | Format |
| --- | --- | --- |
| `audio.kestrel.close.01–06` | Sturmgewehr nah, trocken, ohne Hall, 6 Varianten | 48 kHz, 24 bit, mono, 300–500 ms, Peak −1 dBFS |
| `audio.kestrel.distant.01–03` | Sturmgewehr 100–300 m | mono, 1–2 s |
| `audio.kestrel.mech.01–03` | Verschlussgeräusch ohne Knall | mono, < 150 ms |
| `audio.p01.close.01–06`, `audio.p01.slide.01–03` | Pistole nah, Schlitten | wie oben |
| `audio.reload.{rifle,pistol}.{release,drop,insert,charge}` | Nachladeschritte | mono, < 400 ms |
| `audio.frag.close.01–03`, `audio.frag.distant.01–02` | Explosion nah/fern | mono, 1,5–3 s |
| `audio.melee.{swing,impact}`, `audio.supply.{open,rattle,close}` | Nahkampf, Container | mono |

Quellen nur mit nachweisbarer Lizenz (z. B. eigene Aufnahmen, CC0 mit dokumentierter Herkunft oder gekaufte Bibliotheken mit Spiele-Lizenz). Herkunft, Lizenz und Bearbeitung pro Datei in diesem Dokument nachtragen.

## Tests und Messung

Der [Playtest-Bericht](MILESTONE_7_7D_PLAYTEST.md) sammelt Browsermessungen und den Stand der Höraufgaben.

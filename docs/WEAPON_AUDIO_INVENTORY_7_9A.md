# FREEFALL 7.9A.1 · Waffen-Audio vor der Umstellung

Prüfstand `ffc8191`, Balance-Release 7.3, Schema 2, Hash `01855759529dd588`. Der Audit für 7.9 liegt vor. Waffen, Audio, Netzwerk und Animationszeitpunkte wurden im Code erneut geprüft.

| Waffe | Kestrel AR-01 | P-01 Dienstpistole |
| --- | --- | --- |
| ID, Kategorie, Slot | `kestrel-ar-01`, Sturmgewehr, primär | `p-01`, Pistole, sekundär |
| Abzug | Gehaltenes Feuer, 10 Schuss/s, Takt 3 Serverticks | Gehaltenes Feuer, 4 Schuss/s, Takt 7,5 Serverticks |
| Magazin / Reserve | 45 / 8 volle Magazine | 12 / 4 volle Magazine |
| Schaden / Reichweite | 24 / 72 m | 21,6 / 44 m |
| Effektiver Rückstoß je Schuss (Nick/Gier) | 0,36° / 0,22°, Dauerfeuer bis ×1,6 | 0,85° / 0,25°, Dauerfeuer ×1 |
| Reload ab Start bei 30 Hz (Entnahme / Insertion / bereit) | 13 / 45 / 63 Ticks | 8 / 30 / 44 Ticks |
| Ursprüngliches Schussprofil | `rifle`: Rauschtransiente, Oszillator, Mechanik, Reflexionen, gelegentlicher lokaler Hülsenton | `pistol`: Rauschtransiente, Oszillator, Mechanik, Reflexionen |
| Ursprüngliche Handhabung | Synthetische Magazin-, Lade- und Wechselgeräusche | Synthetische Magazin-, Lade- und Wechselgeräusche |

Beide Waffen laden bei gehaltenem Abzug an einem leeren Magazin automatisch nach, sofern Reserve vorhanden ist. Beim taktischen Reload wird die Restmunition genau bei der bestätigten Insertion verworfen. Ein vorheriger Abbruch erhält sie. Ein leerer Abzug ohne Reserve hat kein bestätigtes Dry-Fire-Ereignis. Die gezeichnete Waffenübergabe erfolgt in der Mitte des serverseitig bestätigten Wechsels. Magazinbewegungen folgen den Reload-Zeitpunkten. Die Pistolenmechanik bewegt den Schlitten beim Schuss und gibt ihn bei der Insertion frei. Es gibt keinen eigenen interaktiven Bolt-, Charging-Handle- oder Hülsen-Gameplay-Schritt. Convicts haben sieben Kestrel-Kits, deren serverseitige Schüsse akustisch zum Primärwaffenprofil geroutet werden.

Die lokale Schussvorhersage spielt sofort aus `Game.predictShot`. Serverbestätigte `ShotEvent`s werden über die Identität `tick:shooter` zugelassen. Leben und Slot sichern die Zuordnung zur lokalen Vorhersage ab. Remote-Schüsse laufen über den Wiedergabezeitpunkt der Waffenpose. `CombatEvent` meldet Reload-Start, Insertion und Abbruch. Die bestehenden Operator-Snapshots enthalten zusätzlich die autoritativen Reload- und Wechselzeitpunkte samt Lebensidentität. Der Reload-Clip und die prozedurale Magazinpose folgen diesem Zeitplan.

Der Client besitzt einen nativen Web-Audio-Context mit Freigabe per Nutzergeste, Master und fünf Bussen, einen Limiter, Ducking, Stereo-Panning für Waffen, positionsabhängige Sample-Wiedergabe für andere Kategorien, räumliche Effekte und Umgebungs-Sends. Asset-Loader, 80-MiB-PCM-Cache, Codec-Fallback, 28 Stimmen und die Grenze von vier je Quelle sind vorhanden. Einzelsamples werden dekodiert und als Puffer wiederverwendet. Session-Cleanup räumt Stimmen und Audiozustände auf. Der bisherige Waffenpfad enthielt keine aufgenommenen Schüsse oder Handhabungsgeräusche und keine Waffensamples mit ungeklärter Lizenz.

Die Vorprüfung isolierte das Dauerfeuerproblem im vorhandenen Budget. Bei 20 lokalen Kestrel-Reservierungen im Abstand von 100 ms mit je 0,62 s Belegungszeit wurden 12 angenommen und 8 verworfen. [Balance-Quelle](../packages/shared/src/balance/data/weapons.json) · [Kampfsystem](../apps/server/src/systems/combat.ts) · [Audioarchitektur](AUDIO_ARCHITECTURE.md) · [7.8-Abnahme](MILESTONE_7_8_FINAL_ACCEPTANCE.md)

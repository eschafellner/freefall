# Pools und Qualitätsgrenzen · 7.8C

| Stufe | Aktive Explosionen | Rauch und Staub je Slot | Splitter je Slot | Dynamische Explosionslichter |
| --- | ---: | ---: | ---: | ---: |
| LOW | 4 | 2 + 2 | 4 | 0 |
| MEDIUM | 8 | 4 + 4 | 8 | 1 |
| HIGH | 12 | 6 + 6 | 12 | 1 |

Es gibt höchstens zwei Kernbillboards je Slot. Das sind insgesamt bis zu 40, 144 und 312 sichtbare Explosionsinstanzen pro Qualitätsstufe. Flugkörper haben einen eigenen Instancing-Pool. Bei Entfernung oder reduzierter Bewegung sinkt die Sekundärdichte etwa auf die Hälfte. Materialstaub wird oberhalb von 62 m ausgelassen, Explosionen oberhalb von 105 m werden optisch verworfen. Bei Sättigung darf ein näherer oder frischer Effekt einen ungünstigeren Slot übernehmen. Audio und Gameplay-Zustellung verwenden eigene vorhandene Budgets.

Alle Geometrien, Texturen, Shader, Instanzattribute und Slotzustände werden beim Aufbau erzeugt. Der Renderer aktualisiert nur belegte Abschnitte von Matrix-, Farb- und Alphaattributen. Explosion, Rauch, Staub und Splitter teilen drei Instanzbatches. Die Kamera-relative Lichtwertung setzt höchstens ein vorab angelegtes schattenloses Licht. Melee verwendet den gemeinsamen 7.8B-Impact-Pool. Ablauf, Quality-Wechsel und Szenenwechsel leeren die belegten Plätze. `ArenaView.dispose` gibt Szenengeometrien, Materialien, Texturen und Instanzbuffer frei.

Die F2-Telemetrie zeigt aktive Granaten, Slots, bestätigte Ereignisse, Rauch, Staub, Splitter, Licht, Pool-Wiederverwendung, Kürzungen, Updatezeit, Kontakt und Detonationsposition. Audio-Voice- und Impact-Anzeigen liegen im selben Overlay.

# Impact-Pools und Skalierung

| Profil | Gemeinsame Tracer-/Impact-Slots | Korn je naher Treffer | Partikel-Obergrenze | Distanz nah / aus |
| --- | ---: | ---: | ---: | ---: |
| Low | 20 | 3 | 100 | 12 / 30 m |
| Medium | 36 | 6 | 288 | 21 / 48 m |
| High | 56 | 9 | 616 | 31 / 67 m |

Die konservativen Partikelobergrenzen enthalten bis zu zwei Staubpunkte pro Slot. Low, die Fernstufe und reduzierte Bewegung verwenden höchstens einen Staubpunkt und die Fernstufe bzw. reduzierte Bewegung höchstens zwei Kornpartikel. Normale Effekte enden nach 180–375 ms, der Tracer nach 72 ms. Die vorhandene Todesdarstellung belegt ihren Slot bis zu 790 ms.

Der Pool belegt zuerst einen freien oder abgelaufenen Slot und ersetzt bei voller Belegung einen Eintrag gleicher oder geringerer Priorität. Eigene Kontakte und nahe Treffer haben Vorrang. Ein gemeinsamer Points-Batch und ein Tracer-Batch verwenden wiederverwendbare dynamische Attribute. Szene, Leben und Qualitätswechsel räumen die aktiven Effekte auf. Die Render-Szene besitzt den finalen Dispose-Pfad der gemeinsamen Geometrien. Das HUD wird durch die Grafikbudgets nicht gekürzt.

F2 zeigt zur Laufzeit aktive Impacts, Partikel, Kapazität, Annahmen pro Sekunde, Reuse, Kürzungen und CPU-Zeit. Der Server braucht für diese Budgets keine zusätzlichen Tick-Schleifen.

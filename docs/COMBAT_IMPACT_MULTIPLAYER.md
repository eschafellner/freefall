# Impacts im Koop

Sobald der Server den Schuss simuliert hat, repliziert `FreefallRoom` dieselbe `shot`-Nachricht an den Raum. Die Nachricht enthält die vorhandene Position und ergänzende Material- oder Zielinformationen. Partikel und Audio werden bei jedem Empfänger aus dem Ergebnis aufgebaut.

Lokale Waffenstöße bleiben unmittelbar. Bei Remote-Operatoren koppelt die vorhandene Posen-Warteschlange die Laufreaktion, den bestätigten Tracer und das Impact-Audio an den Render-Tick. Ein gültiges verspätetes Paket übernimmt den Weltkontakt, auch wenn die passende Waffenpose bereits vorbei ist. Wiederholte Schüsse werden vor Audio, HUD und VFX gefiltert. Der erste aktuelle Player-Snapshot nach Wiederverbindung setzt die Untergrenze für neu darstellbare Treffer.

- [Empfangsfenster und Schussidentität](HIT_EVENT_DEDUPLICATION.md)
- [Playtest, Latenz und Reconnect](MILESTONE_7_8B_PLAYTEST.md)

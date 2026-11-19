# Netzwerk: Vorhersage, Eingabepuffer und Interpolation

Stand Milestone 7.1. Die Ursachenanalyse steht in [MOVEMENT_SMOOTHNESS.md](MOVEMENT_SMOOTHNESS.md), die Messungen in [PERFORMANCE_BASELINE_7_1.md](PERFORMANCE_BASELINE_7_1.md).

## Takte

| Strom | Rate | Inhalt |
| --- | --- | --- |
| Simulation (Server und Client-Vorhersage) | 30 Hz, fester Schritt | `movePlayer()` aus `packages/shared/src/config/movement.ts` |
| `input` Client → Server | eine Nachricht pro vorhergesagtem Schritt | Sequenz, Achsen, Yaw/Pitch, Sprint, Feuer, optional Aim/Reload/Ausrüstung |
| `players` | 20 Hz, also abwechselnd 1 und 2 Ticks Abstand | Spielerzustand, `ack`, Lebensnummer |
| `horde` / `horde-wide` | 10 Hz | binärer Gegnerframe |

## Eingaben auf dem Server

Ab 7.1 bewegt **jede empfangene Eingabe den Operator genau einmal**, in Sequenzreihenfolge (`Battlefield.consumeMoves`). Vorher galt pro Tick die jeweils neueste Eingabe. Das führte zu doppelten und ausgelassenen Schritten und damit zu laufenden Korrekturen beim Client.

```
receiveInput → validieren → player.input = neueste (Feuer, Blick, Ausrüstung, Reload wie bisher)
            → player.moves.push(input)            (max. 10, älteste fällt heraus)
step        → credit = min(3, credit + 1)
            → Warteschlange leer?   → "ausgehungert", warten
            → nach kurzer Lücke (≤ 4 Ticks): cushion + 1 (max. 3)
            → warten, bis moves.length > cushion
            → 1 Eingabe ausführen, ack = deren seq
            → Rückstand > cushion + 2: weitere Eingaben mit dem Guthaben abbauen
```

| Parameter (`MOVEMENT_INPUT`) | Wert | Zweck |
| --- | ---: | --- |
| `queue` | 10 | Obergrenze der Warteschlange. Flutende Clients verlieren die ältesten Eingaben. |
| `budget` | 3 | Höchstens 3 Schritte pro Tick. Im Mittel bleibt es bei einem Schritt pro Tick. |
| `backlog` | 2 | Rückstand über Puffer + 2 wird beschleunigt abgebaut. |
| `maxCushion` | 3 | Adaptiver Jitter-Puffer: bis zu 3 zurückgehaltene Eingaben (100 ms). |
| `jitterGapTicks` | 4 | Nur Lücken bis 4 Ticks zählen als Jitter. Längere sind Pausen. |
| `cushionDecayTicks` | 1.800 | Der Puffer schrumpft nach 60 s ohne neue Lücke um eine Eingabe. |

Eigenschaften:

- **Server bleibt autoritativ.** Die Position entsteht ausschließlich aus `movePlayer()` mit Welt- und Tether-Grenzen. Der Client meldet nur Absichten.
- **Kein Speedhack.** Pro Tick gibt es höchstens `budget` Schritte, im Mittel die Tickrate. Ein Test flutet 40 Eingaben in einem Tick und prüft die Obergrenze.
- **Bitgenaue Vorhersage.** Der Client replayt dieselben Eingaben mit derselben Funktion. Ein Test prüft Gleichheit bis aufs Bit bei unregelmäßiger Ankunft.
- **Gleichmäßige Remote-Bewegung.** Im Normalfall wird ein Schritt pro Tick ausgeführt. Der Puffer verhindert unter Jitter das Muster 0, 2, 0, 2.
- **Kosten.** Der Puffer verzögert nur die Bestätigung und die Remote-Darstellung um 0–3 Ticks, nicht die lokale Figur. Im LAN bleibt er bei 0.
- Mission: `place()`, Disconnect und Extraktions-Lift leeren die Warteschlange mit `clearMoves()` und bestätigen alles Empfangene.

## Lokale Vorhersage und Reconciliation

`Prediction` (`apps/client/src/game/Prediction.ts`):

1. Pro 30-Hz-Schritt wird die Eingabe gesendet, in `pending` (max. 24) gelegt und lokal mit `movePlayer()` angewandt.
2. Bei jedem `players`-Snapshot wird die Serverposition übernommen. Bestätigte Eingaben (`seq ≤ ack`) fallen heraus, offene werden erneut angewandt.
3. Die Differenz zur vorherigen Vorhersage ist die **Korrektur**. Sie verschiebt das Interpolationssegment und wird als Offset sichtbar gehalten, der mit 18/s abklingt (≈ 55 ms). Die Kollisionsposition selbst ist sofort korrekt.
4. Korrekturen über 2 m sowie neues Leben, Tod oder erster Zustand werden sofort übernommen (Snap). Große Desyncs werden nicht durch langsame Interpolation versteckt.
5. `rendered` interpoliert zwischen vorletztem und letztem Schritt mit dem Akkumulator-Anteil (siehe [MOVEMENT_SMOOTHNESS.md](MOVEMENT_SMOOTHNESS.md)).

Treffer, Interaktionen und Server-Raycasts verwenden nie `rendered`. Interaktionsprüfungen auf dem Client nutzen `position`, der Server prüft selbst.

## Remote-Operatoren und Gegner

`Timeline` (`apps/client/src/game/Timeline.ts`) puffert bis zu 12 Snapshots pro Strom, ältere fallen heraus.

- **Uhrbezug.** Für jeden Snapshot wird `Ankunft − tick · 33,3 ms` gespeichert. Das Minimum eines 3-s-Fensters ist der schnellste beobachtete Pfad. Die Streuung darüber ist Jitter (95. Perzentil).
- **Zielverzögerung.** Sie ergibt sich als größter Snapshot-Abstand + Jitter P95 + 0,6 Ticks, begrenzt auf 2,5–8 Ticks (`INTERPOLATION`). Bei 20 Hz Spielersnapshots auf Loopback liegt sie bei etwa 3,5 Ticks (117 ms). Vorher war sie fest auf 4 Ticks (133 ms) über dem gleitenden Mittel eingestellt.
- **Wiedergabe.** Die Wiedergabeuhr läuft in Echtzeit und wird mit höchstens ±8 % zur Zielverzögerung gezogen. Erst ab 6 Ticks Abweichung wird neu verankert. Vorher sorgte ein monotoner Clamp dafür, dass die Wiedergabe bei Ankunftsschwankungen hielt und dann sprang.
- **Extrapolation.** Nur Operatoren werden extrapoliert, höchstens 3 Ticks (100 ms) über den neuesten Snapshot hinaus, linear entlang des letzten Segments. Danach halten sie. Winkel werden nicht extrapoliert, Granaten ebenfalls nicht. Gegner halten am neuesten Frame.
- **Diskontinuitäten.** `remotePose()` interpoliert nicht über eine neue Lebensnummer oder über Sprünge schneller als 2× Sprinttempo. Die Pose wechselt dann in der Mitte des Segments.

Die Werte sind in `packages/shared/src/config/arena.ts` als `INTERPOLATION` konfigurierbar.

## Telemetrie (F2 → Panel „Bewegung“)

| Anzeige | Bedeutung |
| --- | --- |
| Snapshots / Jitter | gemessene `players`-Rate und Ankunftsjitter P95 |
| Interp. / Puffer | Zielverzögerung und aktueller Abstand zum neuesten Snapshot |
| Extrapol. / gehalten | Anteil der Frames, die extrapoliert wurden oder am Limit hielten |
| Prediction Error | aktueller sichtbarer Korrekturoffset |
| Korrekturen/s / letzte, Korr. max / Snaps | Reconciliation-Ereignisse |
| Unbestätigte Eingaben | offene Vorhersageschritte: Roundtrip plus Server-Eingabepuffer |

Bodenmarker zeigen die letzte bestätigte Serverposition (orange) und die simulierte Vorhersage (cyan). Die gerenderte Figur steht zwischen beiden.

# Serverbestätigte Treffer

`fireWeapon` enthält weiterhin die bestehenden Regeln für Munition, Haltung, Rückstoß, Streuung, Reichweite, Hindernisse, Zielreihenfolge und Schaden. Der Aufruf gibt seine bestehende `ShotEvent`-Struktur mit einem optionalen `impact` zurück. `toX/toY/toZ` bleiben der validierte Endpunkt.

- `world` enthält Material und Normale des tatsächlichen Kontakts.
- `enemy` enthält die Schaben-ID in `enemy`, die Normale der Trefferkugel und den autoritativen Todesstatus in `eliminated`. Convict-Waffen behalten ihren bestehenden direkten Trefferpfad und nutzen die Schussrichtung für die Normale.
- `operator` setzt angewandten Schaden voraus und enthält die bestätigte Generation `life` des Ziels in `ally`.
- `convict` und `nest` setzen ebenfalls angewandten Schaden voraus. Die betroffene ID steht in `ally` beziehungsweise `nest`.
- Reichweitenende, ein geschütztes Ziel und der vorhandene Nullstreckenabbruch liefern einen Schuss ohne Impact. Ein von Waffen- oder Haltungsregeln verworfener Schuss erzeugt kein Server-Ereignis.

`HitFeedback.ts` wählt das eigene HUD-Zeichen aus dem autoritativen Schuss. Die Schabe setzt den normalen Marker für 135 ms oder den Todesmarker für 260 ms. Das Nest setzt den normalen Marker. Verbündete setzen ein blaues Zeichen für 200 ms. Der Kill-Marker hat bei Überlappung Vorrang. Der vorhandene Friendly-Fire-Hinweis beruht auf dem separaten, angewandten Schaden. Der Empfänger behält seine HP-basierte Schadensanzeige.

Die unmittelbare lokale Prediction umfasst die 7.8A-Waffenreaktion, Mündung, Schussaudio und Rückstoß. Der bestätigte Tracer übernimmt den Serverendpunkt. Sämtliche Impact-Partikel und Impact-Sounds folgen dem empfangenen `impact`.

- [Audit und Ausgangsstand](COMBAT_IMPACT_ARCHITECTURE.md)
- [Identität und Empfang](HIT_EVENT_DEDUPLICATION.md)

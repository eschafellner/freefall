# Combat HUD 7.8D

Das bestehende React-HUD bleibt an `GameStatus` und replizierte Spielerzustände gebunden. `EquipmentHud.tsx` rendert das aktive und das zweite Magazin, Reservemagazine, Granaten, Stim-Ladungen und die autoritativen Aktions- und Nachladetimer. In gesperrten Haltungen zeigt die Ausrüstung die Sperre als Text. Der Nachladehinweis zeigt den erwarteten Verlust bis zum Einsetzen des Magazins. Der bestätigte `MAGAZINE_INSERTION`-Event liefert die tatsächlich verworfenen Patronen. Ein abgebrochener Magazinwechsel liefert eine eigene Anzeige. Zwischen Bestätigung und Anzeige bleibt der replizierte Ausrüstungsplatz maßgeblich.

Das zentrale Reticle bleibt visuell stabil. Die Bestätigung erscheint als separate Form über dem Reticle. Einfache Raute steht für Trefferschaden, stärkere doppelte Raute für bestätigte Eliminierung, ein gestrichelter Rahmen für validierten Verbündetentreffer. Weltkontakte, blockierte geschützte Ziele, Fehlschüsse und vorhergesagte Mündungsblitze erzeugen keinen Trefferindikator. Auflösungen laufen nach 130–300 ms aus. `ShotHistory` filtert Schussechos; `CombatPresentation` begrenzt und dedupliziert Nahkampf, Granate und Explosion.

Die Lebensanzeige hält „Kritisch“ als Text sichtbar. Schadenspfeile sind ein begrenzter DOM-Pfad außerhalb des React-Renderzyklus. Der Client aktualisiert Form und Winkel entlang der vorhandenen Kamera, während Zustand und Lebenspunkte aus der Serverreplikation stammen.

- [Serverbestätigte Treffer](SERVER_VALIDATED_HIT_FEEDBACK.md)
- [Schadensrichtung und Eigenbeschuss](OPERATOR_DAMAGE_FEEDBACK.md)
- [Priorisierte Meldungen](MISSION_NOTIFICATION_SYSTEM.md)

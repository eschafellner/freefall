# Combat HUD 7.8D

Das bestehende React-HUD bleibt an `GameStatus` und replizierte Spielerzustände gebunden. `EquipmentHud.tsx` rendert das aktive und das zweite Magazin, Reservemagazine, Granaten, Stim-Ladungen und die autoritativen Aktions- und Nachladetimer. In gesperrten Haltungen zeigt die Ausrüstung die Sperre als Text. Der Nachladehinweis zeigt den erwarteten Verlust bis zum Einsetzen des Magazins. Der bestätigte `MAGAZINE_INSERTION`-Event liefert die tatsächlich verworfenen Patronen. Ein abgebrochener Magazinwechsel liefert eine eigene Anzeige. Zwischen Bestätigung und Anzeige bleibt der replizierte Ausrüstungsplatz maßgeblich.

Das zentrale Reticle bleibt visuell stabil. Die Bestätigung erscheint als separate Form über dem Reticle. Einfache Raute steht für Trefferschaden, stärkere doppelte Raute für bestätigte Eliminierung, ein gestrichelter Rahmen für validierten Verbündetentreffer. Weltkontakte, blockierte geschützte Ziele, Fehlschüsse und vorhergesagte Mündungsblitze erzeugen keinen Trefferindikator. Auflösungen laufen nach 130–300 ms aus. `ShotHistory` filtert Schussechos; `CombatPresentation` begrenzt und dedupliziert Nahkampf, Granate und Explosion.

Die Lebensanzeige hält „Kritisch“ als Text sichtbar. Schadenspfeile sind ein begrenzter DOM-Pfad außerhalb des React-Renderzyklus. Der Client aktualisiert Form und Winkel entlang der vorhandenen Kamera, während Zustand und Lebenspunkte aus der Serverreplikation stammen.

- [Serverbestätigte Treffer](SERVER_VALIDATED_HIT_FEEDBACK.md)
- [Schadensrichtung und Eigenbeschuss](OPERATOR_DAMAGE_FEEDBACK.md)
- [Priorisierte Meldungen](MISSION_NOTIFICATION_SYSTEM.md)

## Einsatz-HUD (Überarbeitung)

Im Feld bleiben nur Trupp, eigene Ausrüstung und dringende Hinweise sichtbar. Ziele und Lage öffnen sich mit **Tab** (gedrückt halten). **Esc** gibt den Mauszeiger frei und öffnet das Pausenmenü.

- **Links, Trupp (`TeamPanel`, `FieldHud.tsx`).** Eine Karte pro Operator mit Teamfarbe, Name, Lebensbalken und Status (Offline, Gefallen, Gesichert). Level und Rang sind Platzhalter (`OPERATOR_RANK`: Level 1 · Operator), bis es Fortschritt gibt. Mit Tab zeigt jede Karte die Ausrüstung: beide Waffen mit Magazin und Reserve, Granaten und Heilstims.
- **Rechts unten, eigene Ausrüstung (`CombatLoadout`, `EquipmentHud.tsx`).** Lebenspunkte und Heilstims oben, darunter die gezogene Waffe groß mit Icon, Munition, Reservemagazinen und Magazinbalken. Die geholsterte Waffe und die Granaten folgen als kompakte Zeilen. Nahkampf bleibt belegt, erscheint aber nicht im HUD. Nachlade- und Aktionsfortschritt sowie Munitionshinweise stehen unter der Waffe.
- **Oben Mitte (`FieldAlerts`).** Nur dringende Hinweise: Extraktionstimer, Ballon einsetzen, Schwarmdurchbrüche, dazu der Hinweis „Tab Einsatzinfo“.
- **Tab-Übersicht (`IntelOverlay`).** Missionsname, Fortschritt der Primärziele, Zielliste mit Status und die Lageparameter: Bedrohung, Einsatzzeit, Planet, Schwierigkeit, Tageszeit, Wetter (mit Telemetrie), aktive Nester, Durchbrüche, Zustand des Albatross und Sammelpunkt.
- **Icons (`HudIcons.tsx`).** Jede Waffe und jedes Ausrüstungsteil hat ein eigenes SVG-Icon, verknüpft über die Waffen-ID. Unbekannte Waffen fallen auf das Icon ihres Slots zurück.

`scripts/playtest-field-hud.mjs` landet direkt im Einsatz und nimmt das HUD normal und mit gehaltener Tab-Taste auf.

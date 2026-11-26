# Waffen-Audio

Die Kestrel AR-01 und die P-01 verwenden jeweils zwei Nahaufnahmen und eine eigene Distanzaufnahme. Ein gültiger Schuss startet eine kurze Einmalwiedergabe. Distanzübergänge überblenden zwei Aufnahmen innerhalb derselben Stimme. Tonhöhe ±2 % und Pegel ±4 % variieren pro Schuss. Die Aufnahme trägt Transiente, Waffenmechanik und Ausklang. Ein zusätzliches, leises Metall-Foley begleitet gelegentlich lokale Kestrel-Hülsen auf harten Oberflächen.

## Ereignisse und Lebenszyklus

- Lokale Schüsse nutzen `Game.predictShot`. Ein Echo einer bereits hörbaren Vorhersage erzeugt keinen zweiten Klang. Schüsse, die vor dem Laden des Samples vorausgesagt wurden, können bei rechtzeitiger Bestätigung aus der vorhandenen Aufnahme erklingen.
- Fremde Schüsse, einschließlich Convict-Schüsse, nutzen die bestätigte Schussposition und den Wiedergabezeitpunkt der Waffenpose. Die Zulassung nutzt die vorhandene, begrenzte Schusshistorie.
- Entnahme, Insertion und Waffenwechsel folgen bestätigten Spieler-Snapshots. Remote-Handhabung folgt der vorhandenen Pose-Timeline. Die Pistolenaufnahme verbindet Insertion und Schlittenrücklauf. Das Kestrel-Abschlussgeräusch folgt dem bestätigten Übergang zu `READY`. Abbruch und Zurückweisung können keinen späteren Schritt aus einer vorab terminierten Reload-Sequenz auslösen.
- Disconnect, Szenengrenze und Audio-Deaktivierung lösen die gehaltenen Stimmen und die Handhabungsbasis. Ein neu eingelesener Snapshot spielt alte Phasen nicht nach. Die Initialisierung per Nutzergeste startet auch das Laden der kleinen Waffenbank.
- Granaten, Nahkampf, Nachschub und Explosionen behalten ihre bestehenden Quellen und Routen. Die Spielmechanik liest die serverseitigen Eingaben und Zustände wie bisher.

## Entfernung, Planeten und Mischung

Das Audio folgt Mündung, Entfernung und Hörerausrichtung. Die Hörweite beträgt 150 m, der Pegel folgt `1 / (1 + d / 14)`. Zwischen 22 und 95 m gehen Nahaufnahmen in Distanzaufnahmen über. Die akustische Laufzeit folgt 343 m/s bis zum Wiedergabelimit von 115 ms. Das Limit hält vorgeplante Klänge im bestehenden Stimmenbudget.

Planetare Profile gewichten den bestehenden Hall-Send und Tiefpass unterschiedlich. Grüne Ebene nutzt einen offenen Ausklang, die Wüste etwas stärkere Reflexion, Eis einen helleren Fernklang und Wald stärker gedämpfte Ferne. Carrier und Arena verwenden ihre etablierten Raumprofile. Die Akustikparameter liegen im Client-Katalog.

Der bestehende Mixer verwaltet 28 Stimmen und vier pro Quelle. Schnell feuernde Waffen dürfen über `WeaponRecordings.voices` mehr halten, die Maschinenpistolen acht ([SUBMACHINE_GUNS](SUBMACHINE_GUNS.md#ton)). Nahe Waffenstimmen haben höhere Priorität als entbehrliche Details. Gefahren und UI-Signale behalten ihre reservierten Plätze. Master-Limiter, Stummschaltung und Lautstärkeregler gelten auch für die Waffenaufnahmen. F2 zeigt Wiedergaben für lokale und entfernte Waffen, Handhabung, fehlende Puffer, Stimmen, Ladezeit und PCM-Cache.

[Ausgangsinventar](WEAPON_AUDIO_INVENTORY_7_9A.md) · [Aufnahmen, Lizenz und Abnahme](WEAPON_AUDIO_7_9A.md)

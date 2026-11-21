# Bestätigte Nahkampftreffer · 7.8C

`meleeStrike` prüft einen primären Treffer im bestehenden Frontkegel. Zielauswahl bewertet Reichweite, Deckung und die vorhandenen Körperhöhen für Operatoren. Die Basiswerte sind 2 m Reichweite, 80° Kegel, 50 Grundschaden, 0,14 s Ausholen, 0,42 s Aktionszeit und 0,8 s Cooldown. Friendly Fire und Convict-Schaden folgen dem zentralen Resolver. Weltobjekte blockieren bei bestehender Deckungsprüfung. Ein Treffer auf eine Wand oder mehrere Ziele gehört weiterhin nicht zur Mechanik.

Ein angewandter Treffer trägt die Kontaktposition des bestätigten Ziels. Der Client setzt beim Schabentreffer den bestehenden lokalen Hitmarker und behandelt die optionale Eliminierung über denselben HUD- und Death-Pfad wie 7.8B. Bei freigegebenem Verbündetenschaden greift die bestehende separate Markerfarbe. Trefferpartikel aus Chitin oder Stoff nutzen `VisualEffectsManager` und dieselben Puffer wie Geschosstreffer. Ein Miss und ein geschützter Operator mit null HP-Verlust lösen ausschließlich den Schwung aus. Die vorhandene zeitlich begrenzte Trefferreaktion, Stagger und Death-Pose kommen aus der bisherigen Gegnerdarstellung.

Die Todessimulation benutzt den vorhandenen `damageEnemy`-Pfad und die Server-ID. Die clientseitige Präsentation wiederholt sich bei Paketduplikaten weder als Hitmarker noch als Ton, Partikel oder Todespose.

[Servervalidierung aus 7.8B](SERVER_VALIDATED_HIT_FEEDBACK.md) · [Deduplizierung](EXPLOSION_MULTIPLAYER.md)

# Jäger

Der Jäger (`swarm.jaeger`, Wire-ID 1) ist der schnelle Krieger des Schwarms. Er hält wenig aus, ist ungepanzert, bewegt sich springend und versucht im Gegensatz zu den Schaben, die Operator zu flankieren. Vorlage ist das Konzeptbild `concept_hunter.png` im Projektverzeichnis.

## Gameplay

| Wert | Wert |
| --- | ---: |
| Lebenspunkte | 28 |
| Geschwindigkeit | 5,8 m/s |
| Panzerung | Klasse 1 (ungepanzert) |
| Nahkampfschaden | 16 |
| Nahkampfreichweite (ab Körpermitte) | 2,3 m |
| Angriffsintervall | 1,0 s |
| Nahkampf-Timing | 9 Ticks Ausholen, 3 aktiv, 7 Erholung |
| Sprungangriff | 3,5–8 m, 10 Ticks Ducken, 10 Ticks Flug, 0,9 m Bogenhöhe, 4 s Abklingzeit |
| Bodenradius | 0,5 m |

Die Reichweite gilt ab der Körpermitte. Der Kopf des voll großen Jägers sitzt 1,6 m vor der Mitte, deshalb ist die Reichweite länger als die vorgeschlagenen 1,6 m.

**Flankieren** (`tactics: flank`, `EnemyFlanking`): Der Jäger umkreist sein Ziel im Abstand von 6,5 m und zielt auf eine Position etwa 125° neben der Blickrichtung des Operators. Er legt sich auf die Seite fest, auf der er gerade steht. In folgenden Fällen gibt er das Kreisen auf und greift an:

- Er steht außerhalb von ±80° vor dem Operator.
- Er ist näher als 3,2 m.
- Er wurde in den letzten 1,5 s getroffen.

Entfernt er sich danach weiter als 11 m, beginnt er erneut zu kreisen.

**Sprungangriff** (`leap`): Sobald der Jäger zum Angriff übergeht und sein Ziel 3,5–8 m entfernt und frei sichtbar ist, duckt er sich und springt. Ziel kann ein Operator oder ein Convict sein. Während des Flugs bewegt der Server ihn auf einer Geraden bis knapp vor das Ziel. Hindernisse stoppen ihn wie beim Laufen. Die Höhe folgt einem Bogen, der auch die Trefferzonen anhebt. Beim Aufsetzen prüft die normale Nahkampfvalidierung den Treffer mit 16 Schaden. Der Sprung wird im Hordenframe mit Bit 15 des Angriffsalters (`HORDE_LEAP_FLAG`) als eigene Angriffsart übertragen.

**Auftreten:** In Patrouillen ab Normal, mit steigendem Anteil. Ab Herausfordernd gibt es auch reine Jäger-Patrouillen. Die Anteile stehen in [Schwierigkeit](../DIFFICULTY_SYSTEM.md#kriegerkasten). Wellen und Arena bleiben vorerst ohne Jäger.

## Trefferzonen

| Zone | Panzerklasse | Kapsel (Modellraum, m) |
| --- | ---: | --- |
| `head` | 1 | (0, 1,3, −1,08) → (0, 1,3, −1,48), r 0,26 |
| `thorax` | 1 | (0, 1,28, −0,82) → (0, 1,14, −0,16), r 0,32 |
| `abdomen` | 1 | (0, 1,0, 0,06) → (0, 0,8, 1,05), r 0,27 |

Die dünnen Beine sind nicht trefferfähig.

## Darstellung

`JaegerModel.ts` baut ein Raubtier in voller Konzeptgröße, das bewusst keinem irdischen Insekt gleicht: 3,3 m lang, Helmklinge und Rückenklingen bis etwa 1,75 m, die Kniesporne bis knapp 2 m. Die Merkmale:

- **Haltung:** buckelig und nach vorn gekippt. Die Brust sitzt hoch, die Taille ist dünn wie bei einer Wespe, der Hinterleib hängt tiefer.
- **Kopf:** ein langgezogener, facettierter Schädelhelm, der nach hinten in eine aufsteigende Klinge ausläuft, mit seitlichen Wangenklingen. Darunter sitzen sechs Glutaugen in zwei Reihen.
- **Maul:** ein langer Unterkiefer mit seitlichen Hakenmandibeln, die sich zusammen öffnen. Dazu kommen zwei Zahnreihen, ein schwach glimmender Rachen und ein Paar schlanker Nebenarme unter dem Kiefer.
- **Rücken:** acht dolchförmige, kantig facettierte Klingenschindeln, die je in eine nach hinten steigende Spitze auslaufen. Über dem Nacken stehen drei Kammklingen, über den Schultern zwei geschwungene Schulterklingen.
- **Flanken und Hinterleib:** gepanzerte Flanken über den Organen, ein offen liegender Rippenkorb unter der Brust, überlappende Seitenplatten und glühende Atemschlitze am Hinterleib, die im Schwarmtakt pulsieren. Der Schwanz trägt eine Dornenreihe und endet in einem gegabelten Stachel.
- **Beine:** sechs lange Beine mit facettierten Panzerplatten auf Femur und Tibia, Dornen und einem nach hinten steigenden Kniesporn. Die Kniegelenke glimmen schwach. Das vordere Paar endet in langen Sichelkrallen.
- **Material:** mattes, abgenutztes Chitin in der Schwarmpalette. Die Muskulatur ist fast schwarz-rot und liegt nur unter den Platten offen, ihre Adern glühen im Puls auf.

**Animation** (`WarriorVisualLOD`, Vertex-Shader mit Rollen je Vertex: Bein, Schlaggliedmaße, Kiefer, Schwanz):

- **Lauf:** springender Galopp. Die Vorderbeine setzen gemeinsam auf, die Hinterbeine eine halbe Phase später, und der Körper wippt. Die Phase ergibt sich aus der tatsächlich zurückgelegten Strecke.
- **Nahkampf:** Aufrichten mit erhobenen Schlaggliedmaßen und geöffnetem Maul, dann ein Schlag nach unten.
- **Sprung:** tiefes Ducken, im Flug angezogene Beine und nach vorn greifende Schlaggliedmaßen, Schlag beim Aufsetzen, dann Erholung.
- **Treffer und Tod:** kurzes Zusammenzucken und Aufhellen bei einem Treffer. Gefallene Jäger kippen um und ziehen die Beine an.

| Stufe | Inhalt | Dreiecke (Budget) |
| --- | --- | ---: |
| Nah | Alles, inklusive Zähnen, Nebenarmen, Rippen, Atemschlitzen, Kammklingen, Dornen und Kniegelenken | 4.834 (5.000) |
| Mittel | Körper, fünf Klingenschindeln, Seitenplatten, Helm, Kiefer, Beine mit Platten und Kniespornen | 1.058 (1.100) |
| Fern | Körper, Helm und Stummelbeine | 198 (200) |

| Referenz | Bild |
| --- | --- |
| Front | [front.jpg](jaeger/front.jpg) |
| Seite | [seite.jpg](jaeger/seite.jpg) |
| Rücken | [ruecken.jpg](jaeger/ruecken.jpg) |
| Sprungflug | [sprung.jpg](jaeger/sprung.jpg) |
| Im Spiel (Grüne Ebene, mit Durchbruchskäfer) | [krieger-im-spiel.jpg](krieger-im-spiel.jpg) |

Die Vorschauaufnahmen entstanden in Chromium (SwiftShader) mit Sonne, Hemisphärenlicht und dem Spiel-Tonemapping.

## Ressourcen

| Ressource | Implementierung |
| --- | --- |
| Balance | `packages/shared/src/balance/data/enemies.json` (`swarm.jaeger`), Anteile in `difficulty.json` |
| Eigenschaften je Typ | `packages/shared/src/combat/enemyBody.ts` (Zonen, Timing, Sprung, Flanke) |
| Flankieren | `apps/server/src/ecs/EnemyFlanking.ts`, Ziel in `systems/horde.ts` |
| Sprung | `apps/server/src/ecs/EnemyCombat.ts` (`tryLeap`, `fly`, `elevation`) |
| Modell | `apps/client/src/rendering/JaegerModel.ts` mit `WarriorKit.ts` und `SwarmOrganism.ts` |
| Material und Animation | `WarriorSurface.ts`, `WarriorVisualLOD.ts` (`JAEGER_VISUAL`) |
| Tests | `apps/server/test/warriors.test.ts`, `apps/client/test/warriors-visual.test.ts` |

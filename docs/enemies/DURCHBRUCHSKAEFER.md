# Durchbruchskäfer

Der Durchbruchskäfer (`swarm.durchbruchskaefer`, Wire-ID 2) ist der langsame, schwer gepanzerte Krieger des Schwarms. Er hält viel aus, ist frontal durch mittlere Panzerung geschützt und greift direkt an. Er kommt mit Verstärkungsrufen und bewacht Nester. Vorlage ist das Konzeptbild `concept_breacher.png` im Projektverzeichnis.

## Gameplay

| Wert | Wert |
| --- | ---: |
| Lebenspunkte | 300 |
| Geschwindigkeit | 3,2 m/s (Schabe 3,55 m/s) |
| Panzerung | Frontzonen Klasse 3 (mittel), Körper und Schwachstelle Klasse 1 |
| Nahkampfschaden | 12 |
| Nahkampfreichweite (ab Körpermitte) | 2,5 m |
| Angriffsintervall | 1,6 s |
| Nahkampf-Timing | 20 Ticks Aufbäumen, 4 aktiv, 14 Erholung, Kegel ±70° |
| Bodenradius | 0,85 m |
| Stagger | Immun gegen Nahkampf-Stagger und Rückstoß |

Die Reichweite gilt ab der Körpermitte. Kopfschild, Hauer und Grabarme reichen beim voll großen Käfer bis 1,9 m vor die Mitte, deshalb liegt die Reichweite über den vorgeschlagenen 1,8 m.

**Ziele** (`vehicleTargets: thrusters`): Operator, Convicts und die Düsen der Albatross 02. Rumpf und Versorgungscontainer greift er nicht an. Nahe der Albatross sucht er sich die nächste intakte Düse.

**Auftreten:** Der Käfer erscheint ab Normal, aber selten:

- **Verstärkungsrufe:** Pro Ruf kommt eine Chance auf einen Käfer, der aus dem neuen Durchbruchsnest oder dem verstärkten Nest schlüpft.
- **Nestwachen:** Jedes neue Nest bekommt einige Käfer als Wache. Sie entstehen aus den ersten Spawns des Nests und werden nicht nachproduziert.

Die Werte stehen in [Schwierigkeit](../DIFFICULTY_SYSTEM.md#kriegerkasten).

## Trefferzonen und Panzerung

| Zone | Panzerklasse | Kapsel (Modellraum, m) |
| --- | ---: | --- |
| `weak-spot` | 1 | (−0,08, 0,55, −1,47) → (0,08, 0,55, −1,47), r 0,1 |
| `head-shield` | 3 | (−0,42, 1,0, −1,3) → (0,42, 1,0, −1,3), r 0,42 |
| `breast-plate` | 3 | (−0,48, 0,5, −1,12) → (0,48, 0,5, −1,12), r 0,3 |
| `pronotum` | 3 | (−0,66, 1,46, −0,66) → (0,66, 1,46, −0,66), r 0,5 |
| `forelimb-left` / `-right` | 3 | (∓1,12, 1,1, −0,98) → (∓1,08, 0,32, −1,5), r 0,38 |
| `body-left` / `-right` | 1 | (∓0,5, 1,15, −0,1) → (∓0,5, 1,1, 1,1), r 0,72 |

So wirken die Zonen:

- **Schüsse:** Jeder Schuss trifft die nächstgelegene Zone und verwendet deren Panzerklasse (`zoneRayHit` in `combat/enemyBody.ts`).
- **Durchschlag:** Ein Treffer ohne ausreichenden Durchschlag macht 10 % Schaden. Der Client zeigt dann Funken statt Chitinsplitter (`impact.armored`).
- **Schaden ohne Strahl:** Für Convict-Feuer, Granaten und Operator-Nahkampf gilt der Frontkegel (`frontArmor`, ±60°, Klasse 3).
- **Schwachstelle:** Der glimmende Kehlsack unter dem Kopfschild, zwischen den Hauern, ist ungepanzert (`weak-spot`). Ein Treffer dort macht mit jeder Munition vollen Schaden, ohne Bonus. Er ist mit etwa 36 × 20 cm klein, gut 1 % der Frontfläche, und bleibt bis etwa 50° seitlich der Längsachse treffbar. Schüsse ohne Strahl (Convicts, Granaten, Nahkampf) nutzen weiter den Frontkegel und kennen die Schwachstelle nicht.
- **Abdeckung:** Ein Test schießt ein Raster frontaler Strahlen auf den Käfer. Jeder Treffer muss eine gepanzerte Zone oder die Schwachstelle sein, und die Schwachstelle muss unter 3 % der Treffer bleiben. Ein zweiter Test prüft, dass über 90 % der vorderen Modellvertices in einer gepanzerten Zone oder der Schwachstelle liegen.

Durchschlag der aktuellen Munition gegen die Front:

| Waffe | Durchschlag | Wirkung frontal |
| --- | ---: | --- |
| Pistole, MP, Schrotflinte | 1–2 | 10 % Schaden, auf die Schwachstelle voller Schaden |
| Standard-Sturmgewehr (5.55) | 3 | voller Schaden, bis die Standardmunition wie geplant abgeschwächt ist |
| Schwere Kaliber | 4–5 | voller Schaden |

## Darstellung

`BreacherModel.ts` baut eine aufragende, bullige Silhouette, deutlich höher und massiger als ein irdischer Käfer: 3,6 m lang mit Schildzacken und Hauern, der Panzerbuckel bis 2,0 m hoch. Die Merkmale:

- **Front:** ein facettierter Kopfschild wie ein Räumschild, dessen gezackte Kante nach vorn zeigt. Dahinter sitzt ein massiger, kantiger Schulterbuckel, darunter eine gepanzerte Brustplatte.
- **Gepanzerter Rücken:** ein Mosaik aus gekielten, kantig gehauenen Panzerkacheln, die nach hinten überlappen und je in eine aufsteigende Spitze auslaufen. Es besteht aus einer Rückgratreihe mit Knochenhöckern und zwei schräg über die Flanken fallenden Reihen. Darunter hängen Panzerschürzen über den Hüften.
- **Glutnähte:** Zwischen den Kacheln glimmen geschmolzen wirkende Nähte, und von den abgenutzten Plattenrändern laufen feine Glutrisse ein. Beides pulsiert im Schwarmtakt.
- **Grabarme:** zwei riesige Gliedmaßen mit facettiertem Oberarm und klingenartiger Unterarmplatte, jeweils mit drei Spatenkrallen.
- **Beine:** vier dicke, hochknieige Beine mit kantigen Platten auf Oberschenkel und Schienbein.
- **Kopf:** unter dem Schild sitzen drei Glutaugen je Seite, ein Maul mit Zahnreihe und gebogene Hauer am Kiefer.
- **Schwachstelle:** Zwischen den Hauern sitzt ein schwach glimmender, im Puls aufleuchtender Kehlsack, von Lippenplatten eingefasst.
- **Material:** staubig graubraune, abgenutzte Platten über dunkler Muskulatur, deren Adern schwach pulsieren.

**Animation:**

- **Gang:** schwerer Diagonalgang mit rollendem Schwanken. Die Grabarme laufen als Knöchelgang mit.
- **Angriff:** Der Käfer bäumt sich auf, hebt beide Grabarme und öffnet die Kiefer, dann schmettert er Arme und Körper nach vorn und unten.
- **Treffer und Tod:** Zusammenzucken und Aufhellen bei einem Treffer. Gefallene Käfer kippen um und ziehen die Beine an.

| Stufe | Inhalt | Dreiecke (Budget) |
| --- | --- | ---: |
| Nah | Alles, inklusive Glutnähten, Knochenhöckern, Zähnen, Hauern, Lippenplatten und Gelenken | 5.636 (6.000) |
| Mittel | Körper, Schilde, Brustplatte, Rückgrat- und Flankenkacheln, Schürzen, Arme und Beine mit Platten, Kehlsack | 1.284 (1.400) |
| Fern | Körper, Schilde, Brustplatte, Kehlsack und Stummelgliedmaßen | 272 (280) |

| Referenz | Bild |
| --- | --- |
| Front | [front.jpg](durchbruchskaefer/front.jpg) |
| Seite | [seite.jpg](durchbruchskaefer/seite.jpg) |
| Rücken | [ruecken.jpg](durchbruchskaefer/ruecken.jpg) |
| Aufbäumen vor dem Schlag | [schlag.jpg](durchbruchskaefer/schlag.jpg) |
| Im Spiel (Grüne Ebene, mit Jägern) | [krieger-im-spiel.jpg](krieger-im-spiel.jpg) |

## Ressourcen

| Ressource | Implementierung |
| --- | --- |
| Balance | `packages/shared/src/balance/data/enemies.json` (`swarm.durchbruchskaefer`), Anteile in `difficulty.json` |
| Zonen und Richtungspanzerung | `packages/shared/src/combat/enemyBody.ts`, Auswertung in `systems/combat.ts`, `systems/grenades.ts`, `mission/Convicts.ts` |
| Zielwahl Düsen | `apps/server/src/mission/MissionInstance.ts` (`findSecondary`), Düsenmarkierung in `Albatross.ts` |
| Verstärkung und Nestwachen | `apps/server/src/mission/EncounterDirector.ts` |
| Modell | `apps/client/src/rendering/BreacherModel.ts` mit `WarriorKit.ts` und `SwarmOrganism.ts` |
| Material und Animation | `WarriorSurface.ts`, `WarriorVisualLOD.ts` (`BREACHER_VISUAL`) |
| Tests | `apps/server/test/warriors.test.ts`, `apps/server/test/mission.test.ts` (Düsen), `apps/client/test/warriors-visual.test.ts` |

# Assaultbreaker

Der Assaultbreaker (`swarm.assaultbreaker`, Wire-ID 3) ist die Signatur-Belagerungskaste des Schwarms: ein schwer gepanzerter Vierbeiner, der Stellungen mit einem Ansturm aufbricht. Vorlage ist das Konzeptbild `concept_assaultbreaker2.png` im Projektverzeichnis. Abweichend vom Konzept (2,3 m) ist er deutlich höher gebaut: Der Stirnschild ragt bis 3,9 m, der Schulterbuckel liegt bei 3,0 m, von der Hornspitze bis zur Schwanzspitze misst er 8,0 m.

## Gameplay

| Wert | Wert |
| --- | ---: |
| Lebenspunkte | 1.800 (Durchbruchskäfer 300) |
| Geschwindigkeit | 3,2 m/s, im Ansturm 15 m/s |
| Panzerung | Kopf, Stirnschild, Brust und oberer Rumpf Klasse 5, Läufe und Schwanz Klasse 4, Bauchunterseite Klasse 2 |
| Nahkampf (Hornstoß) | 30 Schaden, Reichweite 4,0 m ab Körpermitte, alle 2,2 s |
| Nahkampf-Timing | 18 Ticks Kopf senken, 4 aktiv, 16 Erholung, Kegel ±60° |
| Ansturm | 45 Schaden (1,5 × Nahkampf) für jeden Getroffenen, 6–16 m Abstand, Abklingzeit 8 s |
| Ansturm-Timing | 30 Ticks Aufbäumen und Kopf senken, 33 Ticks Lauf, 4 Ticks Hornwurf, 24 Ticks Erholung |
| Bodenradius | 1,3 m |
| Stagger | Immun gegen Nahkampf-Stagger und Rückstoß |

**Ziele** (`vehicleTargets: thrusters`): Operator, Convicts und die Düsen der Albatross 02, wie beim Durchbruchskäfer. Rumpf und Versorgungscontainer greift er nicht an. Den Ansturm setzt er nur gegen Operator und Convicts ein, nie gegen die Albatross.

### Ansturm

1. **Auslösen:** Steht das Ziel 6 bis 16 m entfernt in freier Bahn und ist die Abklingzeit vorbei, beginnt der Ansturm. Die Bahn wird auf Kniehöhe und auf Schulterhöhe geprüft. Näher als 6 m stößt er stattdessen mit den Hörnern zu.
2. **Ankündigung (1 s):** Er bäumt sich brüllend auf, senkt dann Kopf und Stirnschild und duckt sich. In dieser Phase bleibt er auf das Ziel ausgerichtet. Verliert er das Ziel, bricht er ab.
3. **Lauf (1,1 s, 15 m/s, rund 16,5 m):** Er rennt geradeaus und korrigiert den Kurs nur um 30° pro Sekunde. Wer im letzten Moment zur Seite springt, entkommt. Hindernisse stoppen ihn wie jede Bodenbewegung. Jeder lebende Operator in einem 3 m breiten Band bis 3,6 m vor der Körpermitte wird überrannt, einmal pro Ansturm und mit vollem Schaden, auch wenn er nicht das Ziel war. Ein Convict als Ziel wird ebenso getroffen.
4. **Hornwurf und Erholung:** Am Ende reißt er den Kopf hoch und schlittert aus. Danach steht er etwa 0,8 s still und ist verwundbar, bevor er sich neu ausrichtet.

Der Ansturm wird mit Bit 14 des Angriffsalters repliziert (`HORDE_CHARGE_FLAG`), der Sprung des Jägers mit Bit 15. Server, Snapshot und Client nutzen dieselbe Zeitleiste aus `enemyBody.ts` (`ATTACK_CHARGE`, `EnemyTraits.charge`).

### Auftreten

Ab Stufe 4 (Schwer), zuerst selten, dann mit jeder Stufe häufiger. Er entsteht als Nestwache oder mit einem Verstärkungsruf und schlüpft aus dem Nest. Eine Obergrenze je Stufe begrenzt, wie viele gleichzeitig leben (1 auf Schwer bis 3 auf FREEFALL). Die Anteile stehen in [Schwierigkeit](../DIFFICULTY_SYSTEM.md#assaultbreaker).

## Trefferzonen und Panzerung

| Zone | Panzerklasse | Kapsel (Modellraum, m) |
| --- | ---: | --- |
| `head` | 5 | (0, 1,62, −2,3) → (0, 1,4, −3,15), r 0,55 |
| `crest-left` / `-right` | 5 | (∓1,35, 2,25, −1,6) → (0, 3,2, −1,4), r 0,6 |
| `chest` | 5 | (−0,55, 1,4, −1,45) → (0,55, 1,4, −1,45), r 0,6 |
| `back` | 5 | (0, 2,05, −1,0) → (0, 1,95, 1,4), r 1,0 |
| `belly` | 2 | (0, 1,0, −0,8) → (0, 1,0, 1,0), r 0,42 |
| `foreleg-left` / `-right` | 4 | (∓0,95, 1,55, −1,1) → (∓1,35, 0,2, −1,3), r 0,42 |
| `hindleg-left` / `-right` | 4 | (∓0,9, 1,55, 1,1) → (∓1,25, 0,2, 1,1), r 0,4 |
| `tail` | 4 | (0, 1,6, 1,9) → (0, 1,05, 3,2), r 0,38 |

So wirken die Zonen:

- **Schüsse:** Jeder Schuss trifft die nächstgelegene Zone und verwendet deren Panzerklasse. Ein Treffer ohne ausreichenden Durchschlag macht 10 % Schaden, der Client zeigt dann Funken.
- **Bauch:** Die weiche, gerippte und schwach glühende Unterseite ist die Schwachstelle. Von vorn ist sie fast vollständig verdeckt (unter 2 % der frontalen Trefferfläche). Von der Seite trifft man sie tief zwischen den Beinen, unterhalb von etwa 1,1 m. Die obere Flanke gehört zur Klasse-5-Zone `back`.
- **Schwanz:** Das Konzept legt den Schwanz nicht fest. Er zählt wie die Läufe als Klasse 4.
- **Schaden ohne Strahl** (Convict-Feuer, Granaten, Operator-Nahkampf): von vorn (±70°) Klasse 5, sonst Klasse 4 (`frontArmor`, `armorClass`).

Wirkung der aktuellen Munition:

| Waffe | Durchschlag | Panzer (Kl. 4/5) | Bauch (Kl. 2) |
| --- | ---: | --- | --- |
| Pistole, Schrotflinte | 2 | 10 % | voller Schaden |
| Standard-Sturmgewehr (5.55) | 3 | 10 % | voller Schaden |
| 7.77 | 4 | Läufe und Schwanz voll, sonst 10 % | voller Schaden |
| 8.88 | 5 | voller Schaden | voller Schaden |
| Splittergranate | 4 | von der Seite und hinten voll, von vorn 10 % | – |

Mit dem Standardgewehr (24 Schaden) braucht ein Trupp 75 Bauchtreffer. Auf die Panzerung sind es 750. Die Werte lassen sich im Balance-Editor anpassen.

## Darstellung

`AssaultBreakerModel.ts` baut den Koloss prozedural aus dem Schwarm-Baukasten (`SwarmOrganism`, `WarriorKit.loft`) und eigenen Bausteinen: `scale` (gekielte, spitze Panzerschuppe mit Unterseite), `hullScale` (Schuppe auf dem Rumpf), `limbScales` (Schuppenring um ein Glied), `shield` (gewölbter Fächer) und `tube` (glatte, gebogene Hörner, Hauer und Klauen).

- **Panzer wie ein Tannenzapfen:** Jede Platte ist eine dicke, gekielte Schuppe, deren Spitze sich vom Körper abhebt. Auf dem Rücken stehen sie als Sägezahnkamm, am größten über der Rückenmitte. Daneben liegen Schindelreihen, vier Flankenreihen je Seite und große, gewölbte Schulter- und Hüftschilde. Tief an der Flanke zwischen Schulter und Hüfte bleibt ein Fenster frei, durch das das glühende Gewebe scheint.
- **Stirnschild:** Ein gewölbter Fächer mit gezacktem Rand. Darüber liegen drei gestaffelte Reihen langer, gekielter Klingen, in der Mitte die längsten. Die äußeren schwingen als Kragen über den Nacken nach hinten. Der Schild ist an den Kopf gebunden.
- **Kopf:** Ein keilförmiger Schädel mit stumpfer Schnauze und Nasenkiel. Darüber liegen Stirnschindeln und schwere Brauenplatten im zornigen V. Die glühenden Schlitzaugen haben eine senkrechte Pupille. Seitlich spreizen sich Schläfen- und Wangenschilde mit Spitzen. Dazu kommen zwei mächtige Stirnhörner, ein Nasenhorn, ein Fangzahn-Maul mit eigenem Unterkiefer und zwei lange, nach innen gebogene Hauer. Der Kopf ist 10 % größer als der Rumpfmaßstab, damit er die Silhouette beherrscht.
- **Läufe:** Säulen mit Schuppenringen. Oben liegen große Schindeln, am Unterlauf drei versetzte Ringe kleiner Schuppen, am Fuß Fersenschuppen. Die breiten Füße tragen Zehenplatten und vier schwere Klauen.
- **Schwanz:** Er hängt dick herab, mit Schuppenringen, einem Rückenkamm und einer Knochenspitze.
- **Material:** Kupferbraune Panzerschuppen mit hellen, abgewetzten Rändern und rußigen Wurzeln. Aus der Nähe zeigt jede Schuppe ein Muster kleiner, erhabener Schildchen (Shader-Option `scales` in `WarriorSurface.ts`). Es blendet aus, bevor es flimmern kann. Hörner und Klauen sind aus poliertem Knochen. Bauch und Glutfenster sind weiches, durchscheinendes Gewebe, das im Schwarmtakt pulsiert.

**Animation** (`AssaultBreakerRig.ts`, Vertex-Shader im Modellraum):

Die Instanzmatrix setzt nur Position und Blickrichtung. Alles andere rechnet der Shader im Modellraum. So bleiben die Füße am Boden stehen, während sich der Körper hebt, neigt und nach vorn stößt.

- **Bein-IK:** Jedes Bein ist eine Zwei-Knochen-Kette (Hüfte, Knie, Knöchel) mit Fuß. Die Modellvertices tragen ihre Knochenkoordinate (`limb.z`: 0 Hüfte, 1 Knie, 2 Knöchel, 3 Sohle). Der Shader löst die Kette für jeden Fußpunkt und beugt Ellbogen und Knie wie beim Nashorn. Der Fuß bleibt in der Standphase waagerecht und kippt beim Abheben.
- **Gang:** Ein schwerer Kreuzgang (links hinten, links vorn, rechts hinten, rechts vorn), 62 % Bodenkontakt, 2,3 m pro Doppelschritt. Der Standschritt entspricht genau der zurückgelegten Strecke, deshalb rutschen die Füße nicht. Dazu kommen zwei Hebungen pro Zyklus, eine Rollbewegung zur Standseite, gegenläufig drehende Schultern und Hüften, ein nickender, pendelnder Kopf und ein schwingender Schwanz.
- **Galopp:** Ab 5 m/s geht der Gang fließend in einen Rotationsgalopp über, voll ab 11 m/s (Ansturm 15 m/s). Der Zyklus misst 5,4 m bei 30 % Bodenkontakt. Der Rumpf schaukelt wie ein Schaukelpferd, Kopf und Hörner liegen tief, der Schwanz hebt sich, das Maul steht offen.
- **Stehen:** Er atmet mit den Flanken, sieht sich langsam um und schnappt gelegentlich mit dem Kiefer. Dreht er sich auf der Stelle, tritt er mit den Beinen.
- **Ansturm:**
  1. Aufbäumen mit offenem Maul.
  2. Zweimaliges Scharren mit dem rechten Vorderfuß, dabei schnaubende Kopfstöße.
  3. Ducken mit gesenkten Hörnern, Galopp.
  4. Am Ende stemmt er die Vorderbeine weit nach vorn, schlittert aus und reißt die Hörner hoch.
  5. Zum Schluss schüttelt er den Kopf.
- **Hornstoß:** Er verlagert das Gewicht zurück und senkt den Kopf schräg. Dann hakt er die Hörner mit einem Ausfallschritt nach oben und quer und setzt sich wieder.
- **Treffer und Tod:** Zusammenzucken und Aufhellen bei Treffern. Gefallene Körper falten die Beine unter den Bauch, der Kopf hängt, das Maul steht offen.
- **Schatten:** Ein eigenes Tiefenmaterial führt im Schattenpass dieselbe Verformung aus, so folgen die Schatten der Animation.
- **Technik:** Der Rig verwendet fünf eigene Vertex-Attribute (`limb`, `motion`, `action`, `body`, `gait`). Statt einer Instanzfarbe tönt er im Shader, damit das Programm unter der WebGL-Grenze von 16 Attributen bleibt.
- **Detailstufen:** Die Entfernungen sind mit 1,8 skaliert (`lodScale`), damit der Koloss länger in der nahen Stufe bleibt. Alle Stufen nutzen denselben Rig.

| Stufe | Inhalt | Dreiecke (Budget) |
| --- | --- | ---: |
| Nah | Alles: Schuppenpanzer, drei Klingenreihen im Schild, Kopfplatten, Augen mit Pupille, Zähne, Schuppenringe, Zehenplatten, Klauen | 24.596 (26.000) |
| Mittel | Körper, Rücken- und drei Flankenreihen, zwei Klingenreihen im Schild, Kopfplatten, Hörner, Hauer, Beinschuppen | 4.630 (5.000) |
| Fern | Körper, Rückenkamm, Schild, Hörner, Säulenbeine mit Gelenken | 970 (1.000) |

Ein Assaultbreaker ist selten (höchstens 3 gleichzeitig), deshalb darf die nahe Stufe mehr Dreiecke verwenden als die Kriegerkasten.

| Referenz | Bild |
| --- | --- |
| Front | [front.jpg](assaultbreaker/front.jpg) |
| Seite | [seite.jpg](assaultbreaker/seite.jpg) |
| Rücken | [ruecken.jpg](assaultbreaker/ruecken.jpg) |
| Schräg vorn | [schraeg.jpg](assaultbreaker/schraeg.jpg) |
| Gang (Bildfolge) | [lauf.jpg](assaultbreaker/lauf.jpg) |
| Galopp (Bildfolge) | [galopp.jpg](assaultbreaker/galopp.jpg) |
| Aufbäumen vor dem Ansturm | [aufbaeumen.jpg](assaultbreaker/aufbaeumen.jpg) |
| Scharren | [scharren.jpg](assaultbreaker/scharren.jpg) |
| Ansturm mit gesenkten Hörnern | [ansturm.jpg](assaultbreaker/ansturm.jpg) |
| Hornwurf am Ende des Ansturms | [hornwurf.jpg](assaultbreaker/hornwurf.jpg) |
| Hornstoß | [hornstoss.jpg](assaultbreaker/hornstoss.jpg) |
| Im Spiel (Grüne Ebene) | [im-spiel.jpg](assaultbreaker/im-spiel.jpg) |

## Ressourcen

| Ressource | Implementierung |
| --- | --- |
| Balance | `packages/shared/src/balance/data/enemies.json` (`swarm.assaultbreaker`, `charge`), Anteile in `difficulty.json`, Kaste in `swarm.json › castes` |
| Zonen, Ansturm-Zeitleiste, Replikation | `packages/shared/src/combat/enemyBody.ts`, `packages/shared/src/contracts/horde.ts` |
| Ansturm (Server) | `apps/server/src/ecs/EnemyCombat.ts` (`tryCharge`, `run`) |
| Auftreten | `apps/server/src/mission/EncounterDirector.ts` (`assaultBreakers`, eigener Zufallsstrom) |
| Modell | `apps/client/src/rendering/AssaultBreakerModel.ts` |
| Animation | `apps/client/src/rendering/AssaultBreakerRig.ts` (Bein-IK, Gangarten, Posen), eingebunden über `ASSAULT_BREAKER_VISUAL` in `WarriorVisualLOD.ts` (`CasteVisual.rig`) |
| Oberfläche | `apps/client/src/rendering/WarriorSurface.ts` (Option `scales`) |
| Stimme | `apps/client/src/audio/HordeAudio.ts` (tiefste Schwarmstimme) |
| Tests | `apps/server/test/assaultbreaker.test.ts`, `apps/client/test/assaultbreaker-visual.test.ts` |
| Spieltest | `scripts/playtest-visuals.mjs` (Aufnahmen `assaultbreaker`, `assaultbreaker-seite`) |

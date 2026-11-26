# Extraktionssystem

Ein `ExtractionSystem` je Einsatz führt zwei Strategien über einen gemeinsamen aktiven Extraktionszustand. Die Missionsmaschine schaltet sie nach den Hauptzielen frei. Der Server prüft den Einsatzstatus, die Lebenspunkte, den verbundenen Operator und die autoritative Position. Alle Wege führen zum gleichen `MissionResult`.

| Methode | Anforderung | Erfolgsregel |
| --- | --- | --- |
| Albatross | **E** in der flugfähigen Kabine. Vier Sekunden Vorlauf. Weitere Operator sichern sich mit **E**. | Beim Abheben werden die lebenden, verbundenen, gesicherten Personen innerhalb der Kabinenfläche übernommen. Zwei zerstörte Düsen oder ein zerstörter Rumpf brechen einen laufenden Start vor dem Abheben ab. |
| Extraktionsballon | **B** auf freiem, offenem Untergrund. Weitere Operator sichern sich mit **E** innerhalb von 25 m. | Nach 90 Sekunden und drei Sekunden Anflug hakt der Jäger das Seil ein und schleppt die lebenden, gesicherten Personen fünf Sekunden lang ab. |

Teilweise Extraktion ist zulässig. Ein einzelner Operator kann einen Start anfordern. Die Personenanzahl und das Extraktionsfenster werden im Trupp-HUD angezeigt. Weitere Operator müssen sich aktiv sichern. Bei Verlust der Flugfähigkeit während des Albatross-Countdowns ist die Wahl wieder offen. Der Ballon ist auch bei flugfähigem Albatross verfügbar.

Während eines ausstehenden Countdowns hält der Encounter Director die bestehenden Nester, Durchbrüche und Verstärkungsbudgets ein. Der Druck reagiert auf die Schwierigkeitsparameter. Die Positionsvalidierung und der 1.000-Gegner-Cap bleiben auch während des Rettungsvorgangs aktiv.

Ab Milestone 6 endet der Einsatz ausschließlich mit mindestens einer erfolgreich extrahierten Person oder einem vollständigen Teamwipe. Ein leerer Albatross bricht den Start ab und kann erneut angefordert werden. Verpasst der Jäger alle Operatoren, bleibt derselbe Ballon aktiv und signalisiert den nächsten Anflug. Andere Überlebende können sich an diesem Seil sichern. Ein vor dem Fang getrennter Operator zählt beim Reconnect zunächst als ungesichert.

## Ballon-Extraktion: Darstellung und Seilphysik

Die Darstellung läuft vollständig im Client (`apps/client/src/rendering/mission/RecoveryView.ts`, Seilphysik in `RecoveryTow.ts`). Der Server kennt nur die Phasen `COUNTDOWN` → `APPROACH` (3 s) → `LIFT`. `LIFT` dauert beim Ballon `BALLOON.liftTicks` = 5 s und beim Albatross weiterhin `ALBATROSS.liftTicks` = 2 s (`extractionLiftTicks(method)`). Gesicherte Operator sind in der Zeit geschützt.

- **Ballon:** Ein olivgrüner Bergungsballon in Luftschiffform (FB-20) mit zwölf Bahnen, abgeklebten Nähten, Leitwerk in X-Anordnung und Low-Vis-Beschriftung. Er steigt aus dem Bodenkanister auf 20 m und dreht die Nase zum Anflugkurs des Jägers.
- **Signalleuchte:** Unter dem Ballon hängt an einem Riser die Strobe-Kapsel mit dem Fangjoch. Sie blitzt rot im Doppeltakt (alle 1,4 s) und markiert für den Jäger den Fangpunkt. Das Leuchten hat eine feste Bildschirmgröße und bleibt deshalb auch auf Distanz sichtbar.
- **Einhaken:** Der Jäger bremst aus 183 m an, fliegt mit 28 m/s unter dem Ballon durch und nimmt mit dem Haken das Seil am Joch (5,6 m unter der Ballonmitte). In diesem Moment platzt der Ballon: Stofffetzen behalten den Schwung der Hülle und trudeln mit Endgeschwindigkeit zu Boden, dazu kommt eine kurze Talkumwolke. Das Ankerseil zum Kanister ist dann gelöst.
- **Nachziehen:** Jeder gesicherte Operator ist ein Massepunkt (118 kg, Cd·A 0,62 m²) an einem elastischen Nylonseil (Steifigkeit E·A/L, Dämpfungsgrad 0,7). Er reagiert auf Seilzug, Schwerkraft, quadratischen Luftwiderstand und Bodenreibung. Solange das Seil durchhängt, bleibt er stehen. Wird es straff, reißt ihn der Ruck vom Boden. Eine Seilbremse im Haken gibt oberhalb von 4,5 g Seil nach und fängt den Ruck ab. Danach hängt der Operator unter und hinter dem Jäger, der Körper richtet sich entlang des Seils aus. Die Simulation läuft in festen Schritten (1/240 s), deshalb sehen alle Clients dieselbe Bahn, und ein später Beitritt spult auf denselben Zustand vor.
- **Kamera:** Der eigene, abgeschleppte Operator wird von der Seite und schräg hinten verfolgt. Zuerst ist das Einhaken oben im Bild, danach die Leine zwischen Operator und Jäger.

Browser-Playtest mit Aufnahmen aller Phasen: `PLAYWRIGHT_MODULE=… node --conditions=development scripts/playtest-extraction.mjs [outputDir] [planet]`. Das Skript hält für jede Aufnahme die Simulation an, weil SwiftShader langsam rendert.

# Albatross 02

Pro Einsatz existiert eine `Albatross`-Entity mit stabiler ID, Landeposition, Rumpfzustand und vier einzeln adressierbaren Düsen. Server und Client nutzen dieselbe Kabinenfläche und dieselben Kollisionselemente. Das Modell besitzt acht Halteplätze, eine animierte Rampe und separat dargestellte Triebwerksbaugruppen. Die positionsgebundene Darstellung wird am Touchdown von der Andockposition auf die Landestelle umgesetzt.

| Zustand | Regel |
| --- | --- |
| `OPERATIONAL` | Rumpf und alle Düsen unbeschädigt |
| `DAMAGED` | Rumpf- oder Düsenschaden mit höchstens einer zerstörten Düse |
| `DISABLED` | Mindestens zwei zerstörte Düsen |
| `DESTROYED` | Rumpf bei null HP |

Die provisorische Konfiguration `ALBATROSS` setzt 1.700 Rumpf-HP und 330 HP pro Düse. Treffer erzeugen `AlbatrossDamaged`. Snapshots erhalten den letzten Treffertick und den Health-State auch nach Verbindungswechsel. Beschädigte Düsen zeigen schwächeren Schub und Rauch, zerstörte Düsen zünden nicht. Ein Wrack bleibt mit Kollision in der Landschaft erhalten.

Die bestehende Gegnersteuerung kann Ziele in der Nähe der Landestelle verfolgen. Ein vorhandenes Operatorziel hat Vorrang. Patrouillen im Alarm- oder Untersuchungszustand können danach Convicts und erreichbare Rumpf- oder Düsenoberflächen angreifen. Rufende Einheiten behalten ihre bisherige Aufgabe. Die Nahkampf-Schadensverarbeitung gilt für alle diese Ziele. Ein flugunfähiges Schiff sperrt den Start. Ein Abflug-Countdown kann durch Schaden abgebrochen werden. Der Extraktionsballon bleibt verfügbar.

`AlbatrossView` kapselt das Fallback-Modell und visualisiert denselben Zustand beim Boarding, in der Fallkamera und am Boden. Modell, Schadensdarstellung, Audio und Balancewerte sind Kandidaten für einen finalen Asset- und Design-Pass.

## Modell 2026-11-22

Das Außenmodell bekam abgeschrägte Dachkanten, ein Rückengrat mit Kühlgittern, Sensorkuppel und Antennen, ein gepanzertes Bugkinn mit Cockpitrahmen, Panelfugen und Lufteinlässe an den Flanken, abgerundete Panzerschürzen, Verkleidungen über den Triebwerksträgern, gebänderte Triebwerksgondeln mit Kappen, Positionslichter (Backbord rot, Steuerbord grün) und Warnwinkel am Heck. Neu sind außerdem ein keramischer Hitzeschild unter Bauch und Kinn, der beim Eintritt glüht, und ein vierbeiniges Teleskopfahrwerk mit Federung für den Aufschlag. Die Details liegen außerhalb des Kabinenvolumens, die Kollision ist unverändert. Bei Zerstörung dunkeln sie zusammen mit dem Rumpf ab. [Vergleich](visual-style/albatross-vorher-nachher.jpg) · [Drop-Sequenz](DEPLOYMENT_SYSTEM.md)

## Fahrwerk 2026-11-25

Die vier Landebeine liefen durch die seitlichen Panzerschürzen, und der eingefahrene Fuß steckte in Schürze und Seitenverkleidung. Die Beine stehen jetzt vor und hinter den Triebwerksgondeln (x ±3,55, z ±4,7) außerhalb der Schürzen. Die Schürzen enden vor den Beinen und lassen so Fahrwerksschächte frei. Jeder Kolben gleitet in eine Hülse, die über Konsole, Oberarm und Diagonalstrebe am Rumpf hängt. Ausgefahren, eingefedert und eingefahren schneidet kein Teil mehr Rumpf, Schürze oder Triebwerk. Kollision und Landeablauf bleiben unverändert.

## Landezone und Kabinenboden 2026-11-25

Die Landezone wird im Gelände exakt auf Höhe 0 eingeebnet, und auch die Oberkante des Kabinenbodens lag bei 0. Betonscheibe und „LZ“-Markierung lagen ein bis zweieinhalb Zentimeter darüber und schienen durch den Boden des gelandeten Albatross. Die Platte an der Landezone ist entfernt. Die Markierungsplatten an den Relais bleiben. Der Kabinenboden liegt jetzt 2 cm über dem Gelände (`FLOOR_TOP` in `AlbatrossView`) und konkurriert nicht mehr mit ihm um die Tiefe. Operatoren stehen weiter auf Geländehöhe, die 2 cm fallen an den Stiefeln nicht auf. Die Landefüße steckten bisher 20 cm im Boden. Jetzt stehen sie auf dem Gelände und bleiben beim Einfedern dort.

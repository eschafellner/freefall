# Albatross-Nachschub

Zwei gepanzerte Nachschubcontainer sind seitlich am Rumpf des Albatross 02 befestigt (links `SUP-02-L`, rechts `SUP-02-R`). Ihre Ladungen sind begrenzt und werden von allen Operatorn gemeinsam genutzt.

## Konfiguration

`structures.json › vehicles[vehicle.albatross_02].supplyContainers`:

| Feld | Links | Rechts |
| --- | --- | --- |
| `id` | `supply.port` | `supply.starboard` |
| `serial` | SUP-02-L | SUP-02-R |
| Montagepunkt `x`, `z` (relativ zum Schiff) | −3,32 / 0 | 3,32 / 0 |
| `charges` | 4 | 4 |
| `health` | 420 | 420 |

`equipment.json › resupply`:

| Feld | Wert |
| --- | --- |
| `perUse.primaryMagazines` | +2 |
| `perUse.secondaryMagazines` | +1 |
| `perUse.grenades` | +1 |
| `perUse.stims` | +2 |
| `interactionSeconds` | 1 s (30 Ticks) |
| `interactionRange` | 2,2 m vom Containermittelpunkt |
| `availableWhen` | beschädigt: ja, flugunfähig: ja, zerstört: nein |

Insgesamt acht Nutzungen pro Mission. Kapazitätsgrenzen sind die Tragekapazitäten der Registry: 8 Rifle-Magazine, 4 Pistolenmagazine, 2 Granaten, 5 Stims.

## Regeln

- Jede Ressource wird höchstens bis zur Tragekapazität aufgefüllt (Beispiel: 4/5 Stims → +1, nicht +2; 8/8 Rifle-Magazine → +0).
- Eine Ladung wird nur verbraucht, wenn mindestens eine Ressource ergänzt wird. Bei Vollversorgung: Meldung „Vollständig versorgt“, keine Ladung.
- Voraussetzungen: Operator lebt, Container intakt und verfügbar, Ladung vorhanden, Operator außen am Rumpf auf der Containerseite und innerhalb der Reichweite, keine andere Aktion und kein Reload, mindestens eine Ressource auffüllbar.
- Jede nicht erfüllte Voraussetzung meldet E sofort (`mission-feedback`): `resupply-busy` bei laufender Aktion oder gehaltenem Feuer, `resupply-reloading` während eines Reloads, `resupply-posture` in einer Haltung ohne Nachschub. Vorher meldete der Server in diesen Fällen Erfolg und es geschah nichts.
- Ablauf: `E` → Server prüft (`ResupplySystem.blocker`) → Aktion `resupply` für 1 s → am letzten Tick erneute Prüfung und atomare Transaktion (`complete`). Abbruch durch Feuern, Sprinten, R, jede Ausrüstungstaste, Verlassen der Reichweite, Ausfall des Containers, Tod oder Disconnect. Ein Abbruch verbraucht nichts.

## Verfügbarkeit

| Albatross-Zustand | Container nutzbar? |
| --- | --- |
| OPERATIONAL | ja |
| DAMAGED | ja (`vehicleDamaged`) |
| DISABLED (flugunfähig, ≥ 2 Düsen zerstört) | ja (`vehicleDisabled`) |
| DESTROYED | nein, Zustand `OFFLINE` (`vehicleDestroyed: false`) |
| Container zerstört (HP 0) | nein, Zustand `DESTROYED` |

Die Container sind zusätzliche Ziele des Schwarms am Rumpf (wie Düsen und Rumpfpunkte) und können zerstört werden. Debug: `destroy-supply`.

## Multiplayer

- Alle Clients sehen denselben Bestand über `mission-state › albatross.supply[]` (Ladungen, HP, Zustand, letzte Nutzung).
- Gleichzeitige Entnahme: Prüfung und Abbuchung passieren auf demselben Server-Tick, nacheinander pro Operator. Die erste Abschlusstransaktion verbraucht die Ladung, die folgenden sehen den neuen Stand. Negative Ladungen sind ausgeschlossen (Test mit vier Operatoren und einer Ladung).
- Reconnect: Der Zustand lebt nur auf dem Server; ein Reconnect wiederholt keine Nachrichten und vergibt nichts doppelt. Ein Disconnect während der Interaktion bricht sie ab.
- Manipulierte Anfragen: `mission-interact` trägt keine Daten. Container, Reichweite und Mengen bestimmt der Server.
- Ereignis `combat › resupply` (Operator, Container, verbleibende Ladungen, tatsächlich vergebene Mengen) für Ton, Klappenanimation und HUD-Meldung.

## Darstellung (`rendering/mission/SupplyContainerView.ts`)

Panzerkasten mit Halterungen in den Rumpf, Warnstreifen, Klappe mit Scharnier oben, Stencil „NACHSCHUB · SUP-02-L / MAG · GR · STIM“, eine Kontrollleuchte pro Ladung (grün verfügbar, aus verbraucht), Interaktionsleiste (pulsiert bei Bereitschaft, orange bei leer/außer Betrieb). Die Klappe öffnet während der Nutzung und kurz danach; zerstörte Container werden dunkel und die Klappe hängt halb offen. Prozedural aus Box-Geometrie, ein authored Modell fehlt noch.

HUD-Prompt in Reichweite: „Nachschub aufnehmen · 3/4“, „Nachschubcontainer leer“, „… zerstört“, „Nachschub außer Betrieb“. Nach der Nutzung: „Nachschub · +2 MAG · +1 P-MAG · +1 GR · +2 STIM“.

## Vorbereitung für Schiffsupgrades

`MissionBalance.resupply` löst Ladungen (`resupply.<containerId>.charges`), Mengen (`resupply.perUse.*`) und Interaktionszeit (`resupply.interactionTicks`) über die Missions-Modifikatorebene auf. Ein späteres Upgrade-System kann sie als `mission`-Modifikatoren beim Missionsstart setzen, ohne Code im Nachschubsystem zu ändern. Weitere Container sind zusätzliche Einträge in `supplyContainers`. Neue Versorgungstypen benötigen ein Feld in `perUse` und `ResupplyGrant`. Upgrades selbst sind nicht implementiert.

## Tests

`combat.test.ts` Abschnitt 15.6 und Reconnect-Fälle in 15.7.

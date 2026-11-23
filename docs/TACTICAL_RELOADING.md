# Taktisches Nachladen

Munition wird in **ganzen Magazinen** verwaltet. Beim Nachladen wird das eingesetzte Magazin entfernt und seine Restmunition verworfen. Angebrochene Magazine werden nie inventarisiert.

## Werte (`weapons.json`)

| | Kestrel AR-01 | P-01 |
| --- | ---: | ---: |
| `magazineSize` | 45 | 12 |
| `reserve` (Missionsstart) | 8 | 4 |

Einzelpatronen-Nachladen (VX-13, `feed.type: single`): [LOADOUT_SYSTEM](LOADOUT_SYSTEM.md#einzelpatronen-nachladen-server-systemscombatts).
| `maxReserve` (Tragekapazität) | 8 | 4 |
| Munition bei Missionsstart | 45 + 8 × 45 = 405 | 12 + 4 × 12 = 60 |
| `reloadSeconds` | 2,1 s = 63 Ticks | 1,45 s = 44 Ticks |
| `reloadTimeline.removalAt` | 0,20 → Tick 13 | 0,18 → Tick 8 |
| `reloadTimeline.insertionAt` | 0,72 → Tick 45 | 0,68 → Tick 30 |

Beispiel: 17/45 und 8 Magazine → nach dem Nachladen 45/45 und 7 Magazine, 17 Schuss verloren (`17 / 45 | 8 MAG` → `45 / 45 | 7 MAG`).

## Zustandsautomat (Server, `systems/combat.ts › updateReload`)

```text
READY ──R oder leeres Magazin + Abzug──▶ RELOAD_START ──Tick removalAt──▶ MAGAZINE_REMOVAL
                                              │                                │
                                              └── Unterbrechung ──▶ RELOAD_INTERRUPTED (Munition unverändert)
MAGAZINE_REMOVAL ──Tick insertAt──▶ MAGAZINE_INSERTION  ◀── einzige Munitionstransaktion
MAGAZINE_INSERTION ──nächster Tick──▶ RELOAD_COMPLETE (Durchladen, kein Feuer) ──Tick until──▶ READY
```

Die Transaktion am Insertion-Tick ist atomar: Reservemagazin −1, Magazin = Kapazität, Restmunition verworfen (Telemetrie `roundsDiscarded`). Der Phasenwechsel macht eine zweite Ausführung unmöglich. Wird nach der Insertion unterbrochen (z. B. Waffenwechsel während `RELOAD_COMPLETE`), bleibt das neue Magazin eingesetzt und es gibt keine weitere Transaktion.

## Regeln

- Nachladen ist nicht möglich bei vollem Magazin oder ohne Reservemagazin (`reloadBlocker`).
- Ein leeres Magazin wird normal ersetzt; gedrückter Abzug bei 0 Schuss startet das Nachladen automatisch.
- Feuern ist in allen laufenden Phasen gesperrt.
- Jede Waffe behält ihr eingesetztes Magazin beim Waffenwechsel (`inactiveAmmo`). Reservemagazine sind getrennt pro Slot.

## Unterbrechungen

| Auslöser | Wirkung |
| --- | --- |
| Waffenwechsel (1/2) | unterbricht |
| Granatenwurf (G) | unterbricht (vor 7.2B wurde der Wurf stattdessen abgelehnt) |
| Nahkampf (V) | unterbricht |
| Tod | unterbricht, Munition bleibt erhalten |
| Disconnect | der Reload läuft serverseitig weiter und endet regulär |
| Sprinten | unterbricht nicht (bestehendes Design) |
| Heilstim | kann während des Nachladens nicht starten; R bricht einen laufenden Stim ab |
| Nachschub | kann während des Nachladens nicht starten; R bricht die Nachschubaktion ab |

## Netzwerk

- Client sendet nur `reload: true` als Flanke im `PlayerInput`. Wiederholte oder doppelte Pakete ändern nichts: Die Flankenerkennung, die strikt steigende Sequenznummer und der laufende Zustand verhindern einen zweiten Start.
- Server sendet `PlayerState.reload` (`ReloadState`: Phase, Slot, `started`, `removalAt`, `insertAt`, `until`, `at`) nur, solange der Reload läuft oder bis eine Sekunde nach einer Unterbrechung. `reloadUntil` bleibt für ältere Clients erhalten.
- `combat`-Events `reload` (`RELOAD_START`, `MAGAZINE_INSERTION` mit `discarded`, `RELOAD_INTERRUPTED`) steuern die Geräusche aller Clients.

## Animation

`WeaponVisualController.reload` und die Stützhand verwenden dieselben Bruchteile `reloadTimeline` wie der Server: Das Magazin verlässt die Waffe um `removalAt` und sitzt exakt bei `insertionAt`. Der Fortschritt kommt aus `reloadUntil` und `reloadTicks`, also aus der Server-Timeline. Bei einer Unterbrechung setzt der Server `reloadUntil = 0`, die Animation endet sofort. Der Pistolenschlitten steht während des Wechsels offen.

## HUD

`17 / 45 | 8 MAG`, darunter der Phasenbalken (Nachladen, Magazinwechsel, Magazin eingesetzt, Durchladen), „Nachladen abgebrochen“ für eine Sekunde, „Keine Reservemagazine“ bei leerer Reserve und unter 25 % im Magazin. Zweitwaffe: `12/12 · 4 MAG`.

## Tests

`combat.test.ts` (Abschnitt 15.2) und `reload.test.ts`.

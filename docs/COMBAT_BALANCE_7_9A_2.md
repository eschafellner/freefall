# FREEFALL 7.9A.2 · Kampf- und Ressourcenbalance

Die Kestrel AR-01 beginnt ihre Rückstoßerholung einen Servertick früher. Der Registry-Release ist `7.9A.2`, Schema `2`, Hash `8cf1c12067347de6`. Baseline ist Commit `ffc81913055f9673ffb55fa027b7488ef0ec9d71` mit Balance-Hash `01855759529dd588`.

## Entscheidung und zentrale Änderung

| Parameter | Baseline | Übernommener Stand | Messung und Entscheidung |
| --- | --- | --- | --- |
| `weapons.json` · `kestrel-ar-01.recoil.recoveryDelaySeconds` | 0,12 s, auf 4 Ticks gerundet | **0,10 s, 3 Ticks** | Eine gehaltene Kestrel feuert alle 3 Ticks. Die Erholung greift jetzt auf dem nächsten regulären Schusstakt. Im festen 18-m-Dauerfeuerfenster stieg die Trefferquote von 17,1 auf 26,3 % und der Aufwand sank von 11,67 auf 7,78 Schuss pro Kill. Kurze Salven blieben effizienter. Beibehalten. |
| Kontrollversuch desselben Parameters | Baseline 4 Ticks | 0,067 s, 2 Ticks | Bei 8 m erzielte Dauerfeuer 140,5 HP/s gegenüber 104 HP/s in kurzen Salven. Der Drei-Tick-Stand erreicht 90,67 HP/s im Dauerfeuer und erhält den Salvenvorteil in dieser Probe. Zwei Ticks verworfen. |

Der effektive Kestrel-Kick beginnt weiterhin bei 0,36° vertikal und 0,22° horizontal pro Schuss. Der spätere Kick wächst weiter bis zum vorgesehenen Multiplikator. Das Dauerfeuer erreicht im langen Fenster weiterhin die 7°-Grenze. Server und Kamera-Prediction lesen denselben aufgelösten Rückstoßwert. Die Trefferprüfung verwendet die serverseitige Schussrichtung. Kamera-Kick, Modellimpuls und Audio sind Präsentation. [Registry-Daten](../packages/shared/src/balance/data/weapons.json) · [Shared Handling](../packages/shared/src/combat/handling.ts) · [Server-Schuss](../apps/server/src/systems/combat.ts)

## Vergleich unter kontrollierten Bedingungen

Der Messharness steuert den Server über Operator-Inputs bei 30 Hz. 320 Einzelzielversuche und 192 Zielkettenversuche verwenden 16 Seeds von 7 bis 292. Die Zielkette verwendet ein Neun-Sekunden-Fenster, einen stationären 48-HP-Gegner nach dem anderen und keine Rückstoßkorrektur durch den Bot. Die Salve schießt neun Ticks und pausiert zwölf. TTK zählt ab dem ersten Schuss auf das jeweilige Ziel. P50/P95 beziehen sich auf aufgelöste Ziele. Schuss/Kill zählt auch Fehlschüsse und Schüsse auf unvollständig aufgelöste Ziele.

| Kestrel, stehende Zielkette | Trefferquote vorher → nachher | Schuss/Kill vorher → nachher | Kills vorher → nachher | P95-TTK vorher → nachher |
| --- | ---: | ---: | ---: | ---: |
| 8 m, gehalten | 33,9 → 48,6 % | 5,96 → 4,12 | 188 → 272 | 5,433 → 4,933 s |
| 18 m, gehalten | 17,1 → 26,3 % | 11,67 → 7,78 | 96 → 144 | 6,033 → 5,733 s |
| 32 m, gehalten | 10,9 → 17,1 % | 18,98 → 12,17 | 59 → 92 | 6,233 → 6,033 s |
| 18 m, kurze Salven | 100 → 100 % | 2,05 → 2,05 | 304 → 304 | 0,500 → 0,500 s |

Die Einzelzielproben im Stand ergaben weiterhin zwei Treffer und 0,10 s TTK für die **Kestrel** sowie drei Treffer und 0,50 s für die **P-01**. Bei 18 m galten diese Zeiten auch in Hocke, Bauchlage, Rückenlage und beim seitlichen Gehen. Bei freier Sicht traf die Kestrel bei 68 m und verfehlte bei 74 m. Die P-01 traf bei 44 m und verfehlte bei 68 m. Die konfigurierten Reichweiten sind 72 bzw. 44 m. Die P-01 behielt im gehaltenen 18-m-Zielkettentest ihre 128 Kills und 100 % Trefferquote. Als alleinige Waffe blieb sie in der schnellen Schwarmprobe aufgrund der niedrigeren Feuerrate im Nachteil.

80 weitere Läufe mit Verfolgung und Angriffen der bestehenden KI maßen Acht-Seed-Mittelwerte für Solo und Vierertrupps. Die Operatoren blieben am Startpunkt und zielten auf den nächsten Gegner. Die Fixture lief ohne Respawn, Rückstoßkorrektur und Ausrüstungsaktionen.

| Kestrel im lebenden Schwarm | Befund vorher → nachher |
| --- | --- |
| Solo, 12 Schaben | Ø 65,25 → 52,88 Schuss, 33,5 → 26,5 HP erlittener Schaden. Je 7 von 8 Läufen mit lebendem Operator. |
| Solo, 48 Schaben | Ø 33,75 → 32,50 Kills. In beiden Varianten alle acht Läufe ohne Überlebenden, mit Munition im Inventar. |
| Vier Operatoren, 48 Schaben | In beiden Varianten 48 Kills und alle Operatoren lebend. Ø 204,5 → 205 Schuss, 14 → 8,75 HP Friendly Fire. |
| Vier Operatoren, 128 Schaben | Ø 113,38 → 116,88 Kills. Ø 0,75 → 0,88 lebende Operatoren. |

Die Unterschiede bei Friendly Fire ergeben sich aus den Schussbahnen in diesen Szenarien. Der Faktor bleibt bei 0,30. [Messharness](../scripts/measure-combat-balance.ts) · [Vorher-/Nachher-Rohdaten](playtest/7-9a2/results.json)

## Munition, Nachschub und Ausrüstung

| Kontrollprobe | Ergebnis in beiden Registry-Ständen |
| --- | --- |
| Kestrel, jeweils leer nachladen | 405 Schuss, 8 Reloads, Erschöpfung nach 56,70 s gehaltenem Feuer einschließlich Ladepausen. |
| Kestrel, ein taktischer Reload nach 1,5 s | 30 Patronen verworfen. 375 Schuss bis zur Erschöpfung, 53,77 s, 7 weitere leere Reloads. |
| P-01, jeweils leer nachladen | 60 Schuss, 4 Reloads, Erschöpfung nach 19,87 s einschließlich Ladepausen. |
| P-01, ein taktischer Reload nach 1,5 s | 6 Patronen verworfen. 54 Schuss bis zur Erschöpfung, 18,57 s, 3 weitere leere Reloads. |
| Ein Frag-Wurf gegen zehn verteilte Schaben | 6 Kills und 334 HP Gegnerschaden. Der kurze Wurf verursachte 36 HP Selbstschaden und 35 HP Friendly Fire. |
| Kolbenstoß bei 1,5 m | Ein Treffer und ein Kill gegen eine Schabe mit 48 HP. Tests decken Reichweite, Windup, Cooldown, Deckung und Haltungssperren ab. |
| Stim und Friendly Fire | Ein abgeschlossener Stim heilte 40 HP. Unterbrechung durch Feuer kostete keine Ladung. Ein Kestrel-Treffer am Operator verursachte 7 HP Friendly Fire. |

Die vollständigen automatisierten Missionsrouten liefern MissionResult, verbrauchte Magazine, Patronenverlust und Reserven am Resultat. Im grünen Nest-Purge-Sololauf trafen 15 Kestrel-Schüsse das Nest. Anschließend verwarf der taktische Reload 30 Patronen. Eine Nachschubladung stellte das verwendete Reservemagazin wieder her. Tests decken verfügbare und leere Container, Vollversorgung, Abbruch und die atomare Vergabe der letzten Ladung an vier Operatoren ab. Daraus ergibt sich in diesem Paket kein gemessener Bedarf für eine Änderung an Kapazität, Schadenswerten oder Nachschubmengen.

Der Balance-Hash ist Teil des vorhandenen Missions-Seeds. Dadurch können gleiche Missions-Seeds nach dem Release andere Ziele und Routen würfeln. Der Generator und die Welt-Seeds folgen ihren bestehenden Regeln. Abnahmerouten wählen ihre Vorlage ausdrücklich. Der Dev’Ault-Ballonlauf verteidigt den Countdown jetzt mit den bestehenden Spielinputs. Mit dem neuen Hash endete der vorherige Wartepfad in einem Teamwipe. Die kausalen Zahlen zur Waffenänderung stammen aus identischen kontrollierten Fixtures.

## Dateien und Tests

| Dateien | Änderung |
| --- | --- |
| [weapons.json](../packages/shared/src/balance/data/weapons.json) und [manifest.json](../packages/shared/src/balance/data/manifest.json) | Ein Kestrel-Wert und Release-Metadaten der Registry. |
| [measure-combat-balance.ts](../scripts/measure-combat-balance.ts) | Identische Inputs, Seeds und Ziele für Basisstand und Kandidaten. Auswertung aus bestätigten Treffern, Kills, Reload-Ereignissen und bestehender Kampftelemetrie. |
| [combat.test.ts](../apps/server/test/combat.test.ts) und [balance.test.ts](../apps/server/test/balance.test.ts) | Regression am Erholungstick und acht neue Fingerabdrücke für die gewollt veränderten Schussbahnen und Folgeereignisse. |
| [procedural-mission.test.ts](../apps/server/test/procedural-mission.test.ts) und [multiplayer.test.ts](../apps/server/test/multiplayer.test.ts) | Missionsrouten mit expliziter Vorlage, Ressourcen am Resultat und reproduzierbare 1.000-Schaben-Reconnect-Fixture. |

Für den vorherigen Registry-Stand lassen sich alle Originaldateien aus Git wiederherstellen. Der Harness lässt Kandidaten im Speicher laufen.

```sh
baseline_dir=$(mktemp -d)
git archive ffc8191 packages/shared/src/balance/data | tar -x -C "$baseline_dir"
export FREEFALL_SOURCE_REVISION=$(git rev-parse HEAD)
node --conditions=development scripts/measure-combat-balance.ts --snapshot "$baseline_dir/packages/shared/src/balance/data"
node --conditions=development scripts/measure-combat-balance.ts --snapshot "$baseline_dir/packages/shared/src/balance/data" --trial-recovery-delay .067
node --conditions=development scripts/measure-combat-balance.ts

npm run typecheck
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target es2023 --module nodenext --allowImportingTsExtensions --types node scripts/measure-combat-balance.ts
npm run build
npm test
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256
git diff --check
npm run benchmark -- 1800 421337 4 continuous

export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
ANGLE=gl FREEFALL_HIT_ACCEPTANCE=1 node --conditions=development scripts/playtest-weapon-vfx.mjs
```

**347 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen.** TypeScript, Produktionsbuild, Registry-Prüfung, Gameplay-Traces und alle drei Schaben-Prüfsummen wurden erfolgreich ausgeführt. Die Vite-Warnung zur Hauptbundle-Größe besteht weiter. Alle elf automatisierten prozeduralen Missionsrouten erreichten die serverseitige Extraktion mit vollständigen Ergebnis- und Ressourcendaten. Die Wiederverbindungs-Fixture nutzt Seed 77, nachdem ein zufälliger Room-Seed im ersten Gesamtlauf keine Startkohorte für die Abstimmung zwischen vier Clients geliefert hatte.

## Leistungsstichprobe

Ryzen 7 9700X unter Linux, Node 24.18.0, vier Operatoren, Seed 421337 und 1.800 Messticks nach 360 Warmup-Ticks. Der bestehende Arena-Benchmark füllt die Reserven für vergleichbare Last auf. Die Messung enthält tatsächliche Verfolgung und Angriffe.

| Servermessung nahe 1.000 aktiven Schaben | Vorher | Nachher |
| --- | ---: | ---: |
| Gemessene Spanne aktiver Schaben | 999–1.000 | 997–1.000 |
| Tick P95 / P99 | 1,037 / 1,074 ms | 1,023 / 1,061 ms |
| Bestätigte Schüsse | 1.598 | 1.597 |
| Geschätzte Nutzlast je Client | 130,5 KiB/s | 130,4 KiB/s |

Die native Chromium-Regression auf Radeon RX 9070 XT hielt im Vierer-Arena-Test 1.000 aktive Schaben zu Anfang und Ende der 2,3-s-Stichprobe. Sie meldete 90 bestätigte Schüsse, Framezeit P95/P99 16,7/16,8 ms und keine Browserfehler. Beide Waffen, Hocke, Bauch- und Rückenlage, Bodenreload, verzögerte Treffer und Freundbeschuss-Feedback wurden ausgeführt. Ein Browser renderte, drei weitere Operatoren waren SDK-Verbindungen. [Rohdaten](playtest/7-9a2/results.json)

## Release-Gates 7.9A.2

| Gate | Status | Nachweis |
| --- | --- | --- |
| A2-G1 Combat Baseline | PASS | Historische Registry und Messbefehle, dieselben Seeds und Eingaben. |
| A2-G2 Weapon Effectiveness | PASS | Einzelziel-TTK, Trefferquote, Zielketten und lebender Schwarm mit beiden Waffen. |
| A2-G3 Resource Balance | PASS | Verbrauch bis Erschöpfung, taktisches Nachladen, Reserven und tatsächliche Missions-Nachschubtransaktionen. |
| A2-G4 Equipment Balance | PASS | Messungen für Granate, Melee, Stim und Friendly Fire plus bestehende Regeltests. |
| A2-G5 Movement Compatibility | PASS | Schießstandversuche in Stand, Hocke und Bodenlagen sowie Dive- und Aufstehregression im Client und Server. |
| A2-G6 Central Balance Registry | PASS | Ein zentraler Wert versioniert und serverseitig synchronisiert, acht Gameplay-Traces geprüft. |
| A2-G7 Multiplayer und Autorität | PASS | Vier WebSockets, simulierte RTT, Reconnect, Server-Validierung und unveränderte Netzwerkverträge. |
| A2-G8 Vergleichende Validierung | PASS | Zwei Vergleichsstufen, gewählte Konfiguration, automatisierte Missionen und native Browserstichprobe. |

**NOT TESTED** bleiben menschliches A/B-Playtesting, Munitionsökonomie in regulären 20–30-Minuten-Missionen und die kombinierte 7.9E-Last. Aus der abgegrenzten Solo-Stress-Fixture folgt kein Sollwert für den allgemeinen Schwarmdruck.

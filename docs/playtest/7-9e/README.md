# FREEFALL 7.9E · Evidenz und Reproduktion

Die Berichte verwenden die Basisrevision `ffc81913055f9673ffb55fa027b7488ef0ec9d71`, die lokal vorgefundenen Dateien der Phasen 7.9A–D und die in der Abnahme genannten Testwerkzeugänderungen. Die Registry für alle Läufe ist `390e375eec0bf943`. [Abnahmebericht](../../MILESTONE_7_9E_FINAL_ACCEPTANCE.md) · [Datei-Fingerabdrücke vor den Harness-Änderungen](baseline-source.sha256)

## Automatisierte Regression

```sh
npm run typecheck
npm test
npm run build
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256
git diff --check
node --check scripts/playtest-combat-presentation.mjs
./node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2023 --module NodeNext \
  --customConditions development --types node --rewriteRelativeImportExtensions \
  --resolveJsonModule --skipLibCheck --strict scripts/measure-mission-balance.ts
```

Das Monorepo definiert kein Lint-Skript. `npm run assets:check` ohne GLB gibt die Hilfe mit Exit 2 aus. Der Referenzbestand verwendet den vorhandenen prozeduralen bzw. hybriden Fallback. Die Audio-Asset-Prüfung gleicht die SHA-256-Werte aus `docs/audio-masters.json` mit den ausgelieferten Dateien ab. `ffprobe` prüft Codec und Kanalzahl und `ffmpeg -nostdin -v error -xerror -i FILE -f null -` dekodiert die Dateien vollständig. [Abschlussregression](regression-final.txt) · [Audio-Asset-Prüfung](weapon-assets.txt)

## Missionen, Kampf und Netzwerk

```sh
export FREEFALL_SOURCE_REVISION=$(git rev-parse HEAD)
EVIDENCE=docs/playtest/7-9e
node --conditions=development scripts/measure-mission-balance.ts \
  "$EVIDENCE/mission-matrix.json" '.*' "$EVIDENCE/balance.json"
FREEFALL_MISSION_CYCLES=6 node --expose-gc --conditions=development scripts/measure-mission-balance.ts \
  "$EVIDENCE/lifecycle.json" '(^green-plains|^desert|^ice|^forest).*relay-defense/4/(albatross|balloon)$' "$EVIDENCE/balance.json"
FREEFALL_MISSION_CYCLES=2 node --expose-gc --conditions=development scripts/measure-mission-balance.ts \
  "$EVIDENCE/lifecycle-failure.json" '^forest/(63/0/relay-defense/4/albatross|76/4/nest-purge/4/balloon/freefall)$' "$EVIDENCE/balance.json"
node --conditions=development scripts/measure-combat-balance.ts > "$EVIDENCE/combat-balance.json"
node --conditions=development scripts/measure-tactical-movement.ts "$EVIDENCE/balance.json" > "$EVIDENCE/tactical-movement.json"
node --conditions=development scripts/motion-bench.ts 60,144 lan,wan,jitter --json "$EVIDENCE/motion.json"
NODE_TEST_CONTEXT=measurement FREEFALL_WORKSPACE=7.9E node --conditions=development \
  scripts/measure-enemy-pressure.ts all "$EVIDENCE/balance.json" > "$EVIDENCE/enemy-pressure.json"
NODE_TEST_CONTEXT=measurement FREEFALL_WORKSPACE=7.9E FREEFALL_PRESSURE_SECONDS=1500 node --conditions=development \
  scripts/measure-enemy-pressure.ts director "$EVIDENCE/balance.json" > "$EVIDENCE/director-pressure.json"
npm run benchmark -- enemy-ai 1800 421337 matrix distributed
npm run benchmark -- mission 36000 77 4 director
```

Bei einem Teil der 1.500-s-Director-Proben endet die Simulation früher, weil die Operatoren sterben. Die tatsächliche Dauer steht in `durationTicks`. Die Missionsmatrix lädt denselben Registry-Snapshot wie 7.9D. `scenario` und `plan` halten beide Seeds, Plan-ID, Schwierigkeit und Generatorvarianten fest. `telemetry`, `combat`, `stages` und `result` halten Messwerte und den serverseitigen Abschluss fest. Bei der Wiederholung werden stattdessen dieselben Operatoren und derselbe Serverraum weiterverwendet. Der Randomizer läuft dabei weiter.

## Chromium und vier Operatoren

Playwright und Chromium werden als vorhandene lokale Testwerkzeuge benötigt. Die Skripte starten Server und Preview ausschließlich auf Loopback. Die folgenden Umgebungsvariablen zeigen die getesteten Pfade. Auf anderen Rechnern die beiden Toolpfade anpassen.

```sh
export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
export FREEFALL_SOURCE_REVISION=$(git rev-parse HEAD)
export FREEFALL_BROWSER_WIDTH=800 FREEFALL_BROWSER_HEIGHT=450

FREEFALL_BROWSER_ANGLE=swiftshader node --conditions=development scripts/playtest-weapon-audio.mjs

FREEFALL_BROWSER_ANGLE=gl FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 \
  FREEFALL_COMBAT_LIVE_MAX=1 FREEFALL_COMBAT_STEADY_POPULATION=1 FREEFALL_COMBAT_MOVEMENT=1 \
  FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_SAMPLE_MS=35000 FREEFALL_COMBAT_MISSION_FLOW=1 \
  FREEFALL_MISSION_TELEMETRY=1 FREEFALL_COMBAT_DROP=1 \
  node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/freefall-79e-combined-final

export FREEFALL_BROWSER_ANGLE=gl
FREEFALL_WEATHER_PLAYTEST=1 FREEFALL_FINAL_QA=1 node --conditions=development scripts/playtest-planet-atmosphere.mjs

export FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63
export FREEFALL_TIME_OF_DAY=dawn FREEFALL_WEATHER=ground-mist FREEFALL_BROWSER_AUDIO=1
FREEFALL_OPERATORS=4 FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=1000 \
  FREEFALL_BROWSER_THREAT=1 FREEFALL_BROWSER_COOP_ACCEPTANCE=1 FREEFALL_BROWSER_SAMPLE_MS=15000 \
  node --conditions=development scripts/playtest-horde-director.mjs
FREEFALL_OPERATORS=1 FREEFALL_BROWSER_PEERS=1 FREEFALL_BROWSER_ENEMIES=0 \
  FREEFALL_BROWSER_LOAD_ONLY=1 FREEFALL_BROWSER_SOAK=1 FREEFALL_BROWSER_SAMPLE_MS=120000 \
  node --conditions=development scripts/playtest-horde-director.mjs
```

Die kombinierte Probe schreibt `report.json` ins angegebene Ausgabeverzeichnis. Der erste Versuch mit fehlenden neutralen Eingaben beim Nachschub ist als `forest-attempt` dokumentiert. Der korrigierte Lauf steht unter `forest-combined`. Die Browser-Planetprüfung nutzt kontrollierte Positionen. Die separaten Serverrouten bewegen die Operatoren mit regulären Eingaben. [Kombinierter Waldlauf](forest-combined.json) · [Planet-Browser](planet-browser.txt) · [Vier native Ansichten](forest-four-clients.txt)

## Erwartete Spielabnahme

Der [Playtestbogen](HUMAN_PLAYTEST.md) enthält die Szenariozuordnung, Eingabefelder und die Fragen zur subjektiven Akzeptanz. Die automatisierten Tests und technischen Messwerte sind §16 und §17 des [Abnahmeberichts](../../MILESTONE_7_9E_FINAL_ACCEPTANCE.md) zugeordnet.

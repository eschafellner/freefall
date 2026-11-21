# Playtest 7.7D · 20. November 2026

## Ausgeführt

| Prüfung | Befund | Nachweis |
| --- | --- | --- |
| Typprüfung, Produktionsbuild | **PASS** | `npm run typecheck` und `npm run build` erfolgreich. Vite meldet die übliche Größenwarnung für das gebündelte Client-JavaScript. |
| Automatisierte Suite | **PASS** | 302 bestandene Tests einschließlich sieben neuer Audio-Tests. Authentische Colyseus-Netzwerktests, beide Extraktionswege und Reconnect bei 1.000 Gegnern auf Serverebene sind enthalten. |
| Asset-Integrität und Headroom | **PASS** | 62 IDs, 124 Game-Dateien mit passenden SHA-256-Werten. FFmpeg EBU-R128 True Peak nach Kodierung maximal −3,2 dBTP. Alle drei Prüfdateien der Schaben-Baseline stimmen mit ihrem SHA-256 überein. |
| Chromium Web Audio | **PASS** | Chromium 153.0.8010.12. Echter Context nach Benutzerinteraktion, je Soundscape ein messbares Stereosignal. Ogg Vorbis und erzwungener MP3-Fallback. Seitentrennung bei ±8 m (4,2:1 RMS) und Dämpfung bei 29 m (nahe Seite 26 % des Werts bei 8 m). Ducking und selbsttätige Rückkehr geprüft. |
| Firefox Formate | **PASS** | Firefox 159.0 dekodierte alle 124 Dateien im lokalen Headless-Test und startete den Context. Die Autoplay-Freigabe war für den Decode-Harness gesetzt. |
| Vier Planeten im Spiel | **PASS** | Chromium-Debug-Playthroughs auf Grün, Wüste, Eis und Wald, Wetterwechsel aus 7.7C, Prone und Supine, anschließende Extraktion. Albatross auf Grün und Wüste, Ballon auf Eis und Wald. |
| Vier Browser und Reconnect | **PASS** | Separater 250er-Waldlauf mit Socket-Abbruch eines Clients während `forest-calm → windy-forest`. Nach Reconnect auf allen vier Clients derselbe Planet und Wetterübergang, je zwei Atmosphäre-Stimmen, null Audiofehler und höchstens 75,1 MiB PCM-Cache. Ein früherer Durchlauf mit Visual-Weather-Abfrage direkt nach dem 1.000er-Softwarelasttest lief in einen Timeout. Ein weiterer nativer Vier-Client-Lauf beendete nach Reconnect die Waldmission mit vier per Ballon extrahierten Operatoren in 3.347 Simulations-Ticks. |
| Horden- und Audio-Stress | **PASS** | Native Radeon- und SwiftShader-Matrix mit 250/500/1.000 Gegnern und vier Renderer-Clients. Native GPU bei allen drei Stufen mit 60 FPS pro Ansicht. Die separate Überlastprobe stellte 1.000 gleichzeitige Anforderungen und prüfte ein zusätzliches Missionssignal unter dem Cap. Die Gesamtbildrate und offenen Langzeitmessungen stehen im [Performance-Bericht](AUDIO_PERFORMANCE.md). |

Die beschleunigten Browsermissionen liefen 1.498–4.807 Simulations-Ticks und verwendeten Testpositionen. Sie decken die Spielwege und beide Extraktionssysteme ab. Das akustische DSP-Signal wurde direkt hinter dem Master im echten Browsergraphen gemessen.

## Subjektive Hörabnahme und Langzeit

| Prompt-Tests | Status | Offene Prüfung |
| --- | --- | --- |
| A–D · Vier Planeten | **NOT TESTED** | Kopfhörer-Hörabnahme für Eigenständigkeit, Schichtung, Loop-Nähte und auffällige Wiederholungen |
| E–G · Bewegung, Schabe, Horde | **NOT TESTED** | Hörbalance der Bewegungsarten und Wahrnehmbarkeit unmittelbarer Angriffe unter Waffenfeuer |
| H–I · Fahrzeug und Extraktion | **NOT TESTED** | Akustische HRTF-Ortung des Flugpfads sowie Mix der Funk- und Nachschubsignale im Gefecht |
| J · Vier-Spieler-Hörtest | **NOT TESTED** | Gemeinsame reale Kopfhörer-Sitzung mit vier Operatoren. Technischer Koop und Reconnect sind oben belegt. |
| K · 20–30 Minuten | **NOT TESTED** | Durchgehende Mission für Langzeitwiederholungen, PCM- und Browser-Prozessspeicher |
| L · Browser | **PASS / NOT TESTED** | Chromium-Ausgabe und Firefox-Dateidekodierung geprüft. Gesamter Firefox-Playthrough und Safari/WebKit stehen aus. |

Der lokale Entwicklungsserver öffnet unter `/?audioLab` die Hörvorschau für Planet, Wetter, Oberfläche, 3D-Position, Schaben-Windup und die 1.000er-Überlastprobe. F2 zeigt im Spiel Audio-Kontext, Layer, Stimmen, PCM-Cache, Lade- und Renderzeiten, Mixerpegel und Ducking.

```bash
node scripts/playtest-audio.mjs
FREEFALL_WEATHER_PLAYTEST=1 node --conditions=development scripts/playtest-planet-atmosphere.mjs
```

Die Browser-Skripte verwenden lokal verfügbares Playwright. `PLAYWRIGHT_MODULE` und `CHROMIUM_EXECUTABLE` können auf vorhandene Installationen zeigen.

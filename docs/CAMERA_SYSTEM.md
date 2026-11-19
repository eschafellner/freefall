# Third-Person-Kamera

`ThirdPersonCamera` (`apps/client/src/rendering/ThirdPersonCamera.ts`) wird einmal pro Frame aufgerufen. Das geschieht in `ArenaView.draw()` **nach** dem Posing der Spielerfiguren. Die Kamera folgt also dem endgültigen sichtbaren Zustand des Frames.

## Aufbau

- **Zielachse.** `aimRay()` aus dem Shared-Paket liefert Kamerapunkt und Blickrichtung aus Position, Yaw und Pitch. Der Server verwendet denselben Strahl für Treffer. Fadenkreuz und Schussrichtung stimmen deshalb überein.
- **Zoom.** Aim, Sprint und Kollision verschieben die Kamera nur *entlang* dieser Achse. Das Fadenkreuz bleibt dabei auf dem Serverstrahl.
- **Schulterperspektive.** Rechte Schulter, 0,86 m seitlich, 4,8 m hinter dem Blickpunkt (`CAMERA_SHOULDER`, `CAMERA_BACK`).

## Was geglättet wird und was nicht

| Größe | Verhalten | Grund |
| --- | --- | --- |
| Yaw / Pitch (Maus) | **ungeglättet**, im selben Frame | direkte Mausreaktion, keine Eingabeverzögerung |
| Position | folgt `Prediction.rendered` ohne eigene Glättung | Die Quelle ist seit 7.1 stetig. Zusätzliche Glättung wäre nur Verzögerung. |
| Aim-Zoom | gedämpft, Rate 11/s | angenehmer Übergang |
| Sprint-Rückzug und FOV | gedämpft, Rate 9/s | angenehmer Übergang |
| Kollision einziehen | sofort | die Kamera darf nie durch Geometrie sehen |
| Kollision freigeben | gedämpft, Rate 7/s | kein Pumpen an Kanten und Pfeilern |
| Rückstoß | kurzer FOV-Impuls, höchstens 0,63° | keine Positionsbewegung, das Fadenkreuz bleibt ruhig |

Animationen bewegen die Kamera nicht. Kopf- und Oberkörperbewegung des Rigs wirken nicht auf die Kamera zurück.

## Konfiguration (`CAMERA_TUNING`)

| Wert | Standard | Vor 7.1 |
| --- | ---: | ---: |
| `aimRate` | 11 | 11 |
| `sprintRate` | 9 | 9 |
| `aimTravel` (m nach vorn) | 0,98 | 0,98 |
| `aimFov` (° enger) | 14 | 14 |
| `sprintPullback` (m zurück) | 0,28 | 0,40 |
| `sprintFov` (° weiter) | 3 | 3,8 |
| `collisionRelease` | 7 | sofort |

## Befunde aus 7.1

- **Ursache des Kamera-Ruckelns.** Die Kamera bekam die Treppenposition der 30-Hz-Vorhersage. Ihre Geschwindigkeit schwankte bei 60 Hz um 75–87 %, bei 144 Hz um 154–175 % (Variationskoeffizient). Mit der interpolierten Vorhersage liegt sie bei 0,1 %. Gemessen wurde im Headless-Benchmark über die gleichförmigen Szenarien ohne Kameradrehung.
- **Szenario „Laufen + Kamera drehen“.** Die Werte von 23,9 % nach der Änderung (vorher 44–88 %) sind keine Unruhe. Die Kamera umkreist die Figur auf der Schulterachse, ihre Bahngeschwindigkeit schwankt dabei zwangsläufig mit der Drehung.
- **Kamerakollision.** Vorher sprang die Kamera an jeder Kante nach außen zurück. Jetzt gibt sie über etwa 300 ms frei. Ein Test prüft sofortiges Einziehen und gedämpftes Freigeben.
- **Zielen.** Die Perspektive bleibt stabil. Zoom und Schulterversatz laufen auf der Zielachse, die Position ist stetig.

## Offen

- Kollisionsprüfung nur gegen die Box-Hindernisse der Welt. Für Decken oder schräge Geometrie fehlt eine allgemeinere Abfrage.
- Die Schulterseite ist fest. Eine wechselbare Schulter braucht ein gemeinsames Zielkonzept mit dem Server.

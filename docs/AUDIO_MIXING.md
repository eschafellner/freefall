# Mischung und Pegel

Die Settings speichern Master, Kampf, Welt, Ambience, Wetter und Interface inklusive Mute und Enabled lokal unter der bestehenden Version `freefall.audio.v1`. Bestehende Regler behalten ihre Kanäle. Neue Ambience- und Weather-Regler erben bei der ersten Verwendung den bisherigen Umgebungspegel. Die Schieberegler verwenden weiterhin die quadratische Lautheitskurve. Freefall enthält derzeit keine Musikspur.

Nahe Angriffe und wichtige Missionstöne ducken Ambience und Wetter auf etwa 44 % ihrer momentanen Amplitude. Die Attack-Zeitkonstante beträgt 60 ms, die Rückkehr beginnt nach dem Ereignis mit 380 ms Zeitkonstante. Effekte und Funk bewahren Vorrang durch eigene Stimmenplätze und Pegel. Der bestehende Master-Kompressor arbeitet als Spitzenschutz bei −6 dB und 20:1. Der bearbeitete Datei-Headroom, Distanzkurven und relevanzbasierte Stimmenlimitierung halten Energie bereits vor dieser Stufe unter Kontrolle.

Geschützter Funk umfasst Missionsabschluss, Extraktionsstart, Lift und Verfügbarkeit. Relays, Alarme und eine bestätigte Nachschubaufnahme nutzen das gleiche UI-Bus-Routing. Resupply bleibt ein autoritatives bisheriges Gameplay-Ereignis.

## Prüfung 7.7E

Der Chromium-Test für 1.000 künstlich gleichzeitige Lab-Ereignisse protokollierte 978 verworfene Hintergrundereignisse. Abklingen des Duckings und reservierte Alarmplätze sind automatisiert geprüft. Für die subjektive Sprach- und Cue-Verständlichkeit steht die Hörabnahme aus. [Audioabnahme](MILESTONE_7_7_AUDIO_ACCEPTANCE.md)

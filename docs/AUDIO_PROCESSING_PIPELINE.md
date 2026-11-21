# Audiobearbeitung 7.7D

Die [Quellenliste](audio-sources.json) enthält Download-URLs, erwartete Eingangspfade und SHA-256. Für Archivquellen ist das Mitglied unter `file` verzeichnet. Die Zip- und 7z-Dateien können einmalig lokal entpackt werden. Freesound-HQ-MP3s erhalten den Dateinamen aus der angestrebten Quell-ID. Die Bearbeitung lässt sich mit Python 3 und FFmpeg mit `libvorbis` und `libmp3lame` reproduzieren.

```bash
python3 scripts/prepare-audio.py /pfad/zu/audio-eingang
```

FFmpeg 9.0.2 schrieb PCM mit 32 kHz, Stereo für Atmosphären und Mono für 3D-Quellen. Das Skript schneidet, filtert Tieftonrumpeln und begrenzt die obere Bandbreite nach Material. Kurze, nicht überlappende Varianten werden an Transienten mit Vorlauf getrennt und bekommen Rand-Fades. Die Loop-Master überblenden nach Kürzung ihr Ende in den Anfang. Der nächste Umlauf setzt dort ein, wo der Kopf der Überblendung aufgehört hat. Die Mischkurve ist eine komplementäre Smoothstep-Kurve, damit korrelierter Wind an der Naht nicht angehoben wird. Wiedergabe startet an einem missionsabhängigen Offset.

Das Skript misst EBU-R128-Lautheit, Lautheitsspanne und True Peak. Es setzt eine konstante Verstärkung mit Zielwert je Kategorie und mindestens 3,5 dB Master-Headroom vor der verlustbehafteten Kodierung. Bei sehr kurzen Transienten ohne integrierten Messwert wird der Pegel nach True Peak gewählt. Die meisten Atmosphären liegen bei −23 bis −25 LUFS, Foley-Ziele bei −22 bis −26 LUFS, Gegner-Windups bei −17 LUFS und Interface bei −19 bis −21 LUFS. Der [Master-Katalog](audio-masters.json) enthält die Werte pro Clip. Dynamik bleibt durch statische Verstärkung erhalten.

Laufzeitformate sind Ogg Vorbis Q4 und MP3 VBR Q3. Der Client versucht bei Format-, HTTP- und Decode-Problemen die alternative Fassung. Der gemeinsame Context läuft mit 48 kHz, damit die Größe dekodierter Puffer über Ausgabegeräte hinweg vorhersehbar bleibt. Browser resampeln die Ausgabe bei Bedarf für das jeweilige Gerät. [Web Audio API](https://www.w3.org/TR/webaudio/#AudioContextOptions). Der Cache zeigt deshalb den tatsächlichen PCM-Speicher dieses Contexts und nicht die Größe der ausgelieferten Dateien an.

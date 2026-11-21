# Horde-Audio und Stimmenbudget

Der gemeinsame Mixer zählt ein Klangereignis als Stimme, auch wenn eine synthetische Waffe mehrere Nodes dafür nutzt. Es gibt global 28 Stimmen und höchstens vier pro Besitzer. Normale Stimmen belegen maximal 22 Plätze. Unmittelbare Angriffe und eigene Schussimpulse können vier zusätzliche Plätze nutzen. Zwei Plätze bleiben für Missionssignale verfügbar. Neue Stimmen höherer Priorität können bei einem vollen Tier eine leisere verdrängen. Anzahl verworfener Stimmen und Spitze erscheinen im F2-Panel.

HordeAudio sampelt höchstens alle zwei Simulationsticks. Nur bereits klingende bewegte Quellen erhalten Transform-Updates pro Frame. Für Windup und aktive Angriffsphase kommen je Scan bis zu zwei nahe Kandidaten zum Mixer. Beschädigungs- und Kill-Foley besitzt zusätzlich einen kurzen Gruppen-Cooldown. Einzelne Bewegungssignale werden alle rund 0,38 s beprobt, pro Gegner mit rund 1,15 s Abstand.

Entfernte Gegner, die mehrere Nachbarn im 36-m-Raster haben, bilden eine Hörgruppe. Der Client wählt einen aussagekräftigen Schwerpunkt im Umkreis von 105 m und variiert den aggregierten Klang. Das Verfahren benötigt eine einzige lineare Suche über den vorhandenen Horde-Frame im Abtastfenster. Es sendet keine zusätzlichen Netzwerkpakete und erzeugt keine Live-Audioquelle pro inaktivem oder entferntem Gegner.

## Prüfung 7.7E

Die 7.7E-Waldmessung mit vier Browser-Operatoren und 1.000 tatsächlich simulierten Schaben belegte Windups und Impacts in allen vier Ansichten. Der höchste F2-Spitzenwert dieser Laststufe war 10 von 28 Stimmen je Client. [Native Lastmatrix](AUDIO_PERFORMANCE.md#native-koop-messung-77e)

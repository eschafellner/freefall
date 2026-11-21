# Higgsfield und Backward-Dive-Pilot

Geprüft am 19. November 2026. Der Test verwendete den Modell- und Aktionskatalog, einen lesenden 3D-Jutsu-Aufruf und zwei konkrete Preisabfragen. Es wurden **0 Credits** verbraucht. Eingereicht wurde nur ein neutraler Textprompt für die Schätzung. Es gab keinen Upload von FREEFALL-Dateien und keinen Generierungsauftrag.

| Umgebung | Verifiziert |
| --- | --- |
| Angebundene Higgsfield-App | Video-Modelle mit Text-, Bild- und Video-Referenz je nach Modell. Der 3D-Katalog führt Bild-zu-GLB, Pose aus einem Einzelbild sowie Rigging für ein bestehendes Mesh mit vorgefertigten Actions. Tripo P2 nennt GLB und FBX. Das Ausgabeformat `3d` allein belegt keine animierten Humanoid-Keyframes. |
| 3D Jutsu | Der lesende Zugriff auf den Cloud-Szenendienst funktioniert. Dessen Tools bieten Blender-Szenenbearbeitung über `bpy`, Download einer festgeschriebenen `.blend`-Revision und GLB der Szene. Die Website beschreibt den Import animierter GLBs sowie GLB, MP4 und Standbilder als Ausgabe. Ein Export mit Armatur und Actions für diesen Pilot wurde nicht bestätigt. [3D-Jutsu-Dokumentation](https://higgsfield.ai/blog/higgsfield-3d-jutsu) |
| Higgsfield-Website | Image-to-Video, video-basierte Referenzen und Motion Control sind Videofunktionen. Ein Video enthält für diese Pipeline keine exportierbare Bone-Hierarchie mit Keyframes. Ein Weg von Video zu einem retargetierbaren Motion-Capture-Clip wurde in der verbundenen App nicht verifiziert. [Video](https://higgsfield.ai/ai-video) · [Modellübersicht](https://higgsfield.ai/enterprise-help-center/platform/ai-models) |
| Separates Blender-Plug-in | Der Hersteller beschreibt einen Character-Animation-Tab mit gewichteter Armatur, Keyframes und Blender-Actions aus Text. Die dokumentierte Installation verlangt Blender 5.1+ auf Windows oder macOS und nutzt das Higgsfield-Creditkonto. Die Blender Bridge ist eine eigene Anbindung. In der lokalen Linux-Entwicklungsumgebung war kein `blender` im PATH und keine aktive Blender-Bridge verfügbar. [Blender-Plug-in und Bridge](https://higgsfield.ai/blog/higgsfield-blender-plugin) |
| Laufzeit | Die Freefall-Registry lädt lokale Modell- und Animationsdateien. Three.js übernimmt Playback und das vorhandene Retargeting. Die Spielsitzung kommuniziert mit dem Freefall-Server. |

## Kosten und Rechte

Im Katalog meldeten 3D-Abfrage, Video-Suche und Abfrage nach Unlimited-Modellen jeweils `free_gens: []`. Ein Modell mit Unlimited-Markierung weist keine verfügbare Kontofreigeneration nach. Die Preisabfragen für je eine fünfsekündige Referenz in 16:9 ergaben **22,5 Credits** für Seedance 2.0 und **10 Credits** für Kling 2.6. Das sind konkrete App-Angebote für die angegebenen Parameter. Der Hersteller weist Free Generations und Unlimited als Website-Kontingente aus. Website-Angebote und Kontoansprüche können sich ändern. [Preisübersicht](https://higgsfield.ai/pricing) · [Credits](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)

Abschnitt 4.4 der Nutzungsbedingungen regelt die kommerzielle Nutzung generierter Outputs. Vor einer Übernahme sind aktuelle Planbedingungen, Zusatzbedingungen des Modells, Rechte an Referenzen sowie Bearbeitung, Weitergabe und Weitervertrieb separat für das konkrete Asset nachzuweisen. Ein vorgefertigter Meshy- oder Mixamo-Clip benötigt seinen eigenen Herkunfts- und Lizenznachweis. [Higgsfield Terms of Use](https://higgsfield.ai/terms-of-use-agreement)

## Ergebnis des Piloten

Die Suche im 3D-Aktionskatalog nach `dive` lieferte drei Varianten von `Dive_Down_and_Land` mit GIF-Vorschau. Die Suche nach `supine` lieferte keinen Treffer. Die Rückwärts-Suche ergab unter anderem Rückwärtsgehen und Stürze. Für die vollständige Folge Bereitschaft, Gewichtsverlagerung, Absprung, Flug, Kontakt, Rückenlandung und stabile Rückenlage lag damit kein belegter passender und kostenfrei verfügbarer Datenpfad vor. Die Preisabfragen betrafen eine einzelne vollständig sichtbare neutrale Figur mit fester Seitenkamera.

Es wurde weder eine Videoreferenz noch ein nativer Clip erzeugt. Skeleton, Bone-Transforms, Keyframes, Dauer und Export des gewünschten Clips waren daher nicht am Ergebnis prüfbar. Der spielinterne Pilot verwendet den prozeduralen Rückwärts-Dive und die servergetaktete Rückenlandung. Der Chromium-Playtest bestätigte den Übergang und anschließend gültiges Feuern und Aufstehen. Produktionsqualität, individuelles Retargeting und Assetlizenz bleiben offen. [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md)

## Übergabe eines späteren nativen Clips

1. Ein freigegebenes neutrales Modell oder eine lizenzierte Motion-Quelle verwenden. Erzeuger, Modellversion, Quellmaterial, Lizenz, Exportrechte und tatsächliche Credits bei der Datei dokumentieren.
2. In einem getrennten lokalen Blender-Projekt oder auf einer freigegebenen Blender-Workstation Armatur, Bone-Hierarchie, Ruhepose, Einheiten, Achsen und Actions prüfen. Hüfte, Hände, Füße und Waffenanker an das Zielrig anpassen. Anlauf, Flug und Landung zum bestätigten Zeitfenster prüfen.
3. Das Ergebnis als In-Place-GLB mit benannten Actions exportieren. Ein vorhandenes FBX kann Blender als Quelle verarbeiten. Die Freefall-Laufzeit erwartet GLB über den AssetLoader.
4. `npm run assets:check -- character.glb animation-pack.glb --clip diveBackward=BackwardDive` prüft die Metadaten und den Namensvertrag. Danach Clip im Three.js-Client isoliert abspielen. Riggesteuerte Skelette, Bodenkontakt, Griff, Scale, Dauer und Mischbarkeit separat abnehmen. Für den Pilot sind `diveBackward`, `supineLand` und `supineIdle` relevant.
5. Validierte Dateien unter `apps/client/public/assets` ablegen. Im Soldier-Mapping Modell, `animationPacks`, Humanoid-Zuordnung, `motionRoot` und Clipnamen registrieren. Die vollständige Asset-Integration setzt das Produktionsrig und seine Mindestclips voraus. [Charakteranimation](CHARACTER_ANIMATION.md) · [Asset-Vertrag](CHARACTER_ASSET_REQUIREMENTS.md)

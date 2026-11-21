# 7.8B · Combat Impact Architecture

## Audit am Arbeitsstand 7.8A

| System und Dateien | Ausgangsstatus | Abhängigkeit und Teststand | Befund und Maßnahme |
| --- | --- | --- | --- |
| Primärwaffe, Pistole, Reload, Spread, Reichweite · `server/systems/combat.ts`, `shared/combat/handling.ts`, `server/simulation/Battlefield.ts` | VERIFIED | Balance-Trace, Combat- und Haltungsregression | Serverseitiger Hitscan. Granaten verwenden eine separate Projektilsimulation. Bestehende Trefferreihenfolge und Waffenregeln erhalten. |
| Geometrie · `shared/config/postureGeometry.ts`, `worldGeometry.ts`, `world/Terrain.ts` | VERIFIED | Autoritatives Höhenfeld, AABB-Deckung und Haltungsvolumina | Trefferstrecke vorhanden. Den tatsächlich gewinnenden Collider und die Normale für Präsentation erfassen. |
| Treffer, Tod und Teamregeln · `combat.ts`, `damage.ts`, `ecs/HordeManager.ts`, `mission/Convicts.ts` | PARTIALLY WORKING | Combat-Tests, fortlaufende Schaben-IDs, Operatorleben | `ally` meldet auch blockierende geschützte Operatoren. Bestätigung an angewandten Schaden binden. |
| Tracer, Prediction, Reconciliation · `client/game/Game.ts`, `Prediction.ts`, `rendering/ArenaView.ts` | VERIFIED | 7.8A Browser- und Waffenregression | Lokale Schusseffekte sofort, Tracer beim Echo. Einschläge ausschließlich aus Serverresultaten. |
| Materialien · `client/rendering/environment/PlanetSurfaces.ts`, `mission/GeneratedTerrain.ts`, `shared/world/WorldGenerator.ts` | PARTIALLY WORKING | Vier Profile, sichtbare Mischgewichte und autoritative Collider | Einschläge schließen aus Distanz und Bodenhöhe auf Material. Vorhandene Geländeklassifikation gemeinsam nutzen. |
| HUD, Partikel und Schabenreaktion · `client/game/Game.ts`, `ui/App.tsx`, `rendering/VisualEffectsManager.ts`, `EnemyVisualLOD.ts` | PARTIALLY WORKING | Bestätigte Tracer und gepoolte Buffers vorhanden | Standardaufwurf steigt immer nach oben. Schabentreffer ändern den Instanzfarbton. Partikel an Kontakt und Normale binden, Trefferfärbung entfernen. |
| Audio · `client/audio/AudioEngine.ts`, `WeaponAudio.ts`, `VoiceBudget.ts` | PARTIALLY WORKING | Räumliche Wiedergabe und gemeinsames Voice-Budget | Schaben-Audio verwendet geschätzte Höhe. Oberflächengeräusche für Schüsse fehlen. |
| Replikation, Jitter und Reconnect · `server/rooms/FreefallRoom.ts`, `client/networking/Match.ts`, `game/Timeline.ts` | PARTIALLY WORKING | Live-Ereignisse, Snapshots, Reconnect- und Latenztests | Höchster Tick pro Schütze verwirft auch verspätete eindeutige Ereignisse. Bisheriger Empfangsfloor wurde beim Reconnect nicht an den ersten neuen Snapshot gehoben. |
| Decals und Diagnose · `client/rendering/weapons/GrenadeView.ts`, `VisualEffectsManager.ts`, `ui/App.tsx` | IMPLEMENTED BUT UNVERIFIED | Separater Grenaden-Scorch-Batch, F2, GPU-Timer | Kugeldecals fehlen. Kontakt-, Pool-, Partikel- und Audiozahlen in F2 ergänzen. |

1. P1 · Geschützte Operatoren und alte Lebens-/Szenenereignisse von bestätigtem Feedback ausschließen.
2. P1 · Material und Normalen vom validierten Treffer liefern und Schabenfärbung entfernen.
3. P2 · Verspätete eindeutige Schussereignisse innerhalb eines begrenzten Fensters zulassen. Wiederholung vor HUD, Audio und VFX abfangen.
4. P2 · Materialimpulse und Audio in vorhandene Ressourcenbudgets aufnehmen, vier Welten und Hordenlast messen.

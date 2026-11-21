# Schuss- und Impact-Identität

Die Colyseus-Nachricht `shot` enthält bereits `shooter`, `tick` und für Operatoren `life`. Jeder der vorhandenen Hitscan-Produzenten feuert höchstens einmal pro Server-Tick und Schütze. Damit identifiziert `tick:shooter` den Schuss und seinen einzigen optionalen Impact innerhalb des Raums. Der Waffenslot verweist auf die bestehende Balance- und Waffenregistrierung. Schuss und Impact bleiben dieselbe Nachricht.

`ShotHistory` prüft vor sämtlichen Präsentationskanälen. Das Fenster umfasst 30 Simulations-Ticks mit höchstens 512 gemerkten Schlüsseln. Ein jüngeres Paket darf ein älteres, eindeutiges Paket überholen. Nach der Pose abgespielte Ereignisse verwenden den bestätigten Weltpunkt. Das Waffenecho übernimmt weiterhin beim lokalen Spieler die Zuordnung nach Leben und Slot. Ein spätes Echo vor dem zuletzt verarbeiteten Snapshot bucht dabei keine zusätzliche Munition und spielt keine zweite Mündungsreaktion.

Beitritt und Reconnect öffnen den Empfang erst mit einem neuen Player-Snapshot. Die Spieler-Snapshots enthalten Zustände und keine zurückliegenden Schüsse. Game setzt eine zusätzliche Grenze bei Respawn, Welt-/Planwechsel, Rückkehr und Ergebnis. Die Schaben-ID wird vom Horde-Manager fortlaufend vergeben, auch wenn ECS-Slots wiederverwendet werden. Ein Schuss auf einen bereits entfernten Slot trägt die ID des späteren Gegners daher nie.

- [Mehrspielerpfad](COMBAT_IMPACT_MULTIPLAYER.md)

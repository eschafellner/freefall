# Spieler-Accounts

Jeder Spieler meldet sich vor dem ersten Raumbeitritt mit einem Operatornamen an. Name und Tag bilden zusammen die eindeutige Kennung, z. B. `Kestrel#0412`. Der Server vergibt den Tag. Derselbe Name kann also mehrfach existieren, jeweils mit anderem Tag.

## Anmeldung und Neuanlage

| Eingabe im Loginfeld | Ablauf |
| --- | --- |
| `Name#1234` und Passwort | Anmeldung. Ein falsches Passwort ergibt eine Fehlermeldung, es wird nie ein Account angelegt. |
| `Name` ohne Tag und Passwort | Die Maske fragt nach, ob ein neuer Operator angelegt werden soll. Erst nach der Bestätigung legt der Server den Account an und zeigt den vollen Namen mit Tag einmal groß an. |

Namen haben 3 bis 16 Zeichen: lateinische Buchstaben einschließlich Umlauten und ß, Ziffern, `_` und `-`. Mindestens ein Buchstabe ist Pflicht. Kyrillische oder griechische Doppelgänger, Leerzeichen und `#` sind ausgeschlossen. Groß- und Kleinschreibung bleiben in der Anzeige erhalten, zählen beim Vergleich aber nicht. Passwörter haben 8 bis 128 Zeichen ohne weitere Zeichenvorschriften. Die Regeln liegen in `packages/shared/src/contracts/accounts.ts` und gelten in Client und Server gleich.

Nach dem Login erhält der Client ein Sitzungstoken und speichert es mit dem vollen Operatornamen in `localStorage`. Beim nächsten Start prüft der Client das Token und zeigt direkt die Einsatzleitstelle. Sitzungen verfallen nach 30 Tagen ohne Nutzung. **Abmelden** widerruft das Token auf dem Server.

## Startbildschirm

`TitleScreen.tsx` übernimmt aus der Vorlage `_template_earth` das Erd-Video bei Nacht, den Titel mit Glow, das Glaspanel und den Tonhinweis unten links. Video und Standbild liegen lokal unter `apps/client/public/media/title/`. Die CDN- und Figma-Adressen der Vorlage und die Google Fonts werden nicht geladen. Regenbogen, Wolken und die Texte der Vorlage passen nicht zum Spiel und sind nicht übernommen. Bei reduzierter Bewegung bleibt das Standbild stehen.

Ohne Anmeldung zeigt das Panel die Loginmaske, danach die Einsatzleitstelle mit Moduswahl, Raum erstellen, Beitreten und den Einstellungen. Oben rechts stehen Operatorname, Level und **Abmelden**. Im Hintergrund läuft „Briefing Silence“ in Schleife mit 40 % der Originallautstärke (Cue `title` in `Music.ts`), zusätzlich gelten die Regler Master und Musik. Der Client versucht die Musik sofort zu starten. Blockiert der Browser Ton ohne Nutzergeste, zeigt der Schalter unten links „Ton aktivieren“, und die Musik setzt mit dem ersten Klick oder Tastendruck ein. Ein Klick auf den Schalter aktiviert dann den Ton, statt stummzuschalten. Läuft die Musik, schaltet er stumm und wieder ein.

**Vollbild** (`Fullscreen.tsx`): Schalter unten rechts im Startbildschirm und in den Einstellungen bzw. im Esc-Menü, dazu die Einstellung „Beim Einstieg automatisch Vollbild“ (Standard: an, gespeichert in `localStorage`). Browser verlangen für Vollbild und Mauserfassung eine Nutzergeste, und die Vollbild-Anforderung verbraucht sie. Deshalb fordert der Klick auf **Raum erstellen** zuerst die Mauserfassung und dann das Vollbild an, noch bevor der Raum verbunden ist. In Chromium sperrt die Keyboard Lock API Esc: Ein kurzer Druck öffnet das Spielmenü, langes Halten verlässt das Vollbild.

Nach **Raum erstellen**, **Beitreten** oder **Schnellbeitritt** steigt der Spieler direkt ein, sobald der Raum synchron ist. Die Maus wird erfasst, ohne dass das Raummenü erscheint. Raumcode, Einladungslink und Einstellungen zeigt erst **Esc**. Lässt der Browser die Mauserfassung nicht zu, z. B. weil die Verbindung länger als die Gültigkeit der Klickgeste gedauert hat, bleibt das Raummenü mit **Carrier betreten** offen.

## Server

| Baustein | Aufgabe |
| --- | --- |
| `AccountStore` | SQLite über `node:sqlite` ohne Zusatzpaket. Accounts, Passwort-Hashes (`scrypt`, N = 16 384, eigenes Salt) und Sitzungen (nur SHA-256 des Tokens). Migrationen über `PRAGMA user_version` (Schema 1: Accounts und Sitzungen, Schema 2: Einsätze und EP, Schema 3: Freischaltungen). |
| `AccountService` | Ratenbegrenzung und Zuordnung Account → Raumplatz. |
| `AccountApi` | HTTP-Endpunkte unter `/api`. |
| `FreefallRoom.onAuth` | Prüft das Token beim Raumbeitritt. Ohne gültiges Token gibt es keinen Platz. |
| `accounts/admin.ts` | Passwort zurücksetzen, Sicherung, Kennzahlen. |

| Endpunkt | Inhalt |
| --- | --- |
| `POST /api/auth/register` | `{ name, password }` → 201 `{ token, account }` |
| `POST /api/auth/login` | `{ handle: "Name#1234", password }` → 200 `{ token, account }` |
| `GET /api/account` | Bearer-Token → `{ account }` mit Level und EP |
| `GET /api/account/missions?limit=20` | Bearer-Token → `{ missions }`, neueste zuerst (höchstens 100) |
| `POST /api/auth/logout` | Bearer-Token → 204 |

Fehler kommen als `{ error, message }` mit deutschem Anzeigetext. Fehlgeschlagene Logins sind auf 20 je IP und 8 je Account in 15 Minuten begrenzt, Neuanlagen auf 6 je IP und Stunde. Hinter nginx liest der Server die Client-IP aus `X-Forwarded-For` (`FREEFALL_TRUST_PROXY=1`). nginx setzt den Header aus `CF-Connecting-IP`. Unbekannte Accounts kosten dieselbe Hash-Zeit wie falsche Passwörter.

### Ein Platz je Account

Ein Account belegt serverweit höchstens einen verbundenen Platz. Ein zweites Fenster mit demselben Account wird abgewiesen. Lädt jemand die Seite neu, während sein alter Platz noch auf Reconnect wartet (12 Sekunden), gibt der Server den alten Platz frei und der neue Beitritt übernimmt. Läuft der Einsatz bereits, bleibt es bei der bestehenden Regel: Beitritt erst wieder auf dem Carrier.

### Namen im Raum

Der Raum sendet bei Beitritt, Verlassen und `sync-state` die Nachricht `roster` mit Session-ID, Name, Tag und Level jedes angemeldeten Operators. Trupp-Panel, Bordliste und Eigenbeschuss-Hinweis zeigen damit Namen statt „OP 02“.

### Gastmodus

`startServer()` ohne `accounts` startet Räume ohne Anmeldung. Tests, Benchmarks und Lastskripte nutzen diesen Modus. `apps/server/src/index.ts` startet immer mit Accounts.

## Kontoverwaltung und Datenschutz

Unter **Konto** im Startbildschirm:

| Aktion | Ablauf |
| --- | --- |
| Passwort ändern | Aktuelles Passwort, neues Passwort zweimal. Alle anderen Sitzungen enden, die eigene bleibt. |
| Andere Geräte abmelden | Beendet alle Sitzungen außer der aktuellen. |
| Meine Daten exportieren | JSON mit Account, Zugangsarten (ohne Hash), Sitzungszeiten, EP-Buch, allen Einsätzen und Freischaltungen. Keine Passwort- oder Token-Hashes. |
| Konto löschen | Voller Operatorname und Passwort zur Bestätigung. Löscht Account, Zugangsdaten, Sitzungen, EP-Buch, Teilnahmen und Freischaltungen. Einsätze ohne verbleibende Teilnehmer werden entfernt. In der Dienstakte der Mitspieler verschwindet der Name. Nicht möglich, solange der Operator in einem Raum ist. |

Passwortbestätigungen sind auf 8 Fehlversuche je Account in 15 Minuten begrenzt.

**Datenschutz** (Link unten rechts, auch ohne Anmeldung) zeigt einen Datenschutzhinweis. Er beschreibt, was der Code tatsächlich speichert. Er ist als **Entwurf** markiert: Der Verantwortliche ist ein Platzhalter (`PrivacyNotice` in `apps/client/src/ui/AccountPanels.tsx`), und der Text ist rechtlich nicht geprüft.

## Freischaltungen

Das Register liegt in `packages/shared/src/definitions/unlocks.ts` (`UNLOCKS`). Jeder Eintrag hat eine dauerhafte ID der Form `<art>.<name>` mit den Arten `weapon`, `attachment`, `upgrade` und `research`. Dazu kommen Mindestlevel, Voraussetzungen und die Spielwirkung: `weaponId`, `equipmentId` oder `attachment: { weaponId, slot }` mit Verweis auf die Balance-Registry.

| Vergabe | Bedeutung |
| --- | --- |
| `starter` | Grundausstattung, jeder Account besitzt sie. Heute: Kestrel AR-01, P-01, Sprenggranate, Heilstim. |
| `level` | Automatisch, sobald Level und Voraussetzungen erfüllt sind. Der Raum vergibt sie direkt nach der Einsatzabrechnung und meldet sie im Ergebnisbildschirm. |
| `choice` | Der Spieler schaltet sie im **Arsenal** selbst frei, sobald Level und Voraussetzungen erfüllt sind. |

Regeln, die `createUnlockRegistry` beim Laden prüft: IDs sind eindeutig, Voraussetzungen stehen weiter oben (keine Zyklen), und die Grundausstattung hat keine Bedingungen. Ein Test prüft zusätzlich die Verweise auf Waffen und Attachment-Slots. IDs werden nie umbenannt oder neu vergeben. Entfernte Einträge bleiben in `account_unlocks` stehen und werden ignoriert.

**Loadout-Prüfung.** Beim Raumbeitritt gleicht der Server die Freischaltungen ab und prüft, ob der Account das Loadout besitzt (`missingLoadoutUnlocks`). Fehlt etwas, wird der Beitritt abgewiesen. Heute setzen alle mit der Standardausrüstung ein, daher greift die Prüfung erst, wenn es eine Loadout-Auswahl gibt.

**Arsenal** im Startbildschirm listet alle Einträge nach Art mit Status: freigeschaltet (Grundausstattung, Levelstufe, ausgewählt, vergeben), gesperrt mit Grund („ab Level 5“, „benötigt …“) oder **Freischalten**. Attachments und Forschung sind leer, bis es Inhalte dafür gibt.

| Endpunkt | Inhalt |
| --- | --- |
| `GET /api/account/unlocks` | Eigene Freischaltungen mit Quelle und Zeitpunkt |
| `POST /api/account/unlocks` | `{ id }`: Freischaltung per Auswahl |
| `POST /api/account/password` | `{ current, next }` |
| `POST /api/account/sessions/revoke-others` | Andere Sitzungen beenden |
| `GET /api/account/export` | Datenexport als JSON-Datei |
| `POST /api/account/delete` | `{ password, confirm: "Name#1234" }` |

## Einsatzabrechnung und Level

Beim Einsatzende erzeugt `MissionInstance` genau ein `MissionResult`. Der Raum leitet es an `MissionSettlement` weiter:

1. **Teilnehmer.** Es zählt die beim Abflug verriegelte Teilnehmerliste (`result.rewards`). Der Raum merkt sich für seine gesamte Laufzeit, welche Session zu welchem Account gehört. Auch wer nach dem Abflug die Verbindung verliert oder geht, wird abgerechnet.
2. **Eine Transaktion.** `mission_results` (Ergebnis-ID als Primärschlüssel), `mission_participants` (Account, extrahiert, EP, Abschüsse) und `experience_ledger` (eindeutig je Account, Grund und Ergebnis-ID) werden gemeinsam geschrieben. Die Summe in `accounts.experience` ist ein Cache des Buchs.
3. **Idempotenz.** Eine bereits abgerechnete Ergebnis-ID ändert nichts mehr. Schlägt das Schreiben fehl, bleibt der Datensatz im Speicher und wird beim nächsten Einsatzende erneut versucht.
4. **Meldung.** Jeder Operator erhält `account-progress` mit Gutschrift, Gesamt-EP, neuem und vorherigem Level. Der Raum aktualisiert das Roster. Nach einem Reconnect sendet `sync-state` die Gutschrift erneut.

Debug-Räume (`FREEFALL_MISSION_DEBUG=1`) schreiben nichts gut, weil Debugbefehle Ziele und Extraktion erzwingen können. Im Gastmodus gibt es keine Abrechnung.

Die EP-Beträge selbst stehen unverändert in `MISSION_REWARDS` ([Missionsbelohnungen](MISSION_REWARDS.md)). Fehlgeschlagene Einsätze erscheinen mit 0 EP in der Historie, im EP-Buch gibt es dafür keine Buchung.

### Levelkurve

`packages/shared/src/definitions/progression.ts`. Der Schritt von Level n auf n + 1 kostet 500 + 250 · (n − 1) EP, die Obergrenze ist Level 50.

| Level | Gesamt-EP | Einsätze à 500 EP |
| --- | --- | --- |
| 2 | 500 | 1 |
| 3 | 1.250 | 3 |
| 5 | 3.500 | 7 |
| 10 | 13.500 | 27 |
| 20 | 52.250 | 105 |
| 50 | 318.500 | 637 |

Level werden nicht gespeichert, sondern immer aus den Gesamt-EP berechnet. Eine geänderte Kurve gilt sofort für alle Accounts. Die Werte sind Platzhalter für die Testphase.

### Anzeige

- **Startbildschirm:** Oben rechts stehen Level und Fortschrittsbalken. **Dienstakte** zeigt Gesamt-EP und die letzten 20 Einsätze mit Auftrag, Planet, Schwierigkeit, Ausgang, Zielen, Abschüssen, Dauer, EP und Mitspielern. Nach dem Verlassen eines Raums lädt der Client das Profil neu.
- **Ergebnisbildschirm:** Unter den EP des Einsatzes erscheinen Gutschrift und neuer Levelstand, bei Aufstieg „Level n erreicht“.
- **Trupp-Panel:** Das Level jedes Operators kommt aus dem Roster.

## Daten und Betrieb

| Umgebung | Datenbank |
| --- | --- |
| Lokal (`npm run dev`) | `apps/server/data/freefall.db` (gitignored), abweichend über `FREEFALL_DATA_DIR` |
| Docker | Volume `freefall-data` unter `/data` im Container `freefall-game` |

Verwaltung im Container:

```bash
docker compose exec game node apps/server/dist/accounts/admin.js stats
docker compose exec game node apps/server/dist/accounts/admin.js reset-password "Name#1234"
docker compose exec game node apps/server/dist/accounts/admin.js backup /data/freefall-backup.db
docker compose exec game node apps/server/dist/accounts/admin.js reconcile
docker compose exec game node apps/server/dist/accounts/admin.js grant "Name#1234" weapon.kestrel-ar-01
```

`reconcile` berechnet die EP-Summen aus dem EP-Buch neu. `reset-password` setzt ein zufälliges Passwort, gibt es aus und beendet alle Sitzungen des Accounts. Ohne E-Mail gibt es keine Selbsthilfe bei vergessenem Passwort. `backup` schreibt mit `VACUUM INTO` eine konsistente Kopie, auch während der Server läuft. Die Kopie liegt danach im Volume und kann mit `docker cp` gesichert werden.

## Nächste Schritte

- **Weitere Login-Arten.** `account_credentials` ist dafür vorbereitet: Jede Art ist eine eigene Zeile (`kind`) am selben Account. Passkeys (WebAuthn) kämen ohne fremden Dienst aus, brauchen aber eine Bibliothek zur Prüfung der Signaturen. Discord- oder Google-Login braucht eine registrierte App mit Client-ID und Secret. Beides ist eine Produktentscheidung und noch offen.
- **Währung für Freischaltungen.** `choice`-Freischaltungen kosten noch nichts. Ob dafür EP, Forschungspunkte oder Material aus Einsätzen ausgegeben werden, ist eine Designfrage. Sie betrifft das EP-Buch (`experience_ledger`), das dafür eine zweite Währung oder negative Buchungen bekäme.
- **Inhalte.** Neue Waffen, Attachments, Verbesserungen und Forschung entstehen in der Balance-Registry und bekommen dann einen Eintrag in `UNLOCKS`. Erst mit einer Loadout-Auswahl wirken Freischaltungen im Spiel.
- **Abrechnungsregel.** Wer nach dem Abflug geht, erhält weiter die Basis-EP, falls der Trupp die Hauptziele erfüllt. Ob das so bleiben soll, ist eine Designfrage.

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { UNLOCKS, UNLOCK_KINDS, accountPasswordError, unlockBlocker } from '@freefall/shared';
import type { AccountProfile, AccountUnlock } from '@freefall/shared';
import { AccountError, changePassword, deleteAccount, downloadExport, revokeOtherSessions, unlock, unlocks } from '../account/AccountClient.ts';

const message = (error: unknown, fallback: string) => error instanceof AccountError ? error.message : fallback;
const SOURCE: Record<AccountUnlock['source'], string> = { starter: 'Grundausstattung', level: 'Levelstufe', choice: 'Ausgewählt', admin: 'Vergeben' };

/** Konto: Passwort ändern, andere Geräte abmelden, Datenexport, Konto löschen. */
export function AccountSettings({ token, account, onBack, onDeleted }: {
  token: string; account: AccountProfile; onBack: () => void; onDeleted: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [fault, setFault] = useState('');

  async function run(action: () => Promise<string | void>, fallback: string) {
    setBusy(true); setFault(''); setStatus('');
    try {
      const done = await action();
      if (done) setStatus(done);
    } catch (error) {
      setFault(message(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = accountPasswordError(next) ?? (next !== repeat ? 'Die neuen Passwörter stimmen nicht überein.' : undefined);
    if (problem) { setFault(problem); return; }
    void run(async () => {
      const revoked = await changePassword(token, current, next);
      setCurrent(''); setNext(''); setRepeat('');
      return `Passwort geändert.${revoked ? ` ${revoked} andere Sitzung${revoked === 1 ? '' : 'en'} beendet.` : ''}`;
    }, 'Passwort konnte nicht geändert werden.');
  }

  function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => { await deleteAccount(token, password, confirm.trim()); onDeleted(); }, 'Konto konnte nicht gelöscht werden.');
  }

  return <div className="title-card account-settings">
    <div className="title-card-head"><span>Konto · {account.handle}</span></div>
    <form className="account-section" onSubmit={submitPassword}>
      <h2>Passwort ändern</h2>
      <input type="text" autoComplete="username" value={account.handle} readOnly hidden/>
      <label className="title-field">Aktuelles Passwort
        <input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required/></label>
      <label className="title-field">Neues Passwort
        <input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required/></label>
      <label className="title-field">Neues Passwort wiederholen
        <input type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required/></label>
      <button className="secondary" type="submit" disabled={busy}>Passwort ändern</button>
      <p className="title-hint">Andere Geräte werden dabei abgemeldet.</p>
    </form>
    <div className="account-section">
      <h2>Sitzungen und Daten</h2>
      <button className="secondary" type="button" disabled={busy} onClick={() => void run(async () => {
        const revoked = await revokeOtherSessions(token);
        return revoked ? `${revoked} andere Sitzung${revoked === 1 ? '' : 'en'} beendet.` : 'Keine anderen Sitzungen aktiv.';
      }, 'Sitzungen konnten nicht beendet werden.')}>Andere Geräte abmelden</button>
      <button className="secondary" type="button" disabled={busy} onClick={() => void run(async () => {
        await downloadExport(token, account.handle);
        return 'Export erstellt.';
      }, 'Export fehlgeschlagen.')}>Meine Daten exportieren (JSON)</button>
    </div>
    <details className="account-section danger">
      <summary>Konto löschen</summary>
      <form onSubmit={submitDelete}>
        <p>Löscht den Operator mit Level, EP, Dienstakte und Freischaltungen endgültig. In den Einsätzen deiner Mitspieler erscheint dein Name danach nicht mehr.</p>
        <label className="title-field">Zur Bestätigung {account.handle} eingeben
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" spellCheck={false} required/></label>
        <label className="title-field">Passwort
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label>
        <button className="danger-button" type="submit" disabled={busy || confirm.trim() !== account.handle || !password}>Konto endgültig löschen</button>
      </form>
    </details>
    {status && <p className="account-status" role="status">{status}</p>}
    {fault && <div className="fault" role="alert">{fault}</div>}
    <button className="title-link" type="button" onClick={onBack}>Zurück zur Einsatzleitstelle</button>
  </div>;
}

/** Arsenal: Waffen, Attachments, Verbesserungen und Forschung mit Freischaltstatus. */
export function Arsenal({ token, account, onBack }: { token: string; account: AccountProfile; onBack: () => void }) {
  const [owned, setOwned] = useState<AccountUnlock[]>();
  const [fault, setFault] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    unlocks(token).then((list) => { if (!cancelled) setOwned(list); }, (error: unknown) => { if (!cancelled) setFault(message(error, 'Arsenal nicht verfügbar.')); });
    return () => { cancelled = true; };
  }, [token]);
  const have = new Map((owned ?? []).map((entry) => [entry.id, entry]));
  const ids = new Set(have.keys());

  async function choose(id: string) {
    setBusy(true); setFault('');
    try { setOwned(await unlock(token, id)); } catch (error) { setFault(message(error, 'Freischaltung fehlgeschlagen.')); } finally { setBusy(false); }
  }

  return <div className="title-card arsenal">
    <div className="title-card-head"><span>Arsenal · Level {account.level}</span></div>
    {!owned && !fault && <p role="status">Lade Freischaltungen …</p>}
    {owned && UNLOCK_KINDS.map(({ kind, label }) => {
      const entries = UNLOCKS.list.filter((entry) => entry.kind === kind);
      return <section key={kind} className="arsenal-group">
        <h2>{label}</h2>
        {!entries.length && <p className="title-hint">Noch keine Einträge. Sie kommen mit neuen Inhalten.</p>}
        <ul>{entries.map((entry) => {
          const mine = have.get(entry.id);
          const blocker = mine ? undefined : unlockBlocker(entry, account.level, ids, UNLOCKS);
          return <li key={entry.id} className={mine ? 'unlocked' : 'locked'}>
            <div><strong>{entry.displayName}</strong><small>{entry.description}</small></div>
            {mine ? <em>{SOURCE[mine.source]}</em>
              : blocker ? <em>{blocker}</em>
              : entry.acquisition === 'choice' ? <button className="secondary" type="button" disabled={busy} onClick={() => void choose(entry.id)}>Freischalten</button>
              : <em>beim nächsten Abgleich</em>}
          </li>;
        })}</ul>
      </section>;
    })}
    {fault && <div className="fault" role="alert">{fault}</div>}
    <button className="title-link" type="button" onClick={onBack}>Zurück zur Einsatzleitstelle</button>
  </div>;
}

/**
 * Datenschutzhinweis. ENTWURF: Vor dem öffentlichen Betrieb Verantwortlichen eintragen und rechtlich prüfen lassen.
 * Inhalt beschreibt den tatsächlichen Stand des Codes (docs/ACCOUNTS.md).
 */
export function PrivacyNotice({ onBack }: { onBack: () => void }) {
  return <div className="title-card privacy">
    <div className="title-card-head"><span>Datenschutzhinweis · Entwurf</span></div>
    <p className="privacy-draft">Entwurf für die Testphase. Vor einer öffentlichen Freigabe Verantwortlichen eintragen und prüfen lassen.</p>
    <h2>Verantwortlich</h2>
    <p>[Name und Kontaktadresse des Betreibers eintragen]</p>
    <h2>Was gespeichert wird</h2>
    <ul>
      <li>Operatorname mit Tag und Zeitpunkt der Anlage und letzten Anmeldung.</li>
      <li>Passwort nur als nicht umkehrbarer Hash (scrypt), nie im Klartext.</li>
      <li>Sitzungen: Zeitpunkt der Anmeldung und letzten Nutzung. Das Sitzungstoken liegt nur als Hash auf dem Server.</li>
      <li>Einsätze: Auftrag, Planet, Schwierigkeit, Ausgang, Ziele, Dauer, EP, Abschüsse und Mitspieler.</li>
      <li>EP-Buchungen und Freischaltungen.</li>
      <li>Im Browser (localStorage): Sitzungstoken, zuletzt verwendeter Operatorname sowie Grafik-, Steuerungs-, Kamera- und Audioeinstellungen.</li>
    </ul>
    <h2>Verbindungsdaten</h2>
    <p>IP-Adressen werden nur im Arbeitsspeicher des Spielservers gehalten, um Anmeldeversuche zu begrenzen (höchstens eine Stunde), und nicht in der Datenbank gespeichert. Der Zugang läuft über Cloudflare, das dabei Verbindungsdaten verarbeitet. Der Webserver protokolliert Anfragen mit Browserkennung.</p>
    <h2>Zweck und Speicherdauer</h2>
    <p>Die Daten dienen nur dem Spielbetrieb: Anmeldung, Fortschritt, Dienstakte und Freischaltungen. Sitzungen verfallen 30 Tage nach der letzten Nutzung. Alle übrigen Daten bleiben bis zur Löschung des Kontos. Es gibt keine Werbung und kein Tracking. Das Spiel selbst setzt keine Cookies und lädt keine externen Schriftarten.</p>
    <h2>Deine Rechte</h2>
    <p>Unter <strong>Konto</strong> kannst du alle gespeicherten Daten als JSON exportieren und dein Konto endgültig löschen. Für Auskunft, Berichtigung oder Beschwerden wende dich an den Verantwortlichen. Du hast außerdem das Recht auf Beschwerde bei einer Datenschutzaufsichtsbehörde.</p>
    <button className="title-link" type="button" onClick={onBack}>Zurück</button>
  </div>;
}

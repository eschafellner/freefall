import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { accountNameError, accountPasswordError, parseAccountHandle } from '@freefall/shared';
import type { AccountSession } from '@freefall/shared';
import { AccountError, login, register, rememberedHandle } from '../account/AccountClient.ts';
import { FullscreenToggle } from './Fullscreen.tsx';

const MEDIA = (import.meta.env?.BASE_URL ?? '/') + 'media/title/';

/** Hintergrundvideo der Erde bei Nacht. Bei reduzierter Bewegung bleibt das Standbild stehen. */
function EarthBackdrop() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (motion.matches) element.pause();
      else void element.play().catch(() => { /* Autoplay blockiert: Standbild bleibt sichtbar. */ });
    };
    sync();
    motion.addEventListener('change', sync);
    return () => motion.removeEventListener('change', sync);
  }, []);
  return <>
    <video ref={video} className="title-video" poster={MEDIA + 'earth-night.webp'} muted loop playsInline preload="auto" aria-hidden="true">
      <source src={MEDIA + 'earth-night.mp4'} type="video/mp4"/>
    </video>
    <div className="title-shade" aria-hidden="true"/>
  </>;
}

type Step = { kind: 'form' } | { kind: 'confirm'; name: string } | { kind: 'created'; session: AccountSession };

/**
 * Anmeldung mit Name#1234 und Passwort. Ohne Tag fragt die Maske nach, ob ein neuer Operator angelegt werden soll,
 * damit ein Tippfehler nie stillschweigend einen leeren Account erzeugt.
 */
export function LoginPanel({ onSession, notice }: { onSession: (session: AccountSession) => void; notice?: string }) {
  const [handle, setHandle] = useState(rememberedHandle);
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState('');

  async function run(action: () => Promise<AccountSession>, created: boolean) {
    setBusy(true);
    setFault('');
    try {
      const session = await action();
      setPassword('');
      if (created) setStep({ kind: 'created', session });
      else onSession(session);
    } catch (error) {
      setFault(error instanceof AccountError ? error.message : 'Anmeldung fehlgeschlagen.');
      if (created) setStep({ kind: 'form' });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = parseAccountHandle(handle);
    if (!parsed) { setFault('Der Tag hat vier Ziffern, z. B. Name#0412.'); return; }
    const problem = accountNameError(parsed.name) ?? (parsed.tag ? undefined : accountPasswordError(password));
    if (problem) { setFault(problem); return; }
    if (!password) { setFault('Bitte Passwort eingeben.'); return; }
    if (parsed.tag) void run(() => login(handle, password), false);
    else { setFault(''); setStep({ kind: 'confirm', name: parsed.name }); }
  }

  if (step.kind === 'created') {
    return <div className="title-card" role="status">
      <div className="title-card-head"><span>Operator angelegt</span></div>
      <p>Dein Operatorname lautet</p>
      <strong className="title-handle">{step.session.account.handle}</strong>
      <p>Merke dir den vollen Namen mit Tag. Du brauchst ihn für die Anmeldung auf anderen Geräten.</p>
      <button className="primary" type="button" onClick={() => onSession(step.session)}>Weiter zur Einsatzleitstelle</button>
    </div>;
  }

  if (step.kind === 'confirm') {
    return <div className="title-card">
      <div className="title-card-head"><span>Neuer Operator</span></div>
      <p>Ohne Tag legst du einen neuen Operator an. Soll <strong>{step.name}</strong> angelegt werden?
        Der Server vergibt dazu einen Tag, z. B. <strong>{step.name}#0412</strong>.</p>
      <p className="title-hint">Du hast schon einen Operator? Dann gib den vollen Namen mit # und Tag ein.</p>
      <button className="primary" type="button" disabled={busy} onClick={() => void run(() => register(step.name, password), true)}>
        {busy ? 'Wird angelegt …' : 'Operator anlegen'}
      </button>
      <button className="title-link" type="button" disabled={busy} onClick={() => setStep({ kind: 'form' })}>Zurück</button>
      {fault && <div className="fault" role="alert">{fault}</div>}
    </div>;
  }

  return <form className="title-card" onSubmit={submit} noValidate>
    <div className="title-card-head"><span>Anmeldung</span></div>
    <label className="title-field">Operatorname
      <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="Name oder Name#1234"
        autoComplete="username" spellCheck={false} maxLength={24} required autoFocus/>
    </label>
    <label className="title-field">Passwort
      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
        autoComplete={parseAccountHandle(handle)?.tag ? 'current-password' : 'new-password'} maxLength={128} required/>
    </label>
    <button className="primary" type="submit" disabled={busy}>{busy ? 'Verbinde …' : 'Anmelden'}<span aria-hidden="true">↗</span></button>
    <p className="title-hint">Neu hier? Gib nur einen Namen ohne # ein, dann legen wir deinen Operator an.</p>
    {(fault || notice) && <div className="fault" role="alert">{fault || notice}</div>}
  </form>;
}

/** Start- und Loginbildschirm: Erde bei Nacht, Titel mit Glow und ein Glaspanel für Anmeldung oder Lobby. */
export function TitleScreen({ brand, account, sound, onPrivacy, compact = false, children }: {
  brand: ReactNode;
  account?: ReactNode;
  /** on: nicht stummgeschaltet; live: Browser hat den Ton freigegeben. */
  sound: { on: boolean; live: boolean; toggle: () => void };
  onPrivacy: () => void;
  /** Kleiner Titel für längere Ansichten (Dienstakte, Arsenal, Konto, Datenschutz). */
  compact?: boolean;
  children: ReactNode;
}) {
  return <section className={compact ? 'title-screen compact' : 'title-screen'} aria-label="Freefall Startbildschirm">
    <EarthBackdrop/>
    <header className="title-bar">{brand}{account}</header>
    <div className="title-hero">
      <p className="title-kicker">Koop · 1–4 Spieler</p>
      <h1 className="title-glow">FREEFALL<span>.</span></h1>
      <p className="title-tagline">Vom Skyfall Carrier in den freien Fall. Gemeinsam landen, gemeinsam zurückkehren.</p>
    </div>
    <div className="title-panel">{children}</div>
    <button className={sound.on && !sound.live ? 'title-sound prompt' : 'title-sound'} type="button" onClick={sound.toggle}
      aria-pressed={sound.on && sound.live}>
      <span className="title-sound-ring" aria-hidden="true"><i/><i/><i/></span>
      <span>{!sound.on ? <>Ton<br/>aus</> : sound.live ? <>Mit Ton<br/>erleben</> : <>Ton<br/>aktivieren</>}</span>
    </button>
    <div className="title-corner">
      <FullscreenToggle className="title-link"/>
      <button className="title-link" type="button" onClick={onPrivacy}>Datenschutz</button>
    </div>
  </section>;
}

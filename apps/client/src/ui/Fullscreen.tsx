import { useEffect, useState } from 'react';

/**
 * Vollbild über die Fullscreen API. In Chromium-Browsern sperrt die Keyboard Lock API zusätzlich Esc: Ein kurzer
 * Druck öffnet das Spielmenü, erst langes Halten verlässt das Vollbild. Andere Browser verlassen mit Esc Vollbild und
 * Mauserfassung gemeinsam; „Carrier betreten“ stellt das Vollbild dann wieder her.
 */
const AUTO_KEY = 'freefall.fullscreen.auto';

interface KeyboardLock { lock(codes?: string[]): Promise<void>; unlock(): void }
const keyboard = (): KeyboardLock | undefined => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

export const fullscreenSupported = (): boolean => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
export const isFullscreen = (): boolean => !!document.fullscreenElement;

export function autoFullscreen(): boolean {
  try { return globalThis.localStorage?.getItem(AUTO_KEY) !== 'off'; } catch { return true; }
}

export function setAutoFullscreen(enabled: boolean): void {
  try { globalThis.localStorage?.setItem(AUTO_KEY, enabled ? 'on' : 'off'); } catch { /* optional */ }
}

/** Muss direkt aus einem Klick- oder Tastenereignis aufgerufen werden (Browser verlangen eine Nutzergeste). */
export function enterFullscreen(): void {
  if (!fullscreenSupported() || isFullscreen()) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => keyboard()?.lock(['Escape']).catch(() => { /* nur Chromium */ }))
    .catch(() => { /* abgelehnt: Fenster bleibt normal */ });
}

export function exitFullscreen(): void {
  keyboard()?.unlock();
  if (isFullscreen()) void document.exitFullscreen().catch(() => {});
}

/** Vollbild beim Einstieg, falls in den Einstellungen aktiv. */
export function enterFullscreenIfWanted(): void {
  if (autoFullscreen()) enterFullscreen();
}

export function useFullscreen(): boolean {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && isFullscreen());
  useEffect(() => {
    const sync = () => {
      setActive(isFullscreen());
      if (!isFullscreen()) keyboard()?.unlock();
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return active;
}

/** Vollbild-Schalter und Einstellung für den automatischen Wechsel beim Einstieg. */
export function FullscreenSettings() {
  const active = useFullscreen();
  const [auto, setAuto] = useState(autoFullscreen);
  if (!fullscreenSupported()) return null;
  return <div className="fullscreen-settings">
    <button className="secondary" type="button" aria-pressed={active} onClick={() => active ? exitFullscreen() : enterFullscreen()}>
      {active ? 'Vollbild beenden' : 'Vollbild'}
    </button>
    <label><input type="checkbox" checked={auto} onChange={(event) => { setAuto(event.target.checked); setAutoFullscreen(event.target.checked); }}/>
      Beim Einstieg automatisch Vollbild</label>
  </div>;
}

/** Kleiner Schalter für den Startbildschirm. */
export function FullscreenToggle({ className }: { className?: string }) {
  const active = useFullscreen();
  if (!fullscreenSupported()) return null;
  return <button className={className} type="button" aria-pressed={active} onClick={() => active ? exitFullscreen() : enterFullscreen()}>
    {active ? 'Vollbild beenden' : 'Vollbild'}
  </button>;
}

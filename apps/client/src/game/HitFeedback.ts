import type { ShotEvent } from '@freefall/shared';

/** Selects a shooter-only marker from a server damage result. */
export function shotMarker(event: ShotEvent, own: string): 'hit' | 'kill' | 'ally' | undefined {
  if (event.shooter !== own) return;
  const kind = event.impact?.kind;
  if (kind === 'operator' || kind === 'convict') return 'ally';
  if (kind === 'enemy') return event.eliminated ? 'kill' : 'hit';
  if (kind === 'nest') return 'hit';
}

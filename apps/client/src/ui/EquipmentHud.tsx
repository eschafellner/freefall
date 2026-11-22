import { bindings } from '../input/Bindings.ts';
import { emptyWeaponHint } from '../game/DryFire.ts';
import { BASE_LOADOUT, FRAG, NET, PLAYER, STIM, allowsPostureAction } from '@freefall/shared';
import type { PlayerState } from '@freefall/shared';
import { KitIcon, Pips } from './HudIcons.tsx';

function ActionProgress({ label, remaining, ticks }: { label: string; remaining: number; ticks: number }) {
  return <div className="kit-progress" role="status"><span>{label}</span>
    <progress aria-label={label} max={Math.max(1, ticks)} value={Math.max(0, Math.min(ticks, ticks - remaining))}/></div>;
}

const RELOAD_LABEL = {
  RELOAD_START: 'Nachladen', MAGAZINE_REMOVAL: 'Magazinwechsel', MAGAZINE_INSERTION: 'Magazin eingesetzt',
  RELOAD_COMPLETE: 'Durchladen', RELOAD_INTERRUPTED: 'Nachladen abgebrochen', READY: '',
} as const;

/**
 * Own kit, bottom right: health and stims above the weapons. The drawn weapon is shown large with its magazine,
 * the holstered one and the grenades as compact rows. Melee stays bound but has no HUD entry.
 */
export function CombatLoadout({ player, tick, dryFireTick, resupply = false }:
  { player: PlayerState; tick: number; dryFireTick?: number; resupply?: boolean }) {
  const gear = player.equipment;
  const slot = gear?.slot ?? 'primary';
  const other = slot === 'primary' ? 'secondary' : 'primary';
  const weapon = BASE_LOADOUT.weapons[slot];
  const spare = BASE_LOADOUT.weapons[other];
  const switching = gear?.action === 'primary' || gear?.action === 'secondary';
  const reload = player.reload?.slot === slot ? player.reload : undefined;
  const reloading = reload && reload.phase !== 'READY' && reload.phase !== 'RELOAD_INTERRUPTED';
  const interrupted = reload?.phase === 'RELOAD_INTERRUPTED' && tick - reload.at < NET.tickHz;
  const mags = gear?.magazines[slot] ?? 0;
  const ammo = player.ammo ?? 0;
  const empty = reloading ? undefined : emptyWeaponHint(player, (action) => bindings.label(action), resupply);
  const dry = !empty && !reloading && !mags && ammo <= weapon.magazineSize * .25;
  const low = ammo > 0 && ammo <= weapon.magazineSize * .25;
  const clicked = dryFireTick !== undefined && tick - dryFireTick >= 0 && tick - dryFireTick < NET.tickHz * 1.5;
  const grounded = player.posture?.current === 'PRONE' || player.posture?.current === 'SUPINE';
  const canGrenade = !player.posture || allowsPostureAction(player.posture, 'grenade');
  const actionLabel = switching ? 'Waffenwechsel' : gear?.action === 'grenade' ? 'Granatenwurf'
    : gear?.action === 'resupply' ? 'Nachschub aufnehmen' : '';
  const applying = gear?.action === 'stim';
  const recent = gear?.stimResult && tick - gear.stimResultAt < NET.tickHz * 1.5;
  const critical = player.hp > 0 && player.hp <= PLAYER.health * .35;
  const health = Math.max(0, Math.min(1, player.hp / PLAYER.health));

  return <section className="loadout" aria-label="Ausrüstung">
    <div className={`vitals ${critical ? 'critical' : ''}`} aria-label="Vitalstatus">
      <div className="vital-heading">
        <span className="vital-label">{player.hp <= 0 ? 'Gefallen' : critical ? 'Kritisch' : 'Vital'}</span>
        <strong>{player.hp}<small> HP</small></strong>
      </div>
      <div className="health-bar" role="meter" aria-label="Gesundheit" aria-valuemin={0} aria-valuemax={PLAYER.health} aria-valuenow={player.hp}>
        <i style={{ width: `${health * 100}%` }}/>
      </div>
      {gear && <div className="kit-row stim">
        <KitIcon id="stim"/><span className="kit-name"><kbd>{bindings.label('USE_STIM')}</kbd> {STIM.displayName}</span>
        <Pips value={gear.stims} max={STIM.maxCharges}/><b>{gear.stims}/{STIM.maxCharges}</b>
      </div>}
      {applying && <ActionProgress label="Stim anwenden" remaining={gear.until - tick} ticks={gear.until - gear.started}/>}
      {!applying && recent && <small className="kit-note" role="status">{gear.stimResult === 'completed' ? 'Heilung bestätigt' : 'Anwendung abgebrochen'}</small>}
    </div>

    <div className="weapon readout" aria-label="Bewaffnung">
      <div className="weapon-active">
        <KitIcon id={weapon.id} slot={slot} className="large"/>
        <div className="weapon-meta">
          <span className="kit-name"><kbd>{bindings.label(slot === 'primary' ? 'SWITCH_PRIMARY' : 'SWITCH_SECONDARY')}</kbd> {weapon.displayName}</span>
          <strong className={`ammo ${ammo === 0 ? 'empty' : low ? 'low' : ''}`} aria-label={`${ammo} von ${weapon.magazineSize} Schuss, ${mags} Reservemagazine`}>
            {player.ammo ?? '–'}<small> / {weapon.magazineSize}</small><em>{mags} MAG</em>
          </strong>
        </div>
      </div>
      <div className="mag-bar" aria-hidden="true"><i style={{ width: `${Math.min(1, ammo / weapon.magazineSize) * 100}%` }}/></div>
      {reloading && <ActionProgress label={RELOAD_LABEL[reload.phase]} remaining={reload.until - tick} ticks={reload.until - reload.started}/>}
      {reloading && tick < reload.insertAt && ammo > 0 && <small className="kit-note">Beim Magazinwechsel gehen {ammo} Schuss verloren.</small>}
      {interrupted && <small className="kit-note" role="status">{RELOAD_LABEL.RELOAD_INTERRUPTED}</small>}
      {dry && <small className="kit-note warn" role="status">Keine Reservemagazine</small>}
      {empty && <small key={clicked ? dryFireTick : 'idle'} className={`kit-note warn${clicked ? ' flash' : ''}`} role="status">
        Keine Munition · {empty.key && <><kbd>{empty.key}</kbd> </>}{empty.text}</small>}
      {gear && <>
        <div className="kit-row holstered">
          <KitIcon id={spare.id} slot={other}/>
          <span className="kit-name"><kbd>{bindings.label(other === 'primary' ? 'SWITCH_PRIMARY' : 'SWITCH_SECONDARY')}</kbd> {spare.displayName}</span>
          <b>{gear.inactiveAmmo}/{spare.magazineSize} · {gear.magazines[other]} MAG</b>
        </div>
        <div className={`kit-row grenade ${canGrenade ? '' : 'locked'}`}>
          <KitIcon id="grenade"/>
          <span className="kit-name">{canGrenade && <kbd>{bindings.label('THROW_GRENADE')}</kbd>} {FRAG.displayName}</span>
          <Pips value={gear.grenades} max={FRAG.capacity}/><b>{gear.grenades}/{FRAG.capacity}</b>
        </div>
        {grounded && <div className="kit-row posture"><span>{player.posture?.current === 'PRONE' ? 'Bauchlage' : 'Rückenlage'}</span>
          <span><kbd>{bindings.label('STAND_UP')}</kbd> Aufstehen</span></div>}
        {actionLabel && <ActionProgress label={actionLabel} remaining={gear.until - tick} ticks={gear.until - gear.started}/>}
      </>}
    </div>
  </section>;
}

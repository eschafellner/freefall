/**
 * Screen-space declutter for world markers. Pure and DOM-free: sizes are estimated from the marker styles
 * (`.world-marker` in styles.css) so the per-frame update never reads layout.
 */

/** Lower values win. Markers of the same priority keep their submission order. */
export const MARKER_PRIORITY = { objective: 0, extraction: 1, pickup: 2, alarm: 3, nest: 4 } as const;

/** Monospace 11 px, weight 650: advance width per character. */
export const MARKER_CHAR_WIDTH = 6.6;
/** Caption padding (2 × 7 px) plus border (2 × 1 px). */
const CAPTION_CHROME = 16;
/** Icon (9 px border box, rotated 45°) and its bottom margin. */
const ICON_HEIGHT = 9 + 4;
/** One caption line plus padding and border. */
const CAPTION_HEIGHT = 20;
/** Progress meter plus its top margin. */
const METER_HEIGHT = 4;
/** Distance kept between two markers and to the viewport edge. */
export const MARKER_GAP = 3;
const EDGE = 6;
/** Vertical slots tried on each side of the anchor before a marker is shown compactly. */
const MAX_STEPS = 3;
/** Frames a displaced or compact marker waits for its original spot to stay free before returning. */
export const MARKER_RELAX_FRAMES = 12;

export interface MarkerRequest {
  /** Stable identity across frames (objective id, alarm enemy, ...). */
  key: string;
  priority: number;
  /** Anchor in CSS pixels; the marker is centred on it. */
  x: number;
  y: number;
  /** Full caption and the short form used when space runs out ('' hides the caption). */
  label: string;
  compactLabel: string;
  meter: boolean;
}

export interface MarkerPlacement {
  /** Vertical displacement from the anchor in CSS pixels. */
  offset: number;
  compact: boolean;
}

interface Memory extends MarkerPlacement {
  relaxed: number;
  seen: number;
}

interface Box { left: number; top: number; right: number; bottom: number }

export function markerSize(label: string, meter: boolean): { width: number; height: number } {
  const caption = label.length > 0;
  return {
    width: Math.max(13, caption ? label.length * MARKER_CHAR_WIDTH + CAPTION_CHROME : 0),
    height: ICON_HEIGHT + (caption ? CAPTION_HEIGHT : 0) + (meter ? METER_HEIGHT : 0),
  };
}

/**
 * Resolves overlaps in priority order. A lower-priority marker moves vertically to the nearest free slot (upwards
 * first), falls back to its compact caption, and as a last resort stays compact at its anchor. Placements are sticky:
 * a moved marker only returns once its original spot has been free for MARKER_RELAX_FRAMES frames.
 */
export class MarkerLayout {
  private readonly memory = new Map<string, Memory>();
  private readonly placed: Box[] = [];
  private readonly order: number[] = [];
  private frame = 0;

  layout(requests: readonly MarkerRequest[], width: number, height: number, out: MarkerPlacement[]): void {
    this.frame++;
    this.placed.length = 0;
    this.order.length = 0;
    for (let i = 0; i < requests.length; i++) this.order.push(i);
    this.order.sort((a, b) => requests[a].priority - requests[b].priority || a - b);
    for (const index of this.order) {
      const request = requests[index];
      const previous = this.memory.get(request.key);
      const memory: Memory = previous && previous.seen === this.frame - 1 ? previous : { offset: 0, compact: false, relaxed: 0, seen: 0 };
      const placement = this.resolve(request, memory, width, height);
      memory.seen = this.frame;
      this.memory.set(request.key, memory);
      out[index] = placement;
    }
    out.length = requests.length;
    if (this.memory.size > 64) for (const [key, memory] of this.memory) if (memory.seen !== this.frame) this.memory.delete(key);
  }

  private resolve(request: MarkerRequest, memory: Memory, width: number, height: number): MarkerPlacement {
    const full = markerSize(request.label, request.meter);
    const short = markerSize(request.compactLabel, request.meter);
    const home = this.free(request, full, 0, width, height);
    const settled = memory.offset === 0 && !memory.compact;
    if (settled && home) return this.commit(request, memory, width, full, 0, false);
    // Stay where the marker went last frame while that spot is free, until home has been free long enough.
    if (!settled && this.free(request, memory.compact ? short : full, memory.offset, width, height)) {
      memory.relaxed = home ? memory.relaxed + 1 : 0;
      if (home && memory.relaxed >= MARKER_RELAX_FRAMES) return this.commit(request, memory, width, full, 0, false);
      return this.commit(request, memory, width, memory.compact ? short : full, memory.offset, memory.compact);
    }
    if (home) return this.commit(request, memory, width, full, 0, false);
    for (const [size, compact] of [[full, false], [short, true]] as const) {
      const step = size.height + MARKER_GAP;
      for (let i = compact ? 0 : 1; i <= MAX_STEPS; i++) {
        for (const offset of i === 0 ? [0] : [-i * step, i * step]) {
          if (this.free(request, size, offset, width, height)) return this.commit(request, memory, width, size, offset, compact);
        }
      }
    }
    return this.commit(request, memory, width, short, 0, true);
  }

  private commit(request: MarkerRequest, memory: Memory, width: number, size: { width: number; height: number },
    offset: number, compact: boolean): MarkerPlacement {
    if (memory.offset !== offset || memory.compact !== compact) memory.relaxed = 0;
    memory.offset = offset;
    memory.compact = compact;
    this.placed.push(markerBox(request.x, request.y + offset, size.width, size.height, width));
    return { offset, compact };
  }

  private free(request: MarkerRequest, size: { width: number; height: number }, offset: number, width: number,
    height: number): boolean {
    const box = markerBox(request.x, request.y + offset, size.width, size.height, width);
    if (offset !== 0 && (box.top < EDGE || box.bottom > height - EDGE)) return false;
    for (const other of this.placed) {
      if (box.left < other.right + MARKER_GAP && other.left < box.right + MARKER_GAP
        && box.top < other.bottom + MARKER_GAP && other.top < box.bottom + MARKER_GAP) return false;
    }
    return true;
  }
}

/** Mirrors the horizontal clamp MissionMarkers applies in CSS. */
function markerBox(x: number, y: number, w: number, h: number, viewport: number): Box {
  // CSS clamp(): the minimum wins when the label is wider than the viewport.
  const left = Math.max(EDGE, Math.min(x - w / 2, viewport - EDGE - w));
  return { left, top: y - h / 2, right: left + w, bottom: y + h / 2 };
}

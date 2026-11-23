const CACHE_LIMIT = 80 * 1024 * 1024;
const AUDIO_PATH = (import.meta.env?.BASE_URL ?? '/') + 'audio/';const pcmBytes = (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * 4;

export class AudioAssets {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly missing = new Set<string>();
  private readonly retained = new Set<string>();
  private readonly abort = new AbortController();
  private bytes = 0;
  private preferMp3?: boolean;
  private loadMs = 0;
  private decodeMs = 0;
  errors = 0;

  get(id: string): AudioBuffer | undefined {
    const buffer = this.buffers.get(id);
    if (buffer) {
      this.buffers.delete(id);
      this.buffers.set(id, buffer);
    }
    return buffer;
  }

  failed(id: string): boolean { return this.missing.has(id); }

  /** Keep the small, latency-critical weapon bank resident within the same PCM limit. */
  retain(ids: Iterable<string>): void {
    for (const id of ids) this.retained.add(id);
  }

  load(context: AudioContext, id: string): Promise<AudioBuffer | undefined> {
    const buffer = this.get(id);
    if (buffer || this.missing.has(id) || this.abort.signal.aborted) return Promise.resolve(buffer);
    const loading = this.pending.get(id);
    if (loading) return loading;
    const request = this.decode(context, id).finally(() => this.pending.delete(id));
    this.pending.set(id, request);
    return request;
  }

  private async decode(context: AudioContext, id: string): Promise<AudioBuffer | undefined> {
    this.preferMp3 ??= typeof Audio !== 'undefined' && !new Audio().canPlayType('audio/ogg; codecs="vorbis"');
    for (const extension of this.preferMp3 ? ['mp3', 'ogg'] : ['ogg', 'mp3']) {
      try {
        const started = performance.now();
        const response = await fetch(AUDIO_PATH + id + '.' + extension, { signal: this.abort.signal });
        if (!response.ok) continue;
        const raw = await response.arrayBuffer();
        const fetched = performance.now();
        this.loadMs = Math.max(this.loadMs, fetched - started);
        const buffer = await context.decodeAudioData(raw);
        if (this.abort.signal.aborted) return;
        this.decodeMs = Math.max(this.decodeMs, performance.now() - fetched);
        const bytes = pcmBytes(buffer);
        if (bytes > CACHE_LIMIT) break;
        for (const [older, cached] of this.buffers) {
          if (this.bytes + bytes <= CACHE_LIMIT) break;
          if (this.retained.has(older)) continue;
          this.bytes -= pcmBytes(cached);
          this.buffers.delete(older);
        }
        if (this.bytes + bytes > CACHE_LIMIT) break;
        this.buffers.set(id, buffer);
        this.bytes += bytes;
        return buffer;
      } catch {
        if (this.abort.signal.aborted) return;
      }
    }
    this.errors++;
    this.missing.add(id);
  }

  metrics() {
    return { buffers: this.buffers.size, pcmMiB: this.bytes / (1024 * 1024), loading: this.pending.size,
      errors: this.errors, loadMs: this.loadMs, decodeMs: this.decodeMs };
  }

  close(): void {
    this.abort.abort();
    this.buffers.clear();
    this.pending.clear();
    this.missing.clear();
    this.retained.clear();
    this.bytes = 0;
  }
}

interface TimerQueryExtension {
  GPU_DISJOINT_EXT: number;
  TIME_ELAPSED_EXT: number;
}

export class GpuFrameTimer {
  private readonly gl: WebGL2RenderingContext;
  private extension: TimerQueryExtension | null;
  private pending?: WebGLQuery;
  private measuring = false;
  private frame = 0;
  private total = 0;
  private samples = 0;
  private lastMs: number | null = null;
  private lastAt = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  begin(): void {
    const { gl, extension } = this;
    if (!extension || gl.isContextLost() || ++this.frame % 8 !== 0) return;
    if (this.pending) {
      if (!gl.getQueryParameter(this.pending, gl.QUERY_RESULT_AVAILABLE)) return;
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        this.total = this.samples = 0;
        this.lastMs = null;
      } else {
        this.total += gl.getQueryParameter(this.pending, gl.QUERY_RESULT) / 1e6;
        this.samples++;
      }
      gl.deleteQuery(this.pending);
      this.pending = undefined;
    }
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    this.pending = query;
    this.measuring = true;
  }

  end(): void {
    if (!this.measuring || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.measuring = false;
  }

  sample(): number | null {
    const now = performance.now();
    if (this.samples) {
      this.lastMs = this.total / this.samples;
      this.lastAt = now;
    }
    this.total = this.samples = 0;
    return now - this.lastAt < 3000 ? this.lastMs : null;
  }

  restore(): void {
    this.pending = undefined;
    this.lastMs = null;
    this.measuring = false;
    this.total = this.samples = 0;
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  dispose(): void {
    if (this.pending) this.gl.deleteQuery(this.pending);
  }
}

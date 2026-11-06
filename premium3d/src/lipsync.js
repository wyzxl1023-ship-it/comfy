// 口型：输出 0..1 的张嘴程度。三种来源：
// 1) audio：播放音频时用 WebAudio 取音量包络（真实音频，首选）
// 2) external：ESP32/桥接服务实时推送音量（{type:'level', v}）
// 3) text：没有音频时（浏览器朗读演示），按文字节奏合成包络
export class LipSync {
  constructor() {
    this.value = 0;
    this.mode = 'idle';
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.external = 0;
    this.externalAt = 0;
    this.textStart = 0;
    this.textRate = 4.6; // 字/秒
    this.textLen = 0;
  }

  ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // 接管一个 <audio> 元素；返回其播放完成的 Promise
  playAudio(audioEl) {
    const ctx = this.ensureCtx();
    if (!audioEl._xySource) {
      audioEl._xySource = ctx.createMediaElementSource(audioEl);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(this.analyser.fftSize);
      audioEl._xySource.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      audioEl._xyAnalyser = this.analyser;
    }
    this.analyser = audioEl._xyAnalyser;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.mode = 'audio';
    return new Promise((res) => {
      audioEl.onended = () => { this.mode = 'idle'; res(); };
      audioEl.play().catch(() => { this.mode = 'idle'; res(); });
    });
  }

  startText(text) {
    this.mode = 'text';
    this.textStart = performance.now() / 1000;
    this.text = text;
    this.charIndex = 0;
  }
  setCharIndex(i) { this.charIndex = i; this.charAt = performance.now() / 1000; }
  stop() { this.mode = 'idle'; }

  pushLevel(v) { this.external = v; this.externalAt = performance.now(); }

  update(dt) {
    let target = 0;
    const now = performance.now();
    if (now - this.externalAt < 250) {
      target = this.external;
    } else if (this.mode === 'audio' && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      target = Math.min(1, Math.max(0, (rms - 0.01) * 7));
    } else if (this.mode === 'text') {
      // 每个字一个开合；标点处闭嘴
      const t = now / 1000 - (this.charAt ?? this.textStart);
      const i = (this.charIndex ?? 0) + Math.floor(t * this.textRate);
      const ch = this.text?.[i] ?? '';
      const phase = (t * this.textRate) % 1;
      target = /[，,。.！!？?、；;…\s]/.test(ch) || !ch ? 0 : 0.25 + 0.65 * Math.sin(phase * Math.PI);
    }
    // 张嘴快、闭嘴稍慢，看起来更自然
    const k = target > this.value ? 18 : 10;
    this.value += (target - this.value) * Math.min(dt * k, 1);
    return this.value;
  }
}

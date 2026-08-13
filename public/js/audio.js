// public/js/audio.js
// Sintetizador acústico con Web Audio API para alertas sísmicas instantáneas

export class SeismicAudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('sismo_sound_enabled') !== 'false';
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('sismo_sound_enabled', this.enabled);
    if (this.enabled) {
      this.initContext();
      this.playChime(440, 0.15, 'sine');
    }
    return this.enabled;
  }

  playAlert(magnitude) {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const mag = Number(magnitude) || 3.0;

    if (mag >= 5.0) {
      this.playSirenAlert();
    } else if (mag >= 3.5) {
      this.playMediumWarning();
    } else {
      this.playChime(520, 0.2, 'sine');
    }
  }

  // Tono sutil para sismos menores (< 3.5)
  playChime(freq, duration, type = 'sine') {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Tono de precaución de dos notas (3.5 - 5.0)
  playMediumWarning() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.setValueAtTime(780, now + 0.15);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sirena de alerta fuerte (M >= 5.0)
  playSirenAlert() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.28;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, startTime);
        osc.frequency.linearRampToValueAtTime(440, startTime + 0.22);

        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }
}

/**
 * DropIn - Audio & Haptic Feedback Manager
 * 
 * Provides subtle, non-intrusive acoustic ping/click feedback and tactile haptics
 * when devices pair or establish WebRTC connection.
 * 
 * Features:
 * - Pure Web Audio API synthesis: zero external audio files, zero network latency.
 * - Exponential decay envelope designed for a pleasant, tactile acoustic chime.
 * - Graceful auto-unlock on user gesture and silent fallback if audio is disabled.
 * - Physical haptic vibration on mobile devices (navigator.vibrate).
 */

class AudioFeedbackManager {
  constructor() {
    this.audioCtx = null;
    this.isAudioAllowed = true;
    this.hasUserInteracted = false;

    // Listen for initial user gesture to unlock Web Audio context seamlessly
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.hasUserInteracted = true;
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  /**
   * Get or instantiate Web Audio Context lazily
   */
  getAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (e) {
          console.warn('AudioContext initialization prevented:', e);
          this.isAudioAllowed = false;
        }
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return this.audioCtx;
  }

  /**
   * Trigger subtle physical haptic vibration (on phones/touch devices)
   * @param {number|number[]} pattern Duration in ms
   */
  triggerHaptic(pattern = [15, 30, 25]) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (e) {
      // Haptics not supported or blocked by user preference
    }
  }

  /**
   * Play a clean, subtle acoustic 'ping' chime when phone and laptop pair via QR
   * Frequency: 880Hz (A5) harmonized with 1046.5Hz (C6) with a gentle exponential decay
   */
  playPairingSuccess() {
    // 1. Fire haptic feedback immediately
    this.triggerHaptic([18, 35, 18]);

    // 2. Play acoustic dual-harmonic chime
    try {
      const ctx = this.getAudioContext();
      if (!ctx || ctx.state === 'suspended') return;

      const now = ctx.currentTime;

      // Master Gain for pleasant, non-intrusive volume
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(0.08, now + 0.008); // 8ms soft attack
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16); // 160ms decay
      masterGain.connect(ctx.destination);

      // Primary crystal note (880 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08); // rising shimmer
      osc1.connect(masterGain);

      // Subtle harmonic overtone (1760 Hz)
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, now);
      
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.02, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc2.connect(subGain);
      subGain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.18);
      osc2.stop(now + 0.18);
    } catch (err) {
      // Audio playback fails silently without interrupting app workflow
    }
  }

  /**
   * Play gentle confirmation click
   */
  playClick() {
    this.triggerHaptic(12);

    try {
      const ctx = this.getAudioContext();
      if (!ctx || ctx.state === 'suspended') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }
}

export const audioFeedback = new AudioFeedbackManager();

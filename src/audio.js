// A small, deliberately quiet instrument. The audio graph is created only after
// the visitor asks for sound.
export function createAudio() {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  const roots = [130.81, 146.83, 110]; // C3, D3, A2
  const pentatonic = [0, 3, 5, 7, 10];
  let context;
  let bus;
  let master;
  let delay;
  let wet;
  let feedback;
  let compressor;
  let pads = [];
  const voices = new Set();
  let scene = 0;
  let enabled = false;
  let desired = false;
  let paused = false;
  let destroyed = false;
  let lastNote = -Infinity;
  let operations = Promise.resolve();

  const visible = () => !globalThis.document?.hidden;
  const audible = () => enabled && !paused && visible() && !destroyed;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const frequency = (semitones) => roots[scene] * 2 ** (semitones / 12);

  function makeGraph() {
    context = new AudioContextClass();
    bus = context.createGain();
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 3;
    master = context.createGain();
    master.gain.value = 0;
    bus.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);

    delay = context.createDelay(0.6);
    delay.delayTime.value = 0.31;
    wet = context.createGain();
    wet.gain.value = 0.19;
    feedback = context.createGain();
    feedback.gain.value = 0.23;
    bus.connect(delay);
    delay.connect(wet);
    wet.connect(compressor);
    delay.connect(feedback);
    feedback.connect(delay);

    for (const [interval, level] of [[0, 0.065], [3, 0.045], [7, 0.048], [14, 0.034]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency(interval);
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(bus);
      oscillator.start();
      pads.push({ oscillator, gain, interval });
    }
  }

  function moveMaster(level) {
    if (!context || context.state === 'closed') return;
    const now = context.currentTime;
    if (master.gain.cancelAndHoldAtTime) master.gain.cancelAndHoldAtTime(now);
    else {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
    }
    master.gain.linearRampToValueAtTime(level, now + 0.07);
  }

  async function syncPlayback() {
    if (!context || context.state === 'closed' || destroyed) return;
    if (audible()) {
      await context.resume();
      if (audible()) moveMaster(0.13);
      else moveMaster(0);
    } else {
      moveMaster(0);
      await new Promise((resolve) => setTimeout(resolve, 85));
      if (!audible() && !destroyed && context.state === 'running') await context.suspend();
    }
  }

  function queue(work) {
    const result = operations.catch(() => {}).then(work);
    operations = result;
    return result;
  }

  function pluck(hz, level, length = 0.85) {
    if (!audible() || context?.state !== 'running' || voices.size >= 8) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { oscillator, gain };
    voices.add(voice);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(hz, now);
    oscillator.frequency.exponentialRampToValueAtTime(hz * 0.997, now + length);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(voice);
    };
    oscillator.start(now);
    oscillator.stop(now + length + 0.01);
  }

  function onVisibilityChange() {
    queue(syncPlayback).catch(() => {});
  }
  globalThis.document?.addEventListener('visibilitychange', onVisibilityChange);

  return {
    get enabled() { return enabled; },

    toggle() {
      if (destroyed) return Promise.reject(new Error('Audio has been destroyed'));
      desired = !desired;
      const target = desired;
      return queue(async () => {
        if (destroyed) throw new Error('Audio has been destroyed');
        if (target) {
          if (!AudioContextClass) {
            desired = false;
            throw new Error('Web Audio is unavailable in this browser');
          }
          try {
            if (!context) makeGraph();
            enabled = true;
            await syncPlayback();
          } catch (error) {
            enabled = false;
            desired = false;
            moveMaster(0);
            throw error;
          }
        } else {
          enabled = false;
          await syncPlayback();
        }
        return enabled;
      });
    },

    setScene(value) {
      if (destroyed) return;
      const nextScene = Math.round(clamp(value, 0, 2));
      if (nextScene === scene) return;
      scene = nextScene;
      if (!context || context.state === 'closed') return;
      for (const pad of pads) {
        pad.oscillator.frequency.setTargetAtTime(frequency(pad.interval), context.currentTime, 0.12);
      }
    },

    gesture(x, y, strength = 1) {
      if (!audible() || context?.state !== 'running') return;
      const now = performance.now();
      if (now - lastNote < 125) return;
      lastNote = now;
      const note = Math.min(14, Math.floor(clamp(x, 0, 1) * 15));
      const octave = Math.floor(note / 5) + (clamp(y, 0, 1) < 0.25 ? 1 : 0);
      const semitones = pentatonic[note % 5] + octave * 12;
      pluck(frequency(semitones), 0.10 + 0.17 * clamp(strength, 0, 1));
    },

    pulse() {
      if (!audible() || context?.state !== 'running') return;
      for (const interval of [0, 3, 7]) pluck(frequency(interval + 12), 0.075, 1.35);
    },

    setPaused(value) {
      if (destroyed) return;
      const nextPaused = Boolean(value);
      if (nextPaused === paused) return;
      paused = nextPaused;
      queue(syncPlayback).catch(() => {});
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      desired = false;
      enabled = false;
      globalThis.document?.removeEventListener('visibilitychange', onVisibilityChange);
      for (const voice of voices) {
        voice.oscillator.onended = null;
        try { voice.oscillator.stop(); } catch { /* Already stopped. */ }
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      }
      voices.clear();
      for (const pad of pads) {
        try { pad.oscillator.stop(); } catch { /* Already stopped. */ }
        pad.oscillator.disconnect();
        pad.gain.disconnect();
      }
      pads = [];
      if (context && context.state !== 'closed') context.close().catch(() => {});
    },
  };
}

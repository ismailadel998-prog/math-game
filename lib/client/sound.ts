'use client'
// Synthesized music + sound effects (Web Audio API). No audio files are shipped.
// Browsers only allow audio after a user gesture, so everything starts after the first tap/keypress.

export type Mood = 'off' | 'lobby' | 'race'
export type Sfx = 'correct' | 'wrong' | 'start' | 'question' | 'pause' | 'resume' | 'reveal' | 'win' | 'join'

const KEY_MUSIC = 'mr:music'
const KEY_SFX = 'mr:sfx'

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
// C – G – Am – F, one chord per bar (midi roots + chord tones)
const CHORDS = [
  { root: 48, tones: [0, 4, 7, 12] },
  { root: 43, tones: [0, 4, 7, 12] },
  { root: 45, tones: [0, 3, 7, 12] },
  { root: 41, tones: [0, 4, 7, 12] },
]
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]

function read(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function write(key: string, v: string) {
  try { window.localStorage.setItem(key, v) } catch { /* ignore */ }
}

class SoundEngine {
  private ctx: AudioContext | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | null = null
  private step = 0
  private nextTime = 0
  private mood: Mood = 'off'
  private unlocked = false
  private listeners = new Set<() => void>()
  musicDefault = true

  get musicOn() { const v = read(KEY_MUSIC); return v === null ? this.musicDefault : v === '1' }
  get sfxOn() { return read(KEY_SFX) !== '0' }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach((f) => f()) }

  /** Call once in the browser. Starts audio on the first user gesture. */
  init() {
    if (typeof window === 'undefined' || this.unlocked) return
    const unlock = () => {
      if (this.unlocked) return
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.ctx = new Ctor()
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.ctx.destination)
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.ctx.destination)
        const len = this.ctx.sampleRate * 0.5
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const d = this.noise.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
        this.unlocked = true
        void this.ctx.resume()
        this.refresh()
      } catch { /* audio unsupported */ }
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  setMusic(on: boolean) { write(KEY_MUSIC, on ? '1' : '0'); this.refresh(); this.emit() }
  setSfx(on: boolean) { write(KEY_SFX, on ? '1' : '0'); this.emit() }
  setMood(m: Mood) { if (m !== this.mood) { this.mood = m; this.step = 0; this.refresh() } }

  private refresh() {
    const want = this.unlocked && this.musicOn && this.mood !== 'off'
    if (want && this.timer === null && this.ctx) {
      this.nextTime = this.ctx.currentTime + 0.1
      this.timer = window.setInterval(() => this.schedule(), 90)
    } else if (!want && this.timer !== null) {
      window.clearInterval(this.timer); this.timer = null
    }
  }

  // ── music ────────────────────────────────────────────────────────
  private schedule() {
    const ctx = this.ctx; if (!ctx || this.mood === 'off') return
    const race = this.mood === 'race'
    const stepDur = 60 / (race ? 132 : 92) / 4 // 16th note
    while (this.nextTime < ctx.currentTime + 0.35) {
      this.playStep(this.step, this.nextTime, race, stepDur)
      this.nextTime += stepDur
      this.step = (this.step + 1) % 64
    }
  }

  private playStep(s: number, t: number, race: boolean, dur: number) {
    const chord = CHORDS[Math.floor(s / 16) % 4]
    const inBar = s % 16
    const mg = this.musicGain!
    if (race) {
      if (inBar % 4 === 0) this.kick(t, mg)
      if (inBar % 4 === 2) this.hat(t, mg, 0.05)
      if (inBar % 2 === 0) this.tone(mtof(chord.root - 12), t, dur * 1.8, 'triangle', 0.16, mg)
      const n = chord.root + 24 + chord.tones[ARP[s % 8]]
      this.tone(mtof(n), t, dur * 0.9, 'square', 0.035, mg)
      if (inBar === 0 || inBar === 6 || inBar === 10) this.tone(mtof(chord.root + 36 + chord.tones[(s >> 2) % 4]), t, dur * 3, 'triangle', 0.05, mg)
    } else {
      if (inBar === 0) for (const tn of chord.tones.slice(0, 3)) this.tone(mtof(chord.root + 12 + tn), t, dur * 15, 'sine', 0.035, mg)
      if (inBar % 2 === 0) this.tone(mtof(chord.root + 24 + chord.tones[ARP[(s >> 1) % 8]]), t, dur * 3, 'sine', 0.05, mg)
      if (inBar % 8 === 0) this.tone(mtof(chord.root - 12), t, dur * 6, 'sine', 0.1, mg)
    }
  }

  // ── building blocks ──────────────────────────────────────────────
  private tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number, dest: AudioNode, slideTo?: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, 0.04))
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05)
  }
  private kick(t: number, dest: AudioNode) { this.tone(140, t, 0.14, 'sine', 0.3, dest, 45) }
  private hat(t: number, dest: AudioNode, peak: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource(); src.buffer = this.noise
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000
    const g = ctx.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + 0.06)
  }

  // ── sound effects ────────────────────────────────────────────────
  play(name: Sfx) {
    if (!this.unlocked || !this.ctx || !this.sfxGain || !this.sfxOn) return
    void this.ctx.resume()
    const t = this.ctx.currentTime + 0.01
    const d = this.sfxGain
    const seq = (notes: number[], gap: number, type: OscillatorType, peak: number, len = gap * 1.6) =>
      notes.forEach((n, i) => this.tone(mtof(n), t + i * gap, len, type, peak, d))
    switch (name) {
      case 'correct': seq([72, 76, 79, 84], 0.085, 'triangle', 0.3, 0.25); break
      case 'wrong': this.tone(mtof(55), t, 0.28, 'sawtooth', 0.16, d, mtof(48)); this.tone(mtof(52), t + 0.14, 0.34, 'sawtooth', 0.14, d, mtof(44)); break
      case 'start': [0, 0.6, 1.2].forEach((o) => this.tone(mtof(72), t + o, 0.18, 'square', 0.14, d)); this.tone(mtof(84), t + 1.8, 0.7, 'square', 0.16, d); break
      case 'question': seq([79, 84], 0.12, 'sine', 0.28, 0.4); break
      case 'pause': seq([74, 67], 0.14, 'triangle', 0.25, 0.3); break
      case 'resume': seq([67, 74], 0.12, 'triangle', 0.25, 0.3); break
      case 'reveal': seq([76, 79, 83, 88], 0.11, 'sine', 0.26, 0.5); break
      case 'join': this.tone(mtof(88), t, 0.12, 'sine', 0.2, d, mtof(95)); break
      case 'win': {
        const n = [67, 67, 67, 72, 76, 72, 76, 79]; const g = [0, 0.14, 0.28, 0.42, 0.7, 0.9, 1.1, 1.3]
        n.forEach((m, i) => { this.tone(mtof(m), t + g[i], i === 7 ? 1.2 : 0.3, 'square', 0.12, d); this.tone(mtof(m - 12), t + g[i], i === 7 ? 1.2 : 0.3, 'triangle', 0.16, d) })
        break
      }
    }
  }
}

export const sound = new SoundEngine()

import { usePrefs } from '../state/prefs-store'

/**
 * Sound effects made with the Web Audio API, so there are no audio files to
 * license or download. Browsers only allow audio after a tap or key press,
 * and every sound here is triggered by one.
 */
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (!usePrefs.getState().sound) return null
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** One second of soft brown noise, reused by every paper sound. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.04 * white) / 1.04
    data[i] = last * 3.5
  }
  noise = buf
  return buf
}

/** A page sweeping over: a filtered swish with paper flutter, then a soft landing. */
export function playPageFlip(): void {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime
  const dur = 0.42 + Math.random() * 0.08

  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  src.playbackRate.value = 0.9 + Math.random() * 0.2

  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.7
  band.frequency.setValueAtTime(2400, t)
  band.frequency.exponentialRampToValueAtTime(700, t + dur)

  const high = ac.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 250

  const env = ac.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(0.55, t + 0.06)
  env.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.6)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  // Flutter: a fast wobble on the level, like a sheet catching air.
  const flutter = ac.createOscillator()
  flutter.frequency.value = 22 + Math.random() * 10
  const flutterDepth = ac.createGain()
  flutterDepth.gain.value = 0.12
  flutter.connect(flutterDepth).connect(env.gain)

  src.connect(band).connect(high).connect(env).connect(ac.destination)
  src.start(t)
  src.stop(t + dur + 0.02)
  flutter.start(t)
  flutter.stop(t + dur)

  // Landing: a very short, low thump as the page settles.
  const thump = ac.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(140, t + dur - 0.05)
  thump.frequency.exponentialRampToValueAtTime(70, t + dur + 0.08)
  const thumpEnv = ac.createGain()
  thumpEnv.gain.setValueAtTime(0.0001, t + dur - 0.05)
  thumpEnv.gain.exponentialRampToValueAtTime(0.12, t + dur - 0.02)
  thumpEnv.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1)
  thump.connect(thumpEnv).connect(ac.destination)
  thump.start(t + dur - 0.05)
  thump.stop(t + dur + 0.12)
}

/** A short, bright "ta-da": four rising bell notes with a shimmer on top. */
export function playCelebration(): void {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const start = t + i * 0.11
    const osc = ac.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    const env = ac.createGain()
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
    env.gain.exponentialRampToValueAtTime(0.0001, start + (i === notes.length - 1 ? 0.9 : 0.35))
    osc.connect(env).connect(ac.destination)
    osc.start(start)
    osc.stop(start + 1)
  })
  // Shimmer: quick high sine sparkles.
  for (let i = 0; i < 6; i++) {
    const start = t + 0.4 + i * 0.06
    const osc = ac.createOscillator()
    osc.frequency.value = 2000 + Math.random() * 1600
    const env = ac.createGain()
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(0.05, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
    osc.connect(env).connect(ac.destination)
    osc.start(start)
    osc.stop(start + 0.2)
  }
}

// ── Drawing sounds ──────────────────────────────────────────────────────────

const SCRIBBLE: Record<string, { type: BiquadFilterType; freq: number; q: number; gain: number }> = {
  crayon: { type: 'bandpass', freq: 1700, q: 0.8, gain: 0.22 },
  pencil: { type: 'bandpass', freq: 3600, q: 1.1, gain: 0.16 },
  marker: { type: 'bandpass', freq: 900, q: 0.7, gain: 0.1 },
  watercolor: { type: 'lowpass', freq: 650, q: 0.5, gain: 0.12 },
  glitter: { type: 'highpass', freq: 5200, q: 0.7, gain: 0.08 },
  eraser: { type: 'bandpass', freq: 2400, q: 0.9, gain: 0.2 },
}

/**
 * A quiet scratch that follows the stroke: louder when the pencil moves fast,
 * silent when it stops. Each tool has its own tone.
 */
export class ScribbleSound {
  private src: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private level = 0.15

  start(tool: string) {
    this.stop()
    if (!usePrefs.getState().drawSounds) return
    const ac = audio()
    const spec = SCRIBBLE[tool]
    if (!ac || !spec) return
    const src = ac.createBufferSource()
    src.buffer = noiseBuffer(ac)
    src.loop = true
    src.playbackRate.value = 1.6
    const filter = ac.createBiquadFilter()
    filter.type = spec.type
    filter.frequency.value = spec.freq
    filter.Q.value = spec.q
    const gain = ac.createGain()
    gain.gain.value = 0
    src.connect(filter).connect(gain).connect(ac.destination)
    src.start()
    this.src = src
    this.gain = gain
    this.level = spec.gain
  }

  /** `speed` in page pixels per millisecond. */
  update(speed: number) {
    if (!this.gain || !ctx) return
    const target = Math.min(1, speed / 2.2) * this.level
    this.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.03)
  }

  stop() {
    if (this.src && this.gain && ctx) {
      const src = this.src
      this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04)
      setTimeout(() => {
        try {
          src.stop()
        } catch {
          /* already stopped */
        }
      }, 200)
    }
    this.src = null
    this.gain = null
  }
}

// ── Fireplace ───────────────────────────────────────────────────────────────

/**
 * A soft crackling fire: low rumble plus random pops and snaps. Returns a stop
 * function. Browsers may hold audio until the first tap; it starts then.
 */
export function startFireplace(): () => void {
  const ac = (() => {
    try {
      if (!ctx) {
        const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
        if (!Ctor) return null
        ctx = new Ctor()
      }
      return ctx
    } catch {
      return null
    }
  })()
  if (!ac) return () => {}
  let stopped = false
  const resume = () => void ac.resume()
  if (ac.state === 'suspended') {
    resume()
    window.addEventListener('pointerdown', resume, { once: true })
  }

  const master = ac.createGain()
  master.gain.value = 0
  master.gain.setTargetAtTime(0.5, ac.currentTime, 1.2)
  master.connect(ac.destination)

  // Rumble: looped brown noise through a low-pass filter.
  const rumble = ac.createBufferSource()
  rumble.buffer = noiseBuffer(ac)
  rumble.loop = true
  const low = ac.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 260
  const rumbleGain = ac.createGain()
  rumbleGain.gain.value = 0.35
  rumble.connect(low).connect(rumbleGain).connect(master)
  rumble.start()

  // Crackles: short, bright noise bursts at random moments.
  let timer = 0
  const crackle = () => {
    if (stopped) return
    const t = ac.currentTime
    const burst = ac.createBufferSource()
    burst.buffer = noiseBuffer(ac)
    burst.playbackRate.value = 1.5 + Math.random() * 2
    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1500 + Math.random() * 4000
    band.Q.value = 1.5
    const g = ac.createGain()
    const peak = 0.08 + Math.random() * (Math.random() < 0.15 ? 0.5 : 0.18)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.06)
    burst.connect(band).connect(g).connect(master)
    burst.start(t, Math.random() * 0.8)
    burst.stop(t + 0.12)
    timer = window.setTimeout(crackle, 40 + Math.random() * (Math.random() < 0.3 ? 900 : 260))
  }
  crackle()

  return () => {
    stopped = true
    clearTimeout(timer)
    window.removeEventListener('pointerdown', resume)
    master.gain.setTargetAtTime(0, ac.currentTime, 0.3)
    setTimeout(() => {
      try {
        rumble.stop()
      } catch {
        /* already stopped */
      }
      master.disconnect()
    }, 1500)
  }
}

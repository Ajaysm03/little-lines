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

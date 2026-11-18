// The hub around the player, all synthesised:
//  - a soft breeze: stereo pink noise through a lowpass whose level and cutoff drift
//    on a slow random walk (gusts)
//  - birdsong by day: short phrases of FM chirps from random directions, a few
//    exotic warbles from the north when the camera is near the canyon
//  - leaves rustling now and then (a gust through the trees)
//  - crickets at night instead of birds
import { AUDIO, HUB } from '../config.js'
import { A, onStart, ready } from './core.js'
import { burst, crinkle, rnd, route } from './synth.js'

const M = AUDIO.ambience
const s = {
  ok: false,
  breeze: null,
  breezeFilter: null,
  gust: 0.5,
  gustTarget: 0.5,
  nextBird: 1,
  nextRustle: 4,
  nextCricket: 0,
  clock: 0,
}

onStart((ctx) => {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  src.start(0, Math.random() * 3)
  s.breezeFilter = ctx.createBiquadFilter()
  s.breezeFilter.type = 'lowpass'
  s.breezeFilter.frequency.value = 500
  s.breezeFilter.Q.value = 0.4
  s.breeze = ctx.createGain()
  s.breeze.gain.value = 0
  src.connect(s.breezeFilter).connect(s.breeze).connect(A.amb)
  s.ok = true
})

// One bird phrase: n chirps, each a fast sine sweep with a little FM trill.
function birdPhrase(t, pan, low = false) {
  const ctx = A.ctx
  const n = 2 + Math.floor(Math.random() * 5)
  const base = low ? rnd(900, 1500) : rnd(2400, 4200)
  const gap = rnd(0.06, 0.14)
  const up = Math.random() < 0.5
  for (let i = 0; i < n; i++) {
    const at = t + i * gap * rnd(0.85, 1.2)
    const f0 = base * rnd(0.9, 1.15) * (up ? 1 : 1.25)
    const f1 = f0 * (up ? rnd(1.15, 1.5) : rnd(0.65, 0.85))
    const d = rnd(0.04, 0.09) * (low ? 1.6 : 1)
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(f0, at)
    osc.frequency.exponentialRampToValueAtTime(f1, at + d)
    const fm = ctx.createOscillator()
    fm.frequency.value = rnd(30, 70)
    const fmg = ctx.createGain()
    fmg.gain.value = f0 * rnd(0.02, 0.06)
    fm.connect(fmg).connect(osc.frequency)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(rnd(0.012, 0.03) * (low ? 1.3 : 1), at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + d)
    osc.connect(g)
    route(g, { bus: A.amb, pan, verb: 0.35 })
    osc.start(at)
    osc.stop(at + d + 0.05)
    fm.start(at)
    fm.stop(at + d + 0.05)
  }
}

function cricket(t, pan) {
  const ctx = A.ctx
  const f = rnd(4300, 5200)
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.05
    const osc = ctx.createOscillator()
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(0.01, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.035)
    osc.connect(g)
    route(g, { bus: A.amb, pan, verb: 0.25 })
    osc.start(at)
    osc.stop(at + 0.05)
  }
}

// st: { x, z (camera), rightX, rightZ (camera right vector), night }
export function update(dt, st) {
  if (!s.ok || !ready()) return
  const ctx = A.ctx
  const t = ctx.currentTime
  s.clock += dt
  // Gusts: a slow random walk of the breeze level + brightness.
  if (Math.random() < dt * 0.25) s.gustTarget = rnd(0.25, 1)
  s.gust += (s.gustTarget - s.gust) * Math.min(1, dt * 0.6)
  s.breeze.gain.setTargetAtTime(M.breeze * 0.05 * (0.4 + s.gust * 0.8), t, 0.3)
  s.breezeFilter.frequency.setTargetAtTime(300 + s.gust * 900, t, 0.4)

  // A source at angle a around the listener pans by the camera's right vector.
  const panToward = (dx, dz) => {
    const len = Math.hypot(dx, dz) || 1
    return Math.max(-0.9, Math.min(0.9, (dx * st.rightX + dz * st.rightZ) / len))
  }

  if (!st.night) {
    s.nextBird -= dt
    if (s.nextBird <= 0) {
      s.nextBird = rnd(M.birdEvery[0], M.birdEvery[1])
      const a = Math.random() * Math.PI * 2
      birdPhrase(t + 0.05, panToward(Math.cos(a), Math.sin(a)))
      // Near the canyon, the wild area answers from the north.
      if (st.z < HUB.minZ + 30 && Math.random() < 0.6) birdPhrase(t + rnd(0.4, 1.2), panToward(-st.x, -200 - st.z), true)
    }
  } else {
    s.nextCricket -= dt
    if (s.nextCricket <= 0) {
      s.nextCricket = rnd(0.25, 0.7)
      cricket(t + 0.02, rnd(-0.8, 0.8))
    }
  }

  s.nextRustle -= dt
  if (s.nextRustle <= 0) {
    s.nextRustle = rnd(M.rustleEvery[0], M.rustleEvery[1])
    const pan = rnd(-0.8, 0.8)
    burst({ t: t + 0.05, noise: 'pink', type: 'highpass', f: 2200, q: 0.4, a: 0.4, hold: 0.3, d: 0.9, gain: 0.025, pan, bus: A.amb })
    crinkle({ t: t + 0.1, n: 22, dur: 1.4, gain: 0.012, f0: 2500, f1: 8000, width: 0.8, bus: A.amb })
  }
}

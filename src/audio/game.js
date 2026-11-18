// The game's own one-shots, synthesised like sfx.js (no files):
//  - the bait machine: pump (pneumatic thunk + squish + bubbles, pitch climbing with
//    the XP fill), level up, claim (suction pop), regrown bait
//  - the harpoon: latch, launch (spring + whoosh + rope zip), far impact, bite, reel ratchet
//  - catches: a pop + glockenspiel run that grows with rarity, chords and booms for the top tiers
//  - money: income clinks (soft, rate-limited), selling, buying
//  - animal calls: formant-shaped oscillators per species
//  - footsteps on grass / the studded lane
import { COARSE_POINTER } from '../config.js'
import { A, now, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, modal, pick, rnd, route, tone, vary } from './synth.js'
import { BELL, COIN, GLASS, PLASTIC, WOOD, buzz, claim, coins, glock, limit } from './sfx.js'

const METAL = [[1, 1, 0.12], [2.76, 0.5, 0.08], [5.4, 0.25, 0.05], [8.9, 0.12, 0.03]]

// --- Machine -----------------------------------------------------------------------------
// fill 0..1: the tank's XP level; each pump's bloop climbs with it.
export function pump(fill = 0, pan = 0) {
  if (!limit('pump', 45) || !voice(0.35, 2)) return
  const t = now()
  tone({ t, f: vary(115, 0.05), f2: 52, d: 0.1, gain: 0.32, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 650, q: 0.6, a: 0.002, d: 0.08, gain: 0.3, pan })
  burst({ t: t + 0.01, noise: 'pink', type: 'bandpass', f: 1100, f2: 320, q: 1.4, a: 0.008, d: 0.12, gain: 0.16, pan })
  const f0 = 300 * (1 + fill * 0.9)
  tone({ t: t + 0.03, type: 'sine', f: f0, f2: f0 * 1.6, glide: 0.07, d: 0.09, gain: 0.13, pan })
  bubbles({ t: t + 0.04, n: COARSE_POINTER ? 4 : 8, dur: 0.3, f0: 500 * (1 + fill * 0.5), f1: 1900 * (1 + fill * 0.4), gain: 0.05, pan })
}

export function levelUp() {
  if (!limit('lvl', 250) || !voice(1.6, 4)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 500, f2: 5000, q: 0.8, a: 0.18, d: 0.25, gain: 0.16 })
  glock(t + 0.05, [0, 4, 7, 12, 16, 19], 0.06, 0.15, 0.35)
  modal({ t: t + 0.42, f: 1046, modes: BELL, gain: 0.16, beat: 4, strike: 0.15, verb: 0.3 })
  bubbles({ t: t + 0.1, n: COARSE_POINTER ? 10 : 22, dur: 0.6, f0: 800, f1: 3600, gain: 0.04 })
  buzz([25, 40, 25])
}

export function claimBait() {
  if (!limit('claim', 150) || !voice(0.8, 3)) return
  claim()
  const t = now()
  bubble({ t, f: 260, d: 0.12, gain: 0.35, rise: 1.6 })
  burst({ t, noise: 'pink', type: 'bandpass', f: 350, f2: 2600, q: 2, a: 0.02, d: 0.18, gain: 0.2 })
  tone({ t: t + 0.02, f: 140, f2: 70, d: 0.1, gain: 0.22 })
  glock(t + 0.12, [7, 12], 0.07, 0.11, 0.25)
}

export function regrown() {
  if (!limit('regrow', 400) || !voice(0.4, 1)) return
  const t = now()
  bubble({ t, f: 600, d: 0.07, gain: 0.12, rise: 0.8 })
  modal({ t: t + 0.03, f: 2093, modes: GLASS, gain: 0.05, verb: 0.2 })
}

// --- Harpoon --------------------------------------------------------------------------------
export function latch() {
  if (!limit('latch', 150) || !voice(0.4, 2)) return
  const t = now()
  modal({ t, f: vary(900, 0.04), modes: METAL, gain: 0.3, strike: 0.25, beat: 3 })
  modal({ t: t + 0.07, f: vary(1300, 0.04), modes: METAL, gain: 0.22, strike: 0.2 })
  burst({ t, type: 'lowpass', f: 900, q: 0.7, d: 0.05, gain: 0.2 })
  tone({ t: t + 0.07, f: 120, f2: 70, d: 0.06, gain: 0.2 })
}

export function launch(pan = 0) {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  // Clunk of the release + the spring's twang.
  tone({ t, f: 80, f2: 38, d: 0.18, gain: 0.45, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, q: 0.5, a: 0.002, d: 0.12, gain: 0.4, pan })
  tone({ t, type: 'triangle', f: 260, f2: 120, glide: 0.25, d: 0.35, gain: 0.16, pan, lp: 1800 })
  modal({ t, f: 620, modes: METAL, gain: 0.25, strike: 0.3, beat: 6, pan })
  // Whoosh away + the rope paying out.
  burst({ t: t + 0.02, noise: 'pink', f: 2600, f2: 380, q: 1.1, a: 0.03, d: 0.75, gain: 0.32, pan, verb: 0.2 })
  burst({ t: t + 0.05, type: 'highpass', f: 5200, f2: 2600, q: 0.7, a: 0.05, hold: 0.45, d: 0.35, gain: 0.05, pan })
  for (let i = 0; i < 10; i++) burst({ t: t + 0.06 + i * 0.07 * (1 + i * 0.12), f: rnd(2500, 3800), q: 3, a: 0.001, d: 0.012, gain: 0.05 * (1 - i / 12), pan })
  buzz(35)
}

// The spear hits the ground far away (quiet, wet with reverb).
export function impact(pan = 0) {
  if (!voice(0.8, 1)) return
  const t = now()
  tone({ t, f: 70, f2: 40, d: 0.2, gain: 0.25, pan, bus: A.sfx })
  burst({ t, noise: 'brown', type: 'lowpass', f: 400, q: 0.5, a: 0.004, d: 0.3, gain: 0.3, pan, verb: 0.5 })
  crinkle({ t: t + 0.02, n: 10, dur: 0.3, gain: 0.03, f0: 2000, f1: 6000 })
}

// Something bites: two quick plucks on the taut rope.
export function bite(pan = 0) {
  if (!limit('bite', 300) || !voice(0.5, 2)) return
  const t = now()
  for (const [dt, f] of [[0, 330], [0.12, 440]]) {
    tone({ t: t + dt, type: 'triangle', f, f2: f * 0.97, d: 0.22, gain: 0.16, pan, lp: 2400 })
    burst({ t: t + dt, f: 3000, q: 2, d: 0.01, gain: 0.08, pan })
  }
}

// One ratchet click of the reel (call repeatedly; `k` 0..1 strain raises it a bit).
export function reelTick(k = 0.5, pan = 0) {
  if (!voice(0.06, 1)) return
  const t = now()
  modal({ t, f: vary(1700 + k * 600, 0.05), modes: PLASTIC, gain: 0.12, strike: 0.2, pan })
  burst({ t, type: 'bandpass', f: 4200, q: 2, a: 0.0005, d: 0.006, gain: 0.08, pan })
}

// The caught animal pops off the spear. r = rarity index 0..5.
export function catchPop(r = 0, pan = 0) {
  if (!voice(3, 4)) return
  claim()
  const t = now()
  bubble({ t, f: 380, d: 0.1, gain: 0.32, rise: 1.4, pan })
  burst({ t, noise: 'pink', f: 600, f2: 3200, q: 0.8, a: 0.04, d: 0.2, gain: 0.18, pan })
  const runs = [[0, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12, 16], [0, 4, 7, 11, 14, 19], [0, 4, 7, 12, 16, 19, 24], [0, 3, 7, 10, 15, 19, 22, 27]]
  glock(t + 0.05, runs[Math.max(0, Math.min(5, r))], 0.07 - r * 0.004, 0.14, 0.35)
  if (r >= 2) modal({ t: t + 0.4, f: 784 * (r >= 4 ? 1.5 : 1), modes: BELL, gain: 0.12 + r * 0.02, beat: 4, strike: 0.15, verb: 0.4 })
  if (r >= 3) {
    // A soft major chord swell.
    for (const n of [0, 4, 7, 12]) tone({ t: t + 0.3, type: 'triangle', f: 261.6 * Math.pow(2, n / 12) * (r >= 5 ? 0.94 : 1), a: 0.25, hold: 0.4, d: 1.1, gain: 0.05, lp: 2600, verb: 0.4 })
    bubbles({ t: t + 0.3, n: COARSE_POINTER ? 12 : 26, dur: 1, f0: 1200, f1: 5200, gain: 0.025 })
  }
  if (r >= 4) {
    tone({ t: t + 0.25, f: 60, f2: 38, d: 0.8, gain: 0.35 }) // boom
    burst({ t: t + 0.25, noise: 'brown', type: 'lowpass', f: 300, a: 0.01, d: 0.9, gain: 0.3, verb: 0.6 })
  }
  buzz(r >= 3 ? [40, 50, 40, 50, 80] : 30)
}

// An animal lands in the pen. size ~ its height in metres.
export function thump(size = 1, pan = 0) {
  if (!limit('thump', 60) || !voice(0.5, 1)) return
  const t = now()
  const k = Math.min(1.4, 0.5 + size * 0.25)
  tone({ t, f: vary(95 / Math.sqrt(size), 0.05), f2: 45, d: 0.14 * k, gain: 0.35 * k, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 480, q: 0.6, a: 0.003, d: 0.15 * k, gain: 0.35 * k, pan })
  crinkle({ t: t + 0.02, n: 8, dur: 0.2, gain: 0.03, f0: 2500, f1: 7000 })
}

// --- Money -----------------------------------------------------------------------------------
// One soft clink per income tick; gain falls off with distance from the pen.
export function income(gain = 1, pan = 0) {
  if (gain < 0.03 || !limit('income', 110) || !voice(0.5, 0.5)) return
  const t = now()
  modal({ t, f: rnd(2900, 4200), modes: COIN, gain: 0.05 * gain, beat: 7, strike: 0.2, decay: 0.6, pan, verb: 0.1 })
}

export function sell(amount = 1) {
  if (!limit('sell', 200) || !voice(1.6, 3)) return
  claim()
  const t = now()
  modal({ t, f: 1318, modes: BELL, gain: 0.18, beat: 4, strike: 0.2, verb: 0.2 }) // till ding
  modal({ t: t + 0.12, f: 1760, modes: BELL, gain: 0.14, beat: 4, strike: 0.15, verb: 0.2 })
  burst({ t, type: 'lowpass', f: 700, q: 0.7, d: 0.1, gain: 0.25 })
  coins(t + 0.08, Math.min(COARSE_POINTER ? 8 : 16, 4 + Math.round(Math.log10(amount + 1) * 3)), 0.6, 0.09)
  buzz([20, 40, 30])
}

// --- Animal calls ---------------------------------------------------------------------------
// A voiced tone: oscillator (with vibrato) -> formant bandpass (+ optional lowpass) -> envelope.
function voiced({ t, type = 'sawtooth', f, f2, glide, a = 0.01, hold = 0, d = 0.2, vib = 0, vibHz = 6, bp = 1000, bpq = 2, lp = 0, gain = 0.2, pan = 0, verb = 0.12 }) {
  const ctx = A.ctx
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(f, t)
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + (glide ?? a + hold + d))
  let lfo = null
  if (vib) {
    lfo = ctx.createOscillator()
    lfo.frequency.value = vibHz
    const lg = ctx.createGain()
    lg.gain.value = f * vib
    lfo.connect(lg).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + a + hold + d + 0.1)
  }
  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'
  f1.frequency.value = bp
  f1.Q.value = bpq
  let last = osc.connect(f1)
  if (lp) {
    const l = ctx.createBiquadFilter()
    l.type = 'lowpass'
    l.frequency.value = lp
    last = last.connect(l)
  }
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + a)
  if (hold) g.gain.setValueAtTime(gain, t + a + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d)
  last.connect(g)
  route(g, { pan, verb })
  osc.start(t)
  osc.stop(t + a + hold + d + 0.1)
}

const CALLS = {
  bunny: (t, g, p) => {
    for (let i = 0; i < 2; i++) voiced({ t: t + i * 0.09, type: 'sine', f: 1700, f2: 2500, d: 0.05, bp: 2200, bpq: 1, gain: 0.12 * g, pan: p })
  },
  duck: (t, g, p) => {
    for (let i = 0; i < 2; i++) voiced({ t: t + i * 0.22, f: vary(420, 0.04), f2: 330, a: 0.01, hold: 0.05, d: 0.12, bp: 1150, bpq: 4, gain: 0.3 * g, pan: p })
  },
  chicken: (t, g, p) => {
    const n = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < n; i++) voiced({ t: t + i * 0.13, type: 'square', f: vary(i === n - 1 ? 1050 : 820, 0.05), f2: 560, a: 0.005, d: 0.08, bp: 1400, bpq: 3, gain: 0.16 * g, pan: p })
  },
  pig: (t, g, p) => {
    voiced({ t, f: 190, f2: 140, a: 0.02, hold: 0.06, d: 0.16, vib: 0.05, vibHz: 28, bp: 700, bpq: 2, lp: 1200, gain: 0.4 * g, pan: p })
    burst({ t, noise: 'pink', type: 'bandpass', f: 600, q: 2, a: 0.01, d: 0.18, gain: 0.08 * g, pan: p })
  },
  sheep: (t, g, p) => {
    voiced({ t, f: 340, f2: 300, a: 0.04, hold: 0.25, d: 0.25, vib: 0.06, vibHz: 9, bp: 1100, bpq: 2.5, gain: 0.3 * g, pan: p })
  },
  fox: (t, g, p) => {
    voiced({ t, type: 'triangle', f: 900, f2: 1400, glide: 0.06, d: 0.14, bp: 1300, bpq: 1.5, gain: 0.25 * g, pan: p })
    voiced({ t: t + 0.18, type: 'triangle', f: 1100, f2: 700, d: 0.14, bp: 1200, bpq: 1.5, gain: 0.2 * g, pan: p })
  },
  cow: (t, g, p) => {
    voiced({ t, f: 150, f2: 112, a: 0.12, hold: 0.5, d: 0.45, vib: 0.015, vibHz: 5, bp: 500, bpq: 1.5, lp: 1400, gain: 0.55 * g, pan: p, verb: 0.2 })
    voiced({ t: t + 0.1, f: 300, f2: 224, a: 0.15, hold: 0.4, d: 0.4, bp: 900, bpq: 3, gain: 0.12 * g, pan: p })
  },
  penguin: (t, g, p) => {
    for (let i = 0; i < 3; i++) voiced({ t: t + i * 0.16, f: vary(560, 0.06), f2: 470, a: 0.01, hold: 0.04, d: 0.1, vib: 0.08, vibHz: 30, bp: 1500, bpq: 3, gain: 0.22 * g, pan: p })
  },
  bear: (t, g, p) => {
    voiced({ t, f: 85, f2: 70, a: 0.1, hold: 0.35, d: 0.4, vib: 0.12, vibHz: 22, bp: 350, bpq: 1.2, lp: 700, gain: 0.7 * g, pan: p, verb: 0.2 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 380, a: 0.1, hold: 0.3, d: 0.4, gain: 0.25 * g, pan: p })
  },
  mammoth: (t, g, p) => {
    voiced({ t, f: 300, f2: 560, glide: 0.25, a: 0.05, hold: 0.45, d: 0.4, vib: 0.03, vibHz: 7, bp: 1500, bpq: 2, gain: 0.4 * g, pan: p, verb: 0.35 })
    voiced({ t, f: 150, f2: 280, glide: 0.25, a: 0.05, hold: 0.45, d: 0.4, bp: 700, bpq: 1.5, gain: 0.2 * g, pan: p, verb: 0.3 })
  },
  raptor: (t, g, p) => {
    voiced({ t, f: 1300, f2: 820, a: 0.02, hold: 0.18, d: 0.25, vib: 0.1, vibHz: 34, bp: 1800, bpq: 2, gain: 0.32 * g, pan: p, verb: 0.3 })
    burst({ t, type: 'highpass', f: 3000, a: 0.02, d: 0.35, gain: 0.08 * g, pan: p })
  },
  dragon: (t, g, p) => {
    voiced({ t, f: 70, f2: 48, a: 0.12, hold: 0.6, d: 0.7, vib: 0.15, vibHz: 18, bp: 400, bpq: 0.9, lp: 900, gain: 0.8 * g, pan: p, verb: 0.45 })
    burst({ t, noise: 'pink', type: 'bandpass', f: 300, f2: 1400, sweep: 0.5, q: 0.8, a: 0.1, hold: 0.5, d: 0.7, gain: 0.35 * g, pan: p, verb: 0.4 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 250, a: 0.1, hold: 0.6, d: 0.8, gain: 0.4 * g, pan: p })
  },
}

export function animalCall(species, gain = 1, pan = 0) {
  if (gain < 0.04 || !limit(`call-${species}`, 600) || !voice(1.4, 1)) return
  ;(CALLS[species] ?? CALLS.chicken)(now(), Math.min(1, gain), pan)
}

// --- Footsteps ---------------------------------------------------------------------------
export function step(surface = 'grass', k = 1) {
  if (!voice(0.15, 0.5)) return
  const t = now()
  const pan = rnd(-0.08, 0.08)
  if (surface === 'lane') {
    modal({ t, f: vary(620, 0.08), modes: PLASTIC, gain: 0.07 * k, strike: 0.12, pan })
    tone({ t, f: vary(110, 0.08), f2: 70, d: 0.04, gain: 0.08 * k, pan })
  } else if (surface === 'pad') {
    modal({ t, f: vary(1100, 0.06), modes: METAL, gain: 0.05 * k, strike: 0.1, pan })
    tone({ t, f: vary(130, 0.08), f2: 80, d: 0.04, gain: 0.08 * k, pan })
  } else if (surface === 'wood') {
    modal({ t, f: vary(260, 0.06), modes: WOOD, gain: 0.12 * k, strike: 0.08, pan })
  } else {
    burst({ t, noise: 'pink', type: 'lowpass', f: vary(900, 0.15), q: 0.5, a: 0.006, d: 0.07, gain: 0.1 * k, pan })
    crinkle({ t, n: 4, dur: 0.06, gain: 0.018 * k, f0: 2500, f1: 7000 })
  }
}

export { pick }

// --- Training ring ----------------------------------------------------------------------
// One rep at the top of the lift: a short forced exhale, the iron's creak, a little tick.
// heavy 0..1 drops the metal lower for the barbell and squat bar.
export function rep(heavy = 0, pan = 0) {
  if (!limit('rep', 150) || !voice(0.45, 2)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'bandpass', f: vary(950, 0.08), f2: 520, q: 0.9, a: 0.04, d: 0.26, gain: 0.11, pan })
  modal({ t: t + 0.02, f: vary(520 - heavy * 200, 0.05), modes: METAL, gain: 0.07 + heavy * 0.05, strike: 0.3, pan })
  glock(t + 0.06, [12 + Math.round(heavy * 2)], 0.05, 0.07, 0.15)
}

// Weights set down on the mat (or picked up off it): a rubbery thud and a plate clank.
export function weightDown(heavy = 0, pan = 0) {
  if (!limit('weightDown', 200) || !voice(0.5, 2)) return
  const t = now()
  tone({ t, f: 95 - heavy * 30, f2: 45, d: 0.16, gain: 0.3 + heavy * 0.15, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.003, d: 0.14, gain: 0.25, pan })
  modal({ t: t + 0.01, f: vary(330 - heavy * 90, 0.05), modes: METAL, gain: 0.16, strike: 0.25, beat: 4, pan })
  modal({ t: t + 0.09, f: vary(470 - heavy * 120, 0.05), modes: METAL, gain: 0.07, strike: 0.2, pan })
}

// --- The bait flow (baitFlow.js) ---------------------------------------------------------------
// Climbing onto the harpoon: a servo whirr up, the bait clipped on, a hydraulic hiss.
export function mount() {
  if (!voice(0.8, 2)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 140, f2: 320, glide: 0.35, a: 0.03, d: 0.4, gain: 0.05, lp: 1200 })
  burst({ t: t + 0.05, noise: 'pink', type: 'highpass', f: 3000, f2: 1500, a: 0.02, d: 0.3, gain: 0.06 })
  latch()
  modal({ t: t + 0.32, f: 1500, modes: GLASS, gain: 0.05, verb: 0.2 })
}
// Climbing off without firing.
export function unmount() {
  if (!voice(0.5, 1)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 300, f2: 120, glide: 0.3, a: 0.02, d: 0.3, gain: 0.045, lp: 1000 })
  modal({ t: t + 0.05, f: vary(600, 0.04), modes: METAL, gain: 0.16, strike: 0.2 })
}
// The power meter passing a segment: a soft tick, higher for higher segments.
export function meterTick(level = 0) {
  if (!voice(0.06, 0.5)) return
  const t = now()
  modal({ t, f: 700 * Math.pow(2, (level * 3) / 12), modes: PLASTIC, gain: 0.05, strike: 0.1 })
}
// The shot's rating: 3 = Perfect (bright run + bell + fizz), 2 = Great, 1 = Good, 0 = Weak.
export function rating(level) {
  if (!voice(1.2, 3)) return
  claim()
  const t = now()
  if (level <= 0) {
    tone({ t, type: 'triangle', f: 330, f2: 220, glide: 0.25, d: 0.3, gain: 0.12, lp: 1400 })
    return
  }
  const runs = [[0, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16, 19]]
  glock(t, runs[level - 1], 0.055, 0.13, 0.35)
  if (level === 3) {
    modal({ t: t + 0.3, f: 1568, modes: BELL, gain: 0.12, beat: 4, strike: 0.15, verb: 0.4 })
    bubbles({ t: t + 0.05, n: COARSE_POINTER ? 10 : 22, dur: 0.5, f0: 1500, f1: 5000, gain: 0.03 })
    buzz([20, 30, 20])
  }
}
// A looping sound with a filtered noise core: returns { set(k 0..1), stop(fade s) }.
function loop(build) {
  if (!A.ctx || !A.master) return { set() {}, stop() {} }
  const ctx = A.ctx
  const out = ctx.createGain()
  out.gain.value = 0.0001
  out.connect(A.sfx)
  const nodes = build(ctx, out)
  let alive = true
  return {
    set(k) {
      if (alive) nodes.set(k, ctx.currentTime)
    },
    stop(fade = 0.3) {
      if (!alive) return
      alive = false
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(out.gain.value, t)
      out.gain.linearRampToValueAtTime(0.0001, t + fade)
      setTimeout(() => {
        nodes.end()
        out.disconnect()
      }, fade * 1000 + 80)
    },
    out,
  }
}
function noiseLoop(ctx, kind = 'pink') {
  const src = ctx.createBufferSource()
  src.buffer = A.noise[kind] ?? A.noise.white
  src.loop = true
  src.start()
  return src
}
// The spear in the air: rushing wind (band-passed noise) and a thin rope whistle.
// set(k): 0 slow .. 1 fastest.
export function flightWind() {
  return loop((ctx, out) => {
    const n = noiseLoop(ctx, 'pink')
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.8
    n.connect(bp).connect(out)
    const w = ctx.createOscillator()
    w.type = 'sine'
    const wg = ctx.createGain()
    wg.gain.value = 0.015
    w.connect(wg).connect(out)
    w.start()
    return {
      set(k, t) {
        bp.frequency.setTargetAtTime(500 + k * 2200, t, 0.05)
        w.frequency.setTargetAtTime(700 + k * 900, t, 0.05)
        out.gain.setTargetAtTime(0.05 + k * 0.22, t, 0.06)
      },
      end() {
        n.stop()
        w.stop()
      },
    }
  })
}
// The luck bush charging: a rising shimmer (two detuned voices + airy noise). set(k 0..1).
export function luckRiser() {
  return loop((ctx, out) => {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 2
    lp.connect(out)
    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    o1.type = 'sawtooth'
    o2.type = 'triangle'
    o2.detune.value = 9
    const og = ctx.createGain()
    og.gain.value = 0.35
    o1.connect(og)
    o2.connect(og)
    og.connect(lp)
    const n = noiseLoop(ctx, 'white')
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 5000
    const ng = ctx.createGain()
    ng.gain.value = 0.3
    n.connect(hp).connect(ng).connect(out)
    o1.start()
    o2.start()
    return {
      set(k, t) {
        const f = 180 * Math.pow(2, k * 2.2)
        o1.frequency.setTargetAtTime(f, t, 0.04)
        o2.frequency.setTargetAtTime(f * 2, t, 0.04)
        lp.frequency.setTargetAtTime(600 + k * 5000, t, 0.05)
        out.gain.setTargetAtTime(0.03 + k * 0.1, t, 0.05)
      },
      end() {
        o1.stop()
        o2.stop()
        n.stop()
      },
    }
  })
}
// One luck count-up tick (k 0..1 raises the pitch).
export function luckTick(k = 0) {
  if (!voice(0.4, 0.6)) return
  const t = now()
  modal({ t, f: 1046 * Math.pow(2, k * 1.6), modes: GLASS, gain: 0.05 + k * 0.03, strike: 0.08, verb: 0.25 })
}
// The bush flashes white at the end of the charge.
export function luckBurst(k = 0.5) {
  if (!voice(1.5, 3)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 500, f2: 7000, q: 0.7, a: 0.05, d: 0.35, gain: 0.2, verb: 0.3 })
  modal({ t: t + 0.05, f: 2093, modes: BELL, gain: 0.1 + k * 0.08, beat: 5, strike: 0.2, verb: 0.5 })
  bubbles({ t, n: COARSE_POINTER ? 12 : 28, dur: 0.7, f0: 1800, f1: 7000, gain: 0.03 })
}
// Leaves rustling (a bush springs up, something moves in it).
export function rustle(gain = 1) {
  if (!voice(0.5, 0.8)) return
  const t = now()
  crinkle({ t, n: COARSE_POINTER ? 10 : 22, dur: 0.45, gain: 0.05 * gain, f0: 1400, f1: 6000 })
  burst({ t, noise: 'pink', f: 1800, q: 0.6, a: 0.03, d: 0.35, gain: 0.08 * gain })
}
// HOOKED! A punchy stinger: thump, brassy stab chord, rope twang. r = rarity index.
export function hooked(r = 0) {
  if (!voice(1.5, 4)) return
  claim()
  const t = now()
  tone({ t, f: 90, f2: 45, d: 0.3, gain: 0.4 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, d: 0.2, gain: 0.3 })
  const root = 220 * Math.pow(2, Math.min(r, 6) / 12)
  for (const n of [0, 4, 7, 12]) tone({ t: t + 0.02, type: 'sawtooth', f: root * Math.pow(2, n / 12), a: 0.01, hold: 0.12, d: 0.35, gain: 0.04, lp: 2200, verb: 0.3 })
  glock(t + 0.08, [12, 16, 19, 24].slice(0, 2 + Math.min(2, r)), 0.05, 0.1, 0.3)
  bite()
  buzz([40, 30, 60])
}
// One reel click: a ratchet tick and the rope creaking under load. k = reel progress.
export function reelClick(k = 0) {
  if (!voice(0.15, 1)) return
  const t = now()
  modal({ t, f: vary(1500 + k * 900, 0.05), modes: PLASTIC, gain: 0.14, strike: 0.25 })
  burst({ t, type: 'bandpass', f: 4500, q: 2, a: 0.0005, d: 0.008, gain: 0.08 })
  tone({ t: t + 0.01, type: 'triangle', f: vary(170 + k * 60, 0.08), f2: 130, d: 0.08, gain: 0.05, lp: 900 })
}
// The catch tugs back: a low rope groan and scuffing feet.
export function tug() {
  if (!limit('tug', 400) || !voice(0.6, 1)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 95, f2: 70, a: 0.03, d: 0.45, gain: 0.06, lp: 500 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, a: 0.02, d: 0.3, gain: 0.18 })
}
// Dirt scuff while the catch is dragged.
export function scuff(gain = 1) {
  if (!limit('scuff', 120) || !voice(0.2, 0.4)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'bandpass', f: vary(700, 0.2), q: 0.8, a: 0.01, d: 0.12, gain: 0.08 * gain })
}
// Reeled all the way in: a rising whoosh and a sparkly chime as the catch glows white.
export function caught() {
  if (!voice(1.2, 3)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 400, f2: 6000, q: 0.8, a: 0.25, d: 0.25, gain: 0.18, verb: 0.3 })
  glock(t + 0.2, [12, 16, 19, 24, 28], 0.05, 0.12, 0.4)
  bubbles({ t: t + 0.2, n: COARSE_POINTER ? 10 : 20, dur: 0.5, f0: 1500, f1: 6000, gain: 0.03 })
}

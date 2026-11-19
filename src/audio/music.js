// Background music: public/audio/Background.mp3, looped under everything else.
// Kept cheap: the file is streamed by one <audio> element (never decoded whole into a
// 10+ MB PCM buffer), only starts after the first gesture, is paused (no decoding at
// all) while the player has music off or the tab is hidden, and feeds the shared bus
// graph through its own gain, so the master mute / ad-break mute / menu ducking apply to
// it for free. Separate on/off from the master Sound button (hud.js has both).
import { AUDIO } from '../config.js'
import { A, onStart } from './core.js'

const M = AUDIO.music
let on = true
try {
  on = localStorage.getItem(M.storageKey) !== 'off'
} catch {
  // Storage blocked: on, this session only.
}

let el = null
let gain = null
let pauseTimer = 0

function create(ctx) {
  el = new Audio()
  el.preload = 'none' // nothing is fetched until the music actually plays
  el.loop = true
  el.src = `${import.meta.env.BASE_URL}${M.src}`
  gain = ctx.createGain()
  gain.gain.value = 0
  ctx.createMediaElementSource(el).connect(gain).connect(A.world)
  apply()
}

let waiting = false
function retryOnGesture() {
  if (waiting) return
  waiting = true
  const go = () => {
    waiting = false
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(type, go, true)
    if (on && !document.hidden && el?.paused) apply()
  }
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, go, { capture: true, passive: true })
}

function apply() {
  if (!el) return
  clearTimeout(pauseTimer)
  const t = A.ctx.currentTime
  if (on && !document.hidden) {
    el.play().catch(retryOnGesture) // refused (autoplay policy / embedded frame): try again on the next input
    gain.gain.cancelScheduledValues(t)
    gain.gain.setTargetAtTime(M.volume, t, M.fadeIn / 3)
  } else {
    gain.gain.cancelScheduledValues(t)
    gain.gain.setTargetAtTime(0, t, 0.12)
    pauseTimer = setTimeout(() => el.pause(), 600) // after the fade-out: no decoding while it is off
  }
}

onStart(create)
document.addEventListener('visibilitychange', apply)

export const isMusicOn = () => on
export function setMusicOn(v) {
  on = !!v
  try {
    localStorage.setItem(M.storageKey, on ? 'on' : 'off')
  } catch {
    // Storage blocked: this session only.
  }
  apply()
}
export const toggleMusic = () => (setMusicOn(!on), on)

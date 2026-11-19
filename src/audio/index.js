// Game audio, the one import the rest of the game uses:
//   import { sfx, snd, installAudio, updateAudio } from './audio/index.js'
// installAudio() once at boot (waits for the first gesture to start), then
// updateAudio(dt, state) every frame for footsteps, jumps/landings and the
// ambience; sfx.<name>() (UI + shared one-shots) and snd.<name>() (this game's
// own sounds) anywhere. Every button press gets its click here (one
// capture-phase listener), so menus need no wiring of their own.
import { AUDIO, BASE, PATH } from '../config.js'
import { A, installAudio as installCore, isMuted, onStart, setAdMuted, setDucked, setMuted, setVolume, toggleMuted } from './core.js'
import * as sfx from './sfx.js'
import * as snd from './game.js'
import * as ambience from './ambience.js'

export { sfx, snd, setVolume, setMuted, isMuted, toggleMuted, setAdMuted }
export const audioCore = A // dev console: context state, voice count

function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled) return
  const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2))
  if (b.classList.contains('uiw-btn')) sfx.press(pan)
  else if (b.getAttribute('role') === 'option' || b.closest('.win-grid')) sfx.tick(pan)
  else sfx.click(pan)
}

export function installAudio() {
  installCore()
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
}

// Feedback hooks for the shared UI pieces (uiWindow.replay): they wait one task so
// a specific sound fired in the same handler wins.
export function feedback(kind) {
  setTimeout(() => {
    if (kind === 'shake') return sfx.deny()
    if (sfx.claimedRecently()) return
    if (kind === 'bump') return sfx.equip()
  }, 0)
}

// Which surface the feet are on (for the footstep sound).
function surface(x, z) {
  if (Math.abs(z - PATH.z) < PATH.halfWidth) return 'lane'
  for (const P of [BASE.pad, BASE.autoPad]) if (Math.abs(x - P.x) < P.w / 2 && Math.abs(z - P.z) < P.d / 2) return 'pad'
  return 'grass'
}

// Per-frame state from main.js: { camera, player: { x, y, z, vy, grounded, speed }, windowOpen, night }
const prev = { x: 0, z: 0, grounded: true, vy: 0, init: false }
let walked = 0
let started = false
onStart(() => (started = true))
export function updateAudio(dt, st) {
  if (!started || !A.ctx || A.ctx.state !== 'running') return
  const p = st.player
  if (prev.init) {
    if (prev.grounded && !p.grounded && p.vy > 2) sfx.jump()
    if (!prev.grounded && p.grounded && prev.vy < -3) sfx.land(Math.min(1, -prev.vy / 18))
    if (p.grounded) {
      walked += Math.hypot(p.x - prev.x, p.z - prev.z)
      const every = AUDIO.stepEvery * (p.speed > 10 ? 1.25 : 1)
      if (walked > every && p.speed > 1) {
        walked = 0
        snd.step(surface(p.x, p.z), Math.min(1, 0.5 + p.speed / 16))
      }
    }
  }
  prev.x = p.x
  prev.z = p.z
  prev.grounded = p.grounded
  prev.vy = p.vy
  prev.init = true

  setDucked(st.windowOpen)
  const e = st.camera.matrixWorld.elements // camera right vector = first column
  const rl = Math.hypot(e[0], e[2]) || 1
  ambience.update(dt, { x: st.camera.position.x, z: st.camera.position.z, rightX: e[0] / rl, rightZ: e[2] / rl, night: st.night })
}

// Pan + distance gain for a world sound heard from the camera.
export function spatial(camera, x, z, near = 25) {
  const e = camera.matrixWorld.elements
  const rl = Math.hypot(e[0], e[2]) || 1
  const dx = x - camera.position.x
  const dz = z - camera.position.z
  const d = Math.hypot(dx, dz)
  const pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, ((dx * e[0]) / rl + (dz * e[2]) / rl) / d)) : 0
  const gain = Math.max(0, Math.min(1, 1 - (d - near * 0.3) / near))
  return { pan, gain, d }
}

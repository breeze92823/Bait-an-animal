import './interact.css'
import { Vector3 } from 'three'
import { MACHINE } from './config.js'
import { anyWindowOpen, replay } from './uiWindow.js'
import { money } from './format.js'

// Proximity prompts: near a target, a dark pill over it shows the key, what it is
// and what pressing does ("E  Auto Click / Buy $2,500"). E (or tapping the pill,
// the touch path) runs it; targets with `hold` repeat while E / the pill is held
// (pumping the bait machine). Prices show green when affordable, red when not.
// In portrait the pill docks centred above the bait bag instead of floating.
// targets(): [{ x, y, z, r, enabled?(), info() -> { title, verb, price?, off?, hold?, dim?, bar? }, run() }]
export function createInteract({ targets, getMoney }) {
  const prompt = document.createElement('button')
  prompt.type = 'button'
  prompt.className = 'ix-prompt'
  prompt.hidden = true
  prompt.innerHTML = '<span class="ix-key">E</span><span class="ix-text"><span class="ix-title"></span><span class="ix-verb"></span><span class="ix-bar"><i></i></span></span>'
  const titleEl = prompt.querySelector('.ix-title')
  const verbEl = prompt.querySelector('.ix-verb')
  const barEl = prompt.querySelector('.ix-bar')
  const barFill = barEl.querySelector('i')
  document.body.append(prompt)

  let active = null
  let shownKey = ''
  let holding = false // E or the pill held down
  let repeatIn = 0
  const v = new Vector3()

  function trigger() {
    if (!active || anyWindowOpen()) return false
    const info = active.info()
    if (info.off) return false
    const before = getMoney()
    const ok = active.run()
    if (ok === false && info.price != null && before < info.price) replay(prompt, 'shake')
    else replay(prompt, 'press')
    shownKey = ''
    return true
  }

  const press = () => {
    holding = true
    repeatIn = MACHINE.holdRepeat * 2.2 // a short pause before a held key repeats
    trigger()
  }
  const release = () => (holding = false)

  prompt.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      prompt.setPointerCapture(e.pointerId)
    } catch {
      // The pointer is already gone.
    }
    press()
  })
  prompt.addEventListener('pointerup', release)
  prompt.addEventListener('pointercancel', release)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || e.target instanceof HTMLInputElement) return
    press()
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') release()
  })
  window.addEventListener('blur', release)

  const list = targets()

  return {
    trigger,
    // pos: the player's feet, or null to hide every prompt.
    update(dt, camera, pos) {
      active = null
      if (pos && !anyWindowOpen()) {
        let best = Infinity
        for (const t of list) {
          if (t.enabled && !t.enabled()) continue
          const d = Math.hypot(pos.x - t.x, pos.z - t.z)
          if (d < t.r && d < best) {
            best = d
            active = t
          }
        }
      }
      if (active) {
        v.set(active.x, active.y, active.z).project(camera)
        if (v.z > 1) active = null
      }
      prompt.hidden = !active
      if (!active) {
        holding = false
        return
      }
      const info = active.info()
      if (holding && info.hold && !info.off) {
        repeatIn -= dt
        if (repeatIn <= 0) {
          repeatIn += MACHINE.holdRepeat
          active.run()
        }
      }
      const afford = info.price == null || getMoney() >= info.price
      const key = `${info.title}|${info.verb}|${info.price}|${afford}|${!!info.off}|${!!info.dim}`
      if (key !== shownKey) {
        shownKey = key
        titleEl.textContent = info.title
        verbEl.textContent = info.verb
        if (info.price != null) {
          const cost = document.createElement('span')
          cost.className = `ix-cost${afford ? '' : ' short'}`
          cost.textContent = money(info.price)
          verbEl.append(cost)
        }
        prompt.classList.toggle('off', !!info.off)
        prompt.classList.toggle('dim', !!info.dim)
      }
      barEl.hidden = info.bar == null
      if (info.bar != null) barFill.style.width = `${Math.round(Math.min(1, info.bar) * 100)}%`
      const w = window.innerWidth
      const h = window.innerHeight
      let x = Math.min(w - 110, Math.max(110, ((v.x + 1) / 2) * w))
      let y = Math.min(h - 140, Math.max(110, ((1 - v.y) / 2) * h))
      if (h > w) {
        x = w / 2
        const bag = document.querySelector('.hud-bag')
        y = (bag?.getBoundingClientRect().top ?? h - 150) - 12
      }
      prompt.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`
    },
  }
}

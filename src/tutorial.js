import './tutorial.css'
import { DoubleSide, BackSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Shape, ShapeGeometry, Vector3 } from 'three'
import { TUTORIAL, UPGRADES } from './config.js'
import { money } from './format.js'
import { player } from './player.js'
import { sfx } from './audio/index.js'
import { burst } from './juice.js'

// The new-player tutorial. Steps (S.tutorial keeps the furthest one reached; TUTORIAL.done =
// finished or skipped, saved with the rest of the state, so it never shows again):
//   PUMP   pump the bait machine TUTORIAL.pumps times
//   CLAIM  claim the bait from its tank
//   ATTACH walk to the harpoon and Attach Bait
//   SHOOT  (on the harpoon) fire it
//   REEL   (it bit) click / tap fast to pull the animal in
//   GRIND  the first animal is in the pen: keep catching, the banner counts up to the Auto Machine
//   BUY    the Auto Machine is affordable: go and buy it -> done
// The step is mostly read from the game state each frame (bait in the bag, the harpoon's phase,
// catches, money), so it follows the player whatever order they do things in.
// Guidance: a banner at the top of the HUD (step, text, progress, Skip), a bouncing 3D arrow +
// ground ring over the target, chevrons on the ground leading from the player to it, an arrow on
// the screen edge while the target is off screen, and a pointer at the on-screen button to press.
const STEP = { pump: 0, claim: 1, attach: 2, shoot: 3, reel: 4, grind: 5, buy: 6 }
const COUNTED = 5 // steps numbered in the banner (pump .. reel); grind / buy show a star
const touch = () => matchMedia('(pointer: coarse)').matches
const POINTER = `<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M13 2h14v22h11L20 46 2 24h11z" fill="#ffd21f" stroke="#1d1a22" stroke-width="3.5" stroke-linejoin="round"/></svg>`
const EDGE = `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M2 13h22V2l22 18-22 18V27H2z" fill="#ffd21f" stroke="#1d1a22" stroke-width="3.5" stroke-linejoin="round"/></svg>`

export function createTutorial({ scene, game, base, harpoon, flow, camera, fx }) {
  const S = game.S
  const price = UPGRADES.auto.price
  let pumps = 0
  game.on('pump', () => pumps++)

  // --- 3D guides ----------------------------------------------------------------------------------
  const yellow = new MeshBasicMaterial({ color: '#ffd21f', toneMapped: false })
  const ink = new MeshBasicMaterial({ color: '#1d1a22', side: BackSide })
  // A chunky arrow pointing down (tip at y = 0), with a dark outline shell.
  const arrowShape = new Shape()
  ;[[0, 0], [0.95, 1.0], [0.4, 1.0], [0.4, 2.1], [-0.4, 2.1], [-0.4, 1.0], [-0.95, 1.0]].forEach(([x, y], i) => (i ? arrowShape.lineTo(x, y) : arrowShape.moveTo(x, y)))
  const arrowGeo = new ExtrudeGeometry(arrowShape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 1 })
  arrowGeo.translate(0, -1.05, -0.18) // centred, so the outline scales evenly
  const arrow = new Group()
  const arrowSpin = new Group()
  const fill = new Mesh(arrowGeo, yellow)
  const outline = new Mesh(arrowGeo, ink)
  outline.scale.setScalar(1.12)
  arrowSpin.add(fill, outline)
  arrowSpin.position.y = 1.05 // tip at the group's origin
  arrow.add(arrowSpin)
  // The ring on the ground under the target.
  const ringMat = new MeshBasicMaterial({ color: '#ffd21f', transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide, toneMapped: false })
  const ring = new Mesh(new RingGeometry(0.95, 1.5, 40), ringMat)
  ring.rotation.x = -Math.PI / 2
  // Chevrons on the ground from the player toward the target.
  const chev = new Shape()
  ;[[0, 0.42], [0.62, -0.18], [0.62, -0.5], [0, 0.1], [-0.62, -0.5], [-0.62, -0.18]].forEach(([x, y], i) => (i ? chev.lineTo(x, y) : chev.moveTo(x, y)))
  const chevGeo = new ShapeGeometry(chev)
  chevGeo.rotateX(-Math.PI / 2) // flat, pointing -z
  const trail = new Group()
  const chevrons = [0, 1, 2, 3].map(() => {
    const m = new Mesh(chevGeo, new MeshBasicMaterial({ color: '#ffd21f', transparent: true, depthWrite: false, toneMapped: false }))
    m.renderOrder = 2
    m.scale.setScalar(1.5)
    trail.add(m)
    return m
  })
  const world3d = new Group()
  world3d.add(arrow, ring, trail)
  world3d.visible = false
  scene.add(world3d)

  // --- DOM: banner, edge arrow, button pointer ----------------------------------------------------
  const root = document.createElement('div')
  root.className = 'tut'
  root.innerHTML = `
    <div class="tut-banner" hidden>
      <span class="tut-num"></span>
      <div class="tut-body"><div class="tut-title"></div><div class="tut-text"></div><div class="tut-bar" hidden><i></i><span></span></div></div>
      <button type="button" class="tut-skip">Skip</button>
    </div>
    <div class="tut-edge" hidden>${EDGE}<span></span></div>
    <div class="tut-point" hidden>${POINTER}</div>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)
  const el = { banner: $('.tut-banner'), num: $('.tut-num'), title: $('.tut-title'), text: $('.tut-text'), bar: $('.tut-bar'), barFill: $('.tut-bar i'), barText: $('.tut-bar span'), skip: $('.tut-skip'), edge: $('.tut-edge'), edgeText: $('.tut-edge span'), point: $('.tut-point') }

  // Skip: the first tap asks, the second (within 3 s) ends the tutorial.
  let skipArmed = 0
  el.skip.addEventListener('click', (e) => {
    e.stopPropagation()
    if (performance.now() < skipArmed) return finish(true)
    skipArmed = performance.now() + 3000
    el.skip.textContent = 'Skip tutorial?'
    el.skip.classList.add('armed')
  })
  el.skip.addEventListener('pointerdown', (e) => e.stopPropagation())

  function finish(skipped) {
    S.tutorial = TUTORIAL.done
    game.saveNow()
    hideAll()
    if (skipped) game.ui.toast('Tutorial skipped. Have fun!', true)
    else {
      game.ui.toast('Tutorial complete! Have fun baiting!', true)
      const p = player.renderPosition
      fx.confetti({ x: p.x, y: p.y + 2.2, z: p.z }, undefined, 60)
      burst(window.innerWidth / 2, window.innerHeight * 0.12, 'big')
      sfx.unlock()
    }
  }
  function hideAll() {
    world3d.visible = false
    el.banner.hidden = el.edge.hidden = el.point.hidden = true
    document.body.classList.remove('tut-on')
  }

  // --- Which step, and what it shows ----------------------------------------------------------------
  function currentStep() {
    if (S.catches > 0 || S.tutorial >= STEP.grind) return S.money >= price ? STEP.buy : STEP.grind
    if (flow.active && flow.phase !== 'outro') return flow.phase === 'aim' ? STEP.shoot : STEP.reel
    if (S.baits.length) return STEP.attach
    if (pumps >= TUTORIAL.pumps || S.tutorial >= STEP.claim) return STEP.claim
    return STEP.pump
  }
  const harpoonAt = () => ({ x: harpoon.root.position.x, y: 0, z: harpoon.root.position.z, h: 5.6, label: 'Harpoon' })
  const spotAt = (s, h, label) => ({ x: s.x, y: s.y, z: s.z, h, label })
  // Guidance for a step: banner text, the world target (3D arrow), the button to point at.
  function guide(step) {
    const t = touch()
    switch (step) {
      case STEP.pump:
        return {
          title: 'Get some bait',
          text: t ? 'Walk to the Bait Machine and tap PUMP to grow bait' : 'Walk to the Bait Machine and pump it (hold E or click it)',
          bar: [pumps / TUTORIAL.pumps, `${pumps} / ${TUTORIAL.pumps} pumps`],
          target: spotAt(base.spots.pump, 1.6, 'Pump'),
        }
      case STEP.claim:
        return { title: 'Claim your bait', text: t ? 'Tap CLAIM at the bait tank to take the bait' : 'Press E at the bait tank to claim the bait', target: spotAt(base.spots.claim, 2.4, 'Claim') }
      case STEP.attach:
        return { title: 'Load the harpoon', text: t ? 'Take the bait to the Harpoon and tap ATTACH BAIT' : 'Take the bait to the Harpoon and press E to Attach Bait', target: harpoonAt() }
      case STEP.shoot:
        return { title: 'Shoot it!', text: t ? 'Tap BAIT to fire. Shoot when the meter is high for more luck!' : 'Press BAIT (or Space) to fire. Shoot when the meter is high for more luck!', point: '.bf-go' }
      case STEP.reel: {
        const pulling = flow.phase === 'hooked' || flow.phase === 'reel'
        if (flow.phase === 'caught') return { title: 'Got it!', text: 'Your new animal is going to your pen!' }
        if (!pulling) return { title: 'Here it comes...', text: 'Watch the harpoon fly and wait for a bite!' }
        return { title: 'Pull it in!', text: t ? 'Tap fast to reel the animal in!' : 'Click fast (or Space) to reel the animal in!', point: '.bf-reel-bar' }
      }
      case STEP.grind:
        return {
          title: 'Keep catching animals!',
          text: 'Animals in your pen earn cash. Keep baiting to catch more and save up for the Auto Machine',
          bar: [S.money / price, `${money(S.money)} / ${money(price)}`],
          target: S.baits.length ? harpoonAt() : spotAt(base.spots.claim, 2.4, 'Bait'),
          star: true,
        }
      case STEP.buy:
        return { title: 'Buy the Auto Machine!', text: 'You have enough cash! The Auto Machine grows bait for you in 3 tanks', target: spotAt(base.spots.autoBuy, 2.6, 'Auto Machine'), star: true }
    }
    return null
  }

  // --- Per frame -------------------------------------------------------------------------------------
  const v = new Vector3()
  const cache = {}
  const set = (key, node, value, prop = 'textContent') => {
    if (cache[key] === value) return
    cache[key] = value
    node[prop] = value
  }
  let shownStep = -1

  function update(dt, t) {
    if (S.tutorial >= TUTORIAL.done) {
      if (shownStep !== -1) {
        shownStep = -1
        hideAll()
      }
      return
    }
    // The tutorial's reward: buying the Auto Machine (also if it was bought from the Shop).
    if (S.passes.autoMachine) return finish(false)
    const step = currentStep()
    if (step > S.tutorial && step <= STEP.grind && step !== STEP.shoot && step !== STEP.reel) {
      S.tutorial = step // furthest point reached (not the in-flow steps: a reload resets the harpoon)
      if (step !== STEP.claim) game.saveNow()
    }
    if (step !== shownStep) {
      if (shownStep !== -1) sfx.click?.()
      shownStep = step
      el.banner.classList.remove('pop')
      void el.banner.offsetWidth
      el.banner.classList.add('pop')
    }
    if (performance.now() > skipArmed && el.skip.classList.contains('armed')) {
      el.skip.classList.remove('armed')
      el.skip.textContent = 'Skip'
    }
    const g = guide(step)
    const inFlow = flow.active
    // Banner (in the harpoon flow only for its own steps, and out of the way at the side).
    const showBanner = !inFlow || step === STEP.shoot || step === STEP.reel
    el.banner.hidden = !showBanner
    document.body.classList.toggle('tut-on', showBanner && !inFlow)
    el.banner.classList.toggle('side', inFlow)
    set('num', el.num, g.star ? '★' : `${step + 1}/${COUNTED}`)
    set('title', el.title, g.title)
    set('text', el.text, g.text)
    el.bar.hidden = !g.bar
    if (g.bar) {
      set('bar', el.barFill.style, `${Math.round(Math.min(1, g.bar[0]) * 1000) / 10}%`, 'width')
      set('barText', el.barText, g.bar[1])
    }

    // Pointer at an on-screen button.
    const btn = g.point && document.querySelector(g.point)
    const r = btn?.getBoundingClientRect()
    if (r && r.width > 0) {
      el.point.hidden = false
      el.point.style.transform = `translate(${Math.round(r.left + r.width / 2)}px, ${Math.round(r.top - 6)}px)`
    } else el.point.hidden = true

    // World target: 3D arrow + ring + ground chevrons, and the edge arrow while it is off screen.
    const tg = !inFlow && g.target
    world3d.visible = !!tg
    if (!tg) {
      el.edge.hidden = true
      return
    }
    const bob = Math.sin(t * 4) * 0.35
    arrow.position.set(tg.x, tg.y + tg.h + bob, tg.z)
    arrowSpin.rotation.y = t * 1.6
    const groundY = Math.max(0, tg.y - 1.25)
    ring.position.set(tg.x, groundY + 0.06, tg.z)
    const pulse = (t * 0.8) % 1
    ring.scale.setScalar(0.8 + pulse * 0.7)
    ringMat.opacity = 0.35 + 0.6 * (1 - pulse)
    // Chevrons: four, flowing from the player toward the target, while it is more than a few m away.
    const p = player.renderPosition
    const dx = tg.x - p.x
    const dz = tg.z - p.z
    const dist = Math.hypot(dx, dz)
    trail.visible = dist > 4.5
    if (trail.visible) {
      const ux = dx / dist
      const uz = dz / dist
      const yaw = Math.atan2(-ux, -uz)
      chevrons.forEach((m, i) => {
        const k = (i + ((t * 1.4) % 1)) / chevrons.length // 0..1 along the run
        const d = 2 + k * Math.min(7, dist - 3)
        m.position.set(p.x + ux * d, p.y + 0.12, p.z + uz * d)
        m.rotation.y = yaw
        m.material.opacity = Math.sin(k * Math.PI) * 0.95
      })
    }
    // Edge arrow.
    v.set(tg.x, tg.y + tg.h * 0.5, tg.z).project(camera)
    const behind = v.z > 1
    let x = behind ? -v.x : v.x
    let y = behind ? -v.y : v.y
    const onScreen = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86
    el.edge.hidden = onScreen
    if (!onScreen) {
      if (behind) {
        // Behind the camera: point straight left or right (turn that way), at mid height.
        x = x < 0 ? -1 : 1
        y = 0
      } else {
        const m = Math.max(Math.abs(x), Math.abs(y), 1e-3)
        if (m > 1) {
          x /= m
          y /= m
        }
      }
      const W = window.innerWidth
      const H = window.innerHeight
      const mx = Math.max(95, W * 0.1) // inside the side button columns
      // Off the bottom corners and top centre, where the money / bait bag / banner sit.
      const px = Math.min(W - mx, Math.max(mx, (x * 0.5 + 0.5) * W))
      const py = Math.min(H * 0.7, Math.max(H * 0.24, (-y * 0.5 + 0.5) * H))
      const ang = Math.atan2(-y, x)
      el.edge.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`
      el.edge.firstElementChild.style.rotate = `${ang}rad`
      set('edgeText', el.edgeText, `${tg.label} ${Math.round(dist)}m`)
    }
  }

  return {
    update,
    get active() {
      return S.tutorial < TUTORIAL.done
    },
    skip: () => finish(true),
    // Dev: start it again (__game.tutorial.restart()).
    restart() {
      S.tutorial = 0
      pumps = 0
      shownStep = -1
    },
  }
}

import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, PointLight, Vector3 } from 'three'
import './baitFlow.css'
import { BAITS, CAMERA, HARPOON, LANE, RARITIES, ZONES, laneLength, zoneAt, zoneStart } from './config.js'
import { animalDef, buildAnimal } from './animals.js'
import { baitName, kindOf } from './bait.js'
import { player, resetPlayer } from './player.js'
import { syncYawToPlayer } from './camera.js'
import { sfx, snd } from './audio/index.js'
import { THUMBS } from './thumbs.js'
import { money as fmt, short } from './format.js'
import { cube, mat } from './voxel.js'
import { glowTex, streakTex } from './glow.js'
import * as bloxity from './bloxity.js'

// The harpoon shot, start to finish (the reference loop, our own look):
//  aim     - the player climbs onto the harpoon; the camera sits behind it looking up the
//            Lane. A power meter sweeps up and down (its fill = the shot's luck, x1..x2);
//            Bait (button / Space / E) stops it ("Perfect!" near the top), Cancel climbs off.
//            The Next Shot 100x Luck boost can be bought here (money).
//  fire    - the turret swings and fires; the spear flies with a glowing trail, the camera
//            chasing it; the distance (m) counts up on a bar of the Lane's zones and the
//            luck multiplier grows with it.
//  land    - the spear sticks next to a bush; the multiplier fades.
//  charge  - the bush glows brighter and brighter (green -> white, light streaks rising,
//            the screen edges warm) while its luck counts up to a rolled final value.
//  hooked  - flash: the catch (rolled with that luck in the landing zone) leaps out with the
//            spear in its mouth. "1 in N" + "HOOKED!".
//  reel    - it reels itself in; clicking/tapping (or Space/E) reels faster. The catch tugs
//            back now and then ("Pull Harder!"). It is dragged up the Lane to the harpoon.
//  caught  - it glows white at the harpoon, then jumps into the pen (game.deliverCatch).
//  outro   - the camera hands back to the chase cam, the player climbs off.
// main.js calls update(dt, t), applyCamera(camera, dt) after the chase camera, and
// seat(group) to place the avatar while mounted.

const CLOVER = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#123a14" stroke-width="5" stroke-linejoin="round">
  <path d="M32 31 C18 30 10 22 14 13 C18 6 28 8 32 17 C36 8 46 6 50 13 C54 22 46 30 32 31Z" fill="#5fd35a"/>
  <path d="M32 33 C18 34 10 42 14 51 C18 58 28 56 32 47 C36 56 46 58 50 51 C54 42 46 34 32 33Z" fill="#4cc24a"/>
  <path d="M31 32 C30 18 22 10 13 14 C6 18 8 28 17 32 C8 36 6 46 13 50 C22 54 30 46 31 32Z" fill="#6fe068"/>
  <path d="M33 32 C34 18 42 10 51 14 C58 18 56 28 47 32 C56 36 58 46 51 50 C42 54 34 46 33 32Z" fill="#58cf55"/></g>
  <path d="M20 18 l6 3 M41 17 l-4 4" stroke="#c9ffb8" stroke-width="3" stroke-linecap="round"/></svg>`
const HAND = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 34 V12 a5 5 0 0 1 10 0 V28 l2 -1 a5 5 0 0 1 9 2 l1 0 a5 5 0 0 1 8 3 V44 c0 10 -8 16 -18 16 c-8 0 -13 -4 -17 -10 L10 40 a5 5 0 0 1 8 -6 Z" fill="#ffd23a" stroke="#1d1a22" stroke-width="4" stroke-linejoin="round"/><path d="M34 28 v10 M45 30 v8" stroke="#1d1a22" stroke-width="3" stroke-linecap="round"/></svg>`
const CURSOR = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 6 L50 38 L34 40 L42 56 L34 60 L26 44 L14 54 Z" fill="#eaf6ff" stroke="#1d3a6a" stroke-width="4" stroke-linejoin="round"/><path d="M20 18 L20 44" stroke="#9fd8ff" stroke-width="3"/></svg>`
const FACE = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="10" fill="#f2c79a" stroke="#1d1a22" stroke-width="4"/><rect x="10" y="8" width="44" height="14" rx="6" fill="#6a3a1c"/><circle cx="24" cy="32" r="4" fill="#1d1a22"/><circle cx="40" cy="32" r="4" fill="#1d1a22"/><path d="M24 42 q8 6 16 0" stroke="#1d1a22" stroke-width="3" fill="none"/></svg>`

const RATINGS = [
  { text: 'Weak...', cls: 'weak' },
  { text: 'Good!', cls: 'good' },
  { text: 'Great!', cls: 'great' },
  { text: 'Perfect!', cls: 'perfect' },
]
const SEGMENTS = 5
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lerp = (a, b, k) => a + (b - a) * k
const easeOut = (k) => 1 - Math.pow(1 - k, 3)
const luckText = (x) => (x >= 1000 ? short(x) : x >= 100 ? x.toFixed(0) : x.toFixed(2))

// Bush luck roll: banded heavy tail (HARPOON.bush).
function rollBush() {
  let x = Math.random()
  for (const [chance, lo, hi] of HARPOON.bush) {
    if (x < chance) return lo + Math.pow(Math.random(), 1.6) * (hi - lo)
    x -= chance
  }
  return 1.2
}

export function createBaitFlow({ scene, harpoon, game, fx }) {
  // --- DOM -------------------------------------------------------------------------------------
  const root = document.createElement('div')
  root.className = 'bf'
  const cells = ZONES.map((z, i) => `<span class="bf-cell" data-i="${i}"><b>${z.icon}</b></span>`).join('')
  root.innerHTML = `
    <div class="bf-glow"></div>
    <div class="bf-flash"></div>
    <div class="bf-part bf-meter"><div class="bf-meter-luck"><i>${CLOVER}</i><span>x1.0 Luck</span></div>
      <div class="bf-meter-bar"><div class="bf-meter-dim"></div><div class="bf-meter-fill"></div>${'<s></s>'.repeat(SEGMENTS - 1)}</div></div>
    <button type="button" class="bf-part bf-boost"><span class="bf-boost-rays"></span><span class="bf-boost-top">NEXT SHOT</span><i>${CLOVER}</i><span class="bf-boost-luck">100x LUCK</span><span class="bf-boost-price"></span></button>
    <div class="bf-part bf-aim">
      <div class="bf-bait"><button type="button" class="bf-arrow prev" aria-label="Previous bait">&#9664;</button><span class="bf-bait-name"></span><button type="button" class="bf-arrow next" aria-label="Next bait">&#9654;</button></div>
      <button type="button" class="bf-go">Bait</button>
      <button type="button" class="bf-cancel">Cancel</button>
    </div>
    <div class="bf-rating"></div>
    <div class="bf-part bf-dist"><div class="bf-dist-text">Harpoon Distance: <b>0m</b></div>
      <div class="bf-track"><span class="bf-me"></span><div class="bf-cells"><div class="bf-track-fill"></div>${cells}</div></div><div class="bf-zone"></div></div>
    <div class="bf-part bf-mult"></div>
    <div class="bf-part bf-luck"><i>${CLOVER}</i><span></span></div>
    <div class="bf-part bf-odds"></div>
    <div class="bf-part bf-hooked">HOOKED!</div>
    <div class="bf-part bf-hand">${HAND}<span>Click</span></div>
    <div class="bf-part bf-tip">Click to Reel Faster!</div>
    <div class="bf-part bf-reel"><div class="bf-reel-label">${CURSOR}<span class="bf-reel-word">Click Fast!</span><span class="bf-reel-n">(0)</span></div>
      <div class="bf-reel-bar"><div class="bf-reel-fill"></div>${'<s></s>'.repeat(9)}<div class="bf-reel-card"><img alt=""></div></div></div>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)
  const el = {
    glow: $('.bf-glow'),
    flash: $('.bf-flash'),
    meterLuck: $('.bf-meter-luck span'),
    meterFill: $('.bf-meter-fill'),
    boost: $('.bf-boost'),
    boostPrice: $('.bf-boost-price'),
    baitName: $('.bf-bait-name'),
    rating: $('.bf-rating'),
    dist: $('.bf-dist-text b'),
    fill: $('.bf-track-fill'),
    me: $('.bf-me'),
    zone: $('.bf-zone'),
    cells: [...root.querySelectorAll('.bf-cell')],
    mult: $('.bf-mult'),
    luck: $('.bf-luck'),
    luckText: $('.bf-luck span'),
    odds: $('.bf-odds'),
    hooked: $('.bf-hooked'),
    hand: $('.bf-hand'),
    reel: $('.bf-reel'),
    reelFill: $('.bf-reel-fill'),
    reelWord: $('.bf-reel-word'),
    reelN: $('.bf-reel-n'),
    reelImg: $('.bf-reel-card img'),
  }
  const shown = new Set()
  function show(...parts) {
    shown.clear()
    for (const p of parts) shown.add(p)
    for (const node of root.querySelectorAll('.bf-part')) {
      const on = parts.some((p) => node.classList.contains(`bf-${p}`))
      node.classList.toggle('on', on)
    }
  }
  const restart = (node, cls) => {
    node.classList.remove(cls)
    void node.offsetWidth
    node.classList.add(cls)
  }

  // --- World pieces ----------------------------------------------------------------------------
  // The luck bush: a cluster of studded leaf blocks with its own (cloned) material so it can glow.
  const bush = new Group()
  bush.visible = false
  const bushMat = mat.studs('#46c24e').clone()
  bushMat.transparent = true
  const bushBase = bushMat.color.clone()
  for (const [w, h, d, x, y, z] of [
    [2.6, 1.4, 2.2, 0, 0.7, 0],
    [1.8, 1.0, 1.8, 0.7, 1.75, -0.2],
    [1.6, 1.0, 1.6, -1.1, 0.5, 0.6],
    [1.2, 0.8, 1.3, 1.4, 0.4, 0.8],
  ])
    cube(bush, w, h, d, x, y, z, bushMat)
  scene.add(bush)
  const groundGlow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glowTex(), color: '#d6ff5a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  groundGlow.rotation.x = -Math.PI / 2
  groundGlow.visible = false
  scene.add(groundGlow)
  // Light streaks rising out of the bush while it charges.
  const streakGeo = new PlaneGeometry(0.22, 3.4)
  const streaks = []
  for (let i = 0; i < 16; i++) {
    const m = new Mesh(streakGeo, new MeshBasicMaterial({ map: streakTex(), color: '#f6ffd8', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
    m.visible = false
    scene.add(m)
    streaks.push({ m, age: 0, life: 1, vy: 4 })
  }
  // One point light reused for the spear glow, the bush and the catch flash (always in
  // the scene so the light count never changes: no shader recompiles mid-shot).
  const light = new PointLight('#d8ff7a', 0, 16, 1.6)
  scene.add(light)

  // --- State -----------------------------------------------------------------------------------
  const F = {
    phase: 'off',
    t: 0,
    power: 0,
    meterPh: 0,
    lastSeg: -1,
    rating: 0,
    p: 0,
    selected: -1,
    boost: 1,
    powerLuck: 1,
    flightLuck: 1,
    finalLuck: 1,
    bushMult: 1,
    shownLuck: 1,
    tickAt: 0,
    chargeTime: 2,
    dist: 0,
    zone: 0,
    traveled: 0,
    data: null,
    r: 0,
    rig: null,
    mats: [],
    progress: 0,
    auto: 0.1,
    clickAdd: 0.04,
    tugIn: 2,
    tugT: 0,
    lurch: 0,
    lastClick: -9,
    dustIn: 0,
    camW: 0,
    shake: 0,
    mount: 0, // 0 standing .. 1 on the harpoon (the climb tween)
    wind: null,
    riser: null,
  }
  const H = harpoon.root.position
  const fwd = harpoon.forward.clone()
  const right = new Vector3(-fwd.z, 0, fwd.x)
  const land = new Vector3()
  const bushAt = new Vector3()
  const start = new Vector3()
  const deliver = new Vector3()
  const toH = new Vector3()
  const animalPos = new Vector3()
  const mouth = new Vector3()
  const seatPos = new Vector3()
  const standPos = new Vector3()
  const spearPrev = new Vector3()
  const spearDir = new Vector3(0, 0, -1)
  const camPos = new Vector3()
  const camLook = new Vector3()
  const wantPos = new Vector3()
  const wantLook = new Vector3()
  const tmp = new Vector3()
  const chasePos = new Vector3()
  const chaseQ = new Object3D().quaternion
  const looker = new Object3D()

  function setPhase(p) {
    F.phase = p
    F.t = 0
  }

  // --- Aim -------------------------------------------------------------------------------------
  function paintBait() {
    const S = game.S
    if (!S.baits.length) return
    const i = Math.min(S.selected, S.baits.length - 1)
    const p = S.baits[i]
    el.baitName.textContent = `${baitName(p)} ${i + 1}/${S.baits.length}`
    el.baitName.style.color = BAITS.kinds[kindOf(p)].color
    harpoon.arm(kindOf(p))
    F.selected = S.selected
  }
  function paintBoost() {
    const ready = game.nextShotReady
    el.boost.classList.toggle('ready', ready)
    el.boostPrice.textContent = ready ? 'READY!' : fmt(game.nextShotPrice())
  }

  function begin() {
    if (F.phase !== 'off' || harpoon.busy) return false
    const why = game.baitBlock()
    if (why) {
      game.ui.toast(why, false)
      sfx.deny()
      return false
    }
    // Stand the player just behind the harpoon (where they climb off later), then climb on.
    standPos.copy(H).addScaledVector(fwd, -3.4).setY(0.05)
    resetPlayer({ x: standPos.x, y: standPos.y, z: standPos.z }, Math.atan2(fwd.x, fwd.z))
    player.locked = true
    game.hideHeld = true
    F.power = 0
    F.meterPh = 0
    F.lastSeg = -1
    F.mount = 0
    F.camW = 0
    camPos.set(0, 0, 0)
    F.camInit = false
    paintBait()
    paintBoost()
    show('aim', 'meter', 'boost')
    document.body.classList.add('bf-on')
    snd.mount()
    setPhase('aim')
    return true
  }

  function cancel() {
    if (F.phase !== 'aim') return
    harpoon.disarm()
    snd.unmount()
    finish()
  }

  function shoot() {
    if (F.phase !== 'aim' || F.t < 0.3) return
    const p = game.takeBait()
    if (p == null) return cancel()
    F.p = p
    F.boost = game.useNextShot()
    const k = F.power
    F.rating = k >= HARPOON.meter.perfect ? 3 : k >= HARPOON.meter.great ? 2 : k >= HARPOON.meter.good ? 1 : 0
    F.powerLuck = lerp(HARPOON.meter.luck[0], HARPOON.meter.luck[1], k)
    const R = HARPOON.reach
    const maxD = game.maxDistance()
    let d = maxD * (R.minPower + (1 - R.minPower) * k) + (Math.random() * 2 - 1) * HARPOON.jitter
    d = Math.max(18, Math.min(laneLength() - 8, d))
    F.dist = d
    F.zone = zoneAt(d)
    const inCanyon = d < H.z - LANE.canyonEnd - 2
    const spread = inCanyon ? HARPOON.spread.canyon : HARPOON.spread.wild
    land.copy(H).addScaledVector(fwd, d).addScaledVector(right, (Math.random() * 2 - 1) * spread).setY(0)
    const flight = Math.min(HARPOON.flight[1] * 2, lerp(HARPOON.flight[0], HARPOON.flight[1], Math.min(1, d / 140)) + Math.max(0, d - 140) / 170)
    const arc = Math.min(30, lerp(HARPOON.arc[0], HARPOON.arc[1], Math.min(1, d / 140)) + Math.max(0, d - 140) * 0.02)
    harpoon.fire(land, flight, arc, { onFire, onFlight, onLand })
    const R2 = RATINGS[F.rating]
    el.rating.textContent = R2.text
    el.rating.className = `bf-rating ${R2.cls}`
    restart(el.rating, 'show')
    snd.rating(F.rating)
    if (F.rating === 3) fx.sparkle(tmp.copy(H).setY(3), '#7dff4f', 26, 4)
    show()
    setPhase('fire')
  }

  function onFire(muzzle) {
    snd.launch()
    fx.dust(muzzle, '#ffffff', 12, 2.5, 0.7)
    fx.dust(tmp.copy(H).setY(0), '#f3e2a0', 16, 3, 1)
    F.shake = 0.35
    F.traveled = 0
    spearPrev.copy(muzzle)
    F.wind = snd.flightWind()
    el.me.innerHTML = bloxity.getPfp() ? `<img alt="" src="${bloxity.getPfp()}">` : FACE
    show('dist', 'mult')
    setPhase('flight')
  }
  function onFlight(k, pos) {
    tmp.copy(pos).sub(spearPrev)
    if (tmp.lengthSq() > 1e-6) spearDir.copy(tmp).normalize()
    spearPrev.copy(pos)
    F.traveled = Math.hypot(pos.x - H.x, pos.z - H.z)
    F.wind?.set(Math.min(1, Math.sin(Math.min(1, k) * Math.PI) * 0.6 + 0.4))
    light.position.copy(pos)
    light.color.set('#eaffb0')
    light.intensity = 30
    light.distance = 14
  }
  function onLand(pos) {
    F.wind?.stop(0.25)
    F.wind = null
    snd.impact()
    snd.rustle(1.2)
    fx.dust(tmp.copy(pos).setY(0), '#c8a070', 28, 4, 2.2)
    fx.ring(tmp, '#fff3c0', 6)
    F.shake = 0.5
    // The bush springs up just beyond where the spear stuck.
    const flat = tmp.set(spearDir.x, 0, spearDir.z).normalize()
    bushAt.copy(pos).setY(0).addScaledVector(flat, 1.9)
    bush.position.copy(bushAt)
    bush.rotation.y = Math.atan2(flat.x, flat.z)
    bush.scale.setScalar(0.01)
    bush.visible = true
    bushMat.color.copy(bushBase)
    bushMat.emissive.set('#000000')
    bushMat.opacity = 1
    groundGlow.position.copy(bushAt).setY(0.08)
    groundGlow.visible = true
    groundGlow.material.opacity = 0
    toH.copy(H).sub(bushAt).setY(0).normalize()
    light.position.copy(bushAt).setY(2.5)
    light.color.set('#c8ff6a')
    light.intensity = 0
    restart(el.mult, 'fade')
    F.flightLuck = F.powerLuck * (1 + F.dist / HARPOON.distLuck) * F.boost
    setPhase('land')
  }

  function startCharge() {
    F.bushMult = rollBush()
    F.finalLuck = F.flightLuck * F.bushMult
    F.shownLuck = F.flightLuck
    F.chargeTime = Math.min(HARPOON.charge.max, HARPOON.charge.base + HARPOON.charge.perDouble * Math.log2(Math.max(1, F.bushMult)))
    F.tickAt = F.flightLuck
    el.luckText.textContent = `x${luckText(F.shownLuck)} LUCK`
    show('luck')
    F.riser = snd.luckRiser()
    setPhase('charge')
  }

  function hook() {
    F.riser?.stop(0.15)
    F.riser = null
    snd.luckBurst(Math.min(1, Math.log10(F.finalLuck) / 2))
    restart(el.flash, 'go')
    F.shake = 0.6
    // Roll the catch with the charged luck, in the landing zone.
    const data = game.rollShot(F.p, F.finalLuck, F.zone)
    F.data = data
    const def = animalDef(data.species)
    F.r = RARITIES.findIndex((x) => x.id === def.rarity)
    const rar = RARITIES[F.r]
    const rig = buildAnimal(data.species, { shiny: data.shiny })
    // Own materials so the catch can glow white without touching the shared ones.
    F.mats = []
    rig.root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        F.mats.push({ m: o.material, e: o.material.emissive?.clone(), ei: o.material.emissiveIntensity })
      }
    })
    rig.root.position.copy(bushAt)
    rig.root.scale.setScalar(0.01)
    rig.root.rotation.y = Math.atan2(toH.x, toH.z)
    scene.add(rig.root)
    F.rig = rig
    start.copy(bushAt).addScaledVector(toH, 2.8)
    harpoon.deliveryPoint(deliver)
    const oneIn = game.oneIn(data.species, F.p)
    el.odds.textContent = `1 in ${oneIn.toLocaleString('en-US')}`
    el.odds.style.setProperty('--c', data.shiny ? '#ffd23a' : rar.color)
    el.hooked.style.setProperty('--c', rar.color)
    show('luck', 'odds', 'hooked')
    restart(el.hooked, 'pop')
    restart(el.odds, 'pop')
    snd.hooked(F.r)
    snd.animalCall(def.base ?? data.species, 1, 0)
    fx.sparkle(tmp.copy(bushAt).setY(1.6), rar.color, 30 + F.r * 8, 5)
    fx.dust(tmp.copy(bushAt).setY(0), '#d9f0b0', 24, 4, 1.8)
    fx.ring(tmp, rar.color, 5)
    if (F.r >= 3 || data.shiny) fx.beam(tmp, data.shiny ? '#ffd23a' : rar.color, 14 + F.r * 2, 2.6)
    // The reel: slower for rarer and further catches; clicks add a fixed share.
    const far = 0.8 + Math.min(1.2, F.dist / 400)
    const seconds = (HARPOON.reel.seconds + HARPOON.reel.perRarity * Math.min(F.r, 6)) * far
    F.auto = 1 / seconds
    F.clickAdd = Math.max(HARPOON.reel.minClick, HARPOON.reel.click - HARPOON.reel.clickRarity * F.r) / far
    F.progress = 0
    F.tugIn = lerp(HARPOON.reel.tug[0], HARPOON.reel.tug[1], Math.random()) + 1
    F.tugT = 0
    F.lurch = 0
    el.reelImg.src = (data.shiny ? THUMBS.shiny[data.species] : THUMBS.animal[data.species]) ?? ''
    el.reel.classList.remove('done')
    setPhase('hooked')
  }

  function reelClick() {
    if (F.phase !== 'reel' && !(F.phase === 'hooked' && F.t > 1)) return
    if (F.phase === 'hooked') setPhase('reel')
    F.progress = Math.min(1, F.progress + F.clickAdd * (F.tugT > 0 ? 0.6 : 1))
    F.lurch = 1
    F.lastClick = performance.now()
    snd.reelClick(F.progress)
    restart(el.hand, 'tap')
    restart(el.reel, 'bump')
    F.shake = Math.max(F.shake, 0.08)
    if (F.rig) fx.sparkle(tmp.copy(mouth), '#fff6a0', 4, 2, 0.3)
  }

  function caught() {
    snd.caught()
    el.reel.classList.add('done')
    el.reelWord.textContent = 'Click Fast!'
    el.reelN.textContent = '(0)'
    show('reel')
    light.position.copy(animalPos).setY(2)
    light.color.set('#ffffff')
    fx.shimmer(tmp.copy(animalPos), '#ffffff', 26, 1.4, 3)
    setPhase('caught')
  }

  function deliverCatch() {
    const at = tmp.copy(animalPos)
    if (F.rig) {
      scene.remove(F.rig.root)
      for (const { m } of F.mats) m.dispose()
      F.rig = null
    }
    harpoon.retract()
    light.intensity = 0
    game.deliverCatch(F.data, at.clone())
    finish()
  }

  // Back to walking: the camera eases back to the chase cam, the player climbs off.
  function finish() {
    show()
    document.body.classList.remove('bf-on')
    bush.visible = false
    groundGlow.visible = false
    for (const s of streaks) s.m.visible = false
    F.wind?.stop(0.2)
    F.riser?.stop(0.2)
    F.wind = F.riser = null
    syncYawToPlayer()
    setPhase('outro')
  }

  // --- Input -------------------------------------------------------------------------------------
  $('.bf-go').addEventListener('click', shoot)
  $('.bf-cancel').addEventListener('click', cancel)
  const cycle = (dir) => {
    const n = game.S.baits.length
    if (n < 2) return
    game.selectBait((game.S.selected + dir + n) % n)
    paintBait()
  }
  $('.bf-arrow.prev').addEventListener('click', () => cycle(-1))
  $('.bf-arrow.next').addEventListener('click', () => cycle(1))
  el.boost.addEventListener('click', () => {
    if (game.nextShotReady) return
    if (game.buyNextShot()) {
      restart(el.boost, 'bought')
      fx.sparkle(tmp.copy(H).setY(3), '#7dff4f', 30, 4)
    } else restart(el.boost, 'shake')
    paintBoost()
  })
  window.addEventListener('keydown', (e) => {
    if (F.phase === 'off' || F.phase === 'outro' || e.target instanceof HTMLInputElement) return
    const key = e.code
    if (key === 'Space' || key === 'KeyE' || key === 'Enter') {
      e.preventDefault()
      if (e.repeat) return
      if (F.phase === 'aim') shoot()
      else reelClick()
    } else if ((key === 'Backspace' || key === 'KeyX') && F.phase === 'aim') cancel()
  })
  // Reeling: a click / tap anywhere on the screen (not on a button) pulls.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if ((F.phase !== 'reel' && F.phase !== 'hooked') || e.target.closest?.('button')) return
      if (e.button > 0) return
      reelClick()
    },
    { capture: true },
  )

  // --- Per frame ---------------------------------------------------------------------------------
  const project = new Vector3()
  function placeHand(camera) {
    project.copy(animalPos).setY(animalPos.y + (F.rig?.height ?? 1.5) * 0.45).addScaledVector(right, 0.9)
    project.project(camera)
    const x = (project.x * 0.5 + 0.5) * 100
    const y = (-project.y * 0.5 + 0.5) * 100
    el.hand.style.left = `${Math.max(8, Math.min(92, x))}%`
    el.hand.style.top = `${Math.max(12, Math.min(80, y))}%`
  }

  function update(dt, t) {
    if (F.phase === 'off') return
    F.t += dt
    F.shake = Math.max(0, F.shake - dt * 1.8)
    const ph = F.phase

    // Climb on / off.
    F.mount = ph === 'outro' ? Math.max(0, F.mount - dt / 0.35) : Math.min(1, F.mount + dt / 0.35)

    if (ph === 'aim') {
      if (game.S.selected !== F.selected) paintBait()
      // Triangle sweep, eased a touch at the ends.
      F.meterPh += dt * HARPOON.meter.speed
      const tri = 1 - Math.abs(((F.meterPh % 1) * 2) - 1)
      F.power = tri * tri * (3 - 2 * tri) * 0.25 + tri * 0.75
      harpoon.setPower(F.power)
      el.meterFill.style.setProperty('--p', F.power.toFixed(3))
      el.meterLuck.textContent = `x${lerp(HARPOON.meter.luck[0], HARPOON.meter.luck[1], F.power).toFixed(1)} Luck`
      const seg = Math.min(SEGMENTS - 1, Math.floor(F.power * SEGMENTS))
      if (seg !== F.lastSeg) {
        if (F.lastSeg >= 0) snd.meterTick(seg)
        F.lastSeg = seg
      }
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) paintBoost()
    } else if (ph === 'flight') {
      const d = F.traveled
      el.dist.textContent = `${Math.round(d)}m`
      const z = zoneAt(d)
      const zs = zoneStart(z)
      const ze = zoneStart(z + 1)
      const frac = (z + clamp01((d - zs) / (ze - zs))) / ZONES.length
      el.fill.style.width = `${(frac * 100).toFixed(2)}%`
      el.cells.forEach((c, i) => c.classList.toggle('reached', i <= z))
      if (el.zone.dataset.z !== String(z)) {
        el.zone.dataset.z = String(z)
        el.zone.textContent = ZONES[z].name
        restart(el.zone, 'pop')
        if (z > 0) sfx.tick?.()
      }
      const m = F.powerLuck * (1 + d / HARPOON.distLuck) * F.boost
      el.mult.textContent = `x${luckText(m)}`
    } else if (ph === 'land') {
      const k = clamp01(F.t / 0.35)
      bush.scale.setScalar(k < 0.7 ? (k / 0.7) * 1.12 : 1.12 - ((k - 0.7) / 0.3) * 0.12)
      light.intensity = lerp(light.intensity, 0, Math.min(1, dt * 6))
      if (F.t > 0.75) startCharge()
    } else if (ph === 'charge') {
      const k = clamp01(F.t / F.chargeTime)
      const e = Math.pow(k, 1.7)
      F.shownLuck = F.flightLuck * Math.pow(F.bushMult, e)
      el.luckText.textContent = `x${luckText(F.shownLuck)} LUCK`
      if (F.shownLuck >= F.tickAt * 1.04 && F.t - (F.lastTick ?? 0) > 0.07) {
        F.tickAt = F.shownLuck
        F.lastTick = F.t
        snd.luckTick(k)
        restart(el.luck, 'tick')
      }
      F.riser?.set(k)
      // Bush: green -> glowing -> white hot; translucent as it peaks.
      bushMat.color.copy(bushBase).lerp(tmp.set(1, 1, 1), e)
      bushMat.emissive.setRGB(0.55 * e + 0.15 * k, 0.9 * e + 0.2 * k, 0.35 * e)
      bushMat.emissiveIntensity = 0.3 + e * 1.8
      bushMat.opacity = 1 - e * 0.25
      bush.scale.setScalar(1 + Math.sin(F.t * (8 + k * 30)) * 0.015 * (0.4 + k))
      groundGlow.material.opacity = 0.25 + e * 0.75
      groundGlow.scale.setScalar(6 + e * 10)
      light.intensity = 6 + e * 70
      light.distance = 14 + e * 10
      el.glow.style.opacity = (e * 0.85).toFixed(3)
      // Rising light streaks, more as it charges.
      F.streakIn = (F.streakIn ?? 0) - dt
      if (F.streakIn <= 0) {
        F.streakIn = lerp(0.22, 0.03, e)
        const s = streaks.find((x) => !x.m.visible)
        if (s) {
          s.m.visible = true
          s.age = 0
          s.life = 0.7 + Math.random() * 0.6
          s.vy = 3 + Math.random() * 4
          s.m.position.copy(bushAt).add(tmp.set((Math.random() - 0.5) * 3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 2.4))
          s.m.scale.set(0.7 + Math.random() * 0.8, 0.6 + Math.random() * 0.9, 1)
        }
      }
      if (Math.random() < dt * (4 + e * 30)) fx.sparkle(tmp.copy(bushAt).add(project.set((Math.random() - 0.5) * 2.4, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2)), '#f4ffd0', 2, 1.5, 0.35)
      if (k >= 1) hook()
    } else if (ph === 'hooked' || ph === 'reel' || ph === 'caught') {
      const rig = F.rig
      // The bush cools back to green, then sinks away.
      const cool = clamp01(F.t / 0.4)
      if (ph === 'hooked') {
        bushMat.color.copy(bushBase).lerp(tmp.set(1, 1, 1), 1 - cool)
        bushMat.emissive.setRGB(0.7 * (1 - cool), 1.1 * (1 - cool), 0.35 * (1 - cool))
        bushMat.opacity = 0.75 + cool * 0.25
        el.glow.style.opacity = ((1 - cool) * 0.85).toFixed(3)
        groundGlow.material.opacity = (1 - cool) * 0.9
        light.intensity = (1 - cool) * 70
        const sink = clamp01((F.t - 0.55) / 0.45)
        bush.scale.setScalar(1 - easeOut(sink))
        if (sink >= 1) bush.visible = false
        if (F.t > 0.55 && !F.rustled) {
          F.rustled = true
          snd.rustle(0.8)
        }
        if (F.t > 0.9 && !shown.has('reel')) {
          show('odds', 'hooked', 'hand', 'tip', 'reel')
          el.reelWord.textContent = 'Click Fast!'
        }
        if (F.t >= HARPOON.hook) {
          F.rustled = false
          show('hand', 'tip', 'reel')
          setPhase('reel')
        }
      }
      // Reel progress: it reels itself; tugs pull back.
      if (F.phase === 'reel') {
        F.tugIn -= dt
        if (F.tugIn <= 0 && F.tugT <= 0) {
          F.tugT = HARPOON.reel.tugTime
          F.tugIn = lerp(HARPOON.reel.tug[0], HARPOON.reel.tug[1], Math.random())
          snd.tug()
          snd.animalCall(animalDef(F.data.species).base ?? F.data.species, 0.6, 0)
        }
        const pull = F.tugT > 0 ? HARPOON.reel.tugPull / HARPOON.reel.tugTime : 0
        F.tugT = Math.max(0, F.tugT - dt)
        F.progress = clamp01(F.progress + (F.auto - pull) * dt)
        const clicking = performance.now() - F.lastClick < 260
        el.reelWord.textContent = F.tugT > 0 ? 'Pull Harder!' : 'Click Fast!'
        el.reel.classList.toggle('tug', F.tugT > 0 || clicking)
        el.reelN.textContent = `(${Math.max(0, Math.ceil((1 - F.progress) / F.auto - 0.05))})`
        el.reelFill.style.setProperty('--p', F.progress.toFixed(3))
        if (F.progress >= 1) caught()
      }
      F.lurch = Math.max(0, F.lurch - dt * 6)
      // Where the catch is: popping out of the bush, then dragged up the Lane.
      if (rig) {
        const pop = clamp01(F.t / 0.45)
        if (F.phase === 'hooked' && pop < 1) {
          animalPos.lerpVectors(bushAt, start, easeOut(pop))
          animalPos.y = Math.sin(pop * Math.PI) * 2.2
          rig.root.scale.setScalar(pop < 0.7 ? (pop / 0.7) * 1.15 : 1.15 - ((pop - 0.7) / 0.3) * 0.15)
        } else if (F.phase === 'hooked') {
          animalPos.copy(start)
          rig.root.scale.setScalar(1)
        } else {
          const k = F.phase === 'caught' ? 1 : F.progress
          animalPos.lerpVectors(start, deliver, k)
          const tugging = F.tugT > 0
          animalPos.y = tugging ? Math.abs(Math.sin(F.t * 11)) * 0.35 : F.lurch * 0.25
          animalPos.addScaledVector(toH, F.lurch * 0.35)
          F.dustIn -= dt
          if (F.phase === 'reel' && F.dustIn <= 0) {
            F.dustIn = 0.14
            fx.dust(tmp.copy(animalPos).setY(0).addScaledVector(toH, -0.6), '#e8f0c8', tugging ? 6 : 3, 1.6, 0.9)
            snd.scuff(tugging ? 1 : 0.5)
          }
        }
        rig.root.position.copy(animalPos)
        const tugging = F.tugT > 0
        const face = Math.atan2(toH.x, toH.z)
        rig.root.rotation.y = face + Math.sin(F.t * (tugging ? 14 : 6)) * (tugging ? 0.5 : 0.18) + (tugging ? 0.4 : 0)
        rig.root.rotation.x = (tugging ? -0.25 : -0.12) + F.lurch * 0.3 // leaning back against the rope
        rig.animate(dt, 0, t, F.phase === 'caught' ? 'idle' : 'flail')
        // The spear sits in its mouth.
        if (rig.head) {
          rig.root.updateMatrixWorld(true)
          rig.head.getWorldPosition(mouth)
          mouth.addScaledVector(toH, 0.35 * (animalDef(F.data.species).scale ?? 1))
        } else mouth.copy(animalPos).setY(rig.height * 0.7)
        harpoon.hold(mouth, F.phase === 'reel' ? 0.12 + (tugging ? 0 : 0.15) : 0.4, F.phase === 'reel' ? 0.35 + (tugging ? 0.65 : 0) + F.lurch * 0.4 : 0.2)
        // Caught: glows white, swells a little.
        if (F.phase === 'caught') {
          const k = clamp01(F.t / HARPOON.caught)
          for (const { m } of F.mats) {
            if (!m.emissive) continue
            m.emissive.setRGB(1, 1, 1)
            m.emissiveIntensity = k * 2.2
          }
          rig.root.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.18)
          light.intensity = k * 40
          if (F.t >= HARPOON.caught) deliverCatch()
        }
      }
    } else if (ph === 'outro') {
      if (F.camW <= 0.001 && F.mount <= 0) {
        player.locked = false
        game.hideHeld = false
        F.phase = 'off'
        light.intensity = 0
      }
    }

    // Light streaks drift up and fade.
    for (const s of streaks) {
      if (!s.m.visible) continue
      s.age += dt
      const k = s.age / s.life
      s.m.position.y += s.vy * dt
      s.m.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9
      if (k >= 1) s.m.visible = false
    }
  }

  // --- Camera --------------------------------------------------------------------------------------
  // The chase camera has already been placed this frame; blend from it to the flow's view.
  function applyCamera(camera, dt, t) {
    if (F.phase === 'off') return
    const ph = F.phase
    F.camW = ph === 'outro' ? Math.max(0, F.camW - dt / 0.9) : Math.min(1, F.camW + dt / 0.6)
    let rate = 4
    let fov = CAMERA.fov
    if (ph === 'aim' || ph === 'fire' || (ph === 'outro' && !F.data)) {
      wantPos.copy(H).addScaledVector(fwd, -7.6).setY(4.4)
      wantLook.copy(H).addScaledVector(fwd, 26).setY(2.6)
      if (ph === 'fire') wantPos.addScaledVector(fwd, F.t * 2)
    } else if (ph === 'flight') {
      const flat = tmp.set(spearDir.x, 0, spearDir.z).normalize()
      wantPos.copy(spearPrev).addScaledVector(flat, -6.5).setY(spearPrev.y + 4.6)
      wantLook.copy(spearPrev).addScaledVector(flat, 5).setY(spearPrev.y - 1.2)
      rate = F.t < 0.4 ? 6 : 16
      fov = CAMERA.fov + 10
    } else if (ph === 'land' || ph === 'charge') {
      const k = ph === 'charge' ? clamp01(F.t / F.chargeTime) : 0
      wantPos.copy(bushAt).addScaledVector(toH, 9 - k * 2.2).addScaledVector(right, 1.2).setY(4 - k * 0.6)
      wantLook.copy(bushAt).setY(1.4)
      rate = ph === 'land' ? 3 : 2.5
      fov = CAMERA.fov - k * 6
    } else if (ph === 'hooked' || ph === 'reel' || ph === 'caught' || ph === 'outro') {
      const h = F.rig?.height ?? 1.5
      const back = 5.5 + h * 1.2
      wantPos.copy(animalPos).setY(0).addScaledVector(toH, back).addScaledVector(right, 2 + h * 0.4).setY(2.2 + h * 0.8)
      wantLook.copy(animalPos).setY(h * 0.55)
      rate = ph === 'reel' ? 7 : 4
    }
    if (!F.camInit) {
      // Start the flow's view where the chase camera is, so the first move is a smooth glide.
      camPos.copy(camera.position)
      camera.getWorldDirection(tmp)
      camLook.copy(camera.position).addScaledVector(tmp, 12)
      F.camInit = true
    }
    if (ph !== 'outro') {
      const a = 1 - Math.exp(-rate * dt)
      camPos.lerp(wantPos, a)
      camLook.lerp(wantLook, a)
    }
    // Blend with the chase camera (always 1 mid-flow; eases in at the start and out at the end).
    const w = F.camW * F.camW * (3 - 2 * F.camW)
    chasePos.copy(camera.position)
    chaseQ.copy(camera.quaternion)
    looker.position.copy(camPos)
    if (F.shake > 0) looker.position.add(tmp.set((Math.random() - 0.5) * F.shake, (Math.random() - 0.5) * F.shake, (Math.random() - 0.5) * F.shake))
    looker.lookAt(camLook)
    camera.position.lerpVectors(chasePos, looker.position, w)
    camera.quaternion.slerpQuaternions(chaseQ, looker.quaternion, w)
    const f = lerp(camera.fov, fov, w)
    if (Math.abs(camera.fov - f) > 0.01) {
      camera.fov = f
      camera.updateProjectionMatrix()
    }
    // Streaks face the camera (cylindrical billboards).
    for (const s of streaks) if (s.m.visible) s.m.rotation.y = Math.atan2(camera.position.x - s.m.position.x, camera.position.z - s.m.position.z)
    if (shown.has('hand')) placeHand(camera)
  }

  // Places the avatar on the harpoon while mounted (with a little hop on and off).
  // Returns true when it did (main.js then skips the normal placement).
  function seat(group) {
    if (F.phase === 'off') return false
    harpoon.seat(seatPos)
    const k = easeOut(F.mount)
    const r = player.renderPosition
    group.position.set(lerp(r.x, seatPos.x, k), lerp(r.y, seatPos.y, k) + Math.sin(k * Math.PI) * 0.8, lerp(r.z, seatPos.z, k))
    group.rotation.y = Math.atan2(fwd.x, fwd.z)
    return true
  }

  const flow = {
    begin,
    cancel,
    update,
    applyCamera,
    seat,
    get active() {
      return F.phase !== 'off'
    },
    get phase() {
      return F.phase
    },
  }
  game.flow = flow
  return flow
}

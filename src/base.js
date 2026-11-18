import { AdditiveBlending, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import { BAITS, BASE, INTERACT } from './config.js'
import { box, cube, mat } from './voxel.js'
import { neon, solidBox } from './propkit.js'
import { world } from './physics.js'
import { bakeInPlace, compact } from './bake.js'
import { bar, billboard, FONT, outlined, panel, pill, roundRect } from './billboard.js'
import { paintStripes, paintXBoard } from './paint.js'
import { buildBait } from './bait.js'
import { createEmitter } from './particles.js'
import { loadBaseCharacter } from './avatar/character.js'
import { makeAnimator } from './avatar/animator.js'

// The player's base, east of the lane:
//  - the pen: a wooden fenced square (gate on the lane side) where caught animals live
//  - the machine pad: the bait tank (glass, bubbling liquid that fills with XP, a
//    press on top, the growing bait floating inside) between two pass tanks
//    (Auto Click, 2X XP), with octagonal floor buttons wired to them by coloured lines
//  - four upgrade signs (multiplier, bait XP, pen slot, auto machine)
//  - the sell stall with its shopkeeper, and the base's name sign
// Returns handles the game drives (fill, labels, owned states, sign contents) and
// the interact spots.

const T = BASE.pad.h + 0.02 // top of the machine pad

const WOOD = { post: '#94461f', rail: '#c8673a', brace: '#b2582f', board: '#b8643a' }

// Rotates local (x, z) by yaw and offsets: the world spot of something on a rotated prop.
function worldSpot(g, lx, lz, y = 0) {
  const v = new Vector3(lx, y, lz).applyAxisAngle(new Vector3(0, 1, 0), g.rotation.y)
  return { x: g.position.x + v.x, y, z: g.position.z + v.z }
}

// --- Pen ------------------------------------------------------------------------------------
// A fence run from (ax, az) to (bx, bz): posts every ~2.75 m, two rails and X braces.
function fenceRun(root, ax, az, bx, bz, H) {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  const yaw = Math.atan2(-dz, dx)
  const n = Math.max(1, Math.round(len / 2.75))
  const seg = len / n
  const run = new Group()
  run.position.set(ax, 0, az)
  run.rotation.y = yaw
  for (let i = 0; i <= n; i++) {
    box(run, 0.42, H, 0.42, i * seg, H / 2, 0, mat.wood(WOOD.post))
    box(run, 0.52, 0.14, 0.52, i * seg, H + 0.07, 0, mat.wood(WOOD.rail))
  }
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * seg
    for (const y of [H * 0.38, H * 0.8]) box(run, seg, 0.17, 0.12, cx, y, 0, mat.wood(WOOD.rail))
    const span = H * 0.42
    const diag = Math.hypot(seg - 0.42, span)
    const tilt = Math.atan2(span, seg - 0.42)
    for (const s of [-1, 1]) box(run, diag, 0.1, 0.06, cx, H * 0.59, 0.06 * s, mat.wood(WOOD.brace), { rz: tilt * s })
  }
  root.add(run)
  solidBox(len / 2, H / 2 + 0.3, 0.2, (ax + bx) / 2, H / 2 + 0.3, (az + bz) / 2, yaw)
}

function buildPen(root) {
  const { x: cx, z: cz, half: h, gate, fenceHeight: H } = BASE.pen
  const W = cx - h
  const E = cx + h
  const N = cz - h
  const S = cz + h
  // The gate is on the north side, facing the machine pad.
  fenceRun(root, W, N, gate.x - gate.half, N, H)
  fenceRun(root, gate.x + gate.half, N, E, N, H)
  fenceRun(root, E, N, E, S, H)
  fenceRun(root, E, S, W, S, H)
  fenceRun(root, W, S, W, N, H)
  // Gate posts: taller, capped.
  for (const x of [gate.x - gate.half, gate.x + gate.half]) {
    box(root, 0.6, H + 1, 0.6, x, (H + 1) / 2, N, mat.wood(WOOD.post))
    box(root, 0.8, 0.22, 0.8, x, H + 1.1, N, mat.wood(WOOD.rail))
  }
  // A hay bale and a water trough in the back corners (decoration; animals avoid the corners).
  const hay = mat.studs('#f2cf5a')
  box(root, 1.6, 1, 1.1, E - 1.2, 0.5, S - 0.95, hay)
  box(root, 1.1, 0.8, 1.6, E - 2.8, 0.4, S - 1.1, hay)
  const trough = new Group()
  trough.position.set(E - 1.1, 0, N + 2.6)
  box(trough, 1.1, 0.7, 2.6, 0, 0.35, 0, mat.wood(WOOD.brace))
  box(trough, 0.85, 0.05, 2.35, 0, 0.66, 0, mat.lit('#46b8ff', 0.25), { shadow: false })
  root.add(trough)
}

// --- Machine pad -------------------------------------------------------------------------
function octButton(root, x, z, r, color) {
  const g = new Group()
  g.position.set(x, T, z)
  const rim = new Mesh(new CylinderGeometry(r + 0.18, r + 0.26, 0.14, 8), mat.plain('#f4f6fa', 0.5))
  rim.position.y = 0.07
  rim.rotation.y = Math.PI / 8
  rim.receiveShadow = true
  const top = new Mesh(new CylinderGeometry(r, r * 1.04, 0.2, 8), new MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.12 }))
  top.position.y = 0.2
  top.rotation.y = Math.PI / 8
  top.castShadow = true
  top.receiveShadow = true
  top.userData.dynamic = true
  g.add(rim, top)
  root.add(g)
  let press = 0
  return {
    top,
    press() {
      press = 1
    },
    update(dt) {
      press = Math.max(0, press - dt * 7)
      top.position.y = 0.2 - Math.sin(press * Math.PI) * 0.09
      top.material.emissiveIntensity = 0.12 + press * 0.6
    },
  }
}

// A flat coloured strip along a polyline on the pad (the button wiring).
function wire(root, pts, color) {
  const m = mat.lit(color, 0.55)
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az) + 0.2
    box(root, Math.abs(bx - ax) > 0.01 ? len : 0.2, 0.03, Math.abs(bz - az) > 0.01 ? len : 0.2, (ax + bx) / 2, T + 0.015, (az + bz) / 2, m, { shadow: false })
  }
}

// Liquid material: translucent, glowing a little (more with bloom on via emissive).
function liquid(color, k = 0.9) {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, transparent: true, opacity: 0.62, roughness: 0.1, depthWrite: false })
}

// A bait tank: steel pedestal, glass box with glowing liquid that fills with XP, the bait
// floating inside, a corner frame and a top housing. opts:
//   { x, z, yaw (front direction), size (scale), top: 'press' | 'motor', collide (default true), seed }
// 'press' = the manual machine's plunger arm (drops on each pump); 'motor' = a motor with a
// spinning fan and a status light (the Auto Machine). Returns the tank's handles + its claim spot.
function baitTank(root, emitters, opts) {
  const { x, z, yaw = 0, size = 1, top = 'press', collide = true, seed = 4 } = opts
  const g = new Group()
  g.position.set(x, T, z)
  g.rotation.y = yaw
  g.scale.setScalar(size)
  root.add(g)
  const steel = mat.metal('#5b6272')
  const dark = mat.metal('#3f4552')
  const light = mat.metal('#8b94a6')
  box(g, 3.8, 0.5, 3.8, 0, 0.25, 0, steel)
  box(g, 3.4, 0.12, 3.4, 0, 0.56, 0, light)
  // Liquid (fill animates) + glass + frame.
  const liq = cube(g, 2.9, 1, 2.9, 0, 0.64, 0, liquid('#2fc6ff', 0.75), false)
  liq.renderOrder = 1
  const glass = box(g, 3.1, 3.6, 3.1, 0, 0.62 + 1.8, 0, mat.glass('#c9f3ff', 0.22), { shadow: false })
  glass.renderOrder = 2
  liq.userData.dynamic = glass.userData.dynamic = true
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.32, 3.75, 0.32, sx * 1.58, 0.62 + 1.87, sz * 1.58, dark)
  // Top housing with vents.
  box(g, 3.8, 0.7, 3.8, 0, 4.6, 0, steel)
  box(g, 2.5, 0.6, 2.5, 0, 5.25, 0, light)
  for (let i = -1; i <= 1; i++) box(g, 0.12, 0.3, 2.6, i * 0.6, 5.25, 0, dark)
  const plunger = new Group()
  plunger.userData.dynamic = true
  const fan = new Group()
  fan.userData.dynamic = true
  let motorLight = null
  if (top === 'press') {
    // The press: a post at the back, an arm over the lid, a plunger that drops on each pump.
    box(g, 0.45, 1.6, 0.45, 0, 6.1, -1.2, dark)
    box(g, 0.45, 0.45, 1.8, 0, 6.8, -0.45, dark)
    plunger.position.set(0, 0, 0.2)
    box(plunger, 0.26, 2.4, 0.26, 0, 5.2, 0, light)
    box(plunger, 2.3, 0.14, 2.3, 0, 4.05, 0, mat.metal('#aab3c4'))
    g.add(plunger)
  } else {
    // Motor: a drum with cooling fins, a caged fan on top and a pipe stub out of the back.
    const drum = new Mesh(new CylinderGeometry(0.85, 0.85, 1.0, 16), mat.metal('#4b5262'))
    drum.position.set(0, 6.0, 0)
    drum.castShadow = true
    g.add(drum)
    for (let i = 0; i < 6; i++) box(g, 1.9, 0.08, 1.9, 0, 5.62 + i * 0.15, 0, mat.metal('#6c7586'), { ry: i * 0.26 })
    box(g, 0.5, 0.5, 1.2, 0, 5.35, -1.5, mat.metal('#7c8698')) // pipe stub to the manifold
    fan.position.set(0, 6.62, 0)
    for (let i = 0; i < 4; i++) box(fan, 1.25, 0.06, 0.3, 0.55 * Math.cos((i * Math.PI) / 2), 0, 0.55 * Math.sin((i * Math.PI) / 2), mat.metal('#d9dee8'), { ry: -(i * Math.PI) / 2 })
    cube(fan, 0.3, 0.16, 0.3, 0, 0.04, 0, mat.metal('#3a3f4c'))
    g.add(fan)
    const cage = new Mesh(new CylinderGeometry(0.95, 0.95, 0.06, 20, 1, true), mat.metal('#9aa3b5'))
    cage.position.set(0, 6.66, 0)
    g.add(cage)
    motorLight = cube(g, 0.22, 0.22, 0.22, 0.75, 6.2, 0.75, mat.lit('#3ff0ff', 2).clone(), false)
    motorLight.userData.dynamic = true
    // Hazard stripes round the pedestal.
    for (let i = 0; i < 4; i++) box(g, 0.5, 0.1, 0.05, -1.35 + i * 0.9, 0.3, 1.92, mat.plain(i % 2 ? '#1d1d24' : '#ffcf1f', 0.6), { shadow: false })
  }
  // Front status lamp.
  const lamp = cube(g, 0.5, 0.22, 0.06, 0, 4.6, 1.92, mat.lit('#7dff6a', 1.4), false)
  lamp.userData.dynamic = true
  // The bait growing inside.
  const holder = new Group()
  holder.userData.dynamic = true
  holder.position.set(0, 2.3, 0)
  holder.scale.setScalar(1.7)
  g.add(holder)
  emitters.push(
    createEmitter(root, {
      boxes: [{ x, y: T + 1.3 * size, z, sx: 1.2 * size, sy: 0.4 * size, sz: 1.2 * size }],
      count: Math.round(46 * size),
      life: 2.6 * size,
      velocity: [0, 0.75, 0],
      spread: [0.12, 0.3, 0.12],
      size: 0.11,
      color: '#d8fbff',
      intensity: 1.6,
      seed,
    }),
  )
  const addCollider = () => solidBox(1.95 * size, 3.2 * size, 1.95 * size, x, 3.2 * size, z, yaw)
  if (collide) addCollider()

  // Label: bait name + XP bar.
  const label = { name: 'Worm Lv 1', xp: 0, need: 40, color: '#ff8fb0' }
  const sprite = billboard(512, 190, 2.2, (ctx, w, h) => {
    outlined(ctx, label.name, w / 2, 52, { px: 60, fill: label.color, width: 13 })
    bar(ctx, 46, 104, w - 92, 62, label.xp / label.need, `${label.xpText} / ${label.needText} xp`, { fill: '#4ce05a', px: 34 })
  })
  sprite.position.set(x, T + (top === 'press' ? 8 : 7.6) * size, z)
  sprite.scale.multiplyScalar(size < 1 ? 0.66 : 1) // the Auto Machine's three labels sit side by side
  root.add(sprite)

  let bait = null
  let baitKind = -1
  let fill = 0
  let fillShown = 0
  let pumpT = 0
  const front = 2.75 * size
  return {
    group: g,
    holder,
    addCollider,
    spot: { x: x + Math.sin(yaw) * front, y: T + 2.2 * size, z: z + Math.cos(yaw) * front },
    get fill() {
      return fillShown
    },
    setBait(kind) {
      if (kind === baitKind) return
      baitKind = kind
      if (bait) holder.remove(bait)
      bait = buildBait(kind)
      holder.add(bait)
      liq.material.color.set(BAITS.kinds[kind].color).lerp(liq.material.emissive.set('#2fc6ff'), 0.65)
      liq.material.emissive.copy(liq.material.color)
    },
    setGrow(s) {
      holder.scale.setScalar(1.7 * Math.max(0.001, s))
    },
    setFill(r) {
      fill = Math.max(0, Math.min(1, r))
    },
    setLabel(name, color, xp, need, xpText, needText) {
      if (label.name === name && label.xpText === xpText && label.needText === needText) return
      Object.assign(label, { name, color, xp, need, xpText, needText })
      sprite.redraw()
    },
    pump() {
      pumpT = 1
    },
    setReady(ready) {
      lamp.material = mat.lit(ready ? '#7dff6a' : '#ffb21a', 1.4)
    },
    update(dt, t, running = true) {
      if (top === 'motor') {
        fan.rotation.y += dt * (running ? 14 : 0)
        if (motorLight) motorLight.material.emissiveIntensity = running ? 1.2 + Math.sin(t * 6 + seed) * 0.9 : 0.1
      }
      fillShown += (fill - fillShown) * (1 - Math.exp(-8 * dt))
      const h = 0.08 + fillShown * 3.3
      liq.scale.y = h
      liq.position.y = 0.64 + h / 2
      pumpT = Math.max(0, pumpT - dt * 5)
      plunger.position.y = -Math.sin(pumpT * Math.PI) * 0.55
      liq.material.emissiveIntensity = 0.75 + Math.sin(pumpT * Math.PI) * 0.8
      holder.position.y = 2.3 + Math.sin(t * 1.6) * 0.18
      holder.rotation.y = t * 0.6
      bait?.wiggle(t)
    },
  }
}

function passTank(root, emitters, at, color, title, seed) {
  const g = new Group()
  g.position.set(at.x, T, at.z)
  root.add(g)
  const steel = mat.metal('#5b6272')
  const dark = mat.metal('#3f4552')
  box(g, 2.4, 0.45, 2.4, 0, 0.22, 0, steel)
  const liq = cube(g, 1.7, 1, 1.7, 0, 0.5, 0, liquid(color, 0.4), false)
  liq.renderOrder = 1
  const glass = box(g, 1.9, 2.6, 1.9, 0, 0.45 + 1.3, 0, mat.glass('#d8f6ff', 0.22), { shadow: false })
  glass.renderOrder = 2
  liq.userData.dynamic = glass.userData.dynamic = true
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.24, 2.75, 0.24, sx * 0.98, 0.45 + 1.37, sz * 0.98, dark)
  box(g, 2.4, 0.45, 2.4, 0, 3.32, 0, steel)
  box(g, 1.1, 0.5, 1.1, 0, 3.78, 0, mat.metal('#8b94a6'))
  box(g, 0.3, 0.7, 0.3, 0, 4.3, 0, dark)
  solidBox(1.2, 2, 1.2, at.x, 2, at.z)
  const em = createEmitter(root, {
    boxes: [{ x: at.x, y: T + 1, z: at.z, sx: 0.7, sy: 0.3, sz: 0.7 }],
    count: 22,
    life: 2,
    velocity: [0, 0.7, 0],
    spread: [0.1, 0.25, 0.1],
    size: 0.09,
    color,
    intensity: 1.8,
    seed,
  })
  emitters.push(em)

  const state = { owned: false, price: '' }
  const sprite = billboard(400, 170, 1.7, (ctx, w) => {
    outlined(ctx, title, w / 2, 50, { px: 54, width: 12 })
    if (state.owned) outlined(ctx, 'OWNED', w / 2, 120, { px: 48, fill: '#7dff6a', width: 11 })
    else outlined(ctx, state.price, w / 2, 120, { px: 50, fill: '#7dff6a', width: 11 })
  })
  sprite.position.set(at.x, T + 5.3, at.z)
  root.add(sprite)
  let fill = 0.3
  return {
    set(owned, priceText) {
      if (state.owned === owned && state.price === priceText) return
      state.owned = owned
      state.price = priceText
      sprite.redraw()
      fill = owned ? 0.95 : 0.3
      liq.material.emissiveIntensity = owned ? 1.1 : 0.35
      em.visible = owned
    },
    update(dt, t) {
      const h = 0.06 + (fill + Math.sin(t * 2 + seed) * 0.015) * 2.4
      liq.scale.y += (h - liq.scale.y) * (1 - Math.exp(-4 * dt))
      liq.position.y = 0.48 + liq.scale.y / 2
    },
  }
}

// --- Signs -----------------------------------------------------------------------------------
let boardArt = null
function signArt() {
  boardArt ??= paintXBoard(512, 356, { wood: '#c4703f', dark: '#8d4a24', frame: 0.07 })
  return boardArt
}

// data: { title, lines: [text...], button: { text, style: 'buy'|'poor'|'done' } }
function drawSign(ctx, w, h, data) {
  ctx.drawImage(signArt(), 0, 0, w, h)
  ctx.fillStyle = 'rgba(30,12,4,0.18)'
  roundRect(ctx, 26, 22, w - 52, h - 44, 18)
  ctx.fill()
  outlined(ctx, data.title, w / 2, 64, { px: 54, fill: '#4fb8ff', stroke: '#0d2a66', width: 12 })
  ;(data.lines ?? []).forEach((line, i) => outlined(ctx, line, w / 2, 128 + i * 44, { px: 34, width: 9 }))
  const b = data.button
  if (!b) return
  const styles = { buy: ['#7dff7a', '#1fbf3c'], poor: ['#ff7a6a', '#d42a2a'], done: ['#ffe46a', '#e8a510'] }
  const [top, bottom] = styles[b.style] ?? styles.buy
  pill(ctx, 106, 240, 300, 84, top, bottom, { r: 22 })
  outlined(ctx, b.text, w / 2, 284, { px: 46, width: 11 })
}

function sign(root, def, initial) {
  const g = new Group()
  g.position.set(def.x, 0, def.z)
  g.rotation.y = def.yaw
  root.add(g)
  for (const sx of [-1, 1]) box(g, 0.34, 3.6, 0.34, sx * 1.55, 1.8, -0.05, mat.wood(WOOD.post))
  box(g, 3.75, 2.6, 0.24, 0, 2.4, -0.05, mat.wood(WOOD.board))
  box(g, 3.9, 0.2, 0.36, 0, 3.75, -0.05, mat.wood(WOOD.post))
  let data = initial
  let key = JSON.stringify(data)
  const face = panel(512, 356, 3.52, 2.44, (ctx, w, h) => drawSign(ctx, w, h, data))
  face.position.set(0, 2.4, 0.075)
  face.userData.dynamic = true
  g.add(face)
  const collider = solidBox(1.95, 1.9, 0.3, def.x, 1.9, def.z, def.yaw)
  return {
    group: g,
    collider,
    spot: worldSpot(g, 0, 1.9, 1.2),
    set(next) {
      const k = JSON.stringify(next)
      if (k === key) return
      key = k
      data = next
      face.redraw()
    },
  }
}

// --- Sell stall ------------------------------------------------------------------------------
function sellStall(root, scene, npcs) {
  const def = BASE.sell
  const g = new Group()
  g.position.set(def.x, 0, def.z)
  g.rotation.y = def.yaw
  root.add(g)
  const wood = mat.wood(WOOD.board)
  const dark = mat.wood(WOOD.post)
  // Counter with an X-braced front.
  box(g, 4.6, 1.15, 1.1, 0, 0.575, 0.9, wood)
  box(g, 4.95, 0.16, 1.45, 0, 1.22, 0.9, dark)
  const frontTex = new CanvasTexture(paintXBoard(512, 128, { frame: 0.1 }))
  frontTex.colorSpace = SRGBColorSpace
  const front = box(g, 4.5, 1.05, 0.04, 0, 0.58, 1.47, new MeshStandardMaterial({ map: frontTex, roughness: 0.85 }))
  front.castShadow = false
  // Posts + back wall with a shelf of bait jars.
  for (const sx of [-1, 1]) {
    box(g, 0.3, 3.5, 0.3, sx * 2.3, 1.75, 1.5, dark)
    box(g, 0.3, 3.9, 0.3, sx * 2.3, 1.95, -1.2, dark)
  }
  box(g, 4.6, 2.6, 0.18, 0, 1.3, -1.25, wood)
  box(g, 4.2, 0.12, 0.5, 0, 1.9, -1.0, dark)
  BAITS.kinds.slice(0, 5).forEach((k, i) => {
    const jx = -1.6 + i * 0.8
    box(g, 0.42, 0.5, 0.42, jx, 2.22, -1.0, mat.glass('#e8fbff', 0.35), { shadow: false })
    cube(g, 0.3, 0.26, 0.3, jx, 2.1, -1.0, mat.lit(k.color, 0.35), false)
    cube(g, 0.46, 0.08, 0.46, jx, 2.5, -1.0, mat.plain('#d23b3b'), false)
  })
  // A bait jar and a little cash box on the counter.
  box(g, 0.5, 0.6, 0.5, -1.4, 1.6, 0.9, mat.glass('#e8fbff', 0.35), { shadow: false })
  cube(g, 0.36, 0.3, 0.36, -1.4, 1.46, 0.9, mat.lit('#ff8fb0', 0.4), false)
  box(g, 0.8, 0.4, 0.55, 1.3, 1.5, 0.9, mat.metal('#3a7a3a'))
  // Striped awning, sloping down to the front, with a scalloped valance.
  const stripes = new CanvasTexture(paintStripes('#2fbf4a', '#ffffff', 10))
  stripes.colorSpace = SRGBColorSpace
  const cloth = new MeshStandardMaterial({ map: stripes, roughness: 0.9 })
  box(g, 5.6, 0.14, 3.7, 0, 3.75, 0.25, cloth, { rx: 0.3 })
  for (let i = 0; i < 10; i++) {
    const vx = -2.52 + i * 0.56
    cube(g, 0.56, 0.42, 0.08, vx, 3.0, 2.08, mat.plain(i % 2 ? '#ffffff' : '#2fbf4a', 0.9))
  }
  const counter = worldSpot(g, 0, 0.9)
  solidBox(2.5, 1.3, 0.75, counter.x, 1.3, counter.z, def.yaw)
  const back = worldSpot(g, 0, -1.2)
  solidBox(2.5, 2, 0.3, back.x, 2, back.z, def.yaw)
  // The awning: high enough to walk under, but it keeps the camera out of the stall roof.
  const roof = worldSpot(g, 0, 0.25)
  solidBox(2.8, 0.35, 1.85, roof.x, 3.75, roof.z, def.yaw)

  // Floating title.
  const sprite = billboard(512, 200, 2.2, (ctx, w) => {
    outlined(ctx, 'Sell', w / 2, 62, { px: 84, fill: '#6dff4f', stroke: '#14400c', width: 16 })
    outlined(ctx, 'Sell extras, catch better ones!', w / 2, 152, { px: 34, width: 9 })
  })
  const top = worldSpot(g, 0, 0.4, 5.6)
  sprite.position.set(top.x, top.y, top.z)
  root.add(sprite)

  // The shopkeeper behind the counter (same rig as the player, idle-animated).
  loadBaseCharacter().then((npc) => {
    const at = worldSpot(g, 0, -0.35)
    npc.position.set(at.x, 0, at.z)
    npc.rotation.y = def.yaw
    scene.add(npc)
    npcs.push({ npc, animator: makeAnimator(npc) })
  })
  return { spot: worldSpot(g, 0, 3.1, 1.6) }
}

// --- Name sign -----------------------------------------------------------------------------
function nameSign(root) {
  const def = BASE.nameSign
  const g = new Group()
  g.position.set(def.x, 0, def.z)
  g.rotation.y = def.yaw
  root.add(g)
  for (const sx of [-1, 1]) box(g, 0.3, 2.6, 0.3, sx * 1.6, 1.3, -0.05, mat.wood(WOOD.post))
  box(g, 3.8, 1.9, 0.22, 0, 2.0, -0.05, mat.wood(WOOD.board))
  const state = { name: 'Your', img: null }
  const face = panel(512, 256, 3.62, 1.81, (ctx, w, h) => {
    ctx.drawImage(signArt(), 0, 0, w, h)
    // Avatar badge.
    const cx = 108
    const cy = h / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 78, 0, Math.PI * 2)
    ctx.fillStyle = '#5fc8ff'
    ctx.fill()
    ctx.lineWidth = 10
    ctx.strokeStyle = '#1d1a22'
    ctx.stroke()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 72, 0, Math.PI * 2)
    ctx.clip()
    if (state.img) ctx.drawImage(state.img, cx - 72, cy - 72, 144, 144)
    else {
      ctx.fillStyle = '#ffd9a8' // a simple blocky face
      ctx.fillRect(cx - 40, cy - 34, 80, 78)
      ctx.fillStyle = '#7a4a22'
      ctx.fillRect(cx - 46, cy - 50, 92, 26)
      ctx.fillStyle = '#1d1a22'
      ctx.fillRect(cx - 22, cy - 8, 12, 14)
      ctx.fillRect(cx + 10, cy - 8, 12, 14)
      ctx.fillRect(cx - 16, cy + 20, 32, 6)
    }
    ctx.restore()
    const name = state.name.length > 12 ? `${state.name.slice(0, 11)}…` : state.name
    outlined(ctx, `${name}'s`, 330, 98, { px: 48, width: 11, fill: '#ffe46a' })
    outlined(ctx, 'Base', 330, 162, { px: 56, width: 12 })
  })
  face.position.set(0, 2.0, 0.075)
  face.userData.dynamic = true
  g.add(face)
  return {
    setName(name, pfpUrl) {
      state.name = name || 'Your'
      face.redraw()
      if (!pfpUrl) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        state.img = img
        try {
          face.redraw()
        } catch {
          state.img = null // a cross-origin image without CORS would taint the canvas
          face.redraw()
        }
      }
      img.src = pfpUrl
    },
  }
}

// --- Auto Machine ---------------------------------------------------------------------------
// Three motor tanks that grow bait by themselves, a pipe manifold along their backs, floor
// wiring to a control console facing the aisle (its screen shows each tank's fill), and
// warning stripes on the pad. Until it is bought the pad shows a flickering hologram of it.
function autoMachine(root, emitters) {
  const D = BASE.autoMachine
  const P = BASE.autoPad
  const built = new Group() // shown once owned
  built.visible = false
  built.userData.dynamic = true
  root.add(built)
  const machine = new Group() // the part that pops in when bought
  built.add(machine)
  const tanks = D.tanks.map((t, i) => baitTank(machine, emitters, { x: t.x, z: t.z, yaw: D.yaw, size: D.size, top: 'motor', collide: false, seed: 11 + i }))
  // Emitters and labels were added to `machine`; they hide with it.

  // Manifold: a horizontal pipe behind the tanks with a riser + valve wheel at each end.
  const pipe = mat.metal('#7c8698')
  const backX = D.tanks[0].x - 1.55 * D.size * 1.2
  const z0 = D.tanks[0].z - 1.3
  const z1 = D.tanks[D.tanks.length - 1].z + 1.3
  const pipeY = T + 5.35 * D.size
  const run = new Mesh(new CylinderGeometry(0.24, 0.24, z1 - z0, 12), pipe)
  run.rotation.x = Math.PI / 2
  run.position.set(backX, pipeY, (z0 + z1) / 2)
  run.castShadow = true
  machine.add(run)
  for (const zz of [z0, z1]) {
    const riser = new Mesh(new CylinderGeometry(0.24, 0.24, pipeY - T, 12), pipe)
    riser.position.set(backX, T + (pipeY - T) / 2, zz)
    riser.castShadow = true
    machine.add(riser)
    const wheel = new Mesh(new CylinderGeometry(0.42, 0.42, 0.08, 6), mat.plain('#e8333a', 0.5))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(backX + 0.3, T + 1.4, zz)
    machine.add(wheel)
  }
  for (const t of D.tanks) {
    box(machine, 0.62, 0.62, 0.62, backX, pipeY, t.z, mat.metal('#5b6272')) // joints
    cube(machine, 0.66, 0.12, 0.66, backX, pipeY, t.z, mat.plain('#3ff0ff', 0.4))
  }

  // Console facing the aisle: desk, slanted screen, three lit buttons, a blinking antenna.
  const C = D.console
  const desk = new Group()
  desk.position.set(C.x, T, C.z)
  desk.rotation.y = D.yaw
  machine.add(desk)
  box(desk, 2.8, 1.05, 0.95, 0, 0.52, 0, mat.metal('#4b5262'))
  box(desk, 2.9, 0.12, 1.15, 0, 1.08, -0.05, mat.metal('#8b94a6'), { rx: 0.42 })
  const screenState = { fills: [0, 0, 0], ready: [true, true, true], on: true }
  const screen = panel(256, 128, 2.2, 0.82, (ctx, w, h) => {
    ctx.fillStyle = '#0b1a2e'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#3ff0ff'
    ctx.font = FONT(26)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('AUTO MACHINE', 14, 22)
    ctx.fillStyle = screenState.on ? '#7dff6a' : '#ff5a5a'
    ctx.fillText(screenState.on ? 'ON' : 'OFF', w - 52, 22)
    screenState.fills.forEach((f, i) => {
      const y = 50 + i * 26
      ctx.fillStyle = '#1d3350'
      ctx.fillRect(14, y, w - 70, 16)
      ctx.fillStyle = screenState.ready[i] ? '#7dff6a' : '#ffb21a'
      ctx.fillRect(14, y, (w - 70) * Math.max(0.02, f), 16)
      ctx.fillStyle = '#9fe6ff'
      ctx.font = FONT(16)
      ctx.fillText(`T${i + 1}`, w - 48, y + 8)
    })
  }, { lit: false })
  screen.position.set(0, 1.16, 0.02)
  screen.rotation.x = -Math.PI / 2 + 0.42 + 0.7
  screen.rotation.x = -1.15
  desk.add(screen)
  const deskButtons = ['#ff3a3a', '#ffd21f', '#2fdc5a'].map((col, i) => {
    const b = new Mesh(new CylinderGeometry(0.13, 0.13, 0.08, 12), mat.lit(col, 0.8).clone())
    b.position.set(-0.75 + i * 0.75, 1.0, 0.42)
    desk.add(b)
    return b
  })
  box(desk, 0.1, 1.8, 0.1, 1.3, 1.9, -0.3, mat.metal('#3a3f4c'))
  const beacon = cube(desk, 0.24, 0.24, 0.24, 1.3, 2.86, -0.3, mat.lit('#ff4a3a', 2).clone(), false)
  // Floor wiring from the console to each tank.
  const wireColors = ['#3ff0ff', '#bb6bff', '#3ff0ff']
  D.tanks.forEach((t, i) => {
    const sx = C.x - 0.6
    const tx = t.x + 1.4 * D.size
    wire(machine, [[sx, C.z + (i - 1) * 0.7], [sx - 0.6, C.z + (i - 1) * 0.7], [sx - 0.6, t.z], [tx, t.z]], wireColors[i])
  })
  // Warning stripes along the aisle edge of the pad.
  const edgeX = P.x + P.w / 2 - 0.3
  for (let i = 0; i < 12; i++) box(machine, 0.35, 0.04, 0.8, edgeX, T + 0.02, P.z - P.d / 2 + 0.5 + i * 1, mat.plain(i % 2 ? '#1d1d24' : '#ffcf1f', 0.6), { shadow: false })
  compact(machine)

  // While locked, a wooden buy board stands on the empty pad facing the aisle (the same
  // X-braced board as the upgrade signs), with a SOLD-style banner on top. It and its
  // collider go away once the machine is bought.
  const forSale = new Group()
  forSale.userData.dynamic = true
  root.add(forSale)
  const F = D.forSale
  const board = sign(forSale, { x: F.x, z: F.z, yaw: F.yaw }, { title: 'Auto Machine', lines: ['3 tanks grow bait'], button: { text: '$9,600', style: 'poor' } })
  board.group.position.y = T
  // A little banner over the board: "NEW MACHINE".
  const banner = billboard(420, 110, 1, (ctx, w) => {
    roundRect(ctx, 8, 10, w - 16, 90, 30)
    ctx.fillStyle = '#ff3b4a'
    ctx.fill()
    ctx.lineWidth = 8
    ctx.strokeStyle = '#1d1a22'
    ctx.stroke()
    outlined(ctx, 'NEW MACHINE', w / 2, 57, { px: 52, width: 11 })
  })
  banner.position.set(F.x, T + 4.6, F.z)
  forSale.add(banner)
  // Two stakes with a rope cordoning off the empty pad.
  const stake = mat.wood(WOOD.post)
  const rope = mat.plain('#e8333a', 0.6)
  const cx = P.x + P.w / 2 - 0.6
  for (const s of [-1, 1]) {
    box(forSale, 0.22, 1.1, 0.22, cx, T + 0.55, P.z + s * (P.d / 2 - 0.6), stake)
    box(forSale, 0.3, 0.3, 0.3, cx, T + 1.15, P.z + s * (P.d / 2 - 0.6), mat.plain('#ffcf1f', 0.5))
  }
  box(forSale, 0.08, 0.08, P.d - 1.2, cx, T + 0.95, P.z, rope, { shadow: false })

  let owned = false
  let popT = 1
  let colliders = false
  const ease = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) // easeOutBack
  return {
    tanks,
    board, // buy board: .spot, .set(data)
    get owned() {
      return owned
    },
    // animate: play the build-in pop (bought just now).
    setOwned(on, animate = false) {
      if (on === owned) return
      owned = on
      built.visible = on
      forSale.visible = !on
      if (on && board.collider) {
        world.removeCollider(board.collider, false)
        board.collider = null
      }
      if (on && !colliders) {
        colliders = true
        for (const t of tanks) t.addCollider()
        solidBox(0.5, 0.55, 1.45, C.x, 0.55, C.z)
      }
      if (on && animate) popT = 0
    },
    setScreen(fills, ready) {
      const changed = fills.some((f, i) => Math.abs(f - screenState.fills[i]) > 0.02) || ready.some((r, i) => r !== screenState.ready[i])
      if (!changed) return
      screenState.fills = fills.slice()
      screenState.ready = ready.slice()
      screen.redraw()
    },
    update(dt, t) {
      if (!owned) {
        banner.position.y = T + 4.6 + Math.sin(t * 2) * 0.12
        return
      }
      if (popT < 1) {
        // Build-in pop: each tank and the console grow in place, one after another.
        popT = Math.min(1, popT + dt / 1.1)
        tanks.forEach((tk, i) => tk.group.scale.setScalar(D.size * Math.max(0.01, ease(Math.min(1, Math.max(0, popT * 1.6 - i * 0.25))))))
        desk.scale.setScalar(Math.max(0.01, ease(Math.min(1, popT * 1.3))))
      }
      for (const tk of tanks) tk.update(dt, t, true)
      beacon.material.emissiveIntensity = Math.sin(t * 5) > 0 ? 2.4 : 0.2
      deskButtons.forEach((b, i) => (b.material.emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 3 + i * 2)) * 1.5))
    },
  }
}

// --- Offline cash -----------------------------------------------------------------------------
// A pile of cash bundles and coins that appears at the base when animals earned while
// you were away; it bobs, glows and floats a label until collected.
function offlinePile(root) {
  const def = BASE.offline
  const g = new Group()
  g.position.set(def.x, 0, def.z)
  g.visible = false
  g.userData.dynamic = true
  root.add(g)
  const bill = mat.plain('#3fcf5a', 0.6)
  const band = mat.plain('#e9f7d9', 0.6)
  const coin = mat.metal('#ffcf3a')
  const stack = new Group()
  g.add(stack)
  const spots = [[0, 0, 0], [0.75, 0, 0.3], [-0.7, 0, 0.25], [0.2, 0, -0.65], [0, 0.42, 0.05], [0.45, 0.42, -0.25], [-0.35, 0.42, -0.2], [0.1, 0.84, -0.05]]
  for (const [x, y, z] of spots) {
    const b = new Group()
    b.position.set(x, 0.21 + y, z)
    b.rotation.y = x * 1.7 + z
    cube(b, 0.9, 0.4, 0.5, 0, 0, 0, bill)
    cube(b, 0.16, 0.42, 0.52, 0, 0, 0, band)
    stack.add(b)
  }
  const coinGeo = new CylinderGeometry(0.2, 0.2, 0.06, 14)
  for (let i = 0; i < 9; i++) {
    const c = new Mesh(coinGeo, coin)
    const a = (i / 9) * Math.PI * 2
    c.position.set(Math.cos(a) * 1.25, 0.04 + (i % 3) * 0.06, Math.sin(a) * 1.0)
    c.castShadow = true
    g.add(c)
  }
  const state = { amount: '' }
  const sprite = billboard(512, 200, 2.3, (ctx, w) => {
    outlined(ctx, 'Offline Cash', w / 2, 62, { px: 72, fill: '#7dff4f', stroke: '#14300a', width: 15 })
    outlined(ctx, state.amount, w / 2, 150, { px: 66, fill: '#7dff4f', stroke: '#14300a', width: 14 })
  })
  sprite.position.set(def.x, 3.4, def.z)
  sprite.visible = false
  root.add(sprite)
  return {
    spot: { x: def.x, y: 1.4, z: def.z },
    set(text) {
      const on = !!text
      g.visible = sprite.visible = on
      if (on && text !== state.amount) {
        state.amount = text
        sprite.redraw()
      }
    },
    update(t) {
      if (!g.visible) return
      stack.position.y = 0.08 + Math.sin(t * 2.4) * 0.08
      stack.rotation.y = t * 0.5
      sprite.position.y = 3.4 + Math.sin(t * 2) * 0.12
    },
  }
}

// --- Training ring ------------------------------------------------------------------------------
// West of the Auto Machine pad: a rubber gym mat inside a glowing ring (the weights lying
// on it belong to training.js), a floating "+1 Strength" label, and the blue upgrade pad
// with its "Level 1 > Level 2 / $price" billboard. Until bought, only the mat, a dim ring
// and a wooden buy board standing in it show.
function gymRing(root) {
  const G = BASE.gym
  const g = new Group()
  g.userData.dynamic = true
  root.add(g)
  // The mat: dark rubber with a lighter inset, flush with the ground.
  const mat1 = new Mesh(new CylinderGeometry(G.r - 0.12, G.r - 0.12, 0.05, 48), mat.plain('#34363f', 0.95))
  mat1.position.set(G.x, 0.03, G.z)
  mat1.receiveShadow = true
  g.add(mat1)
  const inset = new Mesh(new CylinderGeometry(G.r - 0.7, G.r - 0.7, 0.05, 40), mat.plain('#43464f', 0.95))
  inset.position.set(G.x, 0.04, G.z)
  inset.receiveShadow = true
  g.add(inset)
  // The ring: a low, flattened neon band.
  const ringMat = neon('#c22cff', 2.6)
  const ring = new Mesh(new TorusGeometry(G.r - 0.18, 0.2, 10, 64), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.scale.set(1, 1, 0.5)
  ring.position.set(G.x, 0.1, G.z)
  g.add(ring)
  const glowMat = new MeshBasicMaterial({ color: '#d35bff', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false })
  const glow = new Mesh(new RingGeometry(G.r - 0.55, G.r + 0.25, 64), glowMat)
  glow.rotation.x = -Math.PI / 2
  glow.position.set(G.x, 0.07, G.z)
  glow.renderOrder = 4
  g.add(glow)

  // "+1 Strength" over the ring.
  const label = { text: '+1 Strength' }
  const sprite = billboard(512, 110, 1.25, (ctx, w) => outlined(ctx, label.text, w / 2, 58, { px: 74, fill: '#ffffff', stroke: '#1d1a22', width: 14 }))
  sprite.position.set(G.x, 3.9, G.z)
  g.add(sprite)

  // The upgrade pad: a white rim and a blue top with a lighter checker inset.
  const P = G.pad
  const pad = new Group()
  pad.position.set(P.x, 0, P.z)
  g.add(pad)
  const rim = new Mesh(new CylinderGeometry(P.r + 0.16, P.r + 0.22, 0.14, 40), mat.plain('#f4f6fa', 0.5))
  rim.position.y = 0.07
  const top = new Mesh(new CylinderGeometry(P.r, P.r, 0.2, 40), new MeshStandardMaterial({ color: '#29b6ff', roughness: 0.45, emissive: '#1a8fe0', emissiveIntensity: 0.25 }))
  top.position.y = 0.12
  const shine = new Mesh(new CylinderGeometry(P.r * 0.62, P.r * 0.62, 0.21, 32), new MeshStandardMaterial({ color: '#6fd2ff', roughness: 0.4 }))
  shine.position.y = 0.12
  for (const m of [rim, top, shine]) {
    m.receiveShadow = true
    pad.add(m)
  }
  const padState = { top: 'Level 1 > Level 2', name: '', price: '$1,200', style: 'buy' }
  const padSprite = billboard(512, 260, 2.5, (ctx, w) => {
    outlined(ctx, padState.top, w / 2, 44, { px: 46, width: 10 })
    if (padState.name) outlined(ctx, padState.name, w / 2, 100, { px: 40, fill: '#ffe46a', width: 9 })
    const fill = padState.style === 'buy' ? '#7dff4f' : padState.style === 'done' ? '#ffe46a' : '#ff4a4a'
    outlined(ctx, padState.price, w / 2, padState.name ? 182 : 150, { px: 104, fill, stroke: '#1d1a22', width: 18 })
  })
  padSprite.position.set(P.x, 2.4, P.z)
  g.add(padSprite)

  // The buy board, standing in the ring until it is bought (faces the training direction).
  const buy = new Group()
  buy.userData.dynamic = true
  root.add(buy)
  const board = sign(buy, { x: G.x, z: G.z, yaw: G.facing }, { title: 'Training', lines: ['Catch 1 animal'], button: { text: 'LOCKED', style: 'poor' } })

  let owned = false
  let popT = 1
  const dimMat = mat.plain('#6a3f86', 0.6) // the ring before it is bought: unlit purple
  const show = (on) => {
    sprite.visible = pad.visible = padSprite.visible = on
    buy.visible = !on
    ring.material = on ? ringMat : dimMat
  }
  show(false)
  const easeBack = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2)
  return {
    board,
    get owned() {
      return owned
    },
    setOwned(on, animate = false) {
      if (on === owned) return
      owned = on
      show(on)
      if (on && board.collider) {
        world.removeCollider(board.collider, false)
        board.collider = null
      }
      if (on && animate) popT = 0
    },
    setLabel(text) {
      if (text === label.text) return
      label.text = text
      sprite.redraw()
    },
    setPad(next) {
      if (next.top === padState.top && next.name === padState.name && next.price === padState.price && next.style === padState.style) return
      Object.assign(padState, next)
      padSprite.redraw()
    },
    // busy: someone is training in the ring (it pulses faster and brighter).
    update(dt, t, busy) {
      const pulse = owned ? (busy ? 0.55 + Math.sin(t * 7) * 0.25 : 0.3 + Math.sin(t * 2.2) * 0.08) : 0.06
      glowMat.opacity += (pulse - glowMat.opacity) * Math.min(1, dt * 6)
      sprite.position.y = 3.9 + Math.sin(t * 2) * 0.1
      padSprite.position.y = 2.4 + Math.sin(t * 2 + 1) * 0.08
      shine.rotation.y = t * 0.6
      if (popT < 1) {
        popT = Math.min(1, popT + dt / 0.8)
        const s = Math.max(0.01, easeBack(popT))
        pad.scale.setScalar(s)
        ring.scale.set(s, s, 0.5 * s)
      }
    },
  }
}

export function buildBase(scene) {
  const root = new Group()
  scene.add(root)
  const emitters = []
  const npcs = []
  buildPen(root)

  // Machine pads: trim + grey checker top.
  for (const P of [BASE.pad, BASE.autoPad]) {
    box(root, P.w + 0.5, P.h * 0.7, P.d + 0.5, P.x, P.h * 0.35, P.z, mat.plain('#6c7380', 0.8))
    box(root, P.w, P.h, P.d, P.x, P.h / 2 + 0.02, P.z, mat.checker('#b9bfca'))
    solidBox(P.w / 2 + 0.25, P.h / 2, P.d / 2 + 0.25, P.x, P.h / 2, P.z)
  }

  const machine = baitTank(root, emitters, { ...BASE.machine, top: 'press' })
  const auto = autoMachine(root, emitters)
  const tanks = {
    auto: passTank(root, emitters, BASE.tanks.auto, '#3d8bff', 'Auto Click', 6),
    xp: passTank(root, emitters, BASE.tanks.xp, '#c6ff3d', '2X XP', 8),
  }
  const B = BASE.buttons
  const buttons = {
    pump: octButton(root, B.pump.x, B.pump.z, B.pump.r, '#ff3a3a'),
    auto: octButton(root, B.auto.x, B.auto.z, B.auto.r, '#2f8bff'),
    xp: octButton(root, B.xp.x, B.xp.z, B.xp.r, '#ffd21f'),
  }
  const M = BASE.machine
  const A = BASE.tanks.auto
  const X = BASE.tanks.xp
  // Wiring from each button to its tank (the tanks stand along the pad's east edge).
  wire(root, [[B.pump.x + 1.3, B.pump.z], [M.x - 2, M.z]], '#ff3a3a')
  wire(root, [[B.auto.x, B.auto.z], [B.auto.x, B.auto.z - 1.4], [A.x - 1.6, B.auto.z - 1.4], [A.x - 1.6, A.z], [A.x - 1.2, A.z]], '#2f8bff')
  wire(root, [[B.xp.x, B.xp.z], [B.xp.x, B.xp.z + 1.4], [X.x - 1.6, B.xp.z + 1.4], [X.x - 1.6, X.z], [X.x - 1.2, X.z]], '#ffd21f')

  const S = BASE.signs
  const signs = {
    mult: sign(root, S.mult, { title: 'Upgrades', lines: ['1x > 1.5x cash'], button: { text: '$16', style: 'buy' } }),
    xp: sign(root, S.xp, { title: 'Level 2', lines: ['1 xp > 1.25 xp'], button: { text: '$9', style: 'buy' } }),
    slot: sign(root, S.slot, { title: '+1 Slot', lines: ['4/12 Animals'], button: { text: '$1,000', style: 'buy' } }),
    auto: sign(root, S.auto, { title: 'Auto Machine', lines: ['3 tanks grow bait'], button: { text: '$9,600', style: 'poor' } }),
  }
  const sell = sellStall(root, scene, npcs)
  const names = nameSign(root)
  const offline = offlinePile(root)
  const gym = gymRing(root)

  const R = INTERACT.radius
  const spots = {
    pump: { x: B.pump.x, y: T + 1.2, z: B.pump.z, r: R.pump },
    claim: { ...machine.spot, r: R.claim },
    autoClaims: auto.tanks.map((t) => ({ ...t.spot, r: R.claim })),
    autoBuy: { ...auto.board.spot, r: R.sign },
    auto: { x: B.auto.x, y: T + 1, z: B.auto.z, r: R.pass },
    xp: { x: B.xp.x, y: T + 1, z: B.xp.z, r: R.pass },
    mult: { ...signs.mult.spot, r: R.sign },
    xpSign: { ...signs.xp.spot, r: R.sign },
    slot: { ...signs.slot.spot, r: R.sign },
    autoSign: { ...signs.auto.spot, r: R.sign },
    sell: { ...sell.spot, r: R.sell },
    offline: { ...offline.spot, r: R.offline },
    gymBoard: { ...gym.board.spot, r: R.sign },
    gym: { x: BASE.gym.x, y: 1.6, z: BASE.gym.z, r: R.gym },
    gymPad: { x: BASE.gym.pad.x, y: 1.2, z: BASE.gym.pad.z, r: R.gymPad },
  }

  bakeInPlace(root, true) // everything that never moves -> a few meshes

  return {
    root,
    spots,
    machine,
    auto,
    tanks,
    buttons,
    signs,
    names,
    offline,
    gym,
    emitters,
    gymBusy: false, // set by training.js while the player trains
    update(dt, t) {
      gym.update(dt, t, this.gymBusy)
      machine.update(dt, t)
      auto.update(dt, t)
      offline.update(t)
      tanks.auto.update(dt, t)
      tanks.xp.update(dt, t)
      for (const b of Object.values(buttons)) b.update(dt)
      for (const { animator } of npcs) animator.update(dt, { grounded: true, speed: 0, verticalVelocity: 0, turn: 0 })
    },
  }
}

import { CanvasTexture, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { BASE, HUB, LANE, PATH, PLOTS, UPGRADES, ZONES, penSouth } from './config.js'
import { buildZones } from './zones.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { paintJungle } from './paint.js'
import { bake } from './bake.js'
import { box, cube, mat } from './voxel.js'
import { colliderShift, solidBox, solidPole } from './propkit.js'

// The hub: a studded green field boxed in by two tiers of terracotta cliffs with
// grassy tops. The yellow path runs east-west along the north side; north of the
// base a canyon lined with blue panels cuts through the wall into the Lane, the
// wild area the harpoon fires into (blocked out: ground, walls, a jungle backdrop
// and a few plants, not detailed yet). Seen from the south end you look across the
// field at the pen, the machine, the path and the canyon. Voxel trees, lavender rocks, logs, bushes and flowers fill the park west
// of the lane and the edges. All static scenery is baked to a few meshes; the
// colliders are plain boxes.
// Five plots stand side by side along the path (PLOTS.xs): each has the same base, harpoon,
// canyon and Lane; the player's is the middle one (x = 0), the rest are copies.

const C = HUB.colors

// --- Clouds -----------------------------------------------------------------------------
function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const material = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const group = new Group()
  for (let i = 0; i < 36; i++) {
    const ang = rand() * Math.PI * 2
    const dist = 300 + rand() * 200
    const cloud = new Group()
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      const puff = new Mesh(geo, material)
      puff.scale.set(r, r * 0.82, r)
      puff.position.set(t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    const flat = new Mesh(geo, material)
    flat.scale.set(len * 0.62, 4, 9)
    cloud.add(flat)
    cloud.position.set(Math.cos(ang) * dist, 55 + rand() * 70, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// --- Walls ------------------------------------------------------------------------------
// A cliff block from (x0, z0) to (x1, z1), `h` tall, grass cap on top, with a collider.
function cliff(root, x0, z0, x1, z1, h, rand) {
  const w = x1 - x0
  const d = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const off = [rand() * 4, rand() * 4]
  box(root, w, h, d, cx, h / 2, cz, mat.studs(C.wall), { uvOffset: off })
  box(root, w + 0.5, 0.9, d + 0.5, cx, h + 0.35, cz, mat.studs(C.wallTop), { uvOffset: off })
  solidBox(w / 2, 30, d / 2, cx, 30, cz)
}

// Low blocky buttresses along a wall's inner face, so the cliffs read as rock, not a box.
function buttresses(root, rand, axis, fixed, from, to, side) {
  for (let s = from + 3; s < to - 4; s += 9 + rand() * 9) {
    const len = 4 + rand() * 7
    const h = 2.5 + rand() * 6
    const depth = 1.2 + rand() * 2
    const along = s + len / 2
    const out = fixed + side * (depth / 2)
    if (axis === 'x') box(root, len, h, depth, along, h / 2, out, mat.studs(C.wall), { uvOffset: [rand() * 4, rand() * 4] })
    else box(root, depth, h, len, out, h / 2, along, mat.studs(C.wall), { uvOffset: [rand() * 4, rand() * 4] })
    // Grass tuft on the ledge.
    if (axis === 'x') box(root, len + 0.3, 0.5, depth + 0.3, along, h + 0.2, out, mat.studs(C.wallTop))
    else box(root, depth + 0.3, 0.5, len + 0.3, out, h + 0.2, along, mat.studs(C.wallTop))
  }
}

function buildWalls(root) {
  const rand = mulberry32(31)
  const { minX, maxX, minZ, maxZ, wallHeight: h1, wallHeight2: h2, wallDepth: D } = HUB
  const ch = LANE.canyonHalf
  const xs = PLOTS.xs
  // Tier 1 (inner ring).
  cliff(root, minX - D, maxZ, maxX + D, maxZ + D, h1, rand) // south
  cliff(root, minX - D, minZ, minX, maxZ, h1, rand) // west
  cliff(root, maxX, minZ, maxX + D, maxZ, h1, rand) // east
  // North: one run between each pair of canyons (a canyon per plot).
  const edges = [minX - D, ...xs.flatMap((x) => [x - ch, x + ch]), maxX + D]
  for (let i = 0; i < edges.length; i += 2) cliff(root, edges[i], minZ - D, edges[i + 1], minZ, h1, rand)
  // Tier 2 (set back, taller).
  cliff(root, minX - 2 * D, maxZ + D, maxX + 2 * D, maxZ + 2 * D, h2, rand)
  cliff(root, minX - 2 * D, minZ - D, minX - D, maxZ + D, h2, rand)
  cliff(root, maxX + D, minZ - D, maxX + 2 * D, maxZ + D, h2, rand)
  const edges2 = [minX - 2 * D, ...xs.flatMap((x) => [x - ch - D, x + ch + D]), maxX + 2 * D]
  for (let i = 0; i < edges2.length; i += 2) cliff(root, edges2[i], minZ - 2 * D, edges2[i + 1], minZ - D, h2, rand)
  // A plateau between neighbouring canyons, so no gap shows between their cliffs.
  for (let i = 0; i + 1 < xs.length; i++) cliff(root, xs[i] + ch + 22, LANE.canyonEnd - 2, xs[i + 1] - ch - 22, minZ - 2 * D, h2, rand)

  buttresses(root, rand, 'x', maxZ, minX, maxX, -1)
  buttresses(root, rand, 'z', minX, minZ, maxZ, 1)
  buttresses(root, rand, 'z', maxX, minZ, maxZ, -1)
}

// The canyon north of the hub and the wild area at the end of it.
function buildLaneArea(root) {
  const rand = mulberry32(57)
  const { minZ, wallHeight: h1, wallHeight2: h2 } = HUB
  const ch = LANE.canyonHalf
  const W = LANE.wildHalf
  const z0 = minZ // canyon start
  const z1 = LANE.canyonEnd
  // Canyon walls (two tiers each side).
  cliff(root, -ch - 9, z1, -ch, z0, h1, rand)
  cliff(root, ch, z1, ch + 9, z0, h1, rand)
  cliff(root, -ch - 22, z1 - 4, -ch - 9, z0 - 9, h2, rand)
  cliff(root, ch + 9, z1 - 4, ch + 22, z0 - 9, h2, rand)
  // Walls closing the gap between the canyon and the (wider) zones north of it.
  cliff(root, -W - 9, z1 - 2, -ch - 9, z1 + 6, h1 + 2, rand)
  cliff(root, ch + 9, z1 - 2, W + 9, z1 + 6, h1 + 2, rand)

  // Ground: the canyon floor and the wild meadow.
  const wm = mat.checker(ZONES[0].ground)
  box(root, ch * 2, 2, z0 - z1, 0, -1, (z0 + z1) / 2, wm, { shadow: false })
  // Blue panels lining the canyon walls.
  const blue = mat.studs(LANE.canyonWall)
  for (const sx of [-1, 1]) box(root, 0.4, h1 - 1.5, z0 - z1 - 2, sx * (ch - 0.2), (h1 - 1.5) / 2, (z0 + z1) / 2 - 1, blue)
  // Dirt patch where the spear lands, and a worn trail up the canyon.
  box(root, 6, 0.07, z0 - z1 - 4, 0, 0.035, (z0 + z1) / 2, mat.plain('#7cc25a', 0.95), { shadow: false })

  // A few plants along the canyon walls.
  const blade = mat.plain('#2fae4e', 0.8)
  const bladeLight = mat.plain('#56d36a', 0.8)
  for (let i = 0; i < 26; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (ch - 1 - rand() * 1.5)
    const z = z0 - 3 - rand() * (z0 - z1 - 6)
    const h = 1.5 + rand() * 3
    cube(root, 0.3, h, 0.3, x, h / 2, z, rand() < 0.5 ? blade : bladeLight).rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6)
  }


}

// --- Scenery ----------------------------------------------------------------------------
// True where nothing may be placed: the lane, the base plot, the spawn, the statue + boards.
function blocked(x, z, r) {
  if (z < PATH.z + PATH.halfWidth + 4 + r) return true // the path and the strip behind it
  const p = BASE.pen
  // Every base plot and a wide margin round it stay open (camera views, walking room).
  for (const ox of PLOTS.xs) {
    if (Math.abs(x - ox - p.x) < p.half + 13 + r && z < p.z + p.half + 6 + r) return true
    // The open field in front of the base (the spawn, on the player's plot) and the view from it.
    // It reaches past the fully expanded pen (Expand Pen) and the spawn south of it.
    if (Math.abs(x - ox) < 16 + r && z > p.z + p.half && z < penSouth(UPGRADES.pen.max) + 11 + r) return true
  }
  if (Math.hypot(x - STATUE.x, z - STATUE.z) < 11 + r) return true
  if (x > RECORDS.x - 7 - r && x < RECORDS.x + 7 + r && z < RECORDS.z + 5 + r) return true
  if (x < HUB.minX + 3 + r || x > HUB.maxX - 3 - r || z < HUB.minZ + 3 + r || z > HUB.maxZ - 3 - r) return true
  return false
}

export const STATUE = { x: -36, z: 20, scale: 4.2 }
export const RECORDS = { x: -30, z: -31.5 }

function tree(root, x, z, s, rand) {
  const trunkH = (2.2 + rand() * 1.4) * s
  const tw = 0.75 * s
  box(root, tw, trunkH, tw, x, trunkH / 2, z, mat.wood(C.trunk))
  // Little side branch.
  if (rand() < 0.6) {
    const dir = rand() < 0.5 ? 1 : -1
    box(root, 1.1 * s, 0.35 * s, 0.35 * s, x + dir * 0.6 * s, trunkH * 0.55, z, mat.wood(C.trunk))
  }
  const tiers = rand() < 0.45 ? 3 : 2
  let y = trunkH
  let size = (2.8 + rand() * 0.8) * s
  const leaves = mat.studs(rand() < 0.3 ? C.leavesLight : C.leaves)
  for (let t = 0; t < tiers; t++) {
    const hh = size * (t === 0 ? 0.85 : 0.75)
    box(root, size, hh, size, x + (rand() - 0.5) * 0.3 * s, y + hh / 2 - 0.2, z + (rand() - 0.5) * 0.3 * s, leaves, { uvOffset: [rand() * 4, rand() * 4] })
    y += hh - 0.25
    size *= 0.68
  }
  solidPole(tw * 0.6, trunkH + 2, x, z)
}

function rockCluster(root, x, z, s, rand) {
  const m = mat.studs(C.rock)
  const n = 2 + Math.floor(rand() * 3)
  let maxH = 0
  for (let i = 0; i < n; i++) {
    const w = (0.8 + rand() * 1.2) * s
    const h = (0.8 + rand() * 1.8) * s
    const ox = (rand() - 0.5) * 1.6 * s
    const oz = (rand() - 0.5) * 1.6 * s
    box(root, w, h, w * (0.7 + rand() * 0.5), x + ox, h / 2, z + oz, m, { ry: rand() * Math.PI, uvOffset: [rand() * 4, rand() * 4] })
    if (rand() < 0.4) box(root, w * 0.6, h * 0.5, w * 0.6, x + ox, h + h * 0.25, z + oz, m, { ry: rand() * Math.PI })
    maxH = Math.max(maxH, h)
  }
  solidBox(1.1 * s, maxH / 2, 1.1 * s, x, maxH / 2, z)
}

function log(root, x, z, rand) {
  const len = 3 + rand() * 3
  const ry = rand() * Math.PI
  const g = new Group()
  box(g, len, 0.85, 0.85, 0, 0.42, 0, mat.wood(C.log))
  box(g, 0.06, 0.7, 0.7, len / 2, 0.42, 0, mat.plain('#f2b27a'), { shadow: false })
  box(g, 0.06, 0.7, 0.7, -len / 2, 0.42, 0, mat.plain('#f2b27a'), { shadow: false })
  g.position.set(x, 0, z)
  g.rotation.y = ry
  root.add(g)
  solidBox(len / 2, 0.42, 0.42, x, 0.42, z, ry)
}

function flower(root, x, z, rand) {
  const colors = ['#b56cff', '#5aa8ff', '#ffffff', '#ff7ac8', '#ffe14a']
  const m = mat.plain(colors[Math.floor(rand() * colors.length)], 0.6)
  const s = 0.22
  cube(root, s * 2.2, s * 0.6, s * 0.8, x, 0.14, z, m, false)
  cube(root, s * 0.8, s * 0.6, s * 2.2, x, 0.14, z, m, false)
  cube(root, s * 0.6, s * 0.7, s * 0.6, x, 0.22, z, mat.plain('#ffe14a', 0.6), false)
}

// Distance along x from (x) to the nearest plot's centre.
const plotDist = (x) => Math.min(...PLOTS.xs.map((ox) => Math.abs(x - ox)))

function buildScenery(root) {
  const rand = mulberry32(88)
  const k = (HUB.maxX - HUB.minX) / 116 // the field is k times the one-plot hub it was tuned on
  const spot = (r, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const x = HUB.minX + rand() * (HUB.maxX - HUB.minX)
      const z = HUB.minZ + rand() * (HUB.maxZ - HUB.minZ)
      // The field gets sparser toward each plot, where the bases are.
      if (plotDist(x) < 30 && rand() < 0.5) continue
      if (!blocked(x, z, r)) return [x, z]
    }
    return null
  }
  for (let i = 0; i < HUB.trees; i++) {
    const p = spot(2.2)
    if (p) tree(root, p[0], p[1], 0.85 + rand() * 0.6, rand)
  }
  for (let i = 0; i < HUB.rocks; i++) {
    const p = spot(1.6)
    if (p) rockCluster(root, p[0], p[1], 0.7 + rand() * 0.6, rand)
  }
  for (let i = 0; i < 14 * k; i++) {
    const p = spot(2.5)
    if (p) log(root, p[0], p[1], rand)
  }
  for (let i = 0; i < 26 * k; i++) {
    const p = spot(1)
    if (!p) continue
    const s = 0.9 + rand() * 0.9
    box(root, s, s * 0.8, s, p[0], s * 0.4, p[1], mat.studs(C.bush), { ry: rand() * Math.PI })
  }
  for (let i = 0; i < HUB.flowers; i++) {
    const p = spot(0.3, 10)
    if (p) flower(root, p[0], p[1], rand)
  }
  // Flowers along the path's south verge and round the pen.
  for (let i = 0; i < 50 * k; i++) {
    const x = HUB.minX + 4 + rand() * (HUB.maxX - HUB.minX - 8)
    const z = PATH.z + PATH.halfWidth + 1.4 + rand() * 1.6
    if (plotDist(x) < 20) continue
    flower(root, x, z, rand)
  }
  const pen = BASE.pen
  for (const ox of PLOTS.xs) {
    const pr = mulberry32(91) // the same flower ring round every pen
    for (let i = 0; i < 24; i++) {
      const a = pr() * Math.PI * 2
      const d = pen.half + 1.2 + pr() * 2
      const x = ox + pen.x + Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * d
      const z = pen.z + Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * d
      if (z < pen.z - pen.half + 0.5) continue // keep the gate side clear
      flower(root, x, z, pr)
    }
  }
  // Wooden fences along the path's south edge, open in front of every base.
  const rail = mat.wood('#c8673a')
  const post = mat.wood('#94461f')
  const fz = PATH.z + PATH.halfWidth + 0.6
  const fx = [HUB.minX + 2, ...PLOTS.xs.flatMap((x) => [x - 22, x + 22]), HUB.maxX - 2]
  const runs = []
  for (let i = 0; i < fx.length; i += 2) runs.push([fx[i], fx[i + 1]])
  for (const [x0, x1] of runs) {
    const n = Math.round((x1 - x0) / 2.75)
    const seg = (x1 - x0) / n
    for (let i = 0; i <= n; i++) box(root, 0.42, 1.6, 0.42, x0 + i * seg, 0.8, fz, post)
    for (const y of [0.6, 1.28]) box(root, x1 - x0, 0.17, 0.12, (x0 + x1) / 2, y, fz, rail)
    solidBox((x1 - x0) / 2, 1.1, 0.25, (x0 + x1) / 2, 1.1, fz)
  }
}

// --- The records board (north wall, west of the canyon) ---------------------------------
// A wooden board with the player's own stats; update(stats) repaints it.
function buildRecords(root) {
  const g = new Group()
  g.position.set(RECORDS.x, 0, RECORDS.z)
  const wood = mat.wood('#a9572d')
  box(g, 0.5, 7, 0.5, -4.2, 3.5, 0, wood)
  box(g, 0.5, 7, 0.5, 4.2, 3.5, 0, wood)
  box(g, 9.4, 6, 0.4, 0, 4.2, 0, mat.plain('#7a3f1f', 0.9))
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 400
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const face = new Mesh(new PlaneGeometry(8.8, 5.5), new MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }))
  face.position.set(0, 4.2, 0.21)
  g.add(face)
  root.add(g)
  solidBox(4.6, 3.5, 0.4, RECORDS.x, 3.5, RECORDS.z)

  let last = ''
  return {
    update(rows) {
      const key = JSON.stringify(rows)
      if (key === last) return
      last = key
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#f3dcb4'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.strokeStyle = '#7a3f1f'
      ctx.lineWidth = 10
      ctx.strokeRect(5, 5, c.width - 10, c.height - 10)
      ctx.textAlign = 'center'
      ctx.font = '700 54px Fredoka, sans-serif'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 10
      ctx.strokeStyle = '#173a7a'
      ctx.strokeText('Your Records', c.width / 2, 70)
      ctx.fillStyle = '#4fb6ff'
      ctx.fillText('Your Records', c.width / 2, 70)
      ctx.font = '600 34px Fredoka, sans-serif'
      rows.forEach(([k, v], i) => {
        const y = 140 + i * 58
        ctx.textAlign = 'left'
        ctx.fillStyle = '#5b3418'
        ctx.fillText(k, 44, y)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#1f7a18'
        ctx.fillText(v, c.width - 44, y)
      })
      tex.needsUpdate = true
    },
  }
}

// --- Ground + colliders -------------------------------------------------------------------
function buildGround(root) {
  const { minX, maxX, minZ, maxZ } = HUB
  const grass = mat.checker(C.grass)
  const lane = mat.checker(C.lane)
  const n = PATH.z - PATH.halfWidth // north edge of the path
  const s = PATH.z + PATH.halfWidth // south edge
  // The field south of the path, the grass strip north of it, and the path (tops at y = 0).
  box(root, maxX - minX, 2, maxZ - s, (minX + maxX) / 2, -1, (s + maxZ) / 2, grass, { shadow: false })
  box(root, maxX - minX, 2, n - minZ, (minX + maxX) / 2, -1, (minZ + n) / 2, grass, { shadow: false })
  box(root, maxX - minX, 2, s - n, (minX + maxX) / 2, -1, PATH.z, lane, { shadow: false })
  // A darker kerb line along both path edges.
  const kerb = mat.plain('#e9a90f', 0.8)
  for (const z of [n + 0.18, s - 0.18]) box(root, maxX - minX, 0.04, 0.35, (minX + maxX) / 2, 0.02, z, kerb, { shadow: false })
  // One big floor collider under everything.
  addFixed(RAPIER.ColliderDesc.cuboid(HUB.maxX + 3 * HUB.wallDepth, 1, 200), { x: 0, y: -1, z: 0 }, null, { friction: 0.9 })
}

// Builds the whole hub into `scene`. Returns { records, update }.
export function createWorld(scene) {
  // The floor never casts (it only receives); everything standing on it does.
  const floor = new Group()
  buildGround(floor)
  const statics = new Group()
  buildWalls(statics)
  for (const x of PLOTS.xs) {
    const lane = new Group() // every plot's canyon is the same build, moved along x
    lane.position.x = x
    statics.add(lane)
    colliderShift.x = x
    buildLaneArea(lane)
    colliderShift.x = 0
  }
  buildScenery(statics)
  for (const [group, cast] of [[floor, false], [statics, true]]) {
    const baked = bake(group, cast)
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    scene.add(baked)
  }
  const records = buildRecords(scene)
  scene.add(makeClouds())
  const zones = buildZones(scene) // the player's Lane: ten zones north of the canyon
  // The other plots' Lanes: the same zones, decor only.
  const others = PLOTS.xs.filter((x) => x !== PLOTS.own).map((ox) => buildZones(scene, { ox, decor: true }))
  return {
    records,
    zones,
    update(dt, t, camera) {
      if (!camera) return
      zones.update(camera, dt)
      for (const z of others) z.update(camera, dt)
    },
  }
}

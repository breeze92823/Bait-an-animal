import { Box3, Color, Group, Vector3 } from 'three'
import { ANIMALS, BASE, RARITIES, SHINY, penSouth } from './config.js'
import { cube, mat } from './voxel.js'
import { billboard, outlined } from './billboard.js'
import { compact } from './bake.js'
import { money } from './format.js'

// Voxel animals. buildAnimal(id, { shiny }) returns a rig:
//   { root (feet at y = 0, facing +Z), body, head, legs [{ pivot, phase }], wings [], tail,
//     height, animate(dt, speed, t, mode) }
// mode: 'walk' | 'idle' | 'flail' (on the harpoon rope) | 'fly' (jumping into the pen).
// PenAnimal wraps a rig with a label and the pen wandering behaviour.

export const animalDef = (id) => ANIMALS.find((a) => a.id === id)
export const rarityDef = (id) => RARITIES.find((r) => r.id === id)

const GOLD = new Color('#ffd23a')
const tmp = new Color()
function goldify(color) {
  return `#${tmp.set(color).lerp(GOLD, 0.72).getHexString()}`
}

function makeRig(shiny, look = {}) {
  const root = new Group()
  const body = new Group()
  root.add(body)
  const r = {
    root,
    body,
    head: null,
    legs: [],
    wings: [],
    flippers: [],
    tail: null,
    hop: false,
    height: 1,
    stride: 0.9,
  }
  // Species looks: tint every body colour toward look.tint, or gold (the Golden zone / shiny).
  const tint = look.tint ? new Color(look.tint[0]) : null
  const recolor = (color) => (tint ? `#${tmp.set(color).lerp(tint, look.tint[1]).getHexString()}` : color)
  const gold = shiny || look.gold
  r.m = (color) => (gold ? mat.metal(goldify(recolor(color))) : mat.plain(recolor(color), 0.72))
  r.part = (parent, w, h, d, x, y, z, color) => cube(parent, w, h, d, x, y, z, r.m(color))
  r.group = (parent, x, y, z) => {
    const g = new Group()
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }
  // A leg hanging from a hip pivot at (x, y, z); `phase` 0 or PI for the gait.
  r.leg = (x, y, z, w, len, d, color, phase, hoof) => {
    const pivot = r.group(root, x, y, z)
    r.part(pivot, w, len, d, 0, -len / 2, 0, color)
    if (hoof) r.part(pivot, w * 1.08, len * 0.18, d * 1.08, 0, -len + len * 0.09, 0, hoof)
    r.legs.push({ pivot, phase })
    return pivot
  }
  // Two eyes with a highlight, on the head's front face at depth z.
  r.eyes = (parent, sx, y, z, size = 0.09, color = '#15151c') => {
    for (const s of [-1, 1]) {
      cube(parent, size, size * 1.15, 0.04, s * sx, y, z, look.glow ? mat.lit(look.glow, 1.8) : mat.plain(color, 0.3), false)
      cube(parent, size * 0.38, size * 0.38, 0.05, s * sx - size * 0.18, y + size * 0.22, z + 0.005, mat.lit('#ffffff', 0.5), false)
    }
  }
  return r
}

// --- Species ---------------------------------------------------------------------------------
const BUILD = {
  bunny(r) {
    const W = '#f4f2f0'
    r.part(r.body, 0.62, 0.5, 0.72, 0, 0.45, 0, W)
    r.part(r.body, 0.5, 0.36, 0.3, 0, 0.36, 0.3, '#ffffff')
    const h = (r.head = r.group(r.body, 0, 0.72, 0.36))
    r.part(h, 0.46, 0.42, 0.42, 0, 0.12, 0.05, W)
    r.part(h, 0.16, 0.1, 0.06, 0, 0.04, 0.28, '#ff9fb4')
    r.eyes(h, 0.12, 0.18, 0.265)
    for (const s of [-1, 1]) {
      const ear = r.group(h, s * 0.12, 0.3, 0)
      r.part(ear, 0.13, 0.5, 0.09, 0, 0.25, 0, W)
      r.part(ear, 0.07, 0.36, 0.02, 0, 0.25, 0.05, '#ffb3c6')
      ear.rotation.z = s * -0.12
    }
    r.tail = r.group(r.body, 0, 0.55, -0.4)
    r.part(r.tail, 0.24, 0.24, 0.2, 0, 0, 0, '#ffffff')
    r.leg(-0.2, 0.25, 0.25, 0.13, 0.25, 0.14, W, 0)
    r.leg(0.2, 0.25, 0.25, 0.13, 0.25, 0.14, W, 0)
    r.leg(-0.22, 0.25, -0.22, 0.18, 0.25, 0.32, W, Math.PI)
    r.leg(0.22, 0.25, -0.22, 0.18, 0.25, 0.32, W, Math.PI)
    r.hop = true
    r.height = 1.45
  },
  duck(r) {
    const Y = '#ffd83b'
    const O = '#ff9a1f'
    r.part(r.body, 0.6, 0.46, 0.78, 0, 0.5, 0, Y)
    r.tail = r.group(r.body, 0, 0.66, -0.42)
    r.part(r.tail, 0.32, 0.16, 0.18, 0, 0, 0, Y)
    r.tail.rotation.x = -0.5
    const h = (r.head = r.group(r.body, 0, 0.78, 0.26))
    r.part(h, 0.24, 0.24, 0.22, 0, 0.0, 0, Y)
    r.part(h, 0.4, 0.38, 0.4, 0, 0.26, 0.04, Y)
    r.part(h, 0.26, 0.09, 0.26, 0, 0.18, 0.32, O)
    r.eyes(h, 0.11, 0.32, 0.245, 0.08)
    for (const s of [-1, 1]) {
      const w = r.group(r.body, s * 0.32, 0.6, 0)
      r.part(w, 0.08, 0.3, 0.5, 0, -0.05, 0, '#f5c52a')
      r.wings.push({ g: w, s })
    }
    for (const s of [-1, 1]) {
      const leg = r.leg(s * 0.14, 0.27, 0.02, 0.07, 0.24, 0.07, O, s > 0 ? 0 : Math.PI)
      r.part(leg, 0.2, 0.04, 0.26, 0, -0.24, 0.06, O)
    }
    r.height = 1.35
  },
  chicken(r) {
    const W = '#fbfbf8'
    const Yl = '#ffcf33'
    r.part(r.body, 0.66, 0.6, 0.78, 0, 0.68, 0, W)
    r.tail = r.group(r.body, 0, 0.92, -0.42)
    r.part(r.tail, 0.36, 0.42, 0.16, 0, 0.12, 0, W)
    r.part(r.tail, 0.26, 0.3, 0.12, 0, 0.32, -0.06, '#eeeeea')
    r.tail.rotation.x = -0.35
    const h = (r.head = r.group(r.body, 0, 1.0, 0.3))
    r.part(h, 0.4, 0.46, 0.38, 0, 0.2, 0.02, W)
    r.part(h, 0.09, 0.2, 0.32, 0, 0.5, 0.0, '#f02d2d')
    r.part(h, 0.18, 0.1, 0.18, 0, 0.18, 0.28, Yl)
    r.part(h, 0.1, 0.16, 0.06, 0, 0.04, 0.24, '#f02d2d')
    r.eyes(h, 0.12, 0.28, 0.215, 0.08)
    for (const s of [-1, 1]) {
      const w = r.group(r.body, s * 0.35, 0.78, 0)
      r.part(w, 0.08, 0.38, 0.52, 0, -0.06, 0, '#f0f0ea')
      r.wings.push({ g: w, s })
    }
    for (const s of [-1, 1]) {
      const leg = r.leg(s * 0.15, 0.4, 0.02, 0.08, 0.4, 0.08, Yl, s > 0 ? 0 : Math.PI)
      r.part(leg, 0.2, 0.04, 0.26, 0, -0.39, 0.06, Yl)
    }
    r.height = 1.65
  },
  pig(r) {
    const P = '#ffa8bd'
    const D = '#ff7f9c'
    r.part(r.body, 0.82, 0.66, 1.12, 0, 0.68, 0, P)
    const h = (r.head = r.group(r.body, 0, 0.82, 0.62))
    r.part(h, 0.62, 0.56, 0.44, 0, 0.0, 0.12, P)
    r.part(h, 0.32, 0.24, 0.12, 0, -0.06, 0.38, D)
    for (const s of [-1, 1]) cube(h, 0.06, 0.08, 0.02, s * 0.07, -0.06, 0.445, mat.plain('#8a3047'), false)
    r.eyes(h, 0.15, 0.1, 0.345, 0.08)
    for (const s of [-1, 1]) {
      const ear = r.group(h, s * 0.22, 0.3, 0.1)
      r.part(ear, 0.18, 0.18, 0.07, 0, 0.0, 0.05, D)
      ear.rotation.x = 0.6
    }
    r.tail = r.group(r.body, 0, 0.88, -0.58)
    r.part(r.tail, 0.08, 0.08, 0.14, 0, 0, -0.05, D)
    r.part(r.tail, 0.08, 0.14, 0.08, 0, 0.08, -0.1, D)
    for (const [x, z, ph] of [[-0.24, 0.36, 0], [0.24, 0.36, Math.PI], [-0.24, -0.36, Math.PI], [0.24, -0.36, 0]]) r.leg(x, 0.38, z, 0.2, 0.36, 0.2, P, ph, '#c9607a')
    r.height = 1.5
  },
  sheep(r) {
    const Wl = '#f5f5f2'
    const F = '#3b3b44'
    r.part(r.body, 1.0, 0.8, 1.22, 0, 0.92, 0, Wl)
    for (const [x, y, z] of [[0.35, 1.28, 0.3], [-0.3, 1.3, -0.2], [0, 1.32, 0.05], [0.4, 1.0, -0.4], [-0.42, 0.95, 0.35], [0.05, 0.9, 0.6]]) r.part(r.body, 0.38, 0.32, 0.38, x, y, z, '#ffffff')
    const h = (r.head = r.group(r.body, 0, 1.08, 0.66))
    r.part(h, 0.44, 0.5, 0.44, 0, 0, 0.12, F)
    r.part(h, 0.5, 0.22, 0.36, 0, 0.3, 0.06, Wl)
    r.eyes(h, 0.12, 0.06, 0.345, 0.08, '#ffffff')
    for (const s of [-1, 1]) {
      const ear = r.group(h, s * 0.27, 0.12, 0.08)
      r.part(ear, 0.22, 0.1, 0.12, s * 0.06, 0, 0, F)
    }
    r.tail = r.group(r.body, 0, 1.0, -0.64)
    r.part(r.tail, 0.22, 0.22, 0.16, 0, 0, 0, Wl)
    for (const [x, z, ph] of [[-0.28, 0.38, 0], [0.28, 0.38, Math.PI], [-0.28, -0.38, Math.PI], [0.28, -0.38, 0]]) r.leg(x, 0.55, z, 0.17, 0.55, 0.17, F, ph)
    r.height = 1.75
  },
  fox(r) {
    const O = '#ff8a2a'
    const Wh = '#fff4e6'
    const K = '#2a1d16'
    r.part(r.body, 0.56, 0.5, 1.0, 0, 0.66, 0, O)
    r.part(r.body, 0.4, 0.3, 0.4, 0, 0.58, 0.34, Wh)
    const h = (r.head = r.group(r.body, 0, 0.98, 0.56))
    r.part(h, 0.52, 0.44, 0.44, 0, 0.0, 0.02, O)
    r.part(h, 0.26, 0.2, 0.32, 0, -0.08, 0.3, Wh)
    r.part(h, 0.09, 0.08, 0.06, 0, -0.03, 0.47, K)
    r.eyes(h, 0.13, 0.08, 0.245, 0.08)
    for (const s of [-1, 1]) {
      r.part(h, 0.16, 0.26, 0.09, s * 0.16, 0.32, 0.0, O)
      r.part(h, 0.16, 0.08, 0.1, s * 0.16, 0.45, 0.0, K)
    }
    r.tail = r.group(r.body, 0, 0.78, -0.5)
    r.part(r.tail, 0.32, 0.32, 0.6, 0, 0.05, -0.28, O)
    r.part(r.tail, 0.26, 0.26, 0.22, 0, 0.05, -0.66, Wh)
    r.tail.rotation.x = 0.45
    for (const [x, z, ph] of [[-0.17, 0.32, 0], [0.17, 0.32, Math.PI], [-0.17, -0.34, Math.PI], [0.17, -0.34, 0]]) r.leg(x, 0.42, z, 0.14, 0.42, 0.14, O, ph, K)
    r.height = 1.6
  },
  cow(r) {
    const W = '#f6f6f2'
    const K = '#26262c'
    r.part(r.body, 1.0, 0.85, 1.55, 0, 1.12, 0, W)
    for (const [w, h, d, x, y, z] of [[1.02, 0.5, 0.5, 0, 1.2, 0.2], [0.6, 0.4, 0.4, 0.21, 1.4, -0.45], [0.4, 0.3, 0.45, -0.31, 0.95, -0.3]]) r.part(r.body, w, h, d, x, y, z, K)
    r.part(r.body, 0.36, 0.16, 0.36, 0, 0.66, -0.3, '#ff9fb4')
    const h = (r.head = r.group(r.body, 0, 1.36, 0.86))
    r.part(h, 0.62, 0.6, 0.55, 0, 0.04, 0.12, W)
    r.part(h, 0.62, 0.22, 0.2, 0, 0.12, 0.13, K)
    r.part(h, 0.56, 0.3, 0.18, 0, -0.14, 0.45, '#ffb3c6')
    for (const s of [-1, 1]) cube(h, 0.08, 0.08, 0.02, s * 0.13, -0.12, 0.545, mat.plain('#8a3047'), false)
    r.eyes(h, 0.16, 0.12, 0.405, 0.09)
    for (const s of [-1, 1]) {
      r.part(h, 0.1, 0.24, 0.1, s * 0.22, 0.42, 0.1, '#f4e7c6')
      r.part(h, 0.24, 0.12, 0.08, s * 0.38, 0.2, 0.08, W)
    }
    r.tail = r.group(r.body, 0, 1.4, -0.78)
    r.part(r.tail, 0.07, 0.6, 0.07, 0, -0.3, 0, W)
    r.part(r.tail, 0.14, 0.18, 0.14, 0, -0.62, 0, K)
    for (const [x, z, ph] of [[-0.3, 0.52, 0], [0.3, 0.52, Math.PI], [-0.3, -0.52, Math.PI], [0.3, -0.52, 0]]) r.leg(x, 0.75, z, 0.24, 0.75, 0.24, W, ph, K)
    r.height = 2.0
  },
  penguin(r) {
    const K = '#20232c'
    const O = '#ff9a1f'
    r.part(r.body, 0.72, 1.0, 0.62, 0, 0.7, 0, K)
    r.part(r.body, 0.52, 0.8, 0.06, 0, 0.66, 0.31, '#ffffff')
    const h = (r.head = r.group(r.body, 0, 1.28, 0.02))
    r.part(h, 0.56, 0.48, 0.52, 0, 0.12, 0, K)
    r.part(h, 0.4, 0.26, 0.04, 0, 0.08, 0.26, '#ffffff')
    r.part(h, 0.18, 0.1, 0.22, 0, 0.04, 0.34, O)
    r.eyes(h, 0.1, 0.16, 0.285, 0.08)
    for (const s of [-1, 1]) {
      const f = r.group(r.body, s * 0.38, 1.05, 0)
      r.part(f, 0.08, 0.56, 0.26, 0, -0.26, 0, K)
      r.flippers.push({ g: f, s })
    }
    for (const s of [-1, 1]) {
      const leg = r.leg(s * 0.16, 0.2, 0.0, 0.14, 0.2, 0.14, K, s > 0 ? 0 : Math.PI)
      r.part(leg, 0.22, 0.06, 0.3, 0, -0.2, 0.08, O)
    }
    r.waddle = true
    r.height = 1.75
  },
  bear(r) {
    const B = '#8a5630'
    const L = '#c99a6a'
    r.part(r.body, 1.1, 1.0, 1.5, 0, 1.18, 0, B)
    r.part(r.body, 1.0, 0.4, 0.9, 0, 1.75, 0.15, B)
    const h = (r.head = r.group(r.body, 0, 1.65, 0.9))
    r.part(h, 0.82, 0.74, 0.7, 0, 0.0, 0.12, B)
    r.part(h, 0.4, 0.3, 0.24, 0, -0.12, 0.55, L)
    r.part(h, 0.16, 0.1, 0.06, 0, -0.04, 0.68, '#1a1410')
    r.eyes(h, 0.2, 0.14, 0.475, 0.1)
    for (const s of [-1, 1]) {
      r.part(h, 0.24, 0.24, 0.12, s * 0.32, 0.42, 0.05, B)
      r.part(h, 0.12, 0.12, 0.04, s * 0.32, 0.42, 0.115, L)
    }
    r.tail = r.group(r.body, 0, 1.3, -0.78)
    r.part(r.tail, 0.2, 0.2, 0.14, 0, 0, 0, B)
    for (const [x, z, ph] of [[-0.34, 0.5, 0], [0.34, 0.5, Math.PI], [-0.34, -0.5, Math.PI], [0.34, -0.5, 0]]) r.leg(x, 0.8, z, 0.36, 0.8, 0.4, B, ph, '#5e3a20')
    r.height = 2.4
  },
  mammoth(r) {
    const B = '#6e3f22'
    const D = '#4f2a15'
    const Ivory = '#f6ecd2'
    r.part(r.body, 1.6, 1.4, 2.1, 0, 1.85, 0, B)
    r.part(r.body, 1.3, 0.6, 1.2, 0, 2.7, 0.35, B)
    for (let i = 0; i < 7; i++) r.part(r.body, 0.24, 0.5, 0.24, -0.72 + i * 0.24, 1.05, 0.95, D) // shaggy fringe
    for (let i = 0; i < 7; i++) r.part(r.body, 0.24, 0.5, 0.24, -0.72 + i * 0.24, 1.05, -0.95, D)
    const h = (r.head = r.group(r.body, 0, 2.35, 1.2))
    r.part(h, 1.1, 1.1, 0.9, 0, 0.1, 0.2, B)
    r.part(h, 0.9, 0.4, 0.6, 0, 0.75, 0.0, D)
    r.eyes(h, 0.3, 0.25, 0.655, 0.11)
    const trunk = r.group(h, 0, -0.2, 0.62)
    r.part(trunk, 0.36, 0.5, 0.34, 0, -0.25, 0.05, B)
    r.part(trunk, 0.3, 0.5, 0.3, 0, -0.7, 0.15, B)
    r.part(trunk, 0.26, 0.3, 0.32, 0, -1.0, 0.3, D)
    r.trunk = trunk
    for (const s of [-1, 1]) {
      r.part(h, 0.2, 0.2, 0.6, s * 0.38, -0.42, 0.75, Ivory)
      r.part(h, 0.18, 0.4, 0.18, s * 0.38, -0.32, 1.1, Ivory)
      r.part(h, 0.16, 0.6, 0.6, s * 0.62, 0.15, 0.0, D)
    }
    r.tail = r.group(r.body, 0, 2.0, -1.06)
    r.part(r.tail, 0.12, 0.6, 0.12, 0, -0.3, 0, D)
    for (const [x, z, ph] of [[-0.5, 0.7, 0], [0.5, 0.7, Math.PI], [-0.5, -0.7, Math.PI], [0.5, -0.7, 0]]) r.leg(x, 1.15, z, 0.5, 1.15, 0.52, B, ph, D)
    r.height = 3.4
  },
  raptor(r) {
    const G = '#3fb04c'
    const D = '#23722e'
    const Bl = '#d9f2b0'
    r.part(r.body, 0.72, 0.72, 1.3, 0, 1.45, 0, G)
    r.part(r.body, 0.5, 0.4, 0.9, 0, 1.25, 0.1, Bl)
    for (let i = 0; i < 4; i++) r.part(r.body, 0.74, 0.1, 0.12, 0, 1.6, -0.45 + i * 0.3, D)
    r.part(r.body, 0.4, 0.7, 0.4, 0, 1.95, 0.6, G) // neck
    const h = (r.head = r.group(r.body, 0, 2.25, 0.82))
    r.part(h, 0.52, 0.46, 0.8, 0, 0.0, 0.2, G)
    r.part(h, 0.46, 0.14, 0.62, 0, -0.26, 0.26, Bl)
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) cube(h, 0.06, 0.08, 0.06, s * 0.2, -0.17, 0.05 + i * 0.16, mat.plain('#ffffff'), false)
    for (const s of [-1, 1]) {
      cube(h, 0.06, 0.12, 0.12, s * 0.265, 0.1, 0.25, mat.lit('#ffe14a', 0.5), false)
      cube(h, 0.065, 0.12, 0.04, s * 0.27, 0.1, 0.27, mat.plain('#15151c'), false)
    }
    r.tail = r.group(r.body, 0, 1.5, -0.62)
    r.part(r.tail, 0.5, 0.5, 0.7, 0, 0, -0.35, G)
    r.part(r.tail, 0.32, 0.32, 0.7, 0, 0.05, -0.95, G)
    r.part(r.tail, 0.18, 0.18, 0.5, 0, 0.1, -1.45, D)
    for (const s of [-1, 1]) {
      const arm = r.group(r.body, s * 0.36, 1.45, 0.5)
      r.part(arm, 0.12, 0.4, 0.12, 0, -0.18, 0.08, G)
      arm.rotation.x = -0.6
    }
    for (const s of [-1, 1]) {
      const leg = r.leg(s * 0.28, 1.2, -0.05, 0.3, 0.75, 0.42, G, s > 0 ? 0 : Math.PI)
      r.part(leg, 0.2, 0.55, 0.2, 0, -0.95, -0.1, D)
      r.part(leg, 0.28, 0.1, 0.42, 0, -1.18, 0.08, D)
    }
    r.height = 2.75
    r.stride = 1.4
  },
  dragon(r) {
    const R = '#e8333a'
    const Dk = '#9e1824'
    const Gd = '#ffc23a'
    const Wg = '#3a5cff'
    r.part(r.body, 1.2, 1.1, 2.0, 0, 1.75, 0, R)
    r.part(r.body, 0.9, 0.5, 1.6, 0, 1.3, 0.1, Gd)
    for (let i = 0; i < 5; i++) r.part(r.body, 0.16, 0.34, 0.24, 0, 2.38, -0.8 + i * 0.4, Gd)
    r.part(r.body, 0.6, 1.1, 0.6, 0, 2.55, 0.95, R) // neck
    const h = (r.head = r.group(r.body, 0, 3.15, 1.2))
    r.part(h, 0.8, 0.66, 0.9, 0, 0.0, 0.2, R)
    r.part(h, 0.62, 0.32, 0.6, 0, -0.18, 0.72, R)
    r.part(h, 0.56, 0.12, 0.56, 0, -0.38, 0.62, Gd)
    for (const s of [-1, 1]) {
      r.part(h, 0.14, 0.5, 0.14, s * 0.26, 0.5, -0.1, Gd)
      cube(h, 0.06, 0.14, 0.16, s * 0.405, 0.12, 0.4, mat.lit('#ffe14a', 0.8), false)
      cube(h, 0.065, 0.14, 0.05, s * 0.41, 0.12, 0.44, mat.plain('#15151c'), false)
      cube(h, 0.08, 0.06, 0.04, s * 0.15, -0.12, 1.02, mat.plain('#3a0a0a'), false)
    }
    for (const s of [-1, 1]) {
      const w = r.group(r.body, s * 0.6, 2.25, 0.2)
      r.part(w, 1.8, 0.14, 0.2, s * 0.9, 0.0, 0.3, Dk)
      r.part(w, 1.7, 0.06, 1.3, s * 0.95, -0.02, -0.4, Wg)
      r.part(w, 0.16, 0.1, 1.1, s * 1.8, 0.0, -0.3, Dk)
      r.wings.push({ g: w, s, big: true })
    }
    r.tail = r.group(r.body, 0, 1.8, -1.0)
    r.part(r.tail, 0.7, 0.7, 0.9, 0, 0, -0.45, R)
    r.part(r.tail, 0.45, 0.45, 0.9, 0, -0.1, -1.2, R)
    r.part(r.tail, 0.28, 0.28, 0.8, 0, -0.2, -1.9, R)
    r.part(r.tail, 0.6, 0.12, 0.4, 0, -0.2, -2.4, Gd)
    for (const [x, z, ph] of [[-0.46, 0.65, 0], [0.46, 0.65, Math.PI], [-0.46, -0.65, Math.PI], [0.46, -0.65, 0]]) r.leg(x, 1.15, z, 0.42, 1.15, 0.46, R, ph, Dk)
    r.height = 3.9
  },
  // --- Base models added with the Lane zones (recoloured per species by `look`) -------------
  crab(r) {
    const R = '#ff5a3a'
    const D = '#c9351f'
    r.part(r.body, 0.9, 0.36, 0.7, 0, 0.42, 0, R)
    r.part(r.body, 0.7, 0.14, 0.56, 0, 0.66, 0, D)
    const h = (r.head = r.group(r.body, 0, 0.6, 0.36))
    for (const s of [-1, 1]) {
      r.part(h, 0.06, 0.26, 0.06, s * 0.16, 0.16, 0, D)
      r.part(h, 0.14, 0.14, 0.14, s * 0.16, 0.32, 0, '#ffffff')
      cube(h, 0.07, 0.07, 0.03, s * 0.16, 0.32, 0.075, mat.plain('#15151c', 0.3), false)
      const claw = r.group(r.body, s * 0.55, 0.5, 0.42)
      r.part(claw, 0.14, 0.14, 0.34, 0, 0, -0.1, R)
      r.part(claw, 0.3, 0.26, 0.3, 0, 0.04, 0.18, R)
      r.part(claw, 0.08, 0.1, 0.22, s * -0.06, 0.2, 0.26, D)
      r.wings.push({ g: claw, s })
    }
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) r.leg(s * 0.42, 0.36, -0.2 + i * 0.2, 0.08, 0.36, 0.08, D, (i + (s > 0 ? 1 : 0)) % 2 ? Math.PI : 0)
    r.height = 1.0
    r.stride = 0.5
  },
  fish(r) {
    const B = '#4fb6ff'
    const L = '#dff4ff'
    r.part(r.body, 0.5, 0.7, 1.2, 0, 0.75, 0, B)
    r.part(r.body, 0.44, 0.3, 0.9, 0, 0.5, 0.05, L)
    const h = (r.head = r.group(r.body, 0, 0.8, 0.6))
    r.part(h, 0.44, 0.56, 0.36, 0, 0, 0.12, B)
    r.part(h, 0.3, 0.08, 0.1, 0, -0.16, 0.32, '#1d2230')
    r.eyes(h, 0.16, 0.08, 0.305, 0.09)
    r.tail = r.group(r.body, 0, 0.78, -0.6)
    r.part(r.tail, 0.12, 0.3, 0.3, 0, 0, -0.12, B)
    r.part(r.tail, 0.1, 0.8, 0.26, 0, 0, -0.38, B)
    for (const s of [-1, 1]) {
      const f = r.group(r.body, s * 0.26, 0.6, 0.15)
      r.part(f, 0.3, 0.06, 0.24, s * 0.12, 0, 0, L)
      r.flippers.push({ g: f, s })
    }
    r.part(r.body, 0.08, 0.3, 0.36, 0, 1.2, -0.05, B)
    r.swim = true
    r.height = 1.5
  },
  turtle(r) {
    const S = '#3f9a4a'
    const K = '#8fd46a'
    const Sh = '#7a5a2a'
    r.part(r.body, 1.0, 0.42, 1.1, 0, 0.6, 0, Sh)
    r.part(r.body, 0.8, 0.22, 0.9, 0, 0.88, 0, '#9a7a3a')
    r.part(r.body, 0.4, 0.12, 0.4, 0, 1.02, 0, Sh)
    r.part(r.body, 0.92, 0.12, 1.0, 0, 0.36, 0, K)
    const h = (r.head = r.group(r.body, 0, 0.6, 0.62))
    r.part(h, 0.4, 0.36, 0.44, 0, 0.04, 0.16, K)
    r.eyes(h, 0.12, 0.1, 0.385, 0.08)
    r.tail = r.group(r.body, 0, 0.45, -0.58)
    r.part(r.tail, 0.14, 0.12, 0.24, 0, 0, -0.1, K)
    for (const [x, z, ph] of [[-0.4, 0.38, 0], [0.4, 0.38, Math.PI], [-0.4, -0.38, Math.PI], [0.4, -0.38, 0]]) r.leg(x, 0.36, z, 0.24, 0.36, 0.24, K, ph)
    r.height = 1.3
    r.stride = 0.6
  },
  frog(r) {
    const G = '#5fd04a'
    const L = '#d8f7a0'
    r.part(r.body, 0.8, 0.5, 0.8, 0, 0.5, 0, G)
    r.part(r.body, 0.66, 0.3, 0.5, 0, 0.4, 0.2, L)
    const h = (r.head = r.group(r.body, 0, 0.82, 0.3))
    r.part(h, 0.74, 0.32, 0.5, 0, 0, 0.06, G)
    for (const s of [-1, 1]) {
      r.part(h, 0.2, 0.2, 0.2, s * 0.24, 0.2, 0.1, G)
      cube(h, 0.12, 0.13, 0.04, s * 0.24, 0.22, 0.21, mat.plain('#15151c', 0.3), false)
      cube(h, 0.05, 0.05, 0.05, s * 0.24 - 0.03, 0.26, 0.22, mat.lit('#ffffff', 0.5), false)
    }
    r.part(h, 0.5, 0.04, 0.04, 0, -0.08, 0.32, '#c93a4a')
    r.tail = r.group(r.body, 0, 0.5, -0.4)
    for (const [x, z, ph, w] of [[-0.3, 0.3, 0, 0.14], [0.3, 0.3, 0, 0.14], [-0.38, -0.25, Math.PI, 0.24], [0.38, -0.25, Math.PI, 0.24]]) {
      const leg = r.leg(x, 0.28, z, w, 0.28, w * 1.4, G, ph)
      r.part(leg, w * 1.6, 0.05, w * 1.8, 0, -0.27, 0.06, G)
    }
    r.hop = true
    r.height = 1.2
  },
  snake(r) {
    const G = '#5aa83a'
    const Y = '#e8e070'
    const segs = []
    for (let i = 0; i < 7; i++) {
      const g = r.group(r.body, 0, 0.18, -0.9 + i * 0.26)
      r.part(g, 0.3 - Math.abs(i - 3) * 0.02, 0.3, 0.28, 0, 0, 0, i % 2 ? G : Y)
      segs.push(g)
    }
    const h = (r.head = r.group(r.body, 0, 0.9, 1.05))
    r.part(r.body, 0.3, 0.7, 0.3, 0, 0.5, 0.95, G)
    r.part(h, 0.62, 0.5, 0.18, 0, 0.05, -0.12, Y)
    r.part(h, 0.4, 0.32, 0.46, 0, 0.1, 0.14, G)
    r.part(h, 0.08, 0.04, 0.14, 0, -0.06, 0.42, '#d83a4a')
    r.eyes(h, 0.12, 0.18, 0.375, 0.08)
    r.tail = segs[0]
    r.segs = segs
    r.height = 1.4
  },
  jelly(r) {
    const P = '#ff9fe0'
    r.part(r.body, 1.0, 0.6, 1.0, 0, 1.5, 0, P)
    r.part(r.body, 0.7, 0.24, 0.7, 0, 1.9, 0, '#ffc8ef')
    r.part(r.body, 1.1, 0.1, 1.1, 0, 1.2, 0, '#ff7fd0')
    const h = (r.head = r.group(r.body, 0, 1.45, 0.5))
    r.eyes(h, 0.16, 0, 0.01, 0.1)
    const tent = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const g = r.group(r.body, Math.cos(a) * 0.32, 1.15, Math.sin(a) * 0.32)
      r.part(g, 0.08, 0.5, 0.08, 0, -0.25, 0, P)
      r.part(g, 0.06, 0.4, 0.06, 0, -0.68, 0, '#ffd8f4')
      tent.push({ g, s: i % 2 ? 1 : -1 })
    }
    r.flippers.push(...tent)
    r.swim = true
    r.height = 2.1
  },
  bird(r) {
    const B = '#4a7aff'
    const L = '#e6f0ff'
    const Y = '#ffb21f'
    r.part(r.body, 0.56, 0.62, 0.66, 0, 0.82, 0, B)
    r.part(r.body, 0.44, 0.44, 0.3, 0, 0.74, 0.22, L)
    r.tail = r.group(r.body, 0, 0.82, -0.36)
    r.part(r.tail, 0.32, 0.1, 0.42, 0, 0, -0.2, B)
    r.tail.rotation.x = 0.3
    const h = (r.head = r.group(r.body, 0, 1.24, 0.18))
    r.part(h, 0.44, 0.42, 0.42, 0, 0.1, 0.04, B)
    r.part(h, 0.16, 0.12, 0.24, 0, 0.04, 0.34, Y)
    r.eyes(h, 0.13, 0.16, 0.255, 0.08)
    for (const s of [-1, 1]) {
      const w = r.group(r.body, s * 0.3, 1.0, 0)
      r.part(w, 0.08, 0.44, 0.56, 0, -0.12, 0, B)
      r.wings.push({ g: w, s })
    }
    for (const s of [-1, 1]) {
      const leg = r.leg(s * 0.14, 0.5, 0, 0.07, 0.5, 0.07, Y, s > 0 ? 0 : Math.PI)
      r.part(leg, 0.18, 0.04, 0.22, 0, -0.49, 0.05, Y)
    }
    r.height = 1.7
  },
  horse(r) {
    const C = '#a8693a'
    const D = '#5a3418'
    r.part(r.body, 0.62, 0.62, 1.4, 0, 1.25, 0, C)
    const neck = r.group(r.body, 0, 1.45, 0.6)
    r.part(neck, 0.36, 0.7, 0.36, 0, 0.3, 0.05, C)
    neck.rotation.x = 0.45
    const h = (r.head = r.group(r.body, 0, 2.0, 0.92))
    r.part(h, 0.38, 0.4, 0.62, 0, 0, 0.12, C)
    r.part(h, 0.3, 0.26, 0.2, 0, -0.08, 0.48, '#d8a070')
    r.eyes(h, 0.17, 0.06, 0.2, 0.08)
    for (const s of [-1, 1]) r.part(h, 0.1, 0.2, 0.08, s * 0.12, 0.28, -0.08, C)
    r.tail = r.group(r.body, 0, 1.4, -0.72)
    r.part(r.tail, 0.18, 0.7, 0.18, 0, -0.3, -0.08, D)
    r.tail.rotation.x = 0.3
    for (const [x, z, ph] of [[-0.2, 0.52, 0], [0.2, 0.52, Math.PI], [-0.2, -0.52, Math.PI], [0.2, -0.52, 0]]) r.leg(x, 0.95, z, 0.16, 0.95, 0.16, C, ph, D)
    r.height = 2.4
    r.stride = 1.3
  },
  longneck(r) {
    const Y = '#ffcf5a'
    const S = '#a8682a'
    r.part(r.body, 0.66, 0.62, 1.2, 0, 1.75, 0, Y)
    for (const [x, y, z] of [[0.34, 1.9, 0.2], [-0.34, 1.7, -0.3], [0.34, 1.6, -0.35], [-0.34, 1.95, 0.3], [0, 2.07, -0.1]]) r.part(r.body, 0.04, 0.2, 0.24, x, y, z, S)
    const neck = r.group(r.body, 0, 2.0, 0.5)
    r.part(neck, 0.3, 1.5, 0.3, 0, 0.75, 0, Y)
    r.part(neck, 0.32, 0.2, 0.2, 0, 0.6, 0, S)
    neck.rotation.x = 0.2
    const h = (r.head = r.group(r.body, 0, 3.5, 0.85))
    r.part(h, 0.34, 0.34, 0.6, 0, 0, 0.1, Y)
    r.eyes(h, 0.16, 0.06, 0.17, 0.08)
    for (const s of [-1, 1]) r.part(h, 0.07, 0.24, 0.07, s * 0.1, 0.28, -0.1, S)
    r.tail = r.group(r.body, 0, 1.85, -0.6)
    r.part(r.tail, 0.1, 0.6, 0.1, 0, -0.3, 0, Y)
    for (const [x, z, ph] of [[-0.22, 0.45, 0], [0.22, 0.45, Math.PI], [-0.22, -0.45, Math.PI], [0.22, -0.45, 0]]) r.leg(x, 1.45, z, 0.16, 1.45, 0.16, Y, ph, S)
    r.height = 3.9
    r.stride = 1.6
  },
  ape(r) {
    const F = '#5a3a2a'
    const S = '#c8a080'
    r.part(r.body, 0.9, 0.9, 0.66, 0, 1.3, 0, F)
    r.part(r.body, 0.6, 0.56, 0.1, 0, 1.25, 0.34, S)
    const h = (r.head = r.group(r.body, 0, 1.98, 0.12))
    r.part(h, 0.58, 0.52, 0.5, 0, 0.06, 0, F)
    r.part(h, 0.42, 0.3, 0.16, 0, -0.02, 0.28, S)
    r.eyes(h, 0.12, 0.16, 0.255, 0.08)
    for (const s of [-1, 1]) {
      const arm = r.group(r.body, s * 0.56, 1.6, 0.05)
      r.part(arm, 0.28, 1.2, 0.28, 0, -0.55, 0, F)
      r.part(arm, 0.3, 0.2, 0.32, 0, -1.2, 0.04, S)
      r.wings.push({ g: arm, s })
    }
    for (const s of [-1, 1]) r.leg(s * 0.24, 0.86, 0, 0.3, 0.86, 0.3, F, s > 0 ? 0 : Math.PI, S)
    r.height = 2.4
  },
  cat(r) {
    const O = '#9aa0ab'
    const L = '#e8ebf0'
    r.part(r.body, 0.6, 0.55, 1.2, 0, 0.85, 0, O)
    r.part(r.body, 0.44, 0.3, 0.6, 0, 0.66, 0.2, L)
    const h = (r.head = r.group(r.body, 0, 1.25, 0.66))
    r.part(h, 0.56, 0.5, 0.48, 0, 0, 0.02, O)
    r.part(h, 0.3, 0.2, 0.2, 0, -0.1, 0.3, L)
    r.part(h, 0.1, 0.07, 0.05, 0, -0.03, 0.41, '#2a1d16')
    r.eyes(h, 0.14, 0.08, 0.265, 0.09)
    for (const s of [-1, 1]) r.part(h, 0.16, 0.22, 0.1, s * 0.17, 0.32, -0.02, O)
    r.tail = r.group(r.body, 0, 1.0, -0.6)
    r.part(r.tail, 0.16, 0.16, 0.7, 0, 0.1, -0.3, O)
    r.tail.rotation.x = -0.5
    for (const [x, z, ph] of [[-0.18, 0.4, 0], [0.18, 0.4, Math.PI], [-0.18, -0.42, Math.PI], [0.18, -0.42, 0]]) r.leg(x, 0.6, z, 0.17, 0.6, 0.17, O, ph, L)
    r.height = 1.9
    r.stride = 1.1
  },
}

// --- Extras (horns, halos, wings, flames...) added on top of a base model ---------------------
const box3 = new Box3()
const v3 = new Vector3()
function addExtras(r, look) {
  const ex = look.extras ?? []
  if (!ex.length) return
  r.root.updateMatrixWorld(true)
  const head = r.head ?? r.body
  box3.setFromObject(head)
  const hTop = box3.max.y
  const hFront = box3.max.z
  const hCenter = box3.getCenter(new Vector3())
  box3.setFromObject(r.body)
  const bTop = box3.max.y
  const bBack = box3.min.z
  const bFront = box3.max.z
  const bw = box3.max.x - box3.min.x
  // A world point under the head joint -> its local coords.
  const local = (x, y, z) => head.worldToLocal(v3.set(x, y, z)).clone()
  const glowMat = (c, k = 1.6) => mat.lit(c, k)
  const accent = look.glow ?? '#ffe680'
  for (const e of ex) {
    if (e === 'horn') {
      const p = local(hCenter.x, hTop, hCenter.z + 0.08)
      cube(head, 0.1, 0.42, 0.1, p.x, p.y + 0.2, p.z, glowMat(look.glow ?? '#fff2a8', 1.2), false).rotation.x = 0.35
    } else if (e === 'horns') {
      for (const s of [-1, 1]) {
        const p = local(hCenter.x + s * 0.18, hTop, hCenter.z)
        const h = cube(head, 0.1, 0.32, 0.1, p.x, p.y + 0.14, p.z, mat.plain('#2a1a1a', 0.5), false)
        h.rotation.z = s * -0.4
        cube(head, 0.07, 0.14, 0.07, p.x + s * 0.1, p.y + 0.32, p.z, glowMat(accent, 1.4), false)
      }
    } else if (e === 'crown') {
      const p = local(hCenter.x, hTop, hCenter.z)
      cube(head, 0.4, 0.1, 0.4, p.x, p.y + 0.05, p.z, mat.metal('#ffd23a'), false)
      for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) cube(head, 0.08, 0.14, 0.08, p.x + dx, p.y + 0.16, p.z + dz, mat.metal('#ffd23a'), false)
      cube(head, 0.08, 0.08, 0.04, p.x, p.y + 0.06, p.z + 0.21, glowMat('#ff4a6a', 1.2), false)
    } else if (e === 'halo') {
      const p = local(hCenter.x, hTop + 0.32, hCenter.z)
      const m = glowMat('#fff3a0', 2.2)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        cube(head, 0.12, 0.05, 0.12, p.x + Math.cos(a) * 0.26, p.y, p.z + Math.sin(a) * 0.26, m, false)
      }
    } else if (e === 'wings' || e === 'batwings') {
      const bat = e === 'batwings'
      const m = bat ? mat.plain(look.tint?.[0] ?? '#3a2a4a', 0.6) : mat.plain('#ffffff', 0.5)
      for (const s of [-1, 1]) {
        const w = r.group(r.body, s * bw * 0.45, bTop - 0.15, (bFront + bBack) * 0.5)
        cube(w, 0.9, 0.08, 0.5, s * 0.45, 0, 0, m, false)
        cube(w, 0.6, 0.06, 0.4, s * 1.0, 0.04, -0.12, m, false)
        if (!bat) cube(w, 0.5, 0.05, 0.3, s * 1.3, 0.06, -0.22, mat.plain('#eef6ff', 0.5), false)
        r.wings.push({ g: w, s, big: true })
      }
    } else if (e === 'flames' || e === 'crystals') {
      const fl = e === 'flames'
      const colors = fl ? ['#ff4a1a', '#ff9a1f', '#ffe14a'] : [look.glow ?? '#c48bff', '#8fdcff', '#ffffff']
      for (let i = 0; i < 4; i++) {
        const z = bBack + 0.15 + ((bFront - bBack - 0.3) * i) / 3
        const hgt = fl ? 0.3 + (i % 2) * 0.15 : 0.35 + (i % 2) * 0.2
        const c = cube(r.body, fl ? 0.2 : 0.16, hgt, fl ? 0.2 : 0.16, (i % 2 ? 0.1 : -0.1) * bw, bTop + hgt / 2 - 0.05, z, glowMat(colors[i % 3], fl ? 2.4 : 1.8), false)
        c.rotation.set(fl ? 0 : 0.3, i, fl ? 0 : (i % 2 ? 0.3 : -0.3))
      }
    } else if (e === 'hump') {
      r.part(r.body, 0.5, 0.36, 0.5, 0, bTop + 0.12, (bFront + bBack) * 0.5, '#c98a4a')
    } else if (e === 'sail') {
      for (let i = 0; i < 5; i++) r.part(r.body, 0.06, 0.4 + Math.sin((i / 4) * Math.PI) * 0.5, 0.26, 0, bTop + 0.2 + Math.sin((i / 4) * Math.PI) * 0.25, bBack + 0.2 + i * 0.24, '#ff8a4a')
    } else if (e === 'plates') {
      for (let i = 0; i < 5; i++) r.part(r.body, 0.06, 0.3, 0.24, 0, bTop + 0.1, bBack + 0.15 + ((bFront - bBack - 0.3) * i) / 4, '#e08a3a').rotation.x = 0.2
    } else if (e === 'spikes') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        r.part(r.body, 0.1, 0.1, 0.18, Math.cos(a) * bw * 0.5, bTop - 0.2 + Math.sin(a) * 0.15, (bFront + bBack) * 0.5 + Math.sin(a) * 0.3, '#f4f0e0')
      }
    } else if (e === 'stripes') {
      for (let i = 0; i < 4; i++) r.part(r.body, bw + 0.02, 0.1, 0.08, 0, bTop - 0.05, bBack + 0.25 + i * 0.25, '#1d1414')
    } else if (e === 'mane') {
      const p = local(hCenter.x, hTop, hCenter.z - 0.15)
      for (let i = 0; i < 3; i++) cube(head, 0.12, 0.22, 0.16, p.x, p.y - i * 0.18, p.z - 0.08 - i * 0.12, r.m(look.glow ?? '#5a3418'), false)
    } else if (e === 'longnose') {
      const p = local(hCenter.x, hCenter.y, hFront)
      cube(head, 0.08, 0.08, 0.7, p.x, p.y - 0.04, p.z + 0.33, r.m('#d8dde6'), false)
    } else if (e === 'fin') {
      r.part(r.body, 0.08, 0.4, 0.4, 0, bTop + 0.12, (bFront + bBack) * 0.5 - 0.1, '#5a7aa8').rotation.x = -0.4
    }
  }
}

const _box = new Box3()
const _size = new Vector3()
export function buildAnimal(id, { shiny = false } = {}) {
  const def = animalDef(id)
  const look = def?.look ?? {}
  const r = makeRig(shiny, look)
  ;(BUILD[def?.base ?? id] ?? BUILD[id] ?? BUILD.chicken)(r)
  addExtras(r, look)
  // Calibrated size (config SIZE): the base model is scaled to the species' height.
  const scale = def?.size ? def.size / r.height : 1
  if (Math.abs(scale - 1) > 0.001) {
    r.root.children.forEach((c) => {
      c.position.multiplyScalar(scale)
      c.scale.multiplyScalar(scale)
    })
    r.height *= scale
    r.stride *= scale
  }
  r.scale = scale
  // Footprint radius (half the longest side seen from above), for pen margins and spacing.
  r.root.updateMatrixWorld(true)
  _box.setFromObject(r.root).getSize(_size)
  r.radius = Math.max(_size.x, _size.z) / 2
  r.root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = false
    }
  })
  compact(r.root) // one draw call per joint and material
  let walkPhase = 0
  let flap = 0
  // speed: m/s the animal moves (0 = standing).
  r.animate = (dt, speed, t, mode = 'walk') => {
    const moving = speed > 0.05
    walkPhase += dt * (moving ? (speed / r.stride) * Math.PI * 2 : 0)
    const k = mode === 'flail' ? 1 : Math.min(1, speed / 1.5)
    let bodyY = 0
    if (r.hop && moving) bodyY = Math.abs(Math.sin(walkPhase * 0.5)) * 0.35
    else if (moving) bodyY = Math.abs(Math.sin(walkPhase)) * 0.05
    else bodyY = Math.sin(t * 2.2) * 0.012
    if (mode === 'flail') bodyY = 0
    r.body.position.y = bodyY
    for (const L of r.legs) {
      const swing = mode === 'flail' ? Math.sin(t * 22 + L.phase) * 0.9 : r.hop ? (moving ? -Math.abs(Math.sin(walkPhase * 0.5)) * 0.8 : 0) : Math.sin(walkPhase + L.phase) * 0.55 * k
      L.pivot.rotation.x = swing
      L.pivot.userData.y0 ??= L.pivot.position.y
      L.pivot.position.y = L.pivot.userData.y0 + (r.hop ? bodyY * 0.8 : 0)
    }
    if (r.waddle) r.body.rotation.z = moving ? Math.sin(walkPhase) * 0.12 : 0
    if (r.head) {
      if (mode === 'flail') r.head.rotation.set(Math.sin(t * 13) * 0.3, Math.sin(t * 9) * 0.4, 0)
      else if (moving) r.head.rotation.set(Math.sin(walkPhase * 2) * 0.06, 0, 0)
      else r.head.rotation.set(Math.sin(t * 0.7) * 0.08, Math.sin(t * 0.45) * 0.45, 0)
    }
    if (r.tail) r.tail.rotation.y = Math.sin(t * (mode === 'flail' ? 18 : 3)) * (mode === 'flail' ? 0.6 : 0.25)
    if (r.swim) r.body.position.y = 0.25 + Math.sin(t * 2.4) * 0.12 // fish and jellies hover
    if (r.segs) r.segs.forEach((g, i) => (g.position.x = Math.sin(t * (mode === 'flail' ? 14 : 4) - i * 0.9) * 0.14))
    if (r.trunk) r.trunk.rotation.x = Math.sin(t * 1.4) * 0.15
    flap = mode === 'fly' || mode === 'flail' ? 1 : Math.max(0, flap - dt)
    for (const w of r.wings) {
      const amp = w.big ? (mode === 'fly' || mode === 'flail' ? 0.7 : 0.15) : flap > 0 ? 0.9 : 0.05
      const f = w.big ? (mode === 'idle' || mode === 'walk' ? 1.6 : 6) : 18
      w.g.rotation.z = w.s * (Math.sin(t * f) * amp + (w.big ? 0.2 : 0))
    }
    for (const f of r.flippers) f.g.rotation.z = f.s * (0.15 + (moving || mode !== 'walk' ? Math.abs(Math.sin(t * 9)) * 0.5 : 0))
  }
  return r
}

// --- In the pen ------------------------------------------------------------------------------
let nextId = 1
// Where each plot's south fence is (Expand Pen moves it): plot x offset -> z. game.js sets
// the player's (ox 0); a plot not set is at level 0.
const penSouths = new Map()
export function setPenSouth(ox, z) {
  penSouths.set(ox, z)
}
const southOf = (ox) => penSouths.get(ox) ?? penSouth(0)
// Pen interior with a margin, minus the decorated corners. ox: the plot's x offset (another
// player's pen, see remote.js; 0 = the player's own). r: the animal's footprint radius, so a
// big one (dinosaurs...) keeps its whole body inside the fence.
function penBounds(ox = 0, r = 0) {
  const p = BASE.pen
  const m = Math.max(1.6, r * 0.85 + 0.5)
  return { minX: ox + p.x - p.half + m, maxX: ox + p.x + p.half - m, minZ: p.z - p.half + m, maxZ: southOf(ox) - m }
}
function inCorner(x, z, ox = 0) {
  x -= ox
  const p = BASE.pen
  const E = p.x + p.half
  const S = southOf(ox)
  const N = p.z - p.half
  return (x > E - 4.5 && z > S - 3) || (x > E - 2.8 && z < N + 4.6)
}

export class PenAnimal {
  // data: { id, species, shiny }. ox: the plot's x offset (0 = the player's own pen).
  constructor(scene, data, income, ox = 0) {
    this.data = data
    this.ox = ox
    this.uid = data.uid ?? nextId++
    this.def = animalDef(data.species)
    this.rarity = rarityDef(this.def.rarity)
    this.rig = buildAnimal(data.species, { shiny: data.shiny })
    this.root = this.rig.root
    scene.add(this.root)
    this.state = 'idle'
    this.timer = 0.5 + Math.random() * 2
    this.target = { x: 0, z: 0 }
    this.speed = 0
    this.fly = null
    this.income = income
    const name = `${data.shiny ? 'Shiny ' : ''}${this.def.name}`
    const rarity = this.rarity
    this.label = billboard(420, 200, 2.1, (ctx, w) => {
      outlined(ctx, data.shiny ? `Shiny ${rarity.name}` : rarity.name, w / 2, 34, { px: 34, fill: data.shiny ? '#ffe14a' : rarity.color, stroke: rarity.dark, width: 9 })
      outlined(ctx, name, w / 2, 90, { px: 54, width: 12 })
      outlined(ctx, `${money(this.income)}/s`, w / 2, 152, { px: 44, fill: '#b8ff3a', stroke: '#1f3a06', width: 10 })
    })
    scene.add(this.label)
    this.labelY = this.rig.height + 1.15
  }

  setIncome(v) {
    if (Math.round(v) === Math.round(this.income)) return
    this.income = v
    this.label.redraw()
  }

  placeRandom() {
    const b = penBounds(this.ox, this.rig.radius)
    for (let i = 0; i < 20; i++) {
      const x = b.minX + Math.random() * (b.maxX - b.minX)
      const z = b.minZ + Math.random() * (b.maxZ - b.minZ)
      if (!inCorner(x, z, this.ox)) {
        this.root.position.set(x, 0, z)
        break
      }
    }
    this.root.rotation.y = Math.random() * Math.PI * 2
  }

  // Jump from `from` into the pen along an arc (the harpoon delivery).
  flyFrom(from, duration, onLand) {
    const b = penBounds(this.ox, this.rig.radius)
    let tx = b.minX + 2 + Math.random() * (b.maxX - b.minX - 4)
    let tz = b.minZ + 2 + Math.random() * (b.maxZ - b.minZ - 4)
    if (inCorner(tx, tz, this.ox)) {
      tx = this.ox + BASE.pen.x
      tz = BASE.pen.z
    }
    this.fly = { from: { ...from }, to: { x: tx, z: tz }, t: 0, d: duration, onLand }
    this.state = 'fly'
    this.root.position.set(from.x, from.y ?? 0, from.z)
  }

  pickTarget() {
    const b = penBounds(this.ox, this.rig.radius)
    for (let i = 0; i < 12; i++) {
      const x = b.minX + Math.random() * (b.maxX - b.minX)
      const z = b.minZ + Math.random() * (b.maxZ - b.minZ)
      if (!inCorner(x, z, this.ox)) {
        this.target.x = x
        this.target.z = z
        return
      }
    }
  }

  update(dt, t, others) {
    const p = this.root.position
    if (this.state === 'fly') {
      const f = this.fly
      f.t += dt
      const k = Math.min(1, f.t / f.d)
      const height = 7 + Math.hypot(f.to.x - f.from.x, f.to.z - f.from.z) * 0.12
      p.x = f.from.x + (f.to.x - f.from.x) * k
      p.z = f.from.z + (f.to.z - f.from.z) * k
      p.y = (f.from.y ?? 0) * (1 - k) + Math.sin(k * Math.PI) * height
      this.root.rotation.y = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z)
      this.root.rotation.x = Math.sin(k * Math.PI * 2) * 0.25
      this.rig.animate(dt, 0, t, 'fly')
      if (k >= 1) {
        p.y = 0
        this.root.rotation.x = 0
        this.state = 'idle'
        this.timer = 1 + Math.random()
        this.fly = null
        f.onLand?.(this)
      }
    } else if (this.state === 'idle') {
      this.speed = Math.max(0, this.speed - dt * 6)
      this.timer -= dt
      if (this.timer <= 0) {
        this.pickTarget()
        this.state = 'walk'
      }
      this.rig.animate(dt, this.speed, t, 'idle')
    } else if (this.state === 'walk') {
      const dx = this.target.x - p.x
      const dz = this.target.z - p.z
      const d = Math.hypot(dx, dz)
      const want = Math.atan2(dx, dz)
      let diff = want - this.root.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      this.root.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4)
      const facing = Math.abs(diff) < 0.6
      this.speed += ((facing ? this.def.speed : 0.3) - this.speed) * Math.min(1, dt * 4)
      if (d < 0.4) {
        this.state = 'idle'
        this.timer = 1.5 + Math.random() * 4
      } else {
        p.x += Math.sin(this.root.rotation.y) * this.speed * dt
        p.z += Math.cos(this.root.rotation.y) * this.speed * dt
      }
      this.rig.animate(dt, this.speed, t, 'walk')
    }
    // Keep a little space from the others, and inside the fence.
    if (this.state !== 'fly') {
      for (const o of others) {
        if (o === this || o.state === 'fly') continue
        const dx = p.x - o.root.position.x
        const dz = p.z - o.root.position.z
        const d = Math.hypot(dx, dz)
        const min = Math.max((this.rig.height + o.rig.height) * 0.32, (this.rig.radius + o.rig.radius) * 0.6)
        if (d > 0.001 && d < min) {
          p.x += (dx / d) * (min - d) * 0.5
          p.z += (dz / d) * (min - d) * 0.5
        }
      }
      const b = penBounds(this.ox, this.rig.radius)
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x))
      p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z))
    }
    this.label.position.set(p.x, p.y + this.labelY, p.z)
  }

  dispose(scene) {
    scene.remove(this.root)
    scene.remove(this.label)
    this.label.material.map.dispose()
    this.label.material.dispose()
  }
}

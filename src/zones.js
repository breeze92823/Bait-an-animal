import { Group, PerspectiveCamera, SRGBColorSpace, WebGLRenderTarget } from 'three'
import { BASE, FOG, LANE, ZONES, laneLength, zoneStart } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { bake } from './bake.js'
import { box, cube, mat } from './voxel.js'
import { colliderShift, solidBox } from './propkit.js'
import { createEmitter } from './particles.js'

// The ten zones of the Lane north of the canyon (Meadow, Coral, Snow, Desert, Crystal,
// Jungle, Golden, Ancient, Hell, Angelic), each LANE.zoneLength long and 2 * wildHalf wide:
// themed ground, side cliffs, props on both sides of
// the reel corridor (|x| < LANE.corridor stays clear), emissive "light" pieces that the
// bloom picks up, and GPU particles (pollen, bubbles, snow, sand, sparkles, fireflies,
// embers, feathers). Every zone is baked into one group (one draw call per material) and
// hidden with its particles when it is further than LANE.viewDistance from the camera;
// the fog closes in to match the view distance while the camera is out in the Lane.

const HZ = BASE.harpoon.z // the Lane is measured from the harpoon, running north (-z)
const W = LANE.wildHalf
const CORR = LANE.corridor

// World z range of zone i: z0 (south edge) > z1 (north edge).
export function zoneRange(i) {
  const z0 = i === 0 ? LANE.canyonEnd : HZ - zoneStart(i)
  return { z0, z1: HZ - zoneStart(i + 1) }
}

// --- Shared prop pieces --------------------------------------------------------------------------
function wall(g, x0, z0, x1, z1, h, color, top, rand) {
  const w = Math.abs(x1 - x0)
  const d = Math.abs(z1 - z0)
  const off = [rand() * 4, rand() * 4]
  box(g, w, h, d, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, mat.studs(color), { uvOffset: off })
  box(g, w + 0.5, 0.9, d + 0.5, (x0 + x1) / 2, h + 0.35, (z0 + z1) / 2, mat.studs(top), { uvOffset: off })
  solidBox(w / 2, 30, d / 2, (x0 + x1) / 2, 30, (z0 + z1) / 2)
}
function tree(g, x, z, s, trunk, leaves, rand, { tall = 1, tiers = 2 } = {}) {
  const h = (3 + rand() * 2) * s * tall
  box(g, 0.7 * s, h, 0.7 * s, x, h / 2, z, mat.wood(trunk))
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.28
    const w = (3.4 + rand()) * s * k
    box(g, w, 1.6 * s, w, x + (rand() - 0.5) * 0.6, h + i * 1.4 * s, z + (rand() - 0.5) * 0.6, mat.studs(leaves[i % leaves.length]), { ry: rand() * 3 })
  }
}
function pine(g, x, z, s, trunk, green, snow, rand) {
  const h = (1.4 + rand()) * s
  box(g, 0.6 * s, h, 0.6 * s, x, h / 2, z, mat.wood(trunk))
  for (let i = 0; i < 4; i++) {
    const w = (3.2 - i * 0.7) * s
    const y = h + i * 1.15 * s
    box(g, w, 1.2 * s, w, x, y, z, mat.studs(green), { ry: i * 0.4 })
    if (snow) box(g, w * 0.9, 0.3 * s, w * 0.9, x, y + 0.7 * s, z, mat.studs(snow), { ry: i * 0.4 })
  }
}
function rock(g, x, z, s, color, rand) {
  const h = (0.8 + rand() * 1.4) * s
  box(g, (1.6 + rand()) * s, h, (1.4 + rand()) * s, x, h / 2, z, mat.studs(color), { ry: rand() * 3 })
  box(g, (0.9 + rand() * 0.6) * s, h * 0.7, (0.9 + rand() * 0.6) * s, x + 0.5 * s, h + h * 0.3, z - 0.3 * s, mat.studs(color), { ry: rand() * 3 })
}
function bush(g, x, z, s, color, rand) {
  box(g, 1.8 * s, 1.1 * s, 1.6 * s, x, 0.55 * s, z, mat.studs(color), { ry: rand() * 3 })
  box(g, 1.1 * s, 0.8 * s, 1.1 * s, x + 0.5 * s, 1.2 * s, z, mat.studs(color), { ry: rand() * 3 })
}
function flowers(g, x, z, rand, colors) {
  for (let i = 0; i < 4; i++) {
    const fx = x + (rand() - 0.5) * 2.4
    const fz = z + (rand() - 0.5) * 2.4
    cube(g, 0.08, 0.4, 0.08, fx, 0.2, fz, mat.plain('#3f9a3a'), false)
    cube(g, 0.3, 0.12, 0.3, fx, 0.45, fz, mat.plain(colors[Math.floor(rand() * colors.length)], 0.6), false)
  }
}
function crystal(g, x, z, s, color, k, rand) {
  for (let i = 0; i < 4; i++) {
    const h = (1.2 + rand() * 2.6) * s
    const m = cube(g, 0.5 * s, h, 0.5 * s, x + (rand() - 0.5) * 1.2 * s, h / 2 - 0.1, z + (rand() - 0.5) * 1.2 * s, mat.lit(color, k))
    m.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7)
  }
}
function pillar(g, x, z, h, color, capColor) {
  box(g, 1.4, 0.5, 1.4, x, 0.25, z, mat.studs(capColor))
  box(g, 1, h, 1, x, h / 2 + 0.5, z, mat.studs(color))
  box(g, 1.5, 0.5, 1.5, x, h + 0.75, z, mat.studs(capColor))
}
// A side spot (outside the corridor) inside zone range.
function spot(rand, z0, z1, margin = 2) {
  const side = rand() < 0.5 ? -1 : 1
  return { x: side * (CORR + 1.5 + rand() * (W - CORR - 2 - margin)), z: z0 - margin - rand() * (z0 - z1 - margin * 2), side }
}

// --- Zone themes: props(g, z0, z1, rand) + particles -------------------------------------------
const THEMES = {
  meadow(g, z0, z1, rand) {
    for (let i = 0; i < 16; i++) {
      const s = spot(rand, z0, z1, 3)
      tree(g, s.x, s.z, 0.9 + rand() * 0.5, '#9a6a3e', ['#5fd047', '#8ae35a'], rand)
    }
    for (let i = 0; i < 18; i++) {
      const s = spot(rand, z0, z1)
      bush(g, s.x, s.z, 0.7 + rand() * 0.6, rand() < 0.5 ? '#3fb35a' : '#5fcf4a', rand)
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1)
      rock(g, s.x, s.z, 0.8 + rand() * 0.5, '#a99cf0', rand)
    }
    for (let i = 0; i < 26; i++) {
      const x = (rand() * 2 - 1) * (W - 2)
      flowers(g, x, z0 - 2 - rand() * (z0 - z1 - 4), rand, ['#ffffff', '#ffd23a', '#b77bff', '#4fb6ff', '#ff7fb3'])
    }
    for (let i = 0; i < 4; i++) {
      const s = spot(rand, z0, z1, 4)
      box(g, 6, 0.9, 1, s.x, 0.45, s.z, mat.wood('#c9703a'), { ry: rand() * 3 }) // fallen logs
    }
  },
  coral(g, z0, z1, rand) {
    const corals = ['#ff7fb3', '#ff9a5a', '#b77bff', '#ff5f8e', '#ffd23a']
    for (let i = 0; i < 22; i++) {
      const s = spot(rand, z0, z1)
      const c = corals[Math.floor(rand() * corals.length)]
      const h = 1.5 + rand() * 3
      box(g, 0.6, h, 0.6, s.x, h / 2, s.z, mat.studs(c))
      for (let k = 0; k < 3; k++) {
        const a = rand() * Math.PI * 2
        const bh = 0.8 + rand() * 1.4
        box(g, 0.45, bh, 0.45, s.x + Math.cos(a) * 0.7, h * (0.4 + rand() * 0.4) + bh / 2, s.z + Math.sin(a) * 0.7, mat.studs(c))
      }
      cube(g, 0.5, 0.5, 0.5, s.x, h + 0.2, s.z, mat.lit(c, 0.9))
    }
    for (let i = 0; i < 26; i++) {
      const s = spot(rand, z0, z1)
      const h = 2 + rand() * 4
      cube(g, 0.25, h, 0.25, s.x, h / 2, s.z, mat.plain(rand() < 0.5 ? '#2fb59a' : '#3fd16a', 0.8)).rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4)
    }
    for (let i = 0; i < 14; i++) {
      const s = spot(rand, z0, z1)
      box(g, 0.9, 0.18, 0.9, s.x, 0.09, s.z, mat.plain('#ff8a5a', 0.6), { ry: rand() * 3 }) // starfish
      box(g, 1.4, 0.18, 0.3, s.x, 0.1, s.z, mat.plain('#ff8a5a', 0.6), { ry: rand() * 3 })
    }
    for (let i = 0; i < 6; i++) {
      const s = spot(rand, z0, z1, 5)
      box(g, 7 + rand() * 4, 0.08, 5 + rand() * 3, s.x, 0.05, s.z, mat.glass('#3fc8ff', 0.6), { shadow: false }) // tide pools
    }
    for (let i = 0; i < 8; i++) {
      const s = spot(rand, z0, z1)
      rock(g, s.x, s.z, 0.8, '#e6d2a0', rand)
    }
  },
  snow(g, z0, z1, rand) {
    for (let i = 0; i < 20; i++) {
      const s = spot(rand, z0, z1, 3)
      pine(g, s.x, s.z, 0.9 + rand() * 0.6, '#7a5a3a', '#2f8a5a', '#ffffff', rand)
    }
    for (let i = 0; i < 12; i++) {
      const s = spot(rand, z0, z1)
      crystal(g, s.x, s.z, 0.9, '#9fe4ff', 0.5, rand)
    }
    for (let i = 0; i < 6; i++) {
      const s = spot(rand, z0, z1, 4)
      // Snowman.
      cube(g, 1.4, 1.4, 1.4, s.x, 0.7, s.z, mat.studs('#ffffff'))
      cube(g, 1, 1, 1, s.x, 1.9, s.z, mat.studs('#ffffff'))
      cube(g, 0.7, 0.7, 0.7, s.x, 2.75, s.z, mat.studs('#ffffff'))
      cube(g, 0.12, 0.12, 0.5, s.x, 2.75, s.z + 0.5, mat.plain('#ff8a1f'))
      cube(g, 0.8, 0.12, 0.8, s.x, 3.15, s.z, mat.plain('#2a2a30'))
      cube(g, 0.5, 0.45, 0.5, s.x, 3.4, s.z, mat.plain('#2a2a30'))
    }
    for (let i = 0; i < 14; i++) {
      const s = spot(rand, z0, z1)
      box(g, 2.5 + rand() * 2, 0.6 + rand() * 0.6, 2 + rand() * 2, s.x, 0.3, s.z, mat.studs('#f4fbff'), { ry: rand() * 3 })
    }
  },
  desert(g, z0, z1, rand) {
    for (let i = 0; i < 22; i++) {
      const s = spot(rand, z0, z1)
      const h = 2 + rand() * 3
      const green = mat.studs(rand() < 0.5 ? '#4caf3a' : '#5fbf3a')
      box(g, 0.8, h, 0.8, s.x, h / 2, s.z, green)
      for (const k of [-1, 1]) {
        if (rand() < 0.3) continue
        const ay = h * (0.4 + rand() * 0.3)
        box(g, 0.8, 0.5, 0.5, s.x + k * 0.65, ay, s.z, green)
        box(g, 0.5, 1.2, 0.5, s.x + k * 0.9, ay + 0.6, s.z, green)
      }
      cube(g, 0.3, 0.2, 0.3, s.x, h + 0.1, s.z, mat.plain('#ff6fae', 0.5))
    }
    for (let i = 0; i < 7; i++) {
      const s = spot(rand, z0, z1, 5)
      const h = 4 + rand() * 5
      box(g, 5 + rand() * 3, h, 4 + rand() * 3, s.x, h / 2, s.z, mat.studs('#e0995a'), { ry: rand() * 0.5 }) // mesas
      box(g, 5.6, 0.8, 4.6, s.x, h + 0.2, s.z, mat.studs('#c97a3a'))
    }
    for (let i = 0; i < 8; i++) {
      const s = spot(rand, z0, z1)
      for (let k = 0; k < 4; k++) cube(g, 0.25, 0.25, 1.4, s.x + k * 0.5, 0.15, s.z, mat.plain('#f4eedd')).rotation.y = 0.3 // bones
    }
    for (let i = 0; i < 12; i++) {
      const s = spot(rand, z0, z1)
      box(g, 3 + rand() * 3, 0.5, 2 + rand() * 2, s.x, 0.25, s.z, mat.studs('#ffd889'), { ry: rand() * 3 }) // dunes
    }
  },
  crystal(g, z0, z1, rand) {
    const colors = ['#c48bff', '#7fd8ff', '#ff8fe0', '#8affd1']
    for (let i = 0; i < 26; i++) {
      const s = spot(rand, z0, z1)
      crystal(g, s.x, s.z, 1 + rand() * 0.8, colors[Math.floor(rand() * colors.length)], 1.6, rand)
    }
    for (let i = 0; i < 14; i++) {
      const s = spot(rand, z0, z1)
      rock(g, s.x, s.z, 1.2, '#5a5470', rand)
    }
    // Mine-cart rails up the middle.
    for (let z = z0 - 1; z > z1 + 1; z -= 1.6) box(g, 2.4, 0.16, 0.4, 0, 0.08, z, mat.wood('#7a5032'), { shadow: false })
    for (const x of [-0.8, 0.8]) box(g, 0.14, 0.18, z0 - z1 - 2, x, 0.2, (z0 + z1) / 2, mat.metal('#9aa3b5'), { shadow: false })
    for (let i = 0; i < 6; i++) {
      const s = spot(rand, z0, z1, 4)
      box(g, 0.4, 5, 0.4, s.x, 2.5, s.z, mat.wood('#7a5032'))
      cube(g, 0.5, 0.5, 0.5, s.x, 5.2, s.z, mat.lit('#ffd27a', 2.4)) // lanterns
    }
  },
  jungle(g, z0, z1, rand) {
    for (let i = 0; i < 18; i++) {
      const s = spot(rand, z0, z1, 3)
      tree(g, s.x, s.z, 1.2 + rand() * 0.5, '#7a4a2a', ['#2f9a3a', '#3fb84a', '#257a2e'], rand, { tall: 1.6, tiers: 3 })
      for (let k = 0; k < 3; k++) cube(g, 0.12, 3 + rand() * 3, 0.12, s.x + (rand() - 0.5) * 3, 4 + rand() * 2, s.z + (rand() - 0.5) * 3, mat.plain('#3f9a2a')) // vines
    }
    for (let i = 0; i < 30; i++) {
      const s = spot(rand, z0, z1)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + rand()
        cube(g, 1.8, 0.12, 0.5, s.x + Math.cos(a) * 0.7, 0.4, s.z + Math.sin(a) * 0.7, mat.plain('#3fbf4a', 0.8)).rotation.set(0, -a, 0.4) // ferns
      }
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1)
      flowers(g, s.x, s.z, rand, ['#ff4a6a', '#ffd23a', '#ff8a1f'])
    }
    for (let i = 0; i < 4; i++) {
      const s = spot(rand, z0, z1, 6)
      for (let y = 0; y < 6; y++) box(g, 1.2, 0.12, 0.2, s.x, 0.4 + y * 0.7, s.z, mat.wood('#9a6a3e')) // ladder
      for (const k of [-0.5, 0.5]) box(g, 0.14, 4.5, 0.14, s.x + k, 2.25, s.z, mat.wood('#9a6a3e'))
    }
  },
  golden(g, z0, z1, rand) {
    for (let i = 0; i < 16; i++) {
      const s = spot(rand, z0, z1, 3)
      tree(g, s.x, s.z, 1 + rand() * 0.4, '#c9a24a', ['#ffd23a', '#ffe680'], rand)
    }
    for (let i = 0; i < 16; i++) {
      const s = spot(rand, z0, z1)
      for (let k = 0; k < 6; k++) cube(g, 0.5, 0.12, 0.5, s.x + (rand() - 0.5) * 1.6, 0.06 + k * 0.12, s.z + (rand() - 0.5) * 1.6, mat.metal('#ffd23a')) // coin piles
    }
    for (let i = 0; i < 8; i++) {
      const s = spot(rand, z0, z1, 4)
      pillar(g, s.x, s.z, 4 + rand() * 3, '#fff1c0', '#f2b630')
      cube(g, 0.6, 0.6, 0.6, s.x, 8.6, s.z, mat.lit('#fff07a', 2)).rotation.y = 0.8
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1)
      box(g, 1.2, 0.8, 0.8, s.x, 0.4, s.z, mat.metal('#ffd23a'), { ry: rand() * 3 }) // gold bars
    }
  },
  ancient(g, z0, z1, rand) {
    for (let i = 0; i < 16; i++) {
      const s = spot(rand, z0, z1, 3)
      tree(g, s.x, s.z, 1.3 + rand() * 0.4, '#6a4a2a', ['#3f7a3a', '#4f8a3a'], rand, { tall: 1.8, tiers: 2 })
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1)
      rock(g, s.x, s.z, 1.4, '#8a8070', rand)
    }
    // A smoking volcano at the zone's far corner and stone ruins.
    const vx = rand() < 0.5 ? -W + 8 : W - 8
    const vz = z1 + 14
    for (let k = 0; k < 4; k++) box(g, 12 - k * 2.6, 3, 12 - k * 2.6, vx, 1.5 + k * 3, vz, mat.studs(k < 3 ? '#5a5048' : '#3a3430'))
    box(g, 2.5, 0.4, 2.5, vx, 12.2, vz, mat.lit('#ff6a1f', 2.6))
    for (let i = 0; i < 8; i++) {
      const s = spot(rand, z0, z1)
      pillar(g, s.x, s.z, 2 + rand() * 4, '#a8a090', '#8a8070')
    }
    for (let i = 0; i < 8; i++) {
      const s = spot(rand, z0, z1)
      for (let k = 0; k < 5; k++) cube(g, 0.3, 1.2 - k * 0.15, 0.3, s.x + k * 0.6, 0.6, s.z, mat.plain('#f4eedd')).rotation.z = 0.3 - k * 0.15 // ribs
    }
  },
  hell(g, z0, z1, rand) {
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1, 5)
      box(g, 5 + rand() * 4, 0.1, 4 + rand() * 3, s.x, 0.06, s.z, mat.lit('#ff5a14', 2.2), { shadow: false }) // lava pools
      box(g, 6 + rand() * 4, 0.3, 0.6, s.x, 0.15, s.z + 2.5, mat.studs('#2a1414'), { shadow: false })
    }
    for (let i = 0; i < 16; i++) {
      const s = spot(rand, z0, z1, 3)
      const h = 3 + rand() * 3
      box(g, 0.6, h, 0.6, s.x, h / 2, s.z, mat.plain('#1d1414'))
      for (let k = 0; k < 3; k++) cube(g, 2, 0.3, 0.3, s.x + (rand() - 0.5), h * (0.5 + k * 0.2), s.z, mat.plain('#1d1414')).rotation.set(0, rand() * 3, (rand() - 0.5) * 1.2) // dead branches
    }
    for (let i = 0; i < 14; i++) {
      const s = spot(rand, z0, z1)
      rock(g, s.x, s.z, 1.1, '#2a1a24', rand)
      cube(g, 0.3, 0.6, 0.3, s.x, 0.6, s.z + 0.8, mat.lit('#ff8a1f', 2.4))
    }
    for (let i = 0; i < 6; i++) {
      const s = spot(rand, z0, z1, 4)
      pillar(g, s.x, s.z, 5, '#4a1414', '#2a0a0a')
      cube(g, 0.9, 1.2, 0.9, s.x, 6.6, s.z, mat.lit('#ffb02e', 3)) // fire braziers
    }
  },
  angelic(g, z0, z1, rand) {
    for (let i = 0; i < 18; i++) {
      const s = spot(rand, z0, z1)
      box(g, 3 + rand() * 3, 1.2 + rand(), 2.5 + rand() * 2, s.x, 0.6, s.z, mat.studs('#ffffff'), { ry: rand() * 3 }) // cloud banks
      box(g, 2, 1, 2, s.x + 1, 1.5, s.z, mat.studs('#f4f8ff'), { ry: rand() * 3 })
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1, 3)
      tree(g, s.x, s.z, 1, '#f4e8c8', ['#c8f0ff', '#ffe8f6'], rand)
    }
    for (let i = 0; i < 10; i++) {
      const s = spot(rand, z0, z1, 4)
      pillar(g, s.x, s.z, 5 + rand() * 3, '#ffffff', '#ffe680')
      const y = 9.5 + rand() * 2
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        cube(g, 0.35, 0.15, 0.35, s.x + Math.cos(a) * 0.9, y, s.z + Math.sin(a) * 0.9, mat.lit('#fff3a0', 2.4)) // halos
      }
    }
    for (let i = 0; i < 20; i++) {
      const s = spot(rand, z0, z1)
      flowers(g, s.x, s.z, rand, ['#ffffff', '#ffe680', '#c8f0ff'])
    }
  },
}

// GPU particles per zone: (z0, z1) -> createEmitter options.
const PARTICLES = {
  meadow: (b) => ({ boxes: [b(2.5)], count: 120, life: 8, velocity: [0.3, 0.15, -0.2], spread: [0.3, 0.15, 0.3], size: 0.13, color: '#fffbe0', intensity: 1.4, twinkle: 3 }),
  coral: (b) => ({ boxes: [b(1.5)], count: 140, life: 5, velocity: [0, 1.2, 0], spread: [0.2, 0.4, 0.2], size: 0.22, color: '#bff4ff', intensity: 1.6, twinkle: 2 }),
  snow: (b) => ({ boxes: [b(8)], count: 260, life: 7, velocity: [0.3, -1.4, 0], spread: [0.4, 0.3, 0.4], size: 0.18, color: '#ffffff', intensity: 1.3, twinkle: 1 }),
  desert: (b) => ({ boxes: [b(1.5)], count: 160, life: 4, velocity: [2.4, 0.2, 0.3], spread: [0.6, 0.2, 0.4], size: 0.14, color: '#ffe0a0', intensity: 1.1 }),
  crystal: (b) => ({ boxes: [b(3)], count: 160, life: 3, velocity: [0, 0.4, 0], spread: [0.3, 0.3, 0.3], size: 0.3, color: '#e0b8ff', intensity: 2.4, twinkle: 7, sprite: 'sparkle' }),
  jungle: (b) => ({ boxes: [b(3)], count: 130, life: 5, velocity: [0, 0.2, 0], spread: [0.5, 0.3, 0.5], size: 0.24, color: '#d8ff7a', intensity: 2.4, twinkle: 5, sprite: 'sparkle' }),
  golden: (b) => ({ boxes: [b(4)], count: 180, life: 4, velocity: [0, 0.5, 0], spread: [0.3, 0.3, 0.3], size: 0.28, color: '#ffe680', intensity: 2.4, twinkle: 6, sprite: 'sparkle' }),
  ancient: (b) => ({ boxes: [b(4)], count: 140, life: 6, velocity: [0.2, 0.5, 0], spread: [0.3, 0.2, 0.3], size: 0.2, color: '#cfc4a8', intensity: 1, twinkle: 1 }),
  hell: (b) => ({ boxes: [b(1.5)], count: 220, life: 3, velocity: [0, 2.2, 0], spread: [0.5, 0.6, 0.5], size: 0.2, color: '#ff8a2a', intensity: 3, twinkle: 9 }),
  angelic: (b) => ({ boxes: [b(4)], count: 180, life: 6, velocity: [0, -0.4, 0], spread: [0.4, 0.2, 0.4], size: 0.3, color: '#fffbe8', intensity: 2, twinkle: 4, sprite: 'sparkle' }),
}

// --- Hiding spots ------------------------------------------------------------------------------
// Plants, rocks and the like along the reel corridor where animals hide. The spear always lands
// right in front of one; it glows while the luck charges, shakes, and the catch bursts out of it.
// Each spot is baked on its own (1-2 draw calls) so its materials can be swapped while it glows.
// builder(g, rand) builds at the origin; colour = the leaves / dust thrown when the catch pops out.
const HIDES = {
  meadow: [
    { color: '#5fcf4a', build: (g, r) => bush(g, 0, 0, 1.15 + r() * 0.3, r() < 0.5 ? '#3fb35a' : '#5fcf4a', r) },
    { color: '#a99cf0', build: (g, r) => rock(g, 0, 0, 1, '#a99cf0', r) },
  ],
  coral: [
    {
      color: '#ff7fb3',
      build: (g, r) => {
        const c = ['#ff7fb3', '#ff9a5a', '#b77bff'][Math.floor(r() * 3)]
        box(g, 2.2, 1.1, 1.8, 0, 0.55, 0, mat.studs(c))
        for (let k = 0; k < 4; k++) box(g, 0.5, 1 + r() * 1.2, 0.5, (r() - 0.5) * 1.6, 1.4, (r() - 0.5) * 1.2, mat.studs(c))
      },
    },
    { color: '#e6d2a0', build: (g, r) => rock(g, 0, 0, 1.1, '#e6d2a0', r) },
  ],
  snow: [
    {
      color: '#ffffff',
      build: (g, r) => {
        box(g, 2.8, 1.2, 2.2, 0, 0.6, 0, mat.studs('#f4fbff'), { ry: r() })
        box(g, 1.6, 0.9, 1.4, 0.4, 1.5, 0, mat.studs('#ffffff'), { ry: r() })
      },
    },
    { color: '#9fe4ff', build: (g, r) => crystal(g, 0, 0, 0.9, '#9fe4ff', 0.4, r) },
  ],
  desert: [
    { color: '#e0995a', build: (g, r) => rock(g, 0, 0, 1.2, '#e0995a', r) },
    {
      color: '#5fbf3a',
      build: (g, r) => {
        box(g, 2.4, 1.0, 2.0, 0, 0.5, 0, mat.studs('#4caf3a'))
        box(g, 0.7, 2.2, 0.7, 0.3, 2, 0, mat.studs('#5fbf3a'))
      },
    },
  ],
  crystal: [
    { color: '#c48bff', build: (g, r) => crystal(g, 0, 0, 1.1, '#c48bff', 1.2, r) },
    { color: '#5a5470', build: (g, r) => rock(g, 0, 0, 1.2, '#5a5470', r) },
  ],
  jungle: [
    { color: '#2f9a3a', build: (g, r) => bush(g, 0, 0, 1.3, '#2f9a3a', r) },
    { color: '#3fbf4a', build: (g, r) => bush(g, 0, 0, 1.1, '#3fbf4a', r) },
  ],
  golden: [
    { color: '#ffd23a', build: (g, r) => bush(g, 0, 0, 1.2, '#ffd23a', r) },
    { color: '#f2b630', build: (g, r) => rock(g, 0, 0, 1.1, '#f2b630', r) },
  ],
  ancient: [
    { color: '#6f8a4a', build: (g, r) => rock(g, 0, 0, 1.3, '#7d8a5a', r) },
    { color: '#4f8a3a', build: (g, r) => bush(g, 0, 0, 1.3, '#4f8a3a', r) },
  ],
  hell: [
    { color: '#ff7a1f', build: (g, r) => rock(g, 0, 0, 1.2, '#3a1a24', r) },
    { color: '#5a2020', build: (g, r) => rock(g, 0, 0, 1.0, '#5a2020', r) },
  ],
  angelic: [
    {
      color: '#ffffff',
      build: (g, r) => {
        box(g, 2.8, 1.2, 2.2, 0, 0.6, 0, mat.studs('#ffffff'), { ry: r() })
        box(g, 1.8, 1, 1.6, 0.5, 1.5, 0.1, mat.studs('#f4f8ff'), { ry: r() })
      },
    },
    { color: '#c8f0ff', build: (g, r) => bush(g, 0, 0, 1.1, '#c8f0ff', r) },
  ],
}
// Spots in zone i: every ~7 m, alternating sides, inside the corridor near its edges.
// merge: build them straight into `scene` (a zone group about to be baked) instead of
// baking each on its own (the copies' Lanes: nothing ever glows there, fewer draw calls).
function buildHides(scene, i, z0, z1, rand, out, merge = false) {
  const Z = ZONES[i]
  const kinds = HIDES[Z.id]
  // The Meadow also has spots up the canyon (short shots land there).
  const from = i === 0 ? HZ - 14 : z0 - 5
  let side = rand() < 0.5 ? -1 : 1
  for (let z = from; z > z1 + 4; z -= 6 + rand() * 3) {
    const inCanyon = z > LANE.canyonEnd
    const x = side * (inCanyon ? 3.5 + rand() * 3 : 3.5 + rand() * 6)
    side = -side
    const kind = kinds[Math.floor(rand() * kinds.length)]
    const g = new Group()
    kind.build(g, rand)
    if (merge) {
      g.position.set(x, 0, z)
      g.rotation.y = rand() * Math.PI * 2
      scene.add(g)
      continue
    }
    const baked = bake(g, true)
    baked.position.set(x, 0, z)
    baked.rotation.y = rand() * Math.PI * 2
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    scene.add(baked)
    out.push({ group: baked, x, z, zone: i, color: kind.color })
  }
}

// ox: the Lane's x (0 = the player's plot). decor: a copy at another plot (PLOTS): same
// zones, hiding spots baked in, culled by distance in x and z, and no say over the fog.
export function buildZones(scene, { ox = 0, decor = false } = {}) {
  const zones = []
  const spots = [] // hiding spots: { group, x, z, zone, color }
  const end = HZ - laneLength()
  colliderShift.x = ox // the side cliffs' colliders (wall()) land on this Lane
  for (let i = 0; i < ZONES.length; i++) {
    const Z = ZONES[i]
    const { z0, z1 } = zoneRange(i)
    const rand = mulberry32(900 + i * 77)
    const g = new Group()
    const len = z0 - z1
    const zc = (z0 + z1) / 2
    // Ground: checker of the zone colour with lighter patches; collider below it.
    box(g, W * 2, 2, len, 0, -1, zc, mat.checker(Z.ground), { shadow: false })
    for (let k = 0; k < 8; k++) box(g, 4 + rand() * 8, 0.04, 4 + rand() * 8, (rand() * 2 - 1) * (W - 6), 0.02, z0 - 4 - rand() * (len - 8), mat.plain(Z.ground2, 0.95), { shadow: false })
    // A worn trail up the middle (the catch is reeled along it).
    box(g, 6, 0.05, len, 0, 0.025, zc, mat.plain(Z.ground2, 0.95), { shadow: false })
    addFixed(RAPIER.ColliderDesc.cuboid(W + 9, 1, len / 2), { x: ox, y: -1, z: zc }, null, { friction: 0.9 })
    // Side cliffs (taller every zone, the zone's colours).
    const h = 13 + Math.min(10, i * 1.2)
    wall(g, -W - 9, z1, -W, z0 + (i === 0 ? 2 : 0), h, Z.wall, Z.accent, rand)
    wall(g, W, z1, W + 9, z0 + (i === 0 ? 2 : 0), h, Z.wall, Z.accent, rand)
    THEMES[Z.id](g, z0, z1, rand)
    if (decor) buildHides(g, i, z0, z1, rand, [], true)
    const baked = bake(g, true)
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    const holder = new Group()
    holder.position.x = ox
    holder.add(baked)
    scene.add(holder)
    if (!decor) buildHides(holder, i, z0, z1, rand, spots)
    const b = (hgt) => ({ x: ox, y: hgt / 2 + 0.5, z: zc, sx: W - 2, sy: hgt / 2, sz: len / 2 - 2 })
    const emitter = createEmitter(scene, { ...PARTICLES[Z.id](b), seed: 40 + i })
    zones.push({ holder, emitter, z0, z1, zc })
  }
  // The far wall at the end of the Lane.
  {
    const g = new Group()
    const Z = ZONES[ZONES.length - 1]
    wall(g, -W - 9, end - 9, W + 9, end, 24, Z.wall, Z.accent, mulberry32(5))
    const baked = bake(g, true)
    baked.position.x = ox
    scene.add(baked)
  }
  colliderShift.x = 0

  // Culling + fog: zones beyond the view distance hide; out in the Lane the fog closes in.
  const fogFar = LANE.viewDistance + 40
  let fogK = 0
  return {
    zones,
    spots,
    // The hiding spot nearest to (x, z), preferring zone `zone`.
    nearestSpot(x, z, zone) {
      let best = null
      let bd = Infinity
      for (const sp of spots) {
        const d = Math.hypot(sp.x - x, sp.z - z) + (zone != null && sp.zone !== zone ? 40 : 0)
        if (d < bd) {
          bd = d
          best = sp
        }
      }
      return best
    },
    update(camera, dt) {
      const cz = camera.position.z
      const dx = Math.max(0, Math.abs(camera.position.x - ox) - W - 9)
      const view = decor ? LANE.decorView : LANE.viewDistance
      for (const z of zones) {
        const dz = cz > z.z0 ? cz - z.z0 : cz < z.z1 ? z.z1 - cz : 0
        const on = Math.hypot(dx, dz) < view
        if (z.holder.visible !== on) {
          z.holder.visible = on
          z.emitter.visible = on
        }
      }
      const fog = scene.fog
      if (!fog || decor) return
      const inLane = cz < LANE.canyonEnd + 20 ? 1 : 0
      fogK += (inLane - fogK) * Math.min(1, dt * 1.5)
      fog.near = FOG.near + (LANE.viewDistance * 0.4 - FOG.near) * fogK
      fog.far = FOG.far + (fogFar - FOG.far) * fogK
    },
  }
}

// Portrait snapshots of every zone (for the Pet Index), rendered once with the game's own
// renderer into a small target: standing in the zone's trail, looking north up the Lane.
export function renderZoneThumbs(renderer, scene, zones) {
  const W = 160
  const H = 256
  const target = new WebGLRenderTarget(W, H, { colorSpace: SRGBColorSpace })
  const cam = new PerspectiveCamera(60, W / H, 0.1, 400)
  const px = new Uint8Array(W * H * 4)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(W, H)
  const vis = zones.map((z) => z.holder.visible)
  const fog = scene.fog
  const fogNear = fog?.near
  const fogFar = fog?.far
  if (fog) {
    fog.near = 60
    fog.far = 220
  }
  const out = []
  const prevTarget = renderer.getRenderTarget()
  try {
    zones.forEach((z, i) => {
      zones.forEach((o, j) => (o.holder.visible = Math.abs(i - j) <= 1))
      cam.position.set(0, 5.5, z.z0 - 6)
      cam.lookAt(0, 2.5, z.z0 - 40)
      renderer.setRenderTarget(target)
      renderer.render(scene, cam)
      renderer.readRenderTargetPixels(target, 0, 0, W, H, px)
      // Rows come bottom-up: flip while copying.
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
      ctx.putImageData(img, 0, 0)
      out.push(canvas.toDataURL('image/jpeg', 0.82))
    })
  } catch {
    // No render target readback (old GPU): the Index shows the zone colour instead.
  }
  renderer.setRenderTarget(prevTarget)
  zones.forEach((z, i) => (z.holder.visible = vis[i]))
  if (fog) {
    fog.near = fogNear
    fog.far = fogFar
  }
  target.dispose()
  return out
}

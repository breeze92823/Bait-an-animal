import { Group } from 'three'
import { BAITS } from './config.js'
import { cube, mat } from './voxel.js'

// The bait creatures the machine grows (one model per BAITS.kinds entry), about
// half a metre long, built from voxels. buildBait(kind) returns a Group with
// .wiggle(t) for its idle motion (the worm squirms, wings buzz, ...).
// Bait level -> kind: kindOf(p) for an overall level index p (0-based).

export function kindOf(p) {
  return Math.min(BAITS.kinds.length - 1, Math.floor(p / BAITS.levelsPerKind))
}
// Level shown on the bait ("Cricket Lv 2"); the last kind keeps counting up.
export function levelOf(p) {
  const k = kindOf(p)
  return p - k * BAITS.levelsPerKind + 1
}
export function baitName(p) {
  return `${BAITS.kinds[kindOf(p)].name} Lv ${levelOf(p)}`
}

function segmented(g, colors, size, curl, shiny = false) {
  const segs = []
  const n = colors.length
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5
    const s = size * (1 - Math.abs(t) * 0.5)
    const m = shiny ? mat.metal(colors[i]) : mat.plain(colors[i], 0.45)
    const seg = cube(g, s, s, s * 0.9, 0, s / 2, t * size * n * 0.78, m, false)
    seg.userData.baseY = s / 2
    seg.userData.t = t
    segs.push(seg)
  }
  // Eyes on the front segment.
  const head = segs[n - 1]
  const eye = mat.lit('#14141c', 0.2)
  for (const sx of [-1, 1]) cube(g, size * 0.16, size * 0.16, size * 0.08, sx * size * 0.2, head.position.y + size * 0.12, head.position.z + size * 0.42, eye, false)
  g.wiggle = (time) => {
    for (const seg of segs) {
      seg.position.y = seg.userData.baseY + Math.max(0, Math.sin(time * 6 + seg.userData.t * 9)) * size * 0.35
      seg.position.x = Math.sin(time * 4 + seg.userData.t * 6) * size * curl
    }
  }
}

function legs(g, color, n, span, y, len) {
  const m = mat.plain(color, 0.6)
  const out = []
  for (let i = 0; i < n; i++) {
    for (const sx of [-1, 1]) {
      const leg = cube(g, len, 0.04, 0.05, sx * (span + len / 2), y, (i / (n - 1) - 0.5) * 0.28, m, false)
      leg.rotation.z = sx * 0.5
      out.push(leg)
    }
  }
  return out
}

const BUILDERS = {
  worm(g) {
    segmented(g, ['#ff7aa6', '#ff8fb0', '#ff7aa6', '#ff8fb0', '#ff7aa6', '#ff9fbd'], 0.14, 0.35)
  },
  cricket(g) {
    const body = mat.plain('#6fd13e', 0.5)
    const dark = mat.plain('#3e9a25', 0.5)
    cube(g, 0.2, 0.18, 0.42, 0, 0.16, 0, body, false)
    cube(g, 0.17, 0.17, 0.15, 0, 0.2, 0.26, dark, false)
    const legsBack = []
    for (const sx of [-1, 1]) {
      const thigh = cube(g, 0.06, 0.22, 0.06, sx * 0.13, 0.22, -0.08, dark, false)
      thigh.rotation.x = 0.7
      legsBack.push(thigh)
      cube(g, 0.02, 0.02, 0.3, sx * 0.05, 0.32, 0.45, dark, false).rotation.x = -0.6
    }
    legs(g, '#3e9a25', 2, 0.1, 0.1, 0.14)
    const eye = mat.lit('#14141c', 0.2)
    for (const sx of [-1, 1]) cube(g, 0.04, 0.05, 0.03, sx * 0.07, 0.24, 0.34, eye, false)
    g.wiggle = (t) => {
      g.children[0].position.y = 0.16 + Math.abs(Math.sin(t * 5)) * 0.03
      for (const l of legsBack) l.rotation.x = 0.7 + Math.sin(t * 10) * 0.15
    }
  },
  beetle(g) {
    const shell = mat.metal('#3a6cff')
    const shellHi = mat.lit('#9cf2ff', 0.4)
    cube(g, 0.32, 0.18, 0.4, 0, 0.17, 0, shell, false)
    cube(g, 0.26, 0.08, 0.34, 0, 0.29, 0, shell, false)
    cube(g, 0.02, 0.1, 0.36, 0, 0.3, 0, mat.plain('#1a2a66'), false)
    cube(g, 0.06, 0.03, 0.12, -0.07, 0.34, 0.04, shellHi, false)
    cube(g, 0.18, 0.12, 0.12, 0, 0.14, 0.25, mat.plain('#1a2050'), false)
    cube(g, 0.03, 0.03, 0.14, 0, 0.18, 0.36, mat.plain('#1a2050'), false).rotation.x = -0.5
    const ls = legs(g, '#1a2050', 3, 0.15, 0.08, 0.12)
    g.wiggle = (t) => {
      ls.forEach((l, i) => (l.rotation.y = Math.sin(t * 12 + i) * 0.4))
    }
  },
  firefly(g) {
    cube(g, 0.16, 0.14, 0.2, 0, 0.2, 0.08, mat.plain('#3a2a1a'), false)
    cube(g, 0.14, 0.13, 0.12, 0, 0.21, 0.24, mat.plain('#1d1510'), false)
    const glowPart = cube(g, 0.2, 0.18, 0.24, 0, 0.18, -0.15, mat.lit('#ffe14a', 2.2), false)
    const wing = mat.glass('#e8fbff', 0.55)
    const wings = []
    for (const sx of [-1, 1]) {
      const w = cube(g, 0.26, 0.02, 0.16, sx * 0.16, 0.3, 0.06, wing, false)
      wings.push(w)
    }
    for (const sx of [-1, 1]) cube(g, 0.04, 0.05, 0.03, sx * 0.05, 0.24, 0.31, mat.lit('#ffffff', 0.4), false)
    g.wiggle = (t) => {
      wings[0].rotation.z = Math.sin(t * 40) * 0.5
      wings[1].rotation.z = -Math.sin(t * 40) * 0.5
      glowPart.scale.setScalar(1 + Math.sin(t * 5) * 0.08)
    }
  },
  grub(g) {
    segmented(g, ['#ffb81f', '#ffd257', '#ffb81f', '#ffd257', '#ffc838'], 0.2, 0.2, true)
  },
  snail(g) {
    const body = mat.plain('#ffd0f2', 0.4)
    const shell = mat.plain('#b77bff', 0.35)
    const shell2 = mat.lit('#ffe6ff', 0.3)
    cube(g, 0.16, 0.1, 0.5, 0, 0.05, 0.05, body, false)
    cube(g, 0.32, 0.32, 0.3, 0, 0.26, -0.04, shell, false)
    cube(g, 0.2, 0.2, 0.32, 0, 0.28, -0.04, shell2, false)
    cube(g, 0.1, 0.1, 0.34, 0, 0.29, -0.04, shell, false)
    const eyes = []
    for (const sx of [-1, 1]) {
      cube(g, 0.03, 0.18, 0.03, sx * 0.05, 0.18, 0.28, body, false)
      eyes.push(cube(g, 0.06, 0.06, 0.06, sx * 0.05, 0.28, 0.28, mat.lit('#14141c', 0.2), false))
    }
    g.wiggle = (t) => {
      eyes.forEach((e, i) => (e.position.y = 0.28 + Math.sin(t * 3 + i * 2) * 0.03))
    }
  },
  slug(g) {
    segmented(g, ['#ff5f5f', '#ffb347', '#ffe14a', '#5fe36a', '#4fb6ff', '#b77bff'], 0.15, 0.3)
  },
}

// A bait model for kind index `kind` (BAITS.kinds order).
export function buildBait(kind) {
  const g = new Group()
  const def = BAITS.kinds[Math.max(0, Math.min(BAITS.kinds.length - 1, kind))]
  ;(BUILDERS[def.id] ?? BUILDERS.worm)(g)
  g.wiggle ??= () => {}
  return g
}

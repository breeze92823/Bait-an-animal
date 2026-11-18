// Canvas painters for the hub's blocky look. Every studded surface (grass,
// lane, cliffs, leaves, rocks, the machine pad) shares one neutral light-grey
// stud tile that each material tints with its colour, so the whole world is a
// handful of textures. Normal maps come from painted height fields
// (textures.heightToNormal) so the studs catch the sun.
import { heightToNormal, mulberry32, toTexture } from './textures.js'

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Square studs with a bevelled rim. `n` studs per side; with `checker` the tile holds
// 2x2 blocks of n/2 studs, alternate blocks slightly darker (the field's big squares).
export function paintStuds({ size = 256, n = 4, checker = false, seed = 3 } = {}) {
  const rand = mulberry32(seed)
  const color = canvas(size)
  const ctx = color.getContext('2d')
  const heights = new Float32Array(size * size)
  const cell = size / n
  const img = ctx.createImageData(size, size)
  const inset = Math.round(cell * 0.17)
  const bevel = Math.max(2, Math.round(cell * 0.07))
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const block = checker ? (Math.floor(cx / (n / 2)) + Math.floor(cy / (n / 2))) % 2 : 0
      const base = (block ? 214 : 236) + (rand() - 0.5) * 6
      const x0 = Math.round(cx * cell)
      const y0 = Math.round(cy * cell)
      const x1 = Math.round((cx + 1) * cell)
      const y1 = Math.round((cy + 1) * cell)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const lx = x - x0
          const ly = y - y0
          const w = x1 - x0
          const h = y1 - y0
          let v = base
          let ht = 0.35
          // Tile seam: a thin darker groove between studs.
          if (lx === 0 || ly === 0) {
            v -= 16
            ht = 0.25
          }
          const inX = lx >= inset && lx < w - inset
          const inY = ly >= inset && ly < h - inset
          if (inX && inY) {
            const dl = lx - inset // distance from each inner edge
            const dt = ly - inset
            const dr = w - inset - 1 - lx
            const db = h - inset - 1 - ly
            const edge = Math.min(dl, dt, dr, db)
            if (edge < bevel) {
              // Rim: lit from the top-left, shaded bottom-right.
              const lit = dl === edge || dt === edge
              v += lit ? 20 : -26
              ht = 0.55 + (edge / bevel) * 0.3
            } else {
              v += 6
              ht = 0.88
            }
          }
          const i = y * size + x
          heights[i] = ht
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v))
          img.data[i * 4 + 3] = 255
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color, normal: heightToNormal(heights, size, 3) }
}

// Wood with long grain, for fences, posts, sign frames, the stall. Tinted by the material.
export function paintWood(size = 256, seed = 11) {
  const rand = mulberry32(seed)
  const color = canvas(size)
  const ctx = color.getContext('2d')
  ctx.fillStyle = '#e8e8e8'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 70; i++) {
    const y = rand() * size
    const a = 0.05 + rand() * 0.1
    ctx.strokeStyle = `rgba(60,30,10,${a})`
    ctx.lineWidth = 1 + rand() * 3
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2)
    ctx.stroke()
  }
  // Knots.
  for (let i = 0; i < 3; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.strokeStyle = 'rgba(60,30,10,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y, 9 + rand() * 6, 4 + rand() * 3, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  return color
}

// Board face: planks inside a frame with an X brace (the base signs, crates, the counter).
export function paintXBoard(w = 512, h = 512, { wood = '#c4703f', dark = '#94502a', frame = 0.08 } = {}) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = wood
  ctx.fillRect(0, 0, w, h)
  const grain = paintWood(256, 5)
  ctx.globalAlpha = 0.55
  ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(grain, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  const f = Math.min(w, h) * frame
  ctx.lineCap = 'butt'
  // X brace with a lit top edge.
  ctx.strokeStyle = dark
  ctx.lineWidth = f * 0.9
  ctx.beginPath()
  ctx.moveTo(f, f)
  ctx.lineTo(w - f, h - f)
  ctx.moveTo(w - f, f)
  ctx.lineTo(f, h - f)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,210,170,0.25)'
  ctx.lineWidth = f * 0.18
  ctx.beginPath()
  ctx.moveTo(f, f - f * 0.3)
  ctx.lineTo(w - f, h - f - f * 0.3)
  ctx.moveTo(w - f, f - f * 0.3)
  ctx.lineTo(f, h - f - f * 0.3)
  ctx.stroke()
  // Frame.
  ctx.strokeStyle = dark
  ctx.lineWidth = f
  ctx.strokeRect(f / 2, f / 2, w - f, h - f)
  ctx.strokeStyle = 'rgba(40,18,6,0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(f, f, w - f * 2, h - f * 2)
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3)
  return c
}

// Awning stripes (vertical bands), wrapped along the cloth.
export function paintStripes(a = '#2fbf4a', b = '#ffffff', bands = 8, w = 256, h = 64) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  const bw = w / bands
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? b : a
    ctx.fillRect(i * bw, 0, bw + 1, h)
  }
  // Soft fold shading.
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  return c
}

// Hazard stripes for the harpoon barrel.
export function paintHazard(a = '#1d1d24', b = '#ffcf1f', w = 128, h = 128) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = b
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = a
  for (let i = -4; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 32, 0)
    ctx.lineTo(i * 32 + 16, 0)
    ctx.lineTo(i * 32 + 16 + h, h)
    ctx.lineTo(i * 32 + h, h)
    ctx.closePath()
    ctx.fill()
  }
  return c
}

// Jungle backdrop for the far end of the Lane: layered leaf silhouettes on blue.
export function paintJungle(w = 1024, h = 256, seed = 77) {
  const rand = mulberry32(seed)
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#5fb8ff')
  g.addColorStop(1, '#2a7fd4')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const layers = ['#2c9a52', '#3ab55c', '#55cf6a']
  layers.forEach((col, li) => {
    ctx.fillStyle = col
    for (let i = 0; i < 60; i++) {
      const x = rand() * w
      const base = h
      const tall = h * (0.35 + rand() * 0.55) * (1 - li * 0.18)
      const lean = (rand() - 0.5) * 60
      ctx.beginPath()
      ctx.moveTo(x - 10, base)
      ctx.quadraticCurveTo(x + lean * 0.5, base - tall * 0.6, x + lean, base - tall)
      ctx.quadraticCurveTo(x + lean * 0.4 + 12, base - tall * 0.5, x + 10, base)
      ctx.fill()
    }
  })
  return c
}

// Shared textures, made once.
let cache = null
export function sharedTextures() {
  if (cache) return cache
  const studs = paintStuds({ size: 256, n: 4 })
  const checker = paintStuds({ size: 512, n: 8, checker: true, seed: 9 })
  cache = {
    studColor: toTexture(studs.color, { srgb: true }),
    studNormal: toTexture(studs.normal),
    checkerColor: toTexture(checker.color, { srgb: true }),
    checkerNormal: toTexture(checker.normal),
    wood: toTexture(paintWood(), { srgb: true }),
  }
  return cache
}

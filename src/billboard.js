import { CanvasTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { fontReady } from './propkit.js'

// Canvas-backed text in the world, repainted on demand:
//  - billboard(): a Sprite that always faces the camera (labels over machines, animals)
//  - panel(): a flat plane (sign faces), lit or unlit
// draw(ctx, w, h) paints the canvas; .redraw() repaints it (also once Fredoka loads).

export function billboard(w, h, worldHeight, draw, { depthTest = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, fog: false }))
  sprite.scale.set((worldHeight * w) / h, worldHeight, 1)
  sprite.renderOrder = 5
  const ctx = c.getContext('2d')
  sprite.redraw = () => {
    ctx.clearRect(0, 0, w, h)
    draw(ctx, w, h)
    tex.needsUpdate = true
  }
  sprite.redraw()
  fontReady.then(() => sprite.redraw())
  return sprite
}

export function panel(w, h, worldW, worldH, draw, { lit = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  // Lit: shaded by the sun like the wood around it, with a little self-light so it stays readable in shadow.
  const material = lit ? new MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.32 }) : new MeshBasicMaterial({ map: tex })
  const mesh = new Mesh(new PlaneGeometry(worldW, worldH), material)
  const ctx = c.getContext('2d')
  mesh.redraw = () => {
    ctx.clearRect(0, 0, w, h)
    draw(ctx, w, h)
    tex.needsUpdate = true
  }
  mesh.redraw()
  fontReady.then(() => mesh.redraw())
  return mesh
}

// --- Canvas text helpers --------------------------------------------------------------
export const FONT = (px, weight = 700) => `${weight} ${px}px Fredoka, "Arial Black", sans-serif`

// Outlined text (stroke under fill). align: 'center' | 'left' | 'right'.
export function outlined(ctx, text, x, y, { px = 48, fill = '#fff', stroke = '#1d1a22', width = px * 0.2, align = 'center', weight = 700 } = {}) {
  ctx.font = FONT(px, weight)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  if (width > 0) {
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

// Chunky game button: gradient fill, dark outline, lighter top lip.
export function pill(ctx, x, y, w, h, top, bottom, { r = h * 0.3, outline = '#1d1a22', line = Math.max(4, h * 0.08) } = {}) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = line
  ctx.strokeStyle = outline
  ctx.stroke()
  roundRect(ctx, x + line, y + line, w - line * 2, h * 0.32, r * 0.7)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fill()
}

// Progress bar: dark track, coloured fill, centred caption.
export function bar(ctx, x, y, w, h, ratio, text, { fill = '#4ce05a', track = 'rgba(14,22,40,0.85)', px = h * 0.62 } = {}) {
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = track
  ctx.fill()
  ctx.lineWidth = Math.max(3, h * 0.12)
  ctx.strokeStyle = '#0b0f1c'
  ctx.stroke()
  const r = Math.max(0, Math.min(1, ratio))
  if (r > 0) {
    const pad = h * 0.14
    roundRect(ctx, x + pad, y + pad, Math.max(h - pad * 2, (w - pad * 2) * r), h - pad * 2, (h - pad * 2) / 2)
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (text) outlined(ctx, text, x + w / 2, y + h / 2 + 1, { px, width: px * 0.22 })
}

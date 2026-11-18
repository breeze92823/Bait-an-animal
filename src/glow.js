import { CanvasTexture, SRGBColorSpace } from 'three'

// Small cached canvas textures for additive light effects (the spear's glow, the
// luck bush's ground glow and its rising light streaks). Painted once, white, and
// tinted by the material colour.
const cache = {}

function make(key, w, h, paint) {
  if (cache[key]) return cache[key]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return (cache[key] = tex)
}

// Soft round glow: bright core, smooth falloff to transparent.
export const glowTex = () =>
  make('glow', 128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.25, 'rgba(255,255,255,0.75)')
    r.addColorStop(0.6, 'rgba(255,255,255,0.2)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, w, w)
  })

// A tall thin light streak: bright in the middle, fading to both ends and both sides.
export const streakTex = () =>
  make('streak', 32, 256, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h)
    v.addColorStop(0, 'rgba(255,255,255,0)')
    v.addColorStop(0.35, 'rgba(255,255,255,1)')
    v.addColorStop(0.75, 'rgba(255,255,255,0.8)')
    v.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = v
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'destination-in'
    const s = g.createLinearGradient(0, 0, w, 0)
    s.addColorStop(0, 'rgba(0,0,0,0)')
    s.addColorStop(0.5, 'rgba(0,0,0,1)')
    s.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = s
    g.fillRect(0, 0, w, h)
  })

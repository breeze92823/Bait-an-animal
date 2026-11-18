import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { COARSE_POINTER } from './config.js'
import { paintSoftDot, paintSparkle } from './textures.js'

// One-shot effects:
//  - particle bursts from three pools (CPU-simulated, one Points draw each):
//      glow  - additive sparkles (level ups, rare catches, purchases)
//      puff  - soft dust/smoke, normal blending (spear impact, landing, steps)
//      bits  - solid squares: confetti, coins, leaves
//  - ring(): a flat shockwave on the ground; beam(): a rarity light pillar
//  - popup(): DOM floating text over a world point ("+$19", "+1.25 xp")
// update(dt, camera) once per frame. Counts scale down on touch devices.

const SCALE = COARSE_POINTER ? 0.55 : 1

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float uViewport;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * projectionMatrix[1][1] * 0.5 * uViewport / max(-mv.z, 0.1);
    vAlpha = alpha;
    vTint = tint;
  }`
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uIntensity;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * t.rgb * uIntensity, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

function squareSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(4, 4, 24, 24)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(4, 20, 24, 8)
  return c
}

const viewport = { value: 800 }

class Pool {
  constructor(scene, max, sprite, blending, intensity) {
    this.max = max
    this.n = 0
    this.p = [] // particle records
    const geo = new BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.tint = new Float32Array(max * 3)
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('size', new BufferAttribute(this.size, 1))
    geo.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    geo.setAttribute('tint', new BufferAttribute(this.tint, 3))
    const tex = new CanvasTexture(sprite)
    tex.colorSpace = SRGBColorSpace
    const material = new ShaderMaterial({
      uniforms: { map: { value: tex }, uViewport: viewport, uIntensity: { value: intensity } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending,
    })
    this.points = new Points(geo, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 6
    this.geo = geo
    scene.add(this.points)
  }

  // o: { x, y, z, vx, vy, vz, life, size, size2, color (Color), gravity, drag, fade }
  spawn(o) {
    if (this.n >= this.max) return
    this.p[this.n++] = { ...o, age: 0 }
  }

  update(dt) {
    let i = 0
    while (i < this.n) {
      const q = this.p[i]
      q.age += dt
      if (q.age >= q.life) {
        this.p[i] = this.p[--this.n]
        continue
      }
      const drag = Math.exp(-(q.drag ?? 0) * dt)
      q.vx *= drag
      q.vz *= drag
      q.vy = q.vy * drag - (q.gravity ?? 0) * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.z += q.vz * dt
      if (q.floor != null && q.y < q.floor) {
        q.y = q.floor
        q.vy *= -0.35
        q.vx *= 0.6
        q.vz *= 0.6
      }
      const k = q.age / q.life
      this.pos[i * 3] = q.x
      this.pos[i * 3 + 1] = q.y
      this.pos[i * 3 + 2] = q.z
      this.size[i] = q.size + ((q.size2 ?? q.size) - q.size) * k
      this.alpha[i] = (q.fadeIn ? Math.min(1, k * 8) : 1) * (1 - Math.pow(k, q.fade ?? 2))
      this.tint[i * 3] = q.color.r
      this.tint[i * 3 + 1] = q.color.g
      this.tint[i * 3 + 2] = q.color.b
      i++
    }
    this.geo.setDrawRange(0, this.n)
    for (const name of ['position', 'size', 'alpha', 'tint']) this.geo.attributes[name].needsUpdate = true
  }
}

const rnd = (a, b) => a + Math.random() * (b - a)

export function createFx(scene) {
  const glow = new Pool(scene, 900, paintSparkle(64), AdditiveBlending, 2.2)
  const puff = new Pool(scene, 500, paintSoftDot(64), NormalBlending, 1)
  const bits = new Pool(scene, 600, squareSprite(), NormalBlending, 1)
  const meshes = [] // rings + beams: { mesh, age, life, update }

  // DOM popups.
  const layer = document.createElement('div')
  layer.className = 'fx-layer'
  document.body.append(layer)
  const popups = []
  const v = new Vector3()

  const col = (c) => (c instanceof Color ? c : new Color(c))

  const fx = {
    // Sparkles bursting out of a point.
    sparkle(at, color = '#fff6a0', n = 24, speed = 4, size = 0.45) {
      const c = col(color)
      for (let i = 0; i < Math.round(n * SCALE); i++) {
        const a = Math.random() * Math.PI * 2
        const up = rnd(-0.2, 1)
        const s = rnd(0.4, 1) * speed
        glow.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s, vy: up * s, vz: Math.sin(a) * s, life: rnd(0.5, 1.1), size: size * rnd(0.6, 1.3), size2: 0.05, color: c, gravity: 3, drag: 2.2 })
      }
    },
    // Slow rising glitter (a column around a point), for big moments.
    shimmer(at, color, n = 30, radius = 1.2, height = 3) {
      const c = col(color)
      for (let i = 0; i < Math.round(n * SCALE); i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * radius
        glow.spawn({ x: at.x + Math.cos(a) * r, y: at.y + Math.random() * 0.5, z: at.z + Math.sin(a) * r, vx: 0, vy: rnd(0.8, 2) * (height / 3), vz: 0, life: rnd(1, 1.8), size: rnd(0.2, 0.4), size2: 0.02, color: c, fadeIn: true, fade: 1.5 })
      }
    },
    // Dust kicked up from the ground.
    dust(at, color = '#e9dcc0', n = 16, spread = 3, size = 0.9) {
      const c = col(color)
      for (let i = 0; i < Math.round(n * SCALE); i++) {
        const a = Math.random() * Math.PI * 2
        const s = rnd(0.5, 1) * spread
        puff.spawn({ x: at.x, y: at.y + 0.2, z: at.z, vx: Math.cos(a) * s, vy: rnd(0.5, 2), vz: Math.sin(a) * s, life: rnd(0.6, 1.2), size: size * rnd(0.5, 1), size2: size * 2.2, color: c, gravity: -0.5, drag: 3, fade: 1.6 })
      }
    },
    // Confetti / coins: solid squares tumbling down.
    confetti(at, colors = ['#ff4f7b', '#ffe14a', '#4fb6ff', '#62e34a', '#bb6bff'], n = 40, speed = 6) {
      for (let i = 0; i < Math.round(n * SCALE); i++) {
        const a = Math.random() * Math.PI * 2
        const s = rnd(0.3, 1) * speed
        bits.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s * 0.6, vy: rnd(0.6, 1.4) * speed, vz: Math.sin(a) * s * 0.6, life: rnd(1.4, 2.4), size: rnd(0.14, 0.24), color: col(colors[i % colors.length]), gravity: 9, drag: 1.4, floor: 0.05, fade: 4 })
      }
    },
    coins(at, n = 10) {
      this.confetti(at, ['#ffd23a', '#ffe98a', '#f5b400'], n, 4.5)
    },
    // Little splash of a colour (bait liquid, pump).
    splash(at, color, n = 12) {
      const c = col(color)
      for (let i = 0; i < Math.round(n * SCALE); i++) {
        const a = Math.random() * Math.PI * 2
        const s = rnd(0.6, 1.6)
        glow.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s, vy: rnd(2, 4), vz: Math.sin(a) * s, life: rnd(0.4, 0.7), size: rnd(0.15, 0.3), size2: 0.04, color: c, gravity: 9 })
      }
    },
    // Flat shockwave ring on the ground.
    ring(at, color = '#ffffff', size = 3, life = 0.55) {
      const mesh = new Mesh(new RingGeometry(0.75, 1, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(at.x, at.y + 0.06, at.z)
      mesh.renderOrder = 6
      scene.add(mesh)
      meshes.push({
        mesh,
        age: 0,
        life,
        update(k) {
          const s = 0.3 + (1 - Math.pow(1 - k, 3)) * size
          mesh.scale.setScalar(s)
          mesh.material.opacity = 0.9 * (1 - k)
        },
      })
    },
    // Vertical light pillar in a rarity colour.
    beam(at, color, height = 14, life = 2.2, radius = 0.9) {
      const geo = new CylinderGeometry(radius, radius * 1.4, height, 24, 1, true)
      geo.translate(0, height / 2, 0)
      const mesh = new Mesh(geo, new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
      mesh.position.set(at.x, at.y, at.z)
      mesh.renderOrder = 6
      scene.add(mesh)
      meshes.push({
        mesh,
        age: 0,
        life,
        update(k) {
          mesh.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.55
          mesh.scale.set(1 + k * 0.4, Math.min(1, k * 5), 1 + k * 0.4)
          mesh.rotation.y += 0.02
        },
      })
    },
    // Floating DOM text over a world point. cls: '' | 'xp' | 'big' | 'bad'.
    popup(at, text, cls = '', life = 1.1) {
      if (popups.length > 48) popups.shift().el.remove()
      const el = document.createElement('div')
      el.className = `fx-pop ${cls}`.trim()
      el.textContent = text
      layer.append(el)
      popups.push({ el, x: at.x + rnd(-0.3, 0.3), y: at.y, z: at.z + rnd(-0.3, 0.3), age: 0, life, rise: cls === 'big' ? 1.6 : 2.2 })
    },
    update(dt, camera, viewportHeight) {
      viewport.value = viewportHeight
      glow.update(dt)
      puff.update(dt)
      bits.update(dt)
      for (let i = meshes.length - 1; i >= 0; i--) {
        const m = meshes[i]
        m.age += dt
        const k = Math.min(1, m.age / m.life)
        m.update(k)
        if (k >= 1) {
          scene.remove(m.mesh)
          m.mesh.geometry.dispose()
          m.mesh.material.dispose()
          meshes.splice(i, 1)
        }
      }
      const w = window.innerWidth
      const h = window.innerHeight
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i]
        p.age += dt
        const k = p.age / p.life
        if (k >= 1) {
          p.el.remove()
          popups.splice(i, 1)
          continue
        }
        v.set(p.x, p.y + (1 - Math.pow(1 - k, 2)) * p.rise, p.z).project(camera)
        if (v.z > 1) {
          p.el.style.opacity = '0'
          continue
        }
        const x = ((v.x + 1) / 2) * w
        const y = ((1 - v.y) / 2) * h
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.3 ? 1.15 - ((k - 0.15) / 0.15) * 0.15 : 1
        p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`
        p.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1)
      }
    },
  }
  return fx
}

// Voxel building blocks shared by the hub, the base and the animals.
//  - mat.*: cached materials by colour (studded, checker, wood, plain, glass)
//  - box(): a box mesh; studded/wood materials get UVs scaled to the box's
//    size so a stud is HUB.stud metres on every face of every box
//  - cube(): plain unit-cube mesh scaled to size (animals, small parts; shares one geometry)
import { BoxGeometry, Color, DoubleSide, Mesh, MeshStandardMaterial, Vector2 } from 'three'
import { HUB } from './config.js'
import { sharedTextures } from './paint.js'

const cache = new Map()
function cached(key, make) {
  let m = cache.get(key)
  if (!m) cache.set(key, (m = make()))
  return m
}

// `tile` = metres per texture repeat; null = plain colour (no UV scaling).
export const mat = {
  studs: (color) =>
    cached(`studs|${color}`, () => {
      const t = sharedTextures()
      const m = new MeshStandardMaterial({ color, map: t.studColor, normalMap: t.studNormal, normalScale: new Vector2(0.9, 0.9), roughness: 0.82 })
      m.userData.tile = HUB.stud * 4
      return m
    }),
  checker: (color) =>
    cached(`checker|${color}`, () => {
      const t = sharedTextures()
      const m = new MeshStandardMaterial({ color, map: t.checkerColor, normalMap: t.checkerNormal, normalScale: new Vector2(0.9, 0.9), roughness: 0.85 })
      m.userData.tile = HUB.stud * 8
      return m
    }),
  wood: (color) =>
    cached(`wood|${color}`, () => {
      const m = new MeshStandardMaterial({ color, map: sharedTextures().wood, roughness: 0.8 })
      m.userData.tile = 2.2
      return m
    }),
  plain: (color, rough = 0.7, metal = 0) => cached(`plain|${color}|${rough}|${metal}`, () => new MeshStandardMaterial({ color, roughness: rough, metalness: metal })),
  metal: (color) => cached(`metal|${color}`, () => new MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.55 })),
  // Self-lit (screens, light strips, eyes) — stays readable in shadow.
  lit: (color, k = 1) => cached(`lit|${color}|${k}`, () => new MeshStandardMaterial({ color, emissive: new Color(color).multiplyScalar(k), roughness: 0.5 })),
  glass: (color = '#bfefff', opacity = 0.28) =>
    cached(`glass|${color}|${opacity}`, () => new MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.1, depthWrite: false, side: DoubleSide, envMapIntensity: 1.6 })),
}

// Scales a BoxGeometry's UVs so the texture repeats every `tile` metres on each face.
// Face order (BoxGeometry): +x, -x, +y, -y, +z, -z; 4 vertices each.
export function tileBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile)
    }
  }
  uv.needsUpdate = true
  return geo
}

// Box mesh centred at (x, y, z) in `parent`. Textured materials get size-scaled UVs.
// opts: { rx, ry, rz, shadow (default true), uvOffset: [u, v] random offset so neighbours differ }
export function box(parent, w, h, d, x, y, z, material, opts = {}) {
  const geo = new BoxGeometry(w, h, d)
  const tile = material.userData?.tile
  if (tile) {
    tileBoxUV(geo, w, h, d, tile)
    if (opts.uvOffset) {
      const uv = geo.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + opts.uvOffset[0], uv.getY(i) + opts.uvOffset[1])
    }
  }
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  if (opts.rx) m.rotation.x = opts.rx
  if (opts.ry) m.rotation.y = opts.ry
  if (opts.rz) m.rotation.z = opts.rz
  const shadow = opts.shadow ?? true
  m.castShadow = shadow
  m.receiveShadow = true
  parent?.add(m)
  return m
}

// Unit cube scaled to (w, h, d): plain-coloured parts (animals, trims). One shared geometry.
const UNIT = new BoxGeometry(1, 1, 1)
export function cube(parent, w, h, d, x, y, z, material, shadow = true) {
  const m = new Mesh(UNIT, material)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = shadow
  parent?.add(m)
  return m
}

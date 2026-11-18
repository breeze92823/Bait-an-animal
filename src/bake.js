import { Group, Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// --- Baking: one mesh per material ------------------------------------------------
// Props are built from many small meshes (a tree is ~6, an animal ~40); merging
// the ones that share a look keeps a set piece to a handful of draw calls (mobile).
//  - bake(root): a new Group with root's meshes merged per material (root untouched)
//  - bakeInPlace(root): merges root's static meshes in place; anything under an
//    object flagged userData.dynamic (animated parts, labels, glass) is left alone
//  - compact(root): per Group, merges its direct mesh children per material, so a
//    rig keeps its joints (legs, head, wings) but each joint is one draw call
const matKey = (m) => [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.vertexColors, m.side, m.flatShading, m.transparent, m.opacity, m.blending, m.map?.uuid, m.normalMap?.uuid, m.roughness, m.metalness, m.userData.k].join('|')
const rel = new Matrix4()

// Geometries -> one merged geometry with only the attributes they all share.
function mergeAll(geos) {
  const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]))
  for (const g of geos) {
    for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n)
    g.morphAttributes = {}
    g.clearGroups()
  }
  const merged = mergeGeometries(geos)
  for (const g of geos) g.dispose()
  return merged
}

const flat = (geo) => (geo.index ? geo.toNonIndexed() : geo.clone())

export function bake(root, castShadow = false) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const groups = new Map() // key -> { mat, geos }
  const out = new Group()
  root.traverse((o) => {
    if (!o.isMesh) return
    rel.multiplyMatrices(inv, o.matrixWorld)
    if (Array.isArray(o.material)) {
      out.add(new Mesh(o.geometry.clone().applyMatrix4(rel), o.material)) // multi-material: kept as is
      return
    }
    const key = matKey(o.material)
    let e = groups.get(key)
    if (!e) groups.set(key, (e = { mat: o.material, geos: [] }))
    e.geos.push(flat(o.geometry).applyMatrix4(rel))
  })
  for (const { mat, geos } of groups.values()) {
    const merged = mergeAll(geos)
    if (merged) out.add(new Mesh(merged, mat))
  }
  out.traverse((o) => {
    if (o.isMesh) o.castShadow = castShadow
  })
  return out
}

export function bakeInPlace(root, castShadow = true) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const statics = []
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return
    statics.push(o)
  })
  const groups = new Map()
  for (const o of statics) {
    rel.multiplyMatrices(inv, o.matrixWorld)
    const key = matKey(o.material)
    let e = groups.get(key)
    if (!e) groups.set(key, (e = { mat: o.material, geos: [] }))
    e.geos.push(flat(o.geometry).applyMatrix4(rel))
  }
  for (const o of statics) o.parent.remove(o)
  for (const { mat, geos } of groups.values()) {
    const merged = mergeAll(geos)
    if (!merged) continue
    const m = new Mesh(merged, mat)
    m.castShadow = castShadow && !mat.transparent
    m.receiveShadow = true
    root.add(m)
  }
  return root
}

export function compact(root) {
  const holders = []
  root.traverse((o) => {
    if (!o.isMesh) holders.push(o)
  })
  for (const g of holders) {
    const byMat = new Map()
    for (const c of g.children) {
      if (!c.isMesh || c.children.length || Array.isArray(c.material) || c.userData.keep || c.userData.dynamic) continue
      let list = byMat.get(c.material)
      if (!list) byMat.set(c.material, (list = []))
      list.push(c)
    }
    for (const [material, list] of byMat) {
      if (list.length < 2) continue
      const geos = list.map((m) => {
        m.updateMatrix()
        return flat(m.geometry).applyMatrix4(m.matrix)
      })
      const merged = mergeAll(geos)
      if (!merged) continue
      const mesh = new Mesh(merged, material)
      mesh.castShadow = list.some((m) => m.castShadow)
      mesh.receiveShadow = list.some((m) => m.receiveShadow)
      mesh.renderOrder = list[0].renderOrder
      for (const m of list) g.remove(m)
      g.add(mesh)
    }
  }
  return root
}

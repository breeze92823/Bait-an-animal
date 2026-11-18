import { ACESFilmicToneMapping, AmbientLight, Box3, DirectionalLight, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ANIMALS, BAITS } from './config.js'
import { buildAnimal } from './animals.js'
import { buildBait } from './bait.js'

// Portraits of every animal, bait and pet for the HUD and windows: each model is
// rendered once at boot on a small transparent canvas (its own short-lived WebGL
// context) and kept as an image URL. A silhouette version of each animal is made
// for the index's undiscovered entries.
export const THUMBS = { animal: {}, shiny: {}, silhouette: {}, bait: [], pet: {} }

export function renderThumbs() {
  let renderer
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  } catch {
    return THUMBS // no second context: the UI falls back to text
  }
  const S = 160
  renderer.setPixelRatio(1)
  renderer.setSize(S, S, false)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.6
  scene.add(new AmbientLight('#ffffff', 0.6))
  const sun = new DirectionalLight('#fff4e0', 2.4)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  const camera = new PerspectiveCamera(28, 1, 0.05, 100)
  const box = new Box3()
  const size = new Vector3()
  const center = new Vector3()

  const shot = (obj, yaw = -0.6, silhouette = false) => {
    obj.rotation.y = yaw
    scene.add(obj)
    obj.updateMatrixWorld(true)
    box.setFromObject(obj)
    box.getSize(size)
    box.getCenter(center)
    const r = Math.max(size.x, size.y, size.z) * 0.62
    const dist = r / Math.tan((camera.fov * Math.PI) / 360)
    camera.position.set(center.x + dist * 0.18, center.y + dist * 0.22, center.z + dist)
    camera.lookAt(center)
    if (silhouette) {
      obj.traverse((o) => {
        if (o.isMesh) {
          o.userData.m = o.material
          o.material = o.material.clone()
          o.material.color?.set('#1d1a2a')
          o.material.emissive?.set('#000000')
          o.material.metalness = 0
          o.material.roughness = 1
          o.material.envMapIntensity = 0
        }
      })
    }
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    scene.remove(obj)
    return url
  }

  for (const a of ANIMALS) {
    THUMBS.animal[a.id] = shot(buildAnimal(a.id).root)
    THUMBS.shiny[a.id] = shot(buildAnimal(a.id, { shiny: true }).root)
    THUMBS.silhouette[a.id] = shot(buildAnimal(a.id).root, -0.6, true)
  }
  BAITS.kinds.forEach((k, i) => {
    const b = buildBait(i)
    b.wiggle(0.6)
    THUMBS.bait[i] = shot(b, -0.9)
  })
  THUMBS.pet.dino = THUMBS.animal.raptor
  THUMBS.pet.chick = THUMBS.shiny.duck
  THUMBS.pet.mammoth = THUMBS.animal.mammoth

  pmrem.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
  return THUMBS
}

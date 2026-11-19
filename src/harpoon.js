import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { HARPOON } from './config.js'
import { box, cube, mat } from './voxel.js'
import { solidBox } from './propkit.js'
import { paintHazard } from './paint.js'
import { buildBait } from './bait.js'
import { glowTex } from './glow.js'
import { compact } from './bake.js'

// The harpoon on the lane: a tracked turret with an orange body and a striped
// barrel. It is a puppet: the bait flow (baitFlow.js) arms it with a bait, feeds it
// the power meter, fires it at a landing spot (aim swing, flight with a glowing
// trail and a rope), holds the spear in the catch's mouth while it is reeled in,
// and retracts it. See H below for the calls.

const ROPE_SEGMENTS = 14

export function createHarpoon(scene, def) {
  const root = new Group()
  root.position.set(def.x, 0, def.z)
  root.rotation.y = def.yaw
  scene.add(root)

  // --- Model -------------------------------------------------------------------------------
  const treadMat = mat.plain('#2c2f39', 0.85)
  const ridge = mat.plain('#474c59', 0.7)
  const wheelGeo = new CylinderGeometry(0.34, 0.34, 0.12, 12)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheels = []
  for (const s of [-1, 1]) {
    box(root, 0.78, 0.86, 3.4, s * 1.05, 0.45, 0, treadMat)
    for (let i = 0; i < 8; i++) box(root, 0.84, 0.1, 0.2, s * 1.05, 0.9, -1.5 + i * 0.43, ridge)
    for (let i = 0; i < 4; i++) {
      const w = new Mesh(wheelGeo, mat.metal('#5f6574'))
      w.position.set(s * 1.47, 0.45, -1.15 + i * 0.77)
      w.castShadow = true
      root.add(w)
      wheels.push(w)
      cube(root, 0.06, 0.2, 0.2, s * 1.54, 0.45, -1.15 + i * 0.77, mat.metal('#a7b0c2'))
    }
  }
  box(root, 1.5, 0.55, 3.0, 0, 0.78, 0, mat.metal('#5b6070'))
  const lightStrip = cube(root, 1.25, 0.22, 0.06, 0, 0.66, 1.53, mat.lit('#3ff0ff', 2.2).clone(), false)
  lightStrip.userData.keep = true // its glow pulses
  cube(root, 0.9, 0.12, 0.06, 0, 0.66, -1.53, mat.lit('#ff4a3a', 1.5), false)

  const turret = new Group()
  turret.position.set(0, 1.05, -0.15)
  root.add(turret)
  const orange = mat.plain('#ff8a1f', 0.45)
  const orangeDark = mat.plain('#c9560c', 0.5)
  box(turret, 1.95, 0.9, 2.1, 0, 0.45, 0, orange)
  box(turret, 2.0, 0.13, 2.15, 0, 0.66, 0, orangeDark)
  box(turret, 1.5, 0.12, 1.6, 0, 0.96, -0.12, mat.metal('#4a4f5c'))
  for (const s of [-1, 1]) {
    box(turret, 0.12, 0.62, 1.5, s * 1.02, 0.45, -0.05, mat.plain('#ee7714', 0.45))
    box(turret, 0.1, 0.1, 1.2, s * 0.6, 1.2, -0.2, mat.metal('#3a3e49'))
    for (const z of [-0.7, 0.3]) box(turret, 0.1, 0.25, 0.1, s * 0.6, 1.06, z, mat.metal('#3a3e49'))
  }

  const barrel = new Group()
  barrel.position.set(0, 0.72, 0.55)
  turret.add(barrel)
  const hazardTex = new CanvasTexture(paintHazard())
  hazardTex.colorSpace = SRGBColorSpace
  box(barrel, 0.82, 0.82, 0.55, 0, 0, -0.15, mat.metal('#3f4452'))
  box(barrel, 0.62, 0.62, 2.6, 0, 0, 1.2, orange)
  box(barrel, 0.64, 0.14, 2.2, 0, 0.25, 1.1, orangeDark)
  box(barrel, 0.7, 0.7, 0.42, 0, 0, 2.2, new MeshStandardMaterial({ map: hazardTex, roughness: 0.5 }))
  box(barrel, 0.78, 0.78, 0.2, 0, 0, 2.52, mat.metal('#2f333d'))
  const muzzleLocal = new Vector3(0, 0, 2.65)

  // Spear: shaft, four-sided tip, barbs, tail fins, and a holder for the bait.
  const spear = new Group()
  const steel = mat.metal('#d3dae6')
  box(spear, 0.12, 0.12, 1.9, 0, 0, 0, steel)
  const tipGeo = new ConeGeometry(0.22, 0.65, 4)
  tipGeo.rotateX(Math.PI / 2)
  tipGeo.rotateZ(Math.PI / 4)
  const tip = new Mesh(tipGeo, mat.metal('#eef2f8'))
  tip.position.z = 1.25
  tip.castShadow = true
  spear.add(tip)
  for (const s of [-1, 1]) box(spear, 0.04, 0.3, 0.12, 0, s * 0.12, 0.85, steel, { rx: s * 0.5 })
  for (const r of [0, Math.PI / 2]) box(spear, 0.5, 0.03, 0.32, 0, 0, -0.85, mat.plain('#ff4a3a', 0.5), { rz: r })
  const baitHolder = new Group()
  baitHolder.position.set(0, 0.18, 1.0)
  spear.add(baitHolder)
  const spearRest = new Vector3(0, 0, 1.75)
  barrel.add(spear)
  spear.position.copy(spearRest)

  // Rope: thin segments along a sagging curve.
  const ropeMat = mat.plain('#6e4a2a', 0.9)
  const ropeGeo = new BoxGeometry(1, 1, 1)
  const rope = []
  for (let i = 0; i < ROPE_SEGMENTS; i++) {
    const m = new Mesh(ropeGeo, ropeMat)
    m.castShadow = true
    m.visible = false
    scene.add(m)
    rope.push(m)
  }
  const ra = new Vector3()
  const rb = new Vector3()
  const pts = Array.from({ length: ROPE_SEGMENTS + 1 }, () => new Vector3())
  function setRope(a, b, sag) {
    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const k = i / ROPE_SEGMENTS
      pts[i].lerpVectors(a, b, k)
      pts[i].y -= sag * 4 * k * (1 - k)
      if (pts[i].y < 0.05) pts[i].y = 0.05
    }
    for (let i = 0; i < ROPE_SEGMENTS; i++) {
      const m = rope[i]
      const p = pts[i]
      const q = pts[i + 1]
      m.position.lerpVectors(p, q, 0.5)
      m.scale.set(0.11, 0.11, Math.max(0.01, p.distanceTo(q) + 0.02))
      m.lookAt(q)
      m.visible = true
    }
  }
  const hideRope = () => rope.forEach((m) => (m.visible = false))

  compact(root)
  solidBox(1.55, 1.1, 1.75, def.x, 1.1, def.z, def.yaw)

  // Glowing trail behind the spear in flight: tapered additive segments along its arc.
  const TRAIL = 22
  const trailMat = new MeshBasicMaterial({ color: new Color(1.5, 1.8, 1.1), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  const trail = []
  for (let i = 0; i < TRAIL; i++) {
    const m = new Mesh(ropeGeo, trailMat)
    m.visible = false
    m.frustumCulled = false
    scene.add(m)
    trail.push(m)
  }
  const tipGlow = new Sprite(new SpriteMaterial({ map: glowTex(), color: '#f0ffc0', blending: AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }))
  tipGlow.scale.setScalar(2.2)
  tipGlow.position.z = 0.9
  tipGlow.visible = false
  spear.add(tipGlow)

  // --- State -------------------------------------------------------------------------------
  // idle -> armed (bait on the tip, barrel follows the power meter) -> aim (swing + raise)
  // -> flight -> landed -> hooked (the spear held in the catch's mouth, set every frame by
  // hold()) -> retract() -> idle. disarm() goes back from armed to idle.
  const st = {
    state: 'idle',
    t: 0,
    bait: null,
    baitKind: -1,
    loadT: 1,
    power: 0,
    land: new Vector3(),
    start: new Vector3(),
    flight: 1,
    arc: 8,
    aimYaw: 0,
    recoil: 0,
    trailFade: 0,
    strain: 0,
    cb: null,
  }
  const LAND_Y = 0.75 // spear centre height when it sticks in the ground (the tip is buried)
  const muzzleWorld = new Vector3()
  const tmp = new Vector3()
  const tmp2 = new Vector3()
  const vel = new Vector3()
  const forward = new Vector3(Math.sin(def.yaw), 0, Math.cos(def.yaw))
  const seatLocal = new Vector3(0, 1.06, -1.5)

  function getMuzzle(out) {
    root.updateMatrixWorld(true)
    return out.copy(muzzleLocal).applyMatrix4(barrel.matrixWorld)
  }
  // Turret yaw (local) that points the barrel at a world point.
  function yawTo(p) {
    tmp2.copy(p)
    root.worldToLocal(tmp2)
    return Math.atan2(tmp2.x, tmp2.z)
  }
  // Point on the flight arc at u (0 = muzzle, 1 = landing spot).
  function arcPoint(u, out) {
    out.lerpVectors(st.start, st.land, u)
    out.y = st.start.y * (1 - u) + LAND_Y * u + st.arc * 4 * u * (1 - u)
    return out
  }
  function setTrail(k, fade) {
    const from = Math.max(0, k - 0.55)
    for (let i = 0; i < TRAIL; i++) {
      const u0 = from + ((k - from) * i) / TRAIL
      const u1 = from + ((k - from) * (i + 1)) / TRAIL
      arcPoint(u0, ra)
      arcPoint(u1, rb)
      const m = trail[i]
      const w = (0.04 + (i / TRAIL) * 0.2) * fade
      m.position.lerpVectors(ra, rb, 0.5)
      m.scale.set(w, w, Math.max(0.01, ra.distanceTo(rb) + 0.03))
      m.lookAt(rb)
      m.visible = fade > 0.01 && k > 0.001
    }
  }
  const hideTrail = () => trail.forEach((m) => (m.visible = false))
  function dropBait() {
    if (!st.bait) return
    st.bait.removeFromParent()
    st.bait = null
    st.baitKind = -1
    st.baitGround = false
  }

  const H = {
    root,
    forward,
    spear,
    get busy() {
      return st.state !== 'idle'
    },
    get state() {
      return st.state
    },
    // Where the player stands while working the harpoon (the deck behind the turret).
    seat(out) {
      root.updateMatrixWorld(true)
      return out.copy(seatLocal).applyMatrix4(root.matrixWorld)
    },
    muzzle: getMuzzle,
    // Where the bait lies on the ground after landing (null once eaten / before landing).
    baitPos(out) {
      return st.bait && st.baitGround ? out.copy(st.bait.position) : null
    },
    // World position where a catch arrives (in front of the harpoon).
    deliveryPoint(out) {
      return out.set(def.x, 0, def.z).addScaledVector(forward, 3.6)
    },
    // Puts a bait on the spear's tip (or swaps it) and readies the harpoon.
    arm(kind) {
      if (st.state !== 'idle' && st.state !== 'armed') return
      if (st.baitKind !== kind) {
        dropBait()
        st.bait = buildBait(kind)
        st.bait.scale.setScalar(0.01)
        baitHolder.add(st.bait)
        st.baitKind = kind
        st.loadT = 0
      }
      st.state = 'armed'
    },
    // Power meter fill 0..1 while armed: the barrel lifts with it.
    setPower(k) {
      st.power = k
    },
    disarm() {
      if (st.state !== 'armed') return
      dropBait()
      st.state = 'idle'
    },
    // Fires at `land` (world point on the ground): the turret swings and raises the
    // barrel (HARPOON.aim s), then the spear flies for `flight` s on an arc `arc` m high.
    // cb: onFire(muzzle), onFlight(k, spearPos), onLand(spearPos)
    fire(land, flight, arc, cb) {
      if (st.state !== 'armed') return false
      st.cb = cb
      st.land.copy(land)
      st.flight = flight
      st.arc = arc
      st.aimYaw = yawTo(land)
      st.state = 'aim'
      st.t = 0
      return true
    },
    // While a catch is hooked: the spear's tip sits in `mouth`, pointing away from the
    // harpoon; sag (m) slackens the rope, strain 0..1 shakes the turret.
    hold(mouth, sag = 0.3, strain = 0) {
      if (st.state !== 'landed' && st.state !== 'hooked') return
      dropBait()
      if (st.state !== 'hooked') st.t = 0
      st.state = 'hooked'
      getMuzzle(muzzleWorld)
      vel.copy(mouth).sub(muzzleWorld)
      vel.y *= 0.3
      vel.normalize()
      spear.position.copy(mouth).addScaledVector(vel, -1.15)
      spear.lookAt(tmp.copy(spear.position).add(vel))
      setRope(muzzleWorld, ra.copy(spear.position).addScaledVector(vel, -0.95), sag)
      st.strain = strain
      turret.rotation.y += (yawTo(mouth) - turret.rotation.y) * 0.25
    },
    // Snaps the spear back into the barrel; the rope and trail disappear.
    retract() {
      dropBait()
      barrel.attach(spear)
      spear.position.copy(spearRest)
      spear.rotation.set(0, 0, 0)
      tipGlow.visible = false
      hideRope()
      hideTrail()
      st.trailFade = 0
      turret.rotation.z = 0
      st.state = 'idle'
      st.cb = null
      st.recoil = 0.6
    },
    update(dt, t) {
      st.t += dt
      // Idle hum: the light strip breathes (faster while in use), the barrel settles.
      const inUse = st.state !== 'idle'
      lightStrip.material.emissiveIntensity = inUse ? 2.2 + Math.sin(t * 9) : 1.6 + Math.sin(t * 3) * 0.6
      st.recoil = Math.max(0, st.recoil - dt * 2.5)
      barrel.position.z = 0.55 - Math.sin(Math.min(1, st.recoil) * Math.PI) * 0.45
      if (st.bait) {
        st.loadT = Math.min(1, st.loadT + dt / 0.4)
        const k = st.loadT
        st.bait.scale.setScalar((st.baitGround ? 1.3 : 0.85) * (k < 0.7 ? (k / 0.7) * 1.2 : 1.2 - ((k - 0.7) / 0.3) * 0.2))
        st.bait.wiggle(t)
      }
      if (st.trailFade > 0 && st.state !== 'flight') {
        st.trailFade = Math.max(0, st.trailFade - dt * 1.4)
        setTrail(1, st.trailFade)
        if (st.trailFade <= 0) hideTrail()
      }
      const s = st.state
      if (s === 'idle') {
        turret.rotation.y += (Math.sin(t * 0.4) * 0.04 - turret.rotation.y) * Math.min(1, dt * 2)
        barrel.rotation.x += (-0.08 - barrel.rotation.x) * Math.min(1, dt * 3)
        return
      }
      if (s === 'armed') {
        turret.rotation.y += (Math.sin(t * 1.3) * 0.03 - turret.rotation.y) * Math.min(1, dt * 4)
        barrel.rotation.x += (-0.06 - st.power * 0.24 + Math.sin(t * 17) * 0.004 - barrel.rotation.x) * Math.min(1, dt * 12)
        return
      }
      if (s === 'aim') {
        const k = Math.min(1, st.t / HARPOON.aim)
        turret.rotation.y += (st.aimYaw - turret.rotation.y) * Math.min(1, dt * 12)
        barrel.rotation.x += (-0.38 - barrel.rotation.x) * Math.min(1, dt * 10)
        turret.rotation.z = Math.sin(st.t * 60) * 0.008 * k
        if (st.t >= HARPOON.aim) {
          // Fire: the spear leaves the barrel into the world at the muzzle.
          turret.rotation.z = 0
          spear.updateMatrixWorld(true)
          spear.getWorldPosition(st.start)
          scene.attach(spear)
          tipGlow.visible = true
          st.state = 'flight'
          st.t = 0
          st.recoil = 1
          st.trailFade = 1
          st.cb?.onFire?.(getMuzzle(muzzleWorld))
        }
        return
      }
      if (s === 'flight') {
        const k = Math.min(1, st.t / st.flight)
        arcPoint(k, tmp)
        vel.copy(tmp).sub(spear.position)
        spear.position.copy(tmp)
        if (vel.lengthSq() > 1e-6) spear.lookAt(tmp.add(vel))
        getMuzzle(muzzleWorld)
        setRope(muzzleWorld, ra.copy(spear.position).addScaledVector(vel.normalize(), -0.9), 0.3 + k * 2.4)
        setTrail(k, 1)
        tipGlow.material.opacity = 0.75 + Math.sin(t * 30) * 0.25
        st.cb?.onFlight?.(k, spear.position)
        if (k >= 1) {
          st.state = 'landed'
          st.t = 0
          tipGlow.visible = false
          // The bait slips off the tip onto the ground just short of it, where it wriggles.
          if (st.bait) {
            spear.updateMatrixWorld(true)
            tmp2.set(0, 0, 1.0).applyMatrix4(spear.matrixWorld)
            vel.set(st.land.x - st.start.x, 0, st.land.z - st.start.z).normalize()
            scene.add(st.bait)
            st.bait.position.set(tmp2.x, 0.02, tmp2.z).addScaledVector(vel, -0.55)
            st.bait.rotation.set(0, Math.random() * Math.PI * 2, 0)
            st.baitGround = true
            st.loadT = 0.5 // a little pop as it lands
          }
          st.cb?.onLand?.(spear.position)
        }
        return
      }
      if (s === 'landed') {
        // The spear quivers where it stuck; the rope slackens.
        spear.rotateX(Math.exp(-st.t * 5) * Math.sin(st.t * 45) * 0.03)
        getMuzzle(muzzleWorld)
        setRope(muzzleWorld, rb.copy(spear.position).addScaledVector(tmp.set(0, 0, -0.95).applyQuaternion(spear.quaternion), 1), 2.7 - Math.min(1, st.t) * 0.6)
        return
      }
      if (s === 'hooked') {
        // Strain: the turret shakes as the catch pulls.
        turret.rotation.z = Math.sin(st.t * 42) * 0.02 * st.strain
        barrel.rotation.x += (-0.05 - barrel.rotation.x) * Math.min(1, dt * 4)
      }
    },
  }
  return H
}

import { BoxGeometry, CylinderGeometry, Group, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import { BASE, GYM } from './config.js'
import { mat } from './voxel.js'
import { PoseBuffer } from './avatar/rig.js'
import { player } from './player.js'
import { inputState } from './input.js'
import { num } from './format.js'
import { snd, spatial } from './audio/index.js'

// The training ring. Press E in the ring: the player steps to its centre, squats and
// picks the weights up off the mat, then lifts on a loop, each rep = + strength and
// training XP (game.trainRep). Cancel (HUD button, or any move input) sets them down.
// The lift depends on the equipment level (GYM.moves):
//  - curl: alternating dumbbell curls (elbow pinned, small shoulder lift, slight lean back)
//  - press: barbell overhead press from the front rack (bar path clears the face, the
//    head moves back and through, a small leg drive)
//  - squat: front squat (bar racked, hips and knees fold together so the feet stay planted)
// Poses are written straight into the avatar animator's pose buffer (animator `custom`),
// with the arms placed by a two-bone IK in the sagittal plane. The weights are separate
// meshes that lie on the mat until picked up, then follow the hand bones.

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, k) => a + (b - a) * k
const smooth = (k) => k * k * (3 - 2 * k)
const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1))
// Quick start, soft finish: how a lift accelerates off the bottom and decelerates at lockout.
const liftEase = (k) => 1 - Math.pow(1 - smooth(k), 1.6)
// Rig units (player.glb): upper arm and forearm 1.2, thigh and shin 1.2; hip at 2.4.
const SEG = 1.2

// --- Two-bone arm IK -------------------------------------------------------------------------------
// Puts the hand at (ty up, tz forward) from the shoulder, in torso space. Negative X swings a
// limb forward in this rig; the elbow folds forward (negative) and stays below/behind the
// shoulder->hand line.
function armIK(out, upper, lower, ty, tz, roll = 0) {
  const d = Math.min(Math.hypot(ty, tz), SEG * 2 - 1e-3)
  const phi = Math.atan2(-tz, -ty)
  const alpha = Math.acos(clamp(d / (SEG * 2), -1, 1))
  out.set(upper, phi + alpha, 0, roll)
  out.set(lower, -2 * alpha)
}
// Hip and knee fold together (thigh forward theta, shin back theta): feet stay put, the
// pelvis drops by 2 * SEG * (1 - cos theta) rig units.
function legs(out, theta, spread = 0.07) {
  out.set('LegL1', -theta, 0, spread)
  out.set('LegR1', -theta, 0, -spread)
  out.set('LegL2', 2 * theta)
  out.set('LegR2', 2 * theta)
  return 2 * SEG * (1 - Math.cos(theta))
}

// --- Equipment models ------------------------------------------------------------------------------
const steel = () => mat.metal('#9aa3b5')
const darkSteel = () => mat.metal('#4a505e')

function plateColor(level) {
  return GYM.plates[Math.min(GYM.plates.length - 1, Math.floor((level - 1) / 4))]
}

// A voxel dumbbell, handle along X, centred on the grip.
function dumbbell(level) {
  const g = new Group()
  const s = 0.26 + Math.min(level, 5) * 0.016
  const handle = new Mesh(new CylinderGeometry(0.03, 0.03, 0.5, 10), darkSteel())
  handle.rotation.z = Math.PI / 2
  g.add(handle)
  const plate = mat.plain(plateColor(level), 0.55)
  const plates = level >= 3 ? 2 : 1
  for (const side of [-1, 1]) {
    for (let i = 0; i < plates; i++) {
      const size = s * (1 - i * 0.18)
      const m = new Mesh(new BoxGeometry(0.085, size, size), plate)
      m.position.x = side * (0.17 + i * 0.09)
      m.castShadow = true
      g.add(m)
    }
    const cap = new Mesh(new BoxGeometry(0.04, 0.09, 0.09), steel())
    cap.position.x = side * (0.17 + plates * 0.09 - 0.02)
    g.add(cap)
  }
  return { group: g, rest: s / 2 }
}

// A barbell along X, centred between the hands.
function barbell(level) {
  const g = new Group()
  const bar = new Mesh(new CylinderGeometry(0.03, 0.03, 2.1, 10), steel())
  bar.rotation.z = Math.PI / 2
  g.add(bar)
  const plate = mat.plain(plateColor(level), 0.55)
  const big = Math.min(0.72, 0.44 + (level - 5) * 0.014)
  const count = level >= 20 ? 3 : level >= 10 ? 2 : 1
  for (const side of [-1, 1]) {
    const sleeve = new Mesh(new CylinderGeometry(0.05, 0.05, 0.4, 10), darkSteel())
    sleeve.rotation.z = Math.PI / 2
    sleeve.position.x = side * 0.86
    g.add(sleeve)
    const collar = new Mesh(new BoxGeometry(0.05, 0.13, 0.13), steel())
    collar.position.x = side * 0.66
    g.add(collar)
    for (let i = 0; i < count; i++) {
      const size = big * (1 - i * 0.16)
      const m = new Mesh(new BoxGeometry(0.09, size, size), plate)
      m.position.x = side * (0.73 + i * 0.095)
      m.castShadow = true
      g.add(m)
    }
  }
  return { group: g, rest: big / 2 }
}

export function createTraining({ scene, game, base, fx, camera, onChange }) {
  const G = BASE.gym
  const S = game.S

  // --- Weights ---------------------------------------------------------------------------------------
  let kit = null // { move, level, parts: [{ group, rest }] }
  function buildKit() {
    const level = S.gym.level
    const move = game.gymMove().move
    if (kit && kit.level === level) return
    if (kit) for (const p of kit.parts) scene.remove(p.group)
    const parts = move === 'curl' ? [dumbbell(level), dumbbell(level)] : [barbell(level)]
    for (const p of parts) scene.add(p.group)
    kit = { move, level, parts, heavy: move === 'curl' ? 0 : move === 'press' ? 0.5 : 1 }
  }

  // Where each weight lies on the mat, in the training stance (facing G.facing).
  const fwd = new Vector3(Math.sin(G.facing), 0, Math.cos(G.facing))
  const right = new Vector3(-Math.cos(G.facing), 0, Math.sin(G.facing)) // the character's right
  const yawQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), G.facing)
  function restPos(i, out) {
    const p = kit.parts[i]
    if (kit.move === 'curl') {
      const side = i === 0 ? 1 : -1 // 0 = right hand
      return out.set(G.x, p.rest, G.z).addScaledVector(right, side * 0.62).addScaledVector(fwd, 0.2)
    }
    return out.set(G.x, p.rest, G.z).addScaledVector(fwd, 0.34)
  }

  // --- Hand markers on the avatar ------------------------------------------------------------------
  let hands = null // [right, left] Object3D at the grip centre
  function setAvatar(root) {
    hands = null
    if (!root?.nodes) return
    const n = root.nodes
    hands = ['R', 'L'].map((s) => {
      const marker = new Object3D()
      const lower = n[`Arm${s}2`]
      const leaf = n[`Arm${s}2_leaf`]
      if (lower && leaf && leaf.parent === lower) {
        marker.position.copy(leaf.position).multiplyScalar(0.9)
        lower.add(marker)
      } else {
        // Fallback rig: one rigid arm hanging down its bone's -Y.
        marker.position.set(0, -2.2, 0)
        n[`Arm${s}1`]?.add(marker)
      }
      return marker
    })
  }

  // --- Session state ------------------------------------------------------------------------------------
  let phase = 'off' // off | walk | pickup | reps | putdown
  let t = 0 // s in the phase
  let rep = 0 // s into the current rep
  let side = 0 // curl: 0 = right arm working, 1 = left
  let attach = 0 // 0 = weights on the mat, 1 = in the hands
  let wantStop = false
  let counted = false // this rep's gain already paid
  let breath = 0

  const poseA = new PoseBuffer()
  const poseB = new PoseBuffer()

  function start() {
    if (phase !== 'off' || !S.gym.owned) return false
    buildKit()
    phase = 'walk'
    t = 0
    wantStop = false
    player.lock = { x: G.x, z: G.z, facing: G.facing }
    base.gymBusy = true
    onChange?.(true)
    return true
  }
  function cancel() {
    if (phase === 'off' || phase === 'putdown') return
    if (phase === 'walk') return finish()
    wantStop = true // finish the current movement to its start position, then set down
    if (phase === 'pickup') {
      phase = 'putdown'
      t = Math.max(0, GYM.putdown * (1 - t / GYM.pickup))
    }
  }
  function finish() {
    phase = 'off'
    attach = 0
    player.lock = null
    base.gymBusy = false
    onChange?.(false)
  }

  // --- Lift poses -------------------------------------------------------------------------------------
  // k = 0 at the start position of the lift, 1 at the top / bottom of it. Returns the pelvis drop.
  function liftPose(out, move, k, extra) {
    out.reset()
    const breathe = Math.sin(breath * TAU * 0.4) * 0.012
    if (move === 'curl') {
      // Working arm: the elbow stays pinned while the forearm sweeps up; the shoulder rolls
      // forward a little at the top; the torso leans back a touch and twists toward it.
      const w = side === 0 ? ['ArmR1', 'ArmR2', -1] : ['ArmL1', 'ArmL2', 1]
      const f = side === 0 ? ['ArmL1', 'ArmL2', 1] : ['ArmR1', 'ArmR2', -1]
      const squeeze = extra.squeeze ? Math.sin(breath * 55) * 0.012 : 0
      out.set(w[0], -0.05 - 0.24 * k, 0, w[2] * (0.08 - 0.03 * k))
      out.set(w[1], -0.12 - 2.28 * k + squeeze)
      out.set(f[0], 0.02, 0, f[2] * 0.1)
      out.set(f[1], -0.16)
      out.set('Spine1', -0.05 * k + breathe, (side === 0 ? -1 : 1) * 0.06 * k, 0)
      out.set('Spine2', -0.02 * k, 0, 0)
      out.set('Neck1', 0.1 + 0.06 * k, (side === 0 ? -1 : 1) * 0.1, 0)
      return legs(out, 0.06)
    }
    if (move === 'press') {
      // Bar from the front rack to overhead: the path stays in front of the face until it
      // clears the head, then comes back over the shoulders at lockout.
      const ty = lerp(0.3, 2.3, k)
      const tz = 1.05 - 0.9 * smoothstep(0.5, 1, k)
      armIK(out, 'ArmR1', 'ArmR2', ty, tz, -0.04)
      armIK(out, 'ArmL1', 'ArmL2', ty, tz, 0.04)
      const pastFace = Math.sin(Math.PI * smoothstep(0.05, 0.7, k))
      out.set('Spine1', -0.07 * k + breathe, 0, 0)
      out.set('Neck1', -0.2 * pastFace + 0.08 * smoothstep(0.7, 1, k), 0, 0)
      return legs(out, 0.07 + 0.16 * (extra.dip ?? 0))
    }
    // Front squat: bar racked on the shoulders, hips back, chest up, knees out.
    armIK(out, 'ArmR1', 'ArmR2', 0.3, 1.05, -0.05)
    armIK(out, 'ArmL1', 'ArmL2', 0.3, 1.05, 0.05)
    const lean = 0.1 + 0.3 * k
    out.set('Spine1', lean + breathe, 0, 0)
    out.set('Spine2', 0.05 * k, 0, 0)
    out.set('Neck1', -lean * 0.7, 0, 0)
    return legs(out, 0.08 + 1.12 * k, 0.07 + 0.08 * k)
  }

  // Bent down at the mat, hands at the weights (k = 0 standing, 1 at the bottom).
  function reachPose(out, move, k) {
    out.reset()
    const lean = 0.62 * k
    out.set('Spine1', lean, 0, 0)
    out.set('Spine2', 0.08 * k, 0, 0)
    out.set('Neck1', -0.35 * k, 0, 0)
    const reach = move === 'curl' ? 0 : 0.18 // the bar lies a little in front of the shins
    out.set('ArmR1', -(lean + 0.08 * k) - reach * k, 0, move === 'curl' ? -0.12 * k : 0)
    out.set('ArmL1', -(lean + 0.08 * k) - reach * k, 0, move === 'curl' ? 0.12 * k : 0)
    out.set('ArmR2', -0.08)
    out.set('ArmL2', -0.08)
    return legs(out, 1.0 * k, 0.09)
  }

  // Writes the pose for this frame into the animator's buffer (animator `custom`).
  function pose(out, root) {
    const move = kit.move
    const scale = root.scale.y
    let drop = 0
    if (phase === 'pickup' || phase === 'putdown') {
      // pickup: down (0..0.45), grab, up into the lift's start (0.55..1). putdown mirrors it.
      const dur = phase === 'pickup' ? GYM.pickup : GYM.putdown
      const u = phase === 'pickup' ? t / dur : 1 - t / dur
      const down = smoothstep(0, 0.45, u)
      const up = smoothstep(0.55, 1, u)
      const d1 = reachPose(poseA, move, down)
      if (phase === 'pickup' || u > 0.55) {
        const d2 = liftPose(poseB, move, 0, {})
        out.lerpBetween(poseA, poseB, up)
        drop = lerp(d1, d2, up)
      } else {
        // Putting down ends standing empty-handed.
        poseB.reset()
        legs(poseB, 0)
        out.lerpBetween(poseA, poseB, up)
        drop = lerp(d1, 0, up)
      }
    } else {
      const { k, extra } = repState()
      drop = liftPose(out, move, k, extra)
    }
    out.bobY = -drop * scale
  }

  // Where the current rep is: k and the phase flags, from `rep` and the move's tempo.
  function repState() {
    const move = kit.move
    const T = GYM.tempo[move]
    const extra = {}
    let k = 0
    if (move === 'squat') {
      if (rep < T.down) k = smooth(rep / T.down)
      else if (rep < T.down + T.hold) k = 1
      else if (rep < T.down + T.hold + T.up) k = 1 - liftEase((rep - T.down - T.hold) / T.up)
      else k = 0
      return { k, extra }
    }
    if (rep < T.up) {
      k = liftEase(rep / T.up)
      if (move === 'press') extra.dip = Math.sin(Math.PI * clamp(rep / (T.up * 0.35), 0, 1))
    } else if (rep < T.up + T.hold) {
      k = 1
      extra.squeeze = true
    } else if (rep < T.up + T.hold + T.down) k = 1 - smooth((rep - T.up - T.hold) / T.down)
    return { k, extra }
  }
  const repLength = () => {
    const T = GYM.tempo[kit.move]
    return kit.move === 'squat' ? T.down + T.hold + T.up + T.rest : T.up + T.hold + T.down + T.rest
  }
  // The moment the rep counts: lockout (curl, press) or standing back up (squat).
  const repPay = () => {
    const T = GYM.tempo[kit.move]
    return kit.move === 'squat' ? T.down + T.hold + T.up * 0.92 : T.up * 0.95
  }

  function payRep() {
    const { gain, levelled } = game.trainRep()
    const p = player.renderPosition
    const { pan } = spatial(camera, p.x, p.z)
    snd.rep(kit.heavy, pan)
    const sideOff = kit.move === 'curl' ? (side === 0 ? -0.6 : 0.6) : 0
    fx.popup({ x: p.x + right.x * -sideOff, y: p.y + 2.3, z: p.z + right.z * -sideOff }, `+${num(gain)}`, 'str', 1.05)
    if (levelled) {
      snd.levelUp()
      fx.popup({ x: p.x, y: p.y + 3.1, z: p.z }, `Training Lv. ${S.gym.lv}!`, 'big', 1.5)
      fx.sparkle({ x: p.x, y: p.y + 1.4, z: p.z }, '#ffb12e', 36, 5)
      fx.ring({ x: G.x, y: 0.1, z: G.z }, '#d35bff', 5)
      fx.shimmer({ x: G.x, y: 0.1, z: G.z }, '#ffd27a', 26, G.r * 0.8, 4)
    } else if (kit.move !== 'curl') fx.dust({ x: p.x, y: 0, z: p.z }, '#d7c9ff', 4, 1.4, 0.6)
  }

  // --- Per frame (before the animator) ------------------------------------------------------------
  const v = new Vector3()
  function update(dt) {
    breath += dt
    if (phase === 'off') return
    t += dt
    // Walked off (respawn, teleport) or the save was reset: stop at once.
    if (Math.hypot(player.position.x - G.x, player.position.z - G.z) > G.r + 1.5 || !S.gym.owned) return finish()
    // Any move input asks to stop (the joystick on touch, WASD on desktop).
    if ((Math.hypot(inputState.move.x, inputState.move.z) > 0.3 || inputState.jump) && phase !== 'walk') cancel()
    if (phase === 'walk') {
      if (Math.hypot(inputState.move.x, inputState.move.z) > 0.3) return finish()
      const d = Math.hypot(player.position.x - G.x, player.position.z - G.z)
      const turn = Math.abs(Math.atan2(Math.sin(player.facing - G.facing), Math.cos(player.facing - G.facing)))
      if ((d < 0.06 && turn < 0.05) || t > 3) {
        buildKit()
        phase = 'pickup'
        t = 0
      }
      return
    }
    if (phase === 'pickup') {
      if (t > GYM.pickup * 0.47 && attach === 0) {
        const { pan } = spatial(camera, G.x, G.z)
        snd.weightDown(kit.heavy * 0.6, pan)
      }
      attach = smoothstep(0.42, 0.55, t / GYM.pickup)
      if (t >= GYM.pickup) {
        phase = 'reps'
        t = 0
        rep = 0
        counted = false
      }
      return
    }
    if (phase === 'reps') {
      rep += dt
      if (!counted && rep >= repPay()) {
        counted = true
        payRep()
      }
      if (rep >= repLength()) {
        rep = 0
        counted = false
        side = 1 - side
        if (wantStop || kit.level !== S.gym.level) {
          // Set it down (and pick the new equipment up after an upgrade mid-session).
          phase = 'putdown'
          t = 0
        }
      }
      return
    }
    if (phase === 'putdown') {
      const u = 1 - t / GYM.putdown
      const was = attach
      attach = smoothstep(0.42, 0.55, u)
      if (was > 0 && attach === 0) {
        const { pan } = spatial(camera, G.x, G.z)
        snd.weightDown(kit.heavy, pan)
        fx.dust({ x: G.x, y: 0, z: G.z }, '#cfc6e8', 10, 2, 0.8)
      }
      if (t >= GYM.putdown) {
        if (wantStop) return finish()
        buildKit() // upgraded mid-session: swap the equipment and go again
        phase = 'pickup'
        t = 0
      }
    }
  }

  // --- After the animator: place the weights --------------------------------------------------------
  const hr = new Vector3()
  const hl = new Vector3()
  const rest = new Vector3()
  const dir = new Vector3()
  const X = new Vector3(1, 0, 0)
  const q = new Quaternion()
  function place(playerGroup) {
    if (!S.gym.owned) {
      if (kit) for (const p of kit.parts) p.group.visible = false
      return
    }
    if (phase === 'off' || !kit) buildKit()
    for (const p of kit.parts) p.group.visible = true
    const held = attach > 0 && hands && phase !== 'off' && phase !== 'walk'
    if (held) {
      hands[0].getWorldPosition(hr)
      hands[1].getWorldPosition(hl)
    }
    playerGroup.getWorldQuaternion(q)
    kit.parts.forEach((p, i) => {
      restPos(i, rest)
      const g = p.group
      if (!held) {
        g.position.copy(rest)
        g.quaternion.copy(yawQ)
        return
      }
      if (kit.move === 'curl') {
        g.position.copy(rest).lerp(i === 0 ? hr : hl, attach)
        g.quaternion.copy(yawQ).slerp(q, attach)
      } else {
        v.copy(hr).add(hl).multiplyScalar(0.5)
        g.position.copy(rest).lerp(v, attach)
        dir.copy(hl).sub(hr).normalize()
        g.quaternion.copy(yawQ).slerp(q.setFromUnitVectors(X, dir), attach)
      }
    })
  }

  return {
    get active() {
      return phase !== 'off'
    },
    // The animator's custom pose, or null when not lifting (walk-in uses the normal gait).
    get pose() {
      return phase === 'pickup' || phase === 'reps' || phase === 'putdown' ? pose : null
    },
    start,
    cancel,
    setAvatar,
    update,
    place,
  }
}

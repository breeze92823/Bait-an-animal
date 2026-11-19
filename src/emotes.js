// Boxity emotes (docs.bloxity.io, Emotes). Boxity draws the picker; the game only plays the pick.
// The catalogue ({apiUrl}/v1/avatar/emotes, fetched once) carries a clip per emote for the
// standard player.glb rig, which this game uses, so every emote works, including ones Boxity adds
// later: clip = { len, loop, tracks: { boneName: [[timeSec, xDeg, yDeg, zDeg], ...] } }, values are
// degree DELTAS over the bind pose (euler XYZ, right-multiplied onto the bone's bind quaternion),
// smoothstep between keys, clamped outside the key range, looping on time % len.
// An EmotePlayer per character (the local player in main.js, each remote in remote.js) blends the
// clip in over EMOTE_BLEND s on top of the walk animator, and out again when stopped (the player
// moves, or picks the emote off). Unknown ids and bones are ignored; nothing here throws.
import { Euler, Quaternion } from 'three'
import { environment } from './bloxity.js'

const EMOTE_BLEND = 0.1
const DEG = Math.PI / 180
const BONES = ['Rig1', 'Spine1', 'Spine2', 'Neck_Offset', 'Neck1', 'ArmR_Offset', 'ArmR1', 'ArmR2', 'ArmL_Offset', 'ArmL1', 'ArmL2', 'LegR_Offset', 'LegR1', 'LegR2', 'LegL_Offset', 'LegL1', 'LegL2']

let catalogue = null // id -> clip
let loading = null

// Fetches the catalogue once (null without the SDK / when the platform can't be reached). apiUrl:
// the environment's API (Legion.SDK.environment()); the dev console may pass one when there is no SDK.
export function loadEmotes(apiUrl = environment()?.apiUrl) {
  if (catalogue) return Promise.resolve(catalogue)
  if (loading) return loading
  const api = apiUrl
  if (!api) return Promise.resolve(null)
  loading = fetch(`${String(api).replace(/\/$/, '')}/v1/avatar/emotes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      const list = Array.isArray(body?.emotes) ? body.emotes : []
      catalogue = new Map(list.filter((e) => e && typeof e.id === 'string' && e.clip?.tracks).map((e) => [e.id, e.clip]))
      return catalogue
    })
    .catch(() => {
      loading = null // try again on the next pick
      return null
    })
  return loading
}

function sample(keys, t) {
  if (!Array.isArray(keys) || !keys.length) return null
  if (t <= keys[0][0]) return keys[0]
  const last = keys[keys.length - 1]
  if (t >= last[0]) return last
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a[0] && t <= b[0]) {
      let s = (t - a[0]) / (b[0] - a[0] || 1)
      s = s * s * (3 - 2 * s)
      return [t, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s]
    }
  }
  return null
}

const euler = new Euler()
const delta = new Quaternion()
const target = new Quaternion()

export class EmotePlayer {
  // root: a character (avatar/character.js) still in its bind pose.
  constructor(root) {
    this.nodes = root?.nodes ?? {}
    this.bind = new Map()
    for (const name of BONES) if (this.nodes[name]) this.bind.set(name, this.nodes[name].quaternion.clone())
    this.clip = null
    this.id = ''
    this.t = 0
    this.w = 0
    this.stopping = false
  }
  // True while an emote shows (blending out included).
  get active() {
    return !!this.clip
  }
  get playing() {
    return !!this.clip && !this.stopping
  }
  // Starts emote `id` if the catalogue has it (loaded with loadEmotes()). Returns whether it did.
  play(id) {
    const clip = catalogue?.get(id)
    if (!clip || !(clip.len > 0)) return false
    if (this.clip !== clip) this.t = 0
    this.clip = clip
    this.id = id
    this.stopping = false
    return true
  }
  stop() {
    if (this.clip) this.stopping = true
  }
  // After the walk animator has posed the bones this frame.
  update(dt) {
    const c = this.clip
    if (!c) return
    try {
      this.t += dt
      this.w = Math.max(0, Math.min(1, this.w + (this.stopping ? -dt : dt) / EMOTE_BLEND))
      if (!c.loop && this.t >= c.len) this.stopping = true
      if (this.stopping && this.w <= 0) {
        this.clip = null
        this.id = ''
        return
      }
      const time = c.loop ? this.t % c.len : Math.min(this.t, c.len)
      const w = this.w * this.w * (3 - 2 * this.w)
      for (const [bone, keys] of Object.entries(c.tracks)) {
        const node = this.nodes[bone]
        const bind = this.bind.get(bone)
        if (!node || !bind) continue
        const v = sample(keys, time)
        if (!v) continue
        delta.setFromEuler(euler.set(v[1] * DEG, v[2] * DEG, v[3] * DEG, 'XYZ'))
        target.copy(bind).multiply(delta)
        node.quaternion.slerp(target, w)
      }
    } catch {
      this.clip = null // cosmetic: never break a frame
    }
  }
}

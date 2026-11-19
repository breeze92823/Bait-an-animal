// The other players in the room (up to four): their Bloxity characters walking around, and their
// plots. One room = one hub of five plots (PLOTS), one player each; the server gives every
// player a `plot` (net.js myPlot()). Every client builds the hub with ITS player's plot in the
// middle (x = 0), so the five plots sit on a ring: another player's plot shows at the slot
// (theirs - mine) wrapped to -2..2, and positions they send (in their own frame) are mapped onto
// this layout plot by plot (mapX). Everyone sees everyone at the same plot, relative to them.
//
// Per remote player:
//  - character: the base rig (player.glb) dressed in their look: the SDK character kit from their
//    outfit key, else the manual loader from their equipped ids (the default rig for guests);
//    walk / idle / jump driven by the synced speed + vertical velocity; a name tag; their pets.
//  - their plot (main.js otherPlots: a base built with boards: false, and a harpoon): the name
//    sign, the pen animals (their own wandering PenAnimals), the bait machine, the Auto Machine
//    and its tanks, the pass tanks, the training ring (net `pen` / `mach` snapshots); one-off
//    effects (net `fx`: pumps, claims, purchases, the harpoon arming and firing, the catch
//    landing in the pen) play the same particles as on their own screen; the catch on their line
//    shows while it is reeled in (net `hook`).
// A plot nobody holds goes back to the empty base.
import * as THREE from 'three'
import { Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BAITS, BASE, PLOTS, RARITIES, UPGRADES } from './config.js'
import { withColliderShift } from './propkit.js'
import { PenAnimal, animalDef, buildAnimal, setPenSouth } from './animals.js'
import { PET_MODEL } from './game.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { billboard, outlined } from './billboard.js'
import { characterKit, chatBubble, getSkinTextureUrlFor, playerInRoom, playerJoined } from './bloxity.js'
import { EmotePlayer, loadEmotes } from './emotes.js'
import { myPlot, net, onFx } from './net.js'

const N = PLOTS.xs.length
const SP = PLOTS.spacing
const HALF = (N - 1) / 2
const T = BASE.pad.h + 0.02 // top of the machine pads
// Plot difference -> slot offset on this client's layout (-HALF..HALF).
const wrap = (d) => ((((d % N) + N + HALF) % N) + N) % N - HALF
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const parse = (s) => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
const str = (v, max = 40) => (typeof v === 'string' ? v.slice(0, max) : String(v ?? '').slice(0, max))
const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback)
const kindIndex = (k) => clamp(Math.floor(Number(k) || 0), 0, BAITS.kinds.length - 1)
const unit = (v) => clamp(Number(v) || 0, 0, 1)

// plots: [{ x, base, harpoon }] for the four slots around the player's own (main.js).
export function createRemotes({ scene, fx, plots }) {
  const bySlot = new Map(plots.map((p) => [p.x, p]))
  const remotes = new Map() // sessionId -> remote
  const mouth = new Vector3()

  // A sender's own-frame x -> this layout: find which of their plots it is near, then where that
  // plot is here.
  function mapX(x, theirPlot, mine) {
    const k = clamp(Math.round(x / SP), -HALF, HALF)
    return x - k * SP + wrap(theirPlot + k - mine) * SP
  }

  // --- A plot changing hands -------------------------------------------------------------------
  // Their Expand Pen level: the fence (and its colliders, rebuilt now, so on that plot) moves, and
  // the pen animals there keep inside it.
  function setPenLevel(plot, level) {
    const b = plot.base
    if (!b.pen?.setLevel) return
    withColliderShift(plot.x, () => b.pen.setLevel(level))
    setPenSouth(plot.x, b.pen.south)
  }

  function resetPlot(plot) {
    const b = plot.base
    setPenLevel(plot, 0)
    b.names.setVacant()
    b.machine.setBait(0)
    b.machine.setFill(0)
    b.machine.setLabel(`${BAITS.kinds[0].name} Lv 1`, BAITS.kinds[0].color, 0, 1, '0', '0')
    b.machine.setReady(false)
    b.machine.setGrow(1)
    b.auto.setOwned(false)
    b.tanks.auto.set(false, '')
    b.tanks.xp.set(false, '')
    b.gym.setOwned(false)
    try {
      plot.harpoon.retract()
    } catch {
      // Already idle.
    }
  }

  function bind(r, slotX) {
    r.slot = slotX
    r.plot = bySlot.get(slotX) ?? null
    r.penKey = r.machKey = r.nameKey = null // re-applied to the new plot below
  }

  function unbind(r) {
    for (const a of r.pen.values()) a.dispose(scene)
    r.pen.clear()
    clearHook(r)
    if (r.plot) resetPlot(r.plot)
    r.plot = null
    r.slot = null
  }

  // --- Character -------------------------------------------------------------------------------
  function makeTag(r) {
    const state = { name: '' }
    const sprite = billboard(512, 96, 0.55, (ctx, w) => outlined(ctx, state.name, w / 2, 52, { px: 56, width: 12 }))
    sprite.setName = (name) => {
      if (name === state.name) return
      state.name = name
      sprite.redraw()
    }
    scene.add(sprite)
    r.tag = sprite
  }

  function setAvatar(r, root, handle) {
    if (r.avatar) {
      r.handle?.dispose?.()
      r.group.remove(r.avatar)
      disposeAnimator(r.animator)
    }
    r.avatar = root
    r.handle = handle
    r.group.add(root)
    r.animator = makeAnimator(root)
    r.emote = new EmotePlayer(root) // a new rig: any emote starts over on the next pick
  }

  // Dresses a fresh base rig in `lookJson` ({ k: outfit key, e: equipped ids, p: proportions }).
  async function loadLook(r, lookJson) {
    const mine = ++r.gen
    const look = parse(lookJson)
    try {
      const root = await loadBaseCharacter()
      if (mine !== r.gen || r.gone) return
      let handle = null
      const kit = characterKit()
      if (look?.k && kit) {
        try {
          handle = await kit.dress({ THREE, GLTFLoader, root, outfitKey: String(look.k) })
        } catch {
          handle = null
        }
      }
      if (mine !== r.gen || r.gone) return void handle?.dispose?.()
      if (!handle && look?.e && typeof look.e === 'object') {
        await attachEquippedAccessories(root, look.e, { skinTextureUrl: getSkinTextureUrlFor(look.e) })
        if (mine !== r.gen || r.gone) return
        applyProportions(root, look.p && typeof look.p === 'object' ? look.p : null)
      }
      setAvatar(r, root, handle)
    } catch (err) {
      console.warn('[remote] could not dress a player', err)
    }
  }

  function create(sid, p) {
    // Boxity's friend toasts: "you joined X" for whoever was here first, "X joined you" after.
    const name = p?.username || ''
    if (!net.initialSids || net.initialSids.has(sid)) playerInRoom(name)
    else playerJoined(name)
    const group = new Group()
    scene.add(group)
    const r = {
      sid,
      group,
      avatar: null,
      handle: null,
      animator: null,
      gen: 0,
      gone: false,
      lookKey: null,
      uid: '', // Boxity account id (verified by the server; '' = guest): chat bubbles
      bubble: null,
      emote: null,
      pos: new Vector3(),
      target: new Vector3(),
      yaw: 0,
      targetYaw: 0,
      speed: 0,
      vy: 0,
      grounded: true,
      fresh: true,
      plot: null,
      slot: null,
      pen: new Map(), // uid -> PenAnimal
      penKey: null,
      machKey: null,
      nameKey: null,
      pets: new Map(), // pet id -> { rig, pos }
      petsKey: '',
      hookKey: '',
      hookDone: '', // the hook just delivered ('caught')
      hook: null, // { rig, fresh }
      hookPos: new Vector3(),
    }
    setAvatar(r, buildDefaultCharacter(), null) // visible at once; the dressed rig swaps in
    makeTag(r)
    remotes.set(sid, r)
    return r
  }

  function remove(r) {
    r.gone = true
    r.bubble?.remove?.()
    unbind(r)
    for (const f of r.pets.values()) scene.remove(f.rig.root)
    r.pets.clear()
    r.handle?.dispose?.()
    disposeAnimator(r.animator)
    scene.remove(r.group)
    scene.remove(r.tag)
    r.tag.material.map.dispose()
    r.tag.material.dispose()
    remotes.delete(r.sid)
  }

  // --- Base display ------------------------------------------------------------------------------
  function applyPen(r, data) {
    const list = Array.isArray(data?.a) ? data.a.slice(0, 64) : []
    const keep = new Set()
    for (const row of list) {
      if (!Array.isArray(row)) continue
      const [uid, species, shiny, income] = row
      if (!animalDef(species)) continue
      const id = Number(uid) || 0
      keep.add(id)
      const have = r.pen.get(id)
      if (have) {
        have.setIncome(Math.max(0, Number(income) || 0))
        continue
      }
      const a = new PenAnimal(scene, { uid: id, species, shiny: !!shiny }, Math.max(0, Number(income) || 0), r.slot)
      a.placeRandom()
      r.pen.set(id, a)
    }
    for (const [id, a] of r.pen) {
      if (keep.has(id) || a.state === 'fly') continue // a catch still flying in is kept
      a.dispose(scene)
      r.pen.delete(id)
    }
    // Pets following them.
    const pets = Array.isArray(data?.p) ? data.p.filter((id) => PET_MODEL[id]).slice(0, 8) : []
    const key = pets.join(',')
    if (key === r.petsKey) return
    r.petsKey = key
    for (const [id, f] of r.pets) {
      if (pets.includes(id)) continue
      scene.remove(f.rig.root)
      r.pets.delete(id)
    }
    for (const id of pets) {
      if (r.pets.has(id)) continue
      const m = PET_MODEL[id]
      const rig = buildAnimal(m.id, { shiny: !!m.shiny })
      rig.root.scale.setScalar(m.scale)
      rig.root.position.copy(r.pos)
      scene.add(rig.root)
      r.pets.set(id, { rig, pos: rig.root.position })
    }
  }

  function applyTank(t, row) {
    if (!Array.isArray(row)) return
    const [k, fill, name, col, xpText, needText, ready, grow] = row
    const kind = kindIndex(k)
    t.setBait(kind)
    t.setFill(unit(fill))
    t.setLabel(str(name), color(col, BAITS.kinds[kind].color), unit(fill), 1, str(xpText, 16), str(needText, 16))
    t.setReady(!!ready)
    t.setGrow(ready ? 1 : unit(grow))
  }

  function applyMach(r, m) {
    if (!m || !r.plot) return
    const b = r.plot.base
    applyTank(b.machine, m.m)
    b.auto.setOwned(!!m.am)
    if (m.am && Array.isArray(m.at)) {
      m.at.slice(0, b.auto.tanks.length).forEach((row, i) => applyTank(b.auto.tanks[i], row))
      const rows = b.auto.tanks.map((_, i) => (Array.isArray(m.at[i]) ? m.at[i] : [0, 0]))
      b.auto.setScreen(
        rows.map((row) => unit(row[1])),
        rows.map((row) => !!row[6]),
      )
    }
    b.tanks.auto.set(!!m.ac, '')
    b.tanks.xp.set(!!m.xx, '')
    b.gym.setOwned(!!m.g)
    if (m.g) b.gym.setLabel(str(m.g))
    setPenLevel(r.plot, clamp(Math.floor(Number(m.pl) || 0), 0, UPGRADES.pen?.max ?? 0))
  }

  // The catch on their line (net `hook`): built once, placed where they report it each frame.
  function clearHook(r) {
    if (!r.hook) return
    scene.remove(r.hook.rig.root)
    r.hook = null
    r.hookKey = ''
  }
  function applyHook(r, hookJson) {
    if (!hookJson) r.hookDone = '' // the line is empty: the next catch (even the same kind) shows
    if (hookJson === r.hookKey) return
    // Delivered already ('caught' can arrive before the roster drops the hook): keep it gone.
    if (hookJson && hookJson === r.hookDone) return
    r.hookDone = ''
    clearHook(r)
    r.hookKey = hookJson
    const h = parse(hookJson)
    if (!h || !animalDef(h.s)) return
    const rig = buildAnimal(h.s, { shiny: !!h.h })
    scene.add(rig.root)
    r.hook = { rig, fresh: true }
  }

  // --- Roster -> remotes -------------------------------------------------------------------------
  function sync(r, p, mine) {
    const slotX = wrap(p.plot - mine) * SP
    if (slotX !== r.slot) {
      unbind(r)
      if (slotX !== 0) bind(r, slotX)
    }
    const name = p.username || 'Player'
    r.tag.setName(name)
    r.uid = p.uid || ''
    const nameKey = `${name}|${p.pfp}`
    if (r.plot && nameKey !== r.nameKey) {
      r.nameKey = nameKey
      r.plot.base.names.setName(name, p.pfp || null)
    }
    if (p.look !== r.lookKey) {
      r.lookKey = p.look
      loadLook(r, p.look)
    }
    r.target.set(mapX(p.x, p.plot, mine), p.y, p.z)
    r.targetYaw = p.yaw
    r.speed = p.speed
    r.vy = p.vy
    r.grounded = p.grounded
    // Hidden until their first position arrives (the roster starts every player at 0, 0, 0:
    // the middle of their pen), then placed there at once.
    if (r.fresh && (p.x !== 0 || p.y !== 0 || p.z !== 0)) {
      r.fresh = false
      r.pos.copy(r.target)
      r.yaw = r.targetYaw
    }
    const shown = !r.fresh
    r.group.visible = r.tag.visible = shown
    for (const f of r.pets.values()) f.rig.root.visible = shown
    if (!r.plot) return
    if (p.pen !== r.penKey) {
      r.penKey = p.pen
      applyPen(r, parse(p.pen))
    }
    if (p.mach !== r.machKey) {
      r.machKey = p.mach
      applyMach(r, parse(p.mach))
    }
    applyHook(r, p.hook)
    if (r.hook) r.hookPos.set(mapX(p.hx, p.plot, mine), p.hy, p.hz)
  }

  // --- One-off effects (net `fx`) -------------------------------------------------------------
  // Positions in BASE are the player's own plot: + the slot's x for theirs.
  const at = (r, x, y, z) => ({ x: r.slot + x, y, z })
  onFx(({ s, t, d }) => {
    const r = remotes.get(s)
    if (!r?.plot) return
    const b = r.plot.base
    const H = r.plot.harpoon
    const M = BASE.machine
    const machineAt = at(r, M.x, T + 2.4, M.z)
    switch (t) {
      case 'pump': {
        b.buttons.pump.press()
        b.machine.pump()
        const kind = BAITS.kinds[kindIndex(parse(r.machKey)?.m?.[0])]
        fx.splash(machineAt, kind.accent, 6)
        if (d?.l) {
          fx.sparkle(machineAt, kind.accent, 40, 6, 0.6)
          fx.ring(at(r, M.x, T, M.z), '#7dff6a', 5)
          fx.shimmer(at(r, M.x, T + 1, M.z), '#fff6a0', 26, 1.4, 5)
        }
        break
      }
      case 'claim': {
        b.machine.setGrow(0)
        const kind = BAITS.kinds[kindIndex(parse(r.machKey)?.m?.[0])]
        fx.sparkle(machineAt, kind.color, 26, 4)
        break
      }
      case 'claimAuto': {
        const i = clamp(Math.floor(Number(d?.i) || 0), 0, BASE.autoMachine.tanks.length - 1)
        b.auto.tanks[i]?.setGrow(0)
        const tk = BASE.autoMachine.tanks[i]
        fx.sparkle(at(r, tk.x, T + 2, tk.z), '#7ff6ff', 26, 4)
        break
      }
      case 'bought': {
        const id = d?.id
        if (id === 'autoMachine') {
          b.auto.setOwned(true, true)
          for (const tk of BASE.autoMachine.tanks) fx.shimmer(at(r, tk.x, T, tk.z), '#7ff6ff', 30, 1.4, 6)
          fx.confetti(at(r, BASE.autoPad.x, 3, BASE.autoPad.z), undefined, 50)
          fx.ring(at(r, BASE.autoPad.x, T, BASE.autoPad.z), '#7ff6ff', 8)
        } else if (id === 'gym') {
          b.gym.setOwned(true, true)
          fx.confetti(at(r, BASE.gym.x, 2.5, BASE.gym.z), undefined, 44)
          fx.ring(at(r, BASE.gym.x, 0.1, BASE.gym.z), '#d35bff', 6)
        } else if (id === 'autoClick' || id === 'x2xp') {
          const tk = id === 'autoClick' ? BASE.tanks.auto : BASE.tanks.xp
          b.tanks[id === 'autoClick' ? 'auto' : 'xp'].set(true, '')
          fx.sparkle(at(r, tk.x, 2.5, tk.z + 0.5), '#7dff6a', 36, 5)
          fx.ring(at(r, tk.x, T, tk.z), '#7dff6a', 4)
        }
        break
      }
      case 'emote':
        if (typeof d?.id === 'string' && d.id.length <= 64) loadEmotes().then(() => !r.gone && r.emote?.play(d.id))
        break
      case 'emoteStop':
        r.emote?.stop()
        break
      case 'rep':
        fx.sparkle(at(r, BASE.gym.x, 2, BASE.gym.z), '#e7a6ff', 10, 3)
        break
      case 'arm':
        H.arm(kindIndex(d?.k))
        break
      case 'disarm':
        H.disarm()
        break
      case 'fire': {
        const x = Number(d?.x)
        const z = Number(d?.z)
        if (!Number.isFinite(x) || !Number.isFinite(z)) break
        // Armed already (their 'arm' came first); otherwise put a bait on and fire anyway.
        if (H.state !== 'armed') {
          if (H.busy) H.retract()
          H.arm(kindIndex(parse(r.machKey)?.m?.[0]))
        }
        H.fire(new Vector3(r.slot + x, 0, z), clamp(Number(d.f) || 1, 0.2, 6), clamp(Number(d.a) || 8, 1, 40), {})
        break
      }
      case 'caught': {
        // The catch jumps from the harpoon into their pen (the snapshot then keeps it).
        H.retract()
        r.hookDone = r.hookKey
        clearHook(r)
        if (!animalDef(d?.s)) break
        const uid = Number(d.u) || 0
        if (r.pen.has(uid)) break
        const from = H.deliveryPoint(new Vector3())
        const rarity = RARITIES.find((x) => x.id === animalDef(d.s).rarity)
        const a = new PenAnimal(scene, { uid, species: d.s, shiny: !!d.h }, 0, r.slot)
        a.flyFrom(from, 1.1, (an) => {
          fx.dust(an.root.position, '#d9f0b0', 18, 3, 1)
          fx.ring(an.root.position, '#ffffff', 3.5)
        })
        r.pen.set(uid, a)
        fx.sparkle({ x: from.x, y: 1.5, z: from.z }, rarity?.color ?? '#ffffff', 30, 5, 0.55)
        fx.ring(from, rarity?.color ?? '#ffffff', 4)
        if (d.h) fx.beam(from, '#ffd23a', 12, 2.4)
        r.penKey = null // re-read the snapshot (income, the exact list)
        break
      }
    }
  })

  // --- Per frame -------------------------------------------------------------------------------
  return {
    remotes,
    // A Boxity chat message from another player: a bubble over their character, matched by the
    // account id the server verified (a guest, or someone not in this room: no bubble).
    // The local player's own message, over their own character.
    bubbleLocal(target, message) {
      chatBubble(THREE, target, message, { height: 2.6 })
    },
    bubble(message) {
      const id = String(message?.userId ?? '').replace(/^legion_/, '')
      if (!id) return
      for (const r of remotes.values()) {
        if (r.uid !== id || !r.group.visible) continue
        r.bubble = chatBubble(THREE, r.group, message, { height: 3.15 }) ?? r.bubble
        return
      }
    },
    update(dt, t) {
      const room = net.room
      const mine = myPlot()
      const seen = new Set()
      if (room?.state?.players && mine >= 0) {
        room.state.players.forEach((p, sid) => {
          if (sid === room.sessionId || !(p.plot >= 0)) return
          seen.add(sid)
          sync(remotes.get(sid) ?? create(sid, p), p, mine)
        })
      }
      for (const r of [...remotes.values()]) if (!seen.has(r.sid)) remove(r)

      const k = 1 - Math.exp(-12 * dt)
      for (const r of remotes.values()) {
        // Smooth toward the reported position (a jump across the ring, or a respawn, snaps).
        if (r.pos.distanceTo(r.target) > 12) r.pos.copy(r.target)
        else r.pos.lerp(r.target, k)
        let dy = r.targetYaw - r.yaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        r.yaw += dy * k
        r.group.position.copy(r.pos)
        r.group.rotation.y = r.yaw
        r.animator?.update(dt, { grounded: r.grounded, speed: r.speed, verticalVelocity: r.vy, turn: 0 })
        if (r.emote?.playing && (r.speed > 0.6 || !r.grounded)) r.emote.stop() // emotes stop on movement
        r.emote?.update(dt)
        r.tag.position.set(r.pos.x, r.pos.y + 2.55, r.pos.z)

        // Pets trail them (the same formation as the player's own).
        let i = 0
        for (const f of r.pets.values()) {
          const side = i % 2 ? 1 : -1
          const back = 2.2 + Math.floor(i / 2) * 1.4
          const fx0 = r.pos.x - Math.sin(r.yaw) * back + Math.cos(r.yaw) * side * 1.4
          const fz0 = r.pos.z - Math.cos(r.yaw) * back - Math.sin(r.yaw) * side * 1.4
          const dx = fx0 - f.pos.x
          const dz = fz0 - f.pos.z
          const d = Math.hypot(dx, dz)
          if (d > 20) f.pos.set(fx0, 0, fz0)
          else {
            f.pos.x += dx * Math.min(1, dt * 5)
            f.pos.z += dz * Math.min(1, dt * 5)
          }
          f.pos.y = 0.15 + Math.abs(Math.sin(t * 5 + i)) * 0.25
          if (d > 0.05) f.rig.root.rotation.y = Math.atan2(dx, dz)
          f.rig.animate(dt, Math.min(8, d * 5), t, 'walk')
          i++
        }

        // Their pen.
        const list = [...r.pen.values()]
        for (const a of list) a.update(dt, t, list)

        // The catch on their line: where they report it, facing their harpoon, the spear in its mouth.
        if (r.hook && r.plot) {
          const root = r.hook.rig.root
          if (r.hook.fresh) {
            root.position.copy(r.hookPos)
            r.hook.fresh = false
          } else root.position.lerp(r.hookPos, k)
          const hx = r.slot + BASE.harpoon.x - root.position.x
          const hz = BASE.harpoon.z - root.position.z
          root.rotation.y = Math.atan2(hx, hz)
          r.hook.rig.animate(dt, 0, t, 'flail')
          if (r.hook.rig.head) {
            root.updateMatrixWorld(true)
            r.hook.rig.head.getWorldPosition(mouth)
          } else mouth.copy(root.position).setY(r.hook.rig.height * 0.7)
          r.plot.harpoon.hold(mouth, 0.2, 0.35)
        }
      }
    },
  }
}

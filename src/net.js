// Colyseus link to ../Bait-an-animal-backend (room "world"), trimmed from the Bowling Roll client.
// Signed-in players' progress lives on the server: on join it answers with `progress` (the saved
// doc; its `save` field is the game state -> game.hydrate), `noProgress` (new account, guest or no
// database: keep the current state and save it) or `serverError` (the save could not be read:
// never overwrite it). From then on every game.save() goes to the server as `saveProgress`
// { save: S } when it changed, at most every NET.saveEvery s, and right away when the tab hides
// or closes. The server bounds the save (backend src/baitSave.ts).
// Progress is NEVER saved in this browser: guests (not signed in to Bloxity), and everyone when no
// server is configured, play without saving (their progress lasts the page). A guest who signs in
// to a NEW account brings that in-memory progress along; an account with a save loads it instead.
// Signing out starts a fresh guest game.
// Never throws and never blocks play: without a server the game just runs unsaved.
//
// Presence (one room = one hub of five plots, one player each; the server assigns `plot`):
// tickPresence() streams this player's character (`move`, ~10/s), Bloxity look (`look`: outfit key
// + equipped ids + proportions) and base display (`base`: game.baseSnapshot() + the hooked catch)
// into the room's roster; presence.js sendFx() events go out as `fx`, and the others' come back
// through onFx(). remote.js reads the roster (net.room.state.players) and draws everyone else.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import { authState, canResolveServer, getEquippedAvatar, getOutfitKey, getPfp, getProportions, getToken, launchRoomId, locateRoom, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { setFxSender } from './presence.js'

export const net = { room: null, connected: false, hydrated: false }

// --- Identity ---------------------------------------------------------------------
// Signed-in players use their Bloxity id; everyone else a per-browser guest id (never saved on the
// server). Dev mode (no SDK) plays as a per-browser dev id, so a local server with Mongo keeps it.
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('bait-an-animal.guest', () => `guest-${rand()}`)
const DEV = DEV_MODE ? storedId('bait-an-animal.dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuestId = (id) => id.startsWith('guest-')

export const hasServer = () => !!(SERVER_URL || canResolveServer())
// --- Saving -----------------------------------------------------------------------
let game = null
let lastSent = ''
let sentAt = 0
let sentId = '' // the identity this connection was opened / last identified with
let loadedId = '' // the identity whose server save is in the game right now

function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

// Pushes the game state if it changed. `force` skips the NET.saveEvery throttle.
function serverSave(force = false) {
  if (!game || !net.connected || !net.hydrated || isGuestId(sentId)) return
  if (!force && performance.now() - sentAt < NET.saveEvery * 1000) return
  const snap = JSON.stringify(game.S)
  if (snap === lastSent) return
  lastSent = snap
  sentAt = performance.now()
  send('saveProgress', { save: JSON.parse(snap) })
}

// game.save() lands here: only the server stores progress (and only for signed-in players: it
// ignores guests). Nothing is sent until auth has settled.
function persist(state, force = false) {
  if (hasServer() && !authState.ready) return
  serverSave(force)
}
const flush = () => game && persist(game.S, true)

// --- Presence ---------------------------------------------------------------------
const fxListeners = new Set()
// fn({ s: sessionId, t, d }) for every effect another player's game sent (remote.js).
export function onFx(fn) {
  fxListeners.add(fn)
  return () => fxListeners.delete(fn)
}
// This connection's plot (0..4), or -1 while not in a room.
export function myPlot() {
  try {
    return net.room?.state?.players?.get(net.room.sessionId)?.plot ?? -1
  } catch {
    return -1
  }
}

const sent = { moveAt: 0, move: '', baseAt: 0, pen: '', mach: '', hook: '', lookAt: 0, look: '' }
const r2 = (v) => Math.round(v * 100) / 100

// The look the others dress this player's character in. Guests wear the default rig (as they do
// on their own screen, main.js loadAvatar).
function lookJson() {
  if (!authState.user) return ''
  const k = getOutfitKey()
  const e = getEquippedAvatar()
  const p = getProportions()
  return k || e ? JSON.stringify({ k, e, p }) : ''
}

// Called every frame by main.js. now: seconds. me: { x, y, z, yaw, speed, vy, grounded } (own
// frame). snapshot(): game.baseSnapshot(). hook(): baitFlow.hookState().
export function tickPresence(now, me, snapshot, hook) {
  if (!net.connected || !net.room) return
  try {
    const h = hook?.() ?? null
    if (now - sent.moveAt >= NET.moveEvery) {
      const msg = { x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r2(me.yaw), speed: r2(me.speed), vy: r2(me.vy), grounded: !!me.grounded }
      if (h) Object.assign(msg, { hx: r2(h.x), hy: r2(h.y), hz: r2(h.z) })
      const key = JSON.stringify(msg)
      if (key !== sent.move) {
        sent.move = key
        sent.moveAt = now
        send('move', msg)
      }
    }
    if (now - sent.baseAt >= NET.baseEvery) {
      sent.baseAt = now
      const snap = snapshot?.() ?? {}
      const hookKey = h ? JSON.stringify({ s: h.s, h: h.h }) : ''
      const msg = {}
      if (snap.pen != null && snap.pen !== sent.pen) msg.pen = sent.pen = snap.pen
      if (snap.mach != null && snap.mach !== sent.mach) msg.mach = sent.mach = snap.mach
      if (hookKey !== sent.hook) msg.hook = sent.hook = hookKey
      if (Object.keys(msg).length) send('base', msg)
    }
    if (now - sent.lookAt >= 1) {
      sent.lookAt = now
      const look = lookJson()
      if (look !== sent.look) {
        sent.look = look
        send('look', { look })
      }
    }
  } catch (err) {
    console.warn('[net] presence failed', err)
  }
}

// --- Connection -------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  // The players already here when this player arrived (remote.js: "you joined X" vs "X joined you").
  net.initialSids = null
  room.onStateChange((state) => {
    if (net.initialSids || net.room !== room) return
    net.initialSids = new Set()
    state.players?.forEach((_, sid) => net.initialSids.add(sid))
  })
  room.onMessage('adReward', (m) => {
    const done = adPending
    adPending = null
    done?.(m && typeof m === 'object' ? m : { ok: false })
  })
  // A new room knows nothing about this player yet: everything goes out again.
  Object.assign(sent, { moveAt: 0, move: '', baseAt: 0, pen: '', mach: '', hook: '', lookAt: 0, look: '' })
  setFxSender((t, d) => send('fx', d === undefined ? { t } : { t, d }))
  room.onMessage('fx', (m) => {
    for (const fn of fxListeners) {
      try {
        fn(m)
      } catch (err) {
        console.warn('[net] fx listener threw', err)
      }
    }
  })
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSent = ''
    // A reconnect under the same identity: this tab is newer than the save, so push it instead.
    if (loadedId === sentId || !doc?.save) {
      loadedId = sentId
      return flush()
    }
    loadedId = sentId
    game.hydrate(doc.save)
    game.ui.toast?.('Progress loaded!', true)
    flush()
  })
  room.onMessage('noProgress', () => {
    net.hydrated = true
    loadedId = sentId
    lastSent = ''
    flush()
  })
  room.onMessage('serverError', () => {
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving is off for this session')
  })
  room.onLeave(() => {
    if (net.room !== room) return
    setFxSender(null)
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    setTimeout(connect, NET.retry * 1000)
  })
}

// The page's ?roomId= (Boxity's Open Rooms Join button or a friend invite), tried on the first
// connect only: joined through the pod that holds it (locateRoom), else normal matchmaking.
let launchRoom = launchRoomId()
async function joinRoom(options, userId) {
  const launch = launchRoom
  launchRoom = ''
  if (SERVER_URL) {
    const client = new Client(SERVER_URL)
    if (launch) {
      try {
        return { room: await client.joinById(launch.split('~').pop(), options), relay: '' }
      } catch (err) {
        console.info('[net] the linked room is gone or full; matchmaking instead', err?.message ?? err)
      }
    }
    return { room: await client.joinOrCreate('world', options), relay: '' }
  }
  if (launch) {
    try {
      const at = await locateRoom(launch)
      if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
    } catch (err) {
      console.info('[net] the linked room is gone or full; matchmaking instead', err?.message ?? err)
    }
  }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(userId) ? undefined : userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

// --- Rewarded ads ----------------------------------------------------------------------------------
// The server checks the ad's reward token with Boxity before the reward is granted. Resolves to
// { ok, potion, minutes } (ok: false = not granted), or null when there is no server to ask.
let adPending = null
export function requestAdReward(rewardToken) {
  if (!net.connected || !net.room) return Promise.resolve(null)
  adPending?.({ ok: false })
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (adPending === done) adPending = null
      resolve({ ok: false })
    }, 15000)
    const done = (m) => {
      clearTimeout(timer)
      resolve(m)
    }
    adPending = done
    send('adReward', { rewardToken })
  })
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    // The server verifies the Boxity token; it never takes an account id from the client.
    const { room, relay } = await joinRoom({ username: id.username, pfp: getPfp(), token: getToken() ?? '' }, id.userId)
    retryIn = NET.retry
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing unsaved`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

// g: the game (game.js). Its saves are routed through persist() from here on.
export function initNet(g) {
  game = g
  game.setPersist((state) => persist(state))
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.hidden && flush())
  if (!hasServer()) return console.info('[net] no server configured; progress is not saved')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    // Save under the OLD identity before switching (auth has already moved on). A guest has
    // nothing stored: its in-memory progress goes along to a NEW account (`noProgress`).
    if (!isGuestId(sentId) && net.hydrated) {
      lastSent = ''
      sentAt = 0
      const snap = JSON.stringify(game.S)
      send('saveProgress', { save: JSON.parse(snap) })
    }
    net.hydrated = false
    // Signed out: a fresh guest game (the account's progress stays on the server).
    if (isGuestId(id.userId)) {
      game.hydrate(null)
      loadedId = ''
    }
    sentId = id.userId
    send('identify', { username: id.username, pfp: getPfp(), token: getToken() ?? '' })
  })
}

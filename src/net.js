// Colyseus link to ../Bait-an-animal-backend (room "world"), trimmed from the Bowling Roll client.
// Signed-in players' progress lives on the server: on join it answers with `progress` (the saved
// doc; its `save` field is the game state -> game.hydrate), `noProgress` (new account, guest or no
// database: keep the current state and save it) or `serverError` (the save could not be read:
// never overwrite it). From then on every game.save() goes to the server as `saveProgress`
// { save: S } when it changed, at most every NET.saveEvery s, and right away when the tab hides
// or closes. The server bounds the save (backend src/baitSave.ts).
// Guests (not signed in to Bloxity), and everyone when no server is configured, keep their
// progress in this browser (localStorage, SAVE.key) as before. A guest who signs in to a NEW
// account brings that progress along; an account with a save loads it instead. Signing out goes
// back to the browser's guest save.
// Never throws and never blocks play: without a server the game runs on the browser save.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SAVE, SERVER_URL } from './config.js'
import { authState, canResolveServer, getPfp, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

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
const keepsLocal = () => !hasServer() || isGuestId(identity().userId)

// --- Browser save ------------------------------------------------------------------
function localLoad() {
  try {
    return JSON.parse(localStorage.getItem(SAVE.key) || 'null')
  } catch {
    return null
  }
}
function localSave(state) {
  try {
    localStorage.setItem(SAVE.key, JSON.stringify(state))
  } catch {
    // Private mode / storage full: this session's progress lasts the page.
  }
}

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

// game.save() lands here: the browser for guests / no server, the server for signed-in players
// (nothing until auth has settled, since who is playing decides where).
function persist(state, force = false) {
  if (hasServer() && !authState.ready) return
  if (keepsLocal()) localSave(state)
  else serverSave(force)
}
const flush = () => game && persist(game.S, true)

// --- Connection -------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
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
  // Messages this game doesn't use yet (the template server sends them).
  for (const type of ['spins', 'daily', 'leaderboard']) room.onMessage(type, () => {})
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    setTimeout(connect, NET.retry * 1000)
  })
}

async function joinRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const { room, relay } = await joinRoom({ ...id, pfp: getPfp() })
    retryIn = NET.retry
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing on the browser save`, err?.message ?? err)
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
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    // Save under the OLD identity before switching (auth has already moved on).
    if (isGuestId(sentId)) localSave(game.S)
    else if (net.hydrated) {
      lastSent = ''
      sentAt = 0
      const snap = JSON.stringify(game.S)
      send('saveProgress', { save: JSON.parse(snap) })
    }
    net.hydrated = false
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) {
      game.hydrate(localLoad())
      loadedId = ''
    }
    sentId = id.userId
    send('identify', { ...id, pfp: getPfp() })
  })
}

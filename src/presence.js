// Multiplayer presence hub: what the rest of the game tells the other players. game.js and
// baitFlow.js call sendFx() for one-off effects on the player's own plot (a pump, a claim, the
// harpoon firing, a catch landing in the pen); net.js plugs in the real sender once a room is
// joined (until then, and when playing offline, it does nothing). remote.js plays them back on
// the sender's plot on everyone else's screen. Kept import-free so anything can use it.
//
// Event types (backend WorldRoom.ts FX_TYPES) and their data, all in the sender's own frame
// (their plot at x = 0):
//   pump { l: 1 when the bait levelled }   claim {}   claimAuto { i }   bought { id }
//   arm { k: bait kind }   disarm {}   fire { x, z, f: flight s, a: arc m }
//   caught { s: species, h: shiny 0/1, u: pen uid }   rep {}

let sender = null

// fn(type, data) or null: set by net.js.
export function setFxSender(fn) {
  sender = fn
}

export function sendFx(type, data) {
  try {
    sender?.(type, data)
  } catch {
    // Presence is cosmetic: never let it break the game.
  }
}

import { Vector3 } from 'three'
import { ANIMALS, ANIMAL_SELL_MULT, INDEX, NEXT_SHOT, ZONES, laneLength, AUDIO, BAITS, BASE, GYM, HARPOON, MACHINE, OFFER, OFFLINE, PASSES, PETS, PLAY_BOOST, RARITIES, SAVE, SHINY, START_MONEY, STORE, UPGRADES as U } from './config.js'
import { PenAnimal, animalDef, buildAnimal, rarityDef } from './animals.js'
import { baitName, buildBait, kindOf } from './bait.js'
import { money as fmt, num } from './format.js'
import { snd, sfx, spatial } from './audio/index.js'
import { player } from './player.js'

// The game rules and state: money, the bait machine (XP, levels, regrowing bait),
// the carried baits, upgrades, passes, potions, pets, the pen's animals and the
// index. Actions are methods (pump, claim, attach, buy*, sell*); update(dt, t)
// runs the automation (Auto Click, Auto Machine), the bait regrowth, income
// ticks (+$ popups and clinks over each animal), timers and the in-world displays.
// The HUD plugs in through game.ui (toast, banner, open windows).
// State persists to localStorage (SAVE.key).

const T = BASE.pad.h + 0.02
const MACHINE_AT = new Vector3(BASE.machine.x, T + 2.4, BASE.machine.z)

function defaults() {
  return {
    v: 1,
    money: START_MONEY,
    earned: 0,
    catches: 0,
    best: null, // { species, shiny }
    machine: { p: 0, xp: 0 },
    baitReady: true,
    baits: [], // carried baits: overall level index p of each
    selected: 0,
    up: { mult: 0, xp: 0, slot: 0, autoSpeed: 0 },
    // The Auto Machine's three tanks (once passes.autoMachine is owned): each grows its own bait.
    auto: [0, 1, 2].map((i) => ({ p: 0, xp: BAITS.xpBase * MACHINE.autoStagger * i, ready: true })),
    passes: { autoClick: false, x2xp: false, x2cash: false, x2luck: false, autoMachine: false },
    animals: [], // { uid, species, shiny }
    pets: { owned: [], equipped: [] },
    index: {}, // species -> { n, shiny }
    indexSeen: true,
    potions: { luck: 0, cash: 0, xp: 0 }, // end time, ms since epoch
    offerEnds: 0,
    packEnds: 0, // the Shop's Starter Pack offer timer (STORE.pack)
    packBought: false,
    freeClaimed: false,
    lastSeen: 0, // ms since epoch at the last save (offline earnings)
    claimed: {}, // species -> true once its Pet Index reward is claimed
    nextShot: false, // the Next Shot 100x Luck is bought and waiting for the next shot
    // The training ring: level = equipment level (upgrade pad), lv/xp = training level.
    gym: { owned: false, level: 1, strength: 0, lv: 1, xp: 0 },
  }
}

// The browser save, or `given` (a save from the game server, net.js) merged over the defaults.
function load(given) {
  const s = defaults()
  try {
    const raw = given !== undefined ? given : JSON.parse(localStorage.getItem(SAVE.key) || 'null')
    if (raw && raw.v === 1) {
      for (const k of Object.keys(s)) {
        if (raw[k] === undefined) continue
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) s[k] = { ...s[k], ...raw[k] }
        else s[k] = raw[k]
      }
    }
  } catch {
    // Corrupt or blocked storage: a fresh start.
  }
  s.baits = s.baits.filter((p) => Number.isFinite(p)).slice(0, BAITS.carryMax)
  if (!Array.isArray(s.auto) || s.auto.length !== 3) s.auto = defaults().auto
  s.animals = s.animals.filter((a) => animalDef(a.species))
  return s
}

const petDef = (id) => PETS.list.find((p) => p.id === id)
// Pet followers reuse animal models at a small scale.
const PET_MODEL = { dino: { id: 'raptor', scale: 0.42 }, chick: { id: 'duck', scale: 0.55, shiny: true }, mammoth: { id: 'mammoth', scale: 0.36 } }

export function createGame({ scene, base, harpoon, fx, camera }) {
  const S = load()
  const animals = [] // PenAnimal
  let play = 0 // s played this session (Play Boost)
  let saveIn = SAVE.every
  let autoPump = 0
  let regrow = S.baitReady ? 0 : BAITS.regrow
  const autoRegrow = S.auto.map((t) => (t.ready ? 0 : BAITS.regrow))
  let signsIn = 0
  let recordsIn = 0
  let lastPumpSound = 0
  let uid = S.animals.reduce((m, a) => Math.max(m, a.uid ?? 0), 0) + 1

  const ui = { toast() {}, banner() {}, openSell() {}, gain() {}, train() {} } // replaced by the HUD / training

  // --- Derived values ----------------------------------------------------------------------
  const now = () => Date.now()
  const potionOn = (id) => S.potions[id] > now()
  const petBonus = (key) => S.pets.equipped.reduce((a, id) => a + (petDef(id)?.[key] ?? 0), 0)
  const capacity = () => U.slot.start + S.up.slot
  const xpNeed = (p = S.machine.p) => BAITS.xpBase * Math.pow(BAITS.xpGrowth, p)
  const xpBase = (lvl = S.up.xp) => MACHINE.xpPerPump * Math.pow(U.xp.ratio, lvl)
  const xpPerPump = () => xpBase() * (S.passes.x2xp ? 2 : 1) * (potionOn('xp') ? 2 : 1)
  const playBoost = () => Math.min(PLAY_BOOST.max, Math.floor(play / (PLAY_BOOST.every * 60)) * PLAY_BOOST.step)
  const multValue = (lvl = S.up.mult) => 1 + U.mult.step * lvl
  // Zones with every animal found in the Index add INDEX.zoneBonus each.
  let zonesDone = 0
  const countZones = () => (zonesDone = ZONES.filter((z) => ANIMALS.every((a) => a.zone !== z.id || S.index[a.id]?.n)).length)
  countZones()
  const cashMult = () => multValue() * (S.passes.x2cash ? 2 : 1) * (potionOn('cash') ? 2 : 1) * (1 + petBonus('cash')) * (1 + playBoost()) * (1 + INDEX.zoneBonus * zonesDone)
  const luck = () => (1 + petBonus('luck')) * (potionOn('luck') ? 2 : 1) * (S.passes.x2luck ? 2 : 1)
  const baseIncome = (a) => animalDef(a.species).income * (a.shiny ? SHINY.mult : 1)
  const incomeOf = (a) => baseIncome(a) * cashMult()
  const cost = {
    mult: () => Math.round(U.mult.base * Math.pow(U.mult.growth, S.up.mult)),
    xp: () => Math.round(U.xp.base * Math.pow(U.xp.growth, S.up.xp)),
    slot: () => Math.round(U.slot.base * Math.pow(U.slot.growth, S.up.slot)),
    autoSpeed: () => Math.round(U.autoSpeed.base * Math.pow(U.autoSpeed.growth, S.up.autoSpeed)),
  }
  const autoBase = (lvl = S.up.autoSpeed) => MACHINE.autoXpPerSecond * Math.pow(U.autoSpeed.ratio, lvl)
  const autoRate = () => autoBase() * (S.passes.x2xp ? 2 : 1) * (potionOn('xp') ? 2 : 1)
  const maxed = { mult: () => S.up.mult >= U.mult.max, xp: () => S.up.xp >= U.xp.max, slot: () => capacity() >= U.slot.max, autoSpeed: () => S.up.autoSpeed >= U.autoSpeed.max }
  const baitValue = (p) => Math.round(BAITS.sellBase * Math.pow(BAITS.sellGrowth, p))
  const animalValue = (a) => Math.round(baseIncome(a) * ANIMAL_SELL_MULT)
  // Training ring.
  const gymPerRep = (level = S.gym.level, lv = S.gym.lv) => GYM.perRep * Math.pow(GYM.perRepGrowth, level - 1) * (1 + GYM.lvBonus * (lv - 1))
  const gymXpNeed = (lv = S.gym.lv) => GYM.xpBase + lv + Math.floor((lv * lv) / 25)
  const gymCost = () => Math.round(GYM.upgrade.base * Math.pow(GYM.upgrade.growth, S.gym.level - 1))
  const gymMaxed = () => S.gym.level >= GYM.upgrade.max
  const gymMove = (level = S.gym.level) => GYM.moves.reduce((m, x) => (level >= x.from ? x : m), GYM.moves[0])
  const gymUnlocked = () => S.gym.owned || animals.length >= GYM.needAnimals
  const rarityIndex = (species) => RARITIES.findIndex((r) => r.id === animalDef(species).rarity)

  function spend(amount, label) {
    if (S.money < amount) {
      ui.toast(`Need ${fmt(amount - S.money)} more!`, false)
      sfx.deny()
      return false
    }
    S.money -= amount
    ui.gain(-amount)
    if (label) ui.toast(label, true)
    sfx.purchase()
    return true
  }
  function earn(amount) {
    S.money += amount
    S.earned += amount
    ui.gain(amount)
  }

  // --- Rolling a catch ------------------------------------------------------------------------
  function roll(p) {
    const L = luck()
    const weights = RARITIES.map((r, i) => r.weight * Math.exp(r.k * p) * (i > 0 ? L : 1))
    let x = Math.random() * weights.reduce((a, b) => a + b, 0)
    let ri = 0
    while (ri < weights.length - 1 && x >= weights[ri]) {
      x -= weights[ri]
      ri++
    }
    const pool = ANIMALS.filter((a) => a.rarity === RARITIES[ri].id)
    const def = pool[Math.floor(Math.random() * pool.length)]
    return { species: def.id, shiny: Math.random() < SHINY.chance * L }
  }
  // Rarity odds (%) for the bait power p, for the HUD/windows.
  function odds(p) {
    const L = luck()
    const w = RARITIES.map((r, i) => r.weight * Math.exp(r.k * p) * (i > 0 ? L : 1))
    const sum = w.reduce((a, b) => a + b, 0)
    return w.map((x) => (x / sum) * 100)
  }

  // --- Pen ------------------------------------------------------------------------------------
  function spawnAnimal(data, from) {
    const a = new PenAnimal(scene, data, incomeOf(data))
    a.nextPay = 0.3 + Math.random()
    a.callIn = 6 + Math.random() * 14
    if (from) {
      a.flyFrom(from, HARPOON.hop, (an) => {
        const { pan, gain } = spatial(camera, an.root.position.x, an.root.position.z, 40)
        snd.thump(an.rig.height, pan)
        snd.animalCall(an.def.id, gain, pan)
        fx.dust(an.root.position, '#d9f0b0', 18, 3, 1)
        fx.ring(an.root.position, '#ffffff', 3.5)
      })
    } else a.placeRandom()
    animals.push(a)
    return a
  }
  for (const data of S.animals) spawnAnimal(data)

  // Offline earnings: what the pen made while you were away waits in a pile at the base.
  function offlineEarned() {
    if (!(S.lastSeen > 0) || !S.animals.length) return 0
    const away = Math.min(OFFLINE.maxHours * 3600, (now() - S.lastSeen) / 1000)
    if (away < OFFLINE.minSeconds) return 0
    const perSecond = S.animals.reduce((sum, a) => sum + baseIncome(a), 0) * multValue() * (S.passes.x2cash ? 2 : 1) * (1 + petBonus('cash'))
    return Math.floor(perSecond * away * OFFLINE.rate)
  }
  let offline = offlineEarned()
  function collectOffline() {
    if (offline <= 0) return false
    const amount = offline
    offline = 0
    earn(amount)
    snd.sell(amount)
    const at = BASE.offline
    fx.coins({ x: at.x, y: 1.4, z: at.z }, 26)
    fx.sparkle({ x: at.x, y: 1.2, z: at.z }, '#7dff4f', 30, 5)
    fx.ring({ x: at.x, y: 0, z: at.z }, '#7dff4f', 4)
    fx.popup({ x: at.x, y: 3.2, z: at.z }, `+${fmt(amount)}`, 'big', 1.4)
    ui.toast(`Collected ${fmt(amount)} of offline cash!`, true)
    save()
    return true
  }

  function removeAnimal(uidToRemove) {
    const i = animals.findIndex((a) => a.data.uid === uidToRemove)
    if (i < 0) return null
    const a = animals[i]
    a.dispose(scene)
    animals.splice(i, 1)
    S.animals = S.animals.filter((d) => d.uid !== uidToRemove)
    return a
  }

  // --- Pets (followers) ------------------------------------------------------------------------
  const followers = new Map() // id -> { rig, pos }
  function syncFollowers() {
    for (const [id, f] of followers) {
      if (!S.pets.equipped.includes(id)) {
        scene.remove(f.rig.root)
        followers.delete(id)
      }
    }
    S.pets.equipped.forEach((id) => {
      if (followers.has(id)) return
      const m = PET_MODEL[id]
      const rig = buildAnimal(m.id, { shiny: !!m.shiny })
      rig.root.scale.setScalar(m.scale)
      rig.root.position.set(player.position.x, 0, player.position.z)
      scene.add(rig.root)
      followers.set(id, { rig, pos: rig.root.position })
    })
  }
  syncFollowers()

  // --- Held bait (in the player's hand) -----------------------------------------------------------
  let hand = null
  let held = null
  let heldKind = -1
  const v = new Vector3()

  // --- Actions -------------------------------------------------------------------------------------
  const game = {
    S,
    ui,
    animals,
    get money() {
      return S.money
    },
    capacity,
    xpNeed,
    xpPerPump,
    xpBase,
    cashMult,
    playBoost,
    multValue,
    luck,
    potionOn,
    incomeOf,
    baseIncome,
    cost,
    maxed,
    baitValue,
    animalValue,
    odds,
    gymPerRep,
    gymXpNeed,
    gymCost,
    gymMaxed,
    gymMove,
    gymUnlocked,
    training: null, // training.js: { active, start(), cancel() }
    totalIncome: () => animals.reduce((s, a) => s + incomeOf(a.data), 0),
    playNext: () => {
      const every = PLAY_BOOST.every * 60
      return playBoost() >= PLAY_BOOST.max ? 0 : every - (play % every)
    },
    offerLeft: () => Math.max(0, (S.offerEnds - now()) / 1000),

    setAvatar(root) {
      hand = null
      root?.traverse((o) => {
        if (!hand && /hand_?r|righthand|r_?hand/i.test(o.name)) hand = o
      })
      if (!hand) root?.traverse((o) => {
        if (!hand && o.name === 'ArmR2') hand = o
      })
    },

    pump(auto = false) {
      S.machine.xp += xpPerPump()
      let levelled = false
      while (S.machine.xp >= xpNeed()) {
        S.machine.xp -= xpNeed()
        const before = kindOf(S.machine.p)
        S.machine.p++
        levelled = true
        const after = kindOf(S.machine.p)
        if (after !== before) ui.toast(`New bait: ${BAITS.kinds[after].name}!`, true)
        else ui.toast(`${baitName(S.machine.p)}!`, true)
      }
      base.buttons.pump.press()
      base.machine.pump()
      const tNow = performance.now()
      if (!auto || tNow - lastPumpSound > 280) {
        lastPumpSound = tNow
        const { pan } = spatial(camera, BASE.machine.x, BASE.machine.z)
        snd.pump(S.machine.xp / xpNeed(), pan)
        fx.splash(MACHINE_AT, BAITS.kinds[kindOf(S.machine.p)].accent, auto ? 4 : 8)
        fx.popup({ x: MACHINE_AT.x - 1.6, y: MACHINE_AT.y + 2.6, z: MACHINE_AT.z }, `+${num(xpPerPump())} xp`, 'xp', 0.9)
      }
      if (levelled) {
        snd.levelUp()
        fx.sparkle(MACHINE_AT, BAITS.kinds[kindOf(S.machine.p)].accent, 40, 6, 0.6)
        fx.ring({ x: BASE.machine.x, y: T, z: BASE.machine.z }, '#7dff6a', 5)
        fx.shimmer({ x: BASE.machine.x, y: T + 1, z: BASE.machine.z }, '#fff6a0', 26, 1.4, 5)
      }
    },

    claim(auto = false) {
      if (!S.baitReady) {
        if (!auto) {
          ui.toast('The bait is still growing...', false)
          sfx.deny()
        }
        return false
      }
      if (S.baits.length >= BAITS.carryMax) {
        if (!auto) {
          ui.toast('Your bait bag is full! Use or sell some bait.', false)
          sfx.deny()
        }
        return false
      }
      S.baits.push(S.machine.p)
      S.selected = S.baits.length - 1
      S.baitReady = false
      regrow = BAITS.regrow
      base.machine.setGrow(0)
      snd.claimBait()
      fx.sparkle(MACHINE_AT, BAITS.kinds[kindOf(S.machine.p)].color, 26, 4)
      fx.popup({ x: MACHINE_AT.x - 1.6, y: MACHINE_AT.y + 2, z: MACHINE_AT.z }, `+1 ${BAITS.kinds[kindOf(S.machine.p)].name}`, 'big')
      return true
    },

    // Take the bait from Auto Machine tank i.
    claimAuto(i) {
      const tk = S.auto[i]
      if (!S.passes.autoMachine) return false
      if (!tk.ready) {
        ui.toast('That tank is still growing its bait...', false)
        sfx.deny()
        return false
      }
      if (S.baits.length >= BAITS.carryMax) {
        ui.toast('Your bait bag is full! Use or sell some bait.', false)
        sfx.deny()
        return false
      }
      S.baits.push(tk.p)
      S.selected = S.baits.length - 1
      tk.ready = false
      autoRegrow[i] = BAITS.regrow
      base.auto.tanks[i].setGrow(0)
      snd.claimBait()
      const at = BASE.autoMachine.tanks[i]
      const kind = BAITS.kinds[kindOf(tk.p)]
      fx.sparkle({ x: at.x, y: T + 2, z: at.z }, kind.color, 26, 4)
      fx.popup({ x: at.x + 1, y: T + 4, z: at.z }, `+1 ${kind.name}`, 'big')
      return true
    },

    selectBait(i) {
      if (i >= 0 && i < S.baits.length) S.selected = i
    },

    // --- Harpoon: the bait flow (baitFlow.js) runs the shot; these are its rules -------------
    // Why the harpoon can't be used right now (toast text), or '' when it can.
    baitBlock() {
      if (!S.baits.length) return 'Claim bait from the machine first!'
      if (animals.length >= capacity()) return 'Your pen is full! Sell animals or buy +1 Slot.'
      return ''
    },
    selectedBait: () => (S.baits.length ? S.baits[Math.min(S.selected, S.baits.length - 1)] : null),
    // Takes the selected bait out of the bag (it is on the flying spear now). Returns its level p.
    takeBait() {
      if (!S.baits.length) return null
      const i = Math.min(S.selected, S.baits.length - 1)
      const p = S.baits.splice(i, 1)[0]
      S.selected = Math.max(0, Math.min(S.selected, S.baits.length - 1))
      return p
    },
    strength: () => S.gym?.strength ?? 0,
    // Longest shot (m) at full power: grows with Strength (log scale), capped by the Lane.
    maxDistance() {
      const R = HARPOON.reach
      return Math.min(laneLength() - 8, R.base + R.k * Math.log2(1 + game.strength() / R.s0))
    },
    // Rolls the catch in zone `zone` for bait level p and the shot's luck multiplier.
    rollShot(p, shotLuck, zone) {
      const L = luck() * Math.pow(Math.max(1, shotLuck), HARPOON.luckPower)
      const pool = ANIMALS.filter((a) => a.zone === ZONES[zone].id)
      const tiers = RARITIES.map((r, i) => i).filter((i) => pool.some((a) => a.rarity === RARITIES[i].id))
      const w = tiers.map((i, j) => RARITIES[i].weight * Math.exp(RARITIES[i].k * p) * (j > 0 ? L : 1))
      let x = Math.random() * w.reduce((a, b) => a + b, 0)
      let j = 0
      while (j < w.length - 1 && x >= w[j]) {
        x -= w[j]
        j++
      }
      const list = pool.filter((a) => a.rarity === RARITIES[tiers[j]].id)
      const def = list[Math.floor(Math.random() * list.length)]
      return { species: def.id, shiny: Math.random() < Math.min(0.5, SHINY.chance * luck() * Math.sqrt(Math.max(1, shotLuck))) }
    },
    // "1 in N": how rare this species is in its zone for bait level p (no luck).
    oneIn(species, p) {
      const def = animalDef(species)
      const pool = ANIMALS.filter((a) => a.zone === def.zone)
      const tiers = RARITIES.filter((r) => pool.some((a) => a.rarity === r.id))
      const w = tiers.map((r) => r.weight * Math.exp(r.k * p))
      const sum = w.reduce((a, b) => a + b, 0)
      const ti = tiers.findIndex((r) => r.id === def.rarity)
      const share = pool.filter((a) => a.rarity === def.rarity).length
      return Math.max(1, Math.round(sum / w[ti] * share))
    },
    // The "Next Shot 100x Luck" boost (money only).
    nextShotPrice() {
      const raw = Math.max(NEXT_SHOT.base, game.totalIncome() * NEXT_SHOT.incomeSeconds)
      const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1))
      return Math.ceil(raw / mag) * mag
    },
    get nextShotReady() {
      return !!S.nextShot
    },
    buyNextShot() {
      if (S.nextShot) return true
      if (!spend(game.nextShotPrice(), `Next shot: ${NEXT_SHOT.luck}x Luck!`)) return false
      S.nextShot = true
      save()
      return true
    },
    useNextShot() {
      const on = !!S.nextShot
      S.nextShot = false
      return on ? NEXT_SHOT.luck : 1
    },
    // The reeled-in catch arrives at `at`: it joins the pen (jumping over the base), the
    // index and records update, the banner shows. Returns the rarity index.
    deliverCatch(data, at) {
      const r = rarityIndex(data.species)
      const rar = RARITIES[r]
      const { pan } = spatial(camera, at.x, at.z)
      snd.catchPop(Math.min(5, r), pan)
      fx.sparkle({ x: at.x, y: 1.5, z: at.z }, rar.color, 30 + r * 12, 5 + r, 0.55)
      fx.ring(at, rar.color, 4 + r)
      if (r >= 2 || data.shiny) fx.beam(at, data.shiny ? '#ffd23a' : rar.color, 12 + r * 3, 2.4)
      if (r >= 3 || data.shiny) fx.confetti({ x: at.x, y: 2, z: at.z }, undefined, 30 + r * 10)
      const record = { uid: uid++, species: data.species, shiny: data.shiny }
      S.animals.push(record)
      S.catches++
      const entry = (S.index[data.species] ??= { n: 0, shiny: false })
      const first = entry.n === 0
      entry.n++
      if (data.shiny) entry.shiny = true
      if (first) {
        S.indexSeen = false
        countZones()
      }
      const best = S.best
      if (!best || r > rarityIndex(best.species) || (r === rarityIndex(best.species) && baseIncome(record) > baseIncome(best))) S.best = { species: data.species, shiny: data.shiny }
      ui.banner(data, rar, first)
      spawnAnimal(record, { x: at.x, y: 0.5, z: at.z })
      save()
      return r
    },

    // --- Pet Index rewards --------------------------------------------------------------------
    indexReward: (id) => Math.round(animalDef(id).income * INDEX.claimSeconds),
    indexClaimable: () => ANIMALS.filter((a) => S.index[a.id]?.n && !S.claimed[a.id]).map((a) => a.id),
    zoneFound: (zid) => ANIMALS.filter((a) => a.zone === zid && S.index[a.id]?.n).length,
    zonesDone: () => zonesDone,
    claimIndex(id) {
      if (!S.index[id]?.n || S.claimed[id]) return 0
      const amount = game.indexReward(id)
      S.claimed[id] = true
      earn(amount)
      snd.sell(amount)
      save()
      return amount
    },
    claimAllIndex() {
      const ids = game.indexClaimable()
      let total = 0
      for (const id of ids) {
        S.claimed[id] = true
        total += game.indexReward(id)
      }
      if (!total) return 0
      earn(total)
      snd.sell(total)
      ui.toast(`Claimed ${fmt(total)} from the Index!`, true)
      save()
      return total
    },

    buyUpgrade(id) {
      if (maxed[id]()) {
        ui.toast('Already maxed!', true)
        return false
      }
      const price = cost[id]()
      const names = { mult: `Cash x${multValue(S.up.mult + 1)}!`, xp: `Bait XP ${num(xpBase(S.up.xp + 1))}/pump!`, slot: `Pen: ${capacity() + 1} slots!`, autoSpeed: `Auto Machine ${num(autoBase(S.up.autoSpeed + 1))} xp/s!` }
      if (!spend(price, names[id])) return false
      S.up[id]++
      const at = { mult: BASE.signs.mult, xp: BASE.signs.xp, slot: BASE.signs.slot, autoSpeed: BASE.signs.auto }[id]
      fx.coins({ x: at.x, y: 3.2, z: at.z + 0.6 }, 14)
      fx.sparkle({ x: at.x, y: 2.6, z: at.z + 0.6 }, '#7dff6a', 22, 4)
      save()
      return true
    },

    buyPass(id) {
      if (S.passes[id]) return false
      const price = id === 'autoMachine' ? U.auto.price : PASSES[id].price
      const name = id === 'autoMachine' ? U.auto.name : PASSES[id].name
      if (!spend(price, `${name} unlocked!`)) return false
      S.passes[id] = true
      const at = id === 'autoClick' ? BASE.tanks.auto : id === 'x2xp' ? BASE.tanks.xp : id === 'autoMachine' ? BASE.autoPad : null
      if (at) {
        fx.sparkle({ x: at.x, y: 2.5, z: at.z + 0.5 }, '#7dff6a', 36, 5)
        fx.ring({ x: at.x, y: T, z: at.z }, '#7dff6a', 4)
      }
      if (id === 'autoMachine') {
        // The machine builds itself on its pad: pop-in, sparkles up each tank, confetti.
        base.auto.setOwned(true, true)
        for (const t of BASE.autoMachine.tanks) fx.shimmer({ x: t.x, y: T, z: t.z }, '#7ff6ff', 30, 1.4, 6)
        fx.confetti({ x: BASE.autoPad.x, y: 3, z: BASE.autoPad.z }, undefined, 50)
        fx.ring({ x: BASE.autoPad.x, y: T, z: BASE.autoPad.z }, '#7ff6ff', 8)
        snd.levelUp()
      }
      sfx.unlock()
      save()
      return true
    },

    // The training ring: bought once, after the first animal is in the pen.
    buyGym() {
      if (S.gym.owned) return false
      if (!gymUnlocked()) {
        ui.toast('Catch an animal for your pen first!', false)
        sfx.deny()
        return false
      }
      if (!spend(GYM.price, 'Training Ring unlocked! Train to get stronger.')) return false
      S.gym.owned = true
      base.gym.setOwned(true, true)
      const at = BASE.gym
      fx.confetti({ x: at.x, y: 2.5, z: at.z }, undefined, 44)
      fx.ring({ x: at.x, y: 0.1, z: at.z }, '#d35bff', 6)
      fx.shimmer({ x: at.x, y: 0.1, z: at.z }, '#e7a6ff', 30, at.r, 4)
      snd.levelUp()
      sfx.unlock()
      save()
      return true
    },
    // Upgrade pad: better equipment, more strength per rep.
    upgradeGym() {
      if (!S.gym.owned) return false
      if (gymMaxed()) {
        ui.toast('Training is maxed!', true)
        return false
      }
      const before = gymMove()
      if (!spend(gymCost(), `Training Level ${S.gym.level + 1}! +${num(gymPerRep(S.gym.level + 1))} Strength per rep`)) return false
      S.gym.level++
      const after = gymMove()
      if (after !== before) setTimeout(() => ui.toast(`New equipment: ${after.name}!`, true), 900)
      const P = BASE.gym.pad
      fx.coins({ x: P.x, y: 1.6, z: P.z }, 14)
      fx.sparkle({ x: P.x, y: 1, z: P.z }, '#6fd2ff', 28, 4)
      fx.ring({ x: P.x, y: 0.25, z: P.z }, '#6fd2ff', 3)
      fx.shimmer({ x: BASE.gym.x, y: 0.1, z: BASE.gym.z }, '#e7a6ff', 20, BASE.gym.r, 3)
      save()
      return true
    },
    // One finished rep: strength + training XP. Returns { gain, levelled }.
    trainRep() {
      const gain = gymPerRep()
      S.gym.strength = Math.round((S.gym.strength + gain) * 100) / 100
      S.gym.xp++
      let levelled = false
      while (S.gym.xp >= gymXpNeed()) {
        S.gym.xp -= gymXpNeed()
        S.gym.lv++
        levelled = true
      }
      return { gain, levelled }
    },

    buyPotion(id) {
      const P = STORE.potions[id]
      if (!spend(P.price, `${P.name} active!`)) return false
      S.potions[id] = Math.max(now(), S.potions[id]) + P.minutes * 60000
      save()
      return true
    },
    buyBundle() {
      const B = STORE.bundle
      if (!spend(B.price, `${B.name} active!`)) return false
      for (const id of B.potions) S.potions[id] = Math.max(now(), S.potions[id]) + STORE.potions[id].minutes * 60000
      save()
      return true
    },

    claimFreePet() {
      if (S.freeClaimed) return false
      S.freeClaimed = true
      game.givePet('dino')
      ui.toast('Dino Buddy is yours! +25% cash', true)
      sfx.unlock()
      return true
    },
    buyPet(id) {
      if (S.pets.owned.includes(id)) return false
      const def = petDef(id)
      if (!spend(def.price, `${def.name} joined you!`)) return false
      game.givePet(id)
      return true
    },
    givePet(id) {
      if (!S.pets.owned.includes(id)) S.pets.owned.push(id)
      if (S.pets.equipped.length < PETS.equipMax && !S.pets.equipped.includes(id)) S.pets.equipped.push(id)
      syncFollowers()
      fx.sparkle({ x: player.position.x, y: 1.5, z: player.position.z }, '#ffe14a', 30, 4)
      save()
    },
    toggleEquip(id) {
      const eq = S.pets.equipped
      if (eq.includes(id)) S.pets.equipped = eq.filter((x) => x !== id)
      else if (eq.length >= PETS.equipMax) {
        ui.toast(`You can equip ${PETS.equipMax} pets at once.`, false)
        sfx.deny()
        return false
      } else eq.push(id)
      syncFollowers()
      sfx.equip()
      save()
      return true
    },

    sellBait(i) {
      if (i < 0 || i >= S.baits.length) return
      const value = baitValue(S.baits[i])
      S.baits.splice(i, 1)
      S.selected = Math.max(0, Math.min(S.selected, S.baits.length - 1))
      earn(value)
      snd.sell(value)
      save()
    },
    // Sells every carried bait except the best one.
    sellExtraBaits() {
      if (S.baits.length < 2) return 0
      const best = Math.max(...S.baits)
      let kept = false
      let total = 0
      S.baits = S.baits.filter((p) => {
        if (p === best && !kept) return (kept = true)
        total += baitValue(p)
        return false
      })
      S.selected = 0
      earn(total)
      snd.sell(total)
      save()
      return total
    },
    sellAnimal(uidToSell) {
      const a = removeAnimal(uidToSell)
      if (!a) return 0
      const value = animalValue(a.data)
      earn(value)
      snd.sell(value)
      fx.coins({ x: a.root.position.x, y: 1.5, z: a.root.position.z }, 12)
      fx.dust(a.root.position, '#ffffff', 12, 2, 1)
      save()
      return value
    },
    sellRarity(rarityId) {
      let total = 0
      for (const a of [...animals]) {
        if (animalDef(a.data.species).rarity !== rarityId || a.data.shiny) continue
        const r = removeAnimal(a.data.uid)
        total += animalValue(r.data)
        fx.coins({ x: r.root.position.x, y: 1.5, z: r.root.position.z }, 6)
      }
      if (total) {
        earn(total)
        snd.sell(total)
        save()
      }
      return total
    },

    // --- Shop / Sell / Pets windows (windows.js) ------------------------------------------------
    sellAllBaits() {
      if (!S.baits.length) return 0
      const total = S.baits.reduce((s, p) => s + baitValue(p), 0)
      S.baits = []
      S.selected = 0
      earn(total)
      snd.sell(total)
      save()
      return total
    },
    sellAllAnimals() {
      let total = 0
      for (const a of [...animals]) {
        if (a.state === 'fly') continue // still landing in the pen
        const r = removeAnimal(a.data.uid)
        total += animalValue(r.data)
        fx.coins({ x: r.root.position.x, y: 1.5, z: r.root.position.z }, 6)
      }
      if (total) {
        earn(total)
        snd.sell(total)
        save()
      }
      return total
    },

    // The Starter Pack: STORE.pack's animals jump into the pen + every potion for potionMinutes.
    packPrice() {
      const P = STORE.pack
      const value = P.animals.reduce((s, id) => s + (animalDef(id)?.income ?? 0), 0) * ANIMAL_SELL_MULT * P.valueMult
      const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, value))) - 1))
      return Math.ceil(value / step) * step
    },
    packLeft: () => Math.max(0, (S.packEnds - now()) / 1000),
    buyPack() {
      const P = STORE.pack
      if (S.packBought) return false
      const room = capacity() - animals.length
      if (room < P.animals.length) {
        ui.toast(`The pack needs ${P.animals.length} free pen slots. Sell an animal first!`, false)
        sfx.deny()
        return false
      }
      if (!spend(game.packPrice(), `${P.name} unlocked!`)) return false
      S.packBought = true
      for (const id of Object.keys(STORE.potions)) S.potions[id] = Math.max(now(), S.potions[id] ?? 0) + P.potionMinutes * 60000
      P.animals.forEach((species, i) => {
        if (!animalDef(species)) return
        const record = { uid: uid++, species, shiny: false }
        S.animals.push(record)
        const entry = (S.index[species] ??= { n: 0, shiny: false })
        if (entry.n === 0) S.indexSeen = false
        entry.n++
        const from = { x: player.position.x + (i - 0.5) * 1.6, y: 0.5, z: player.position.z }
        spawnAnimal(record, from)
      })
      fx.confetti({ x: player.position.x, y: 2.5, z: player.position.z }, undefined, 50)
      snd.levelUp()
      sfx.unlock()
      save()
      return true
    },

    // "Upgrade Bait!": the bait machine jumps to the next bait kind at Lv 1.
    baitSkipMaxed: () => kindOf(S.machine.p) >= BAITS.kinds.length - 1,
    baitSkipPrice: () => Math.round(STORE.baitSkip.base * Math.pow(STORE.baitSkip.growth, kindOf(S.machine.p))),
    skipBait() {
      if (game.baitSkipMaxed()) {
        ui.toast('Your machine already grows the best bait!', true)
        return false
      }
      const next = kindOf(S.machine.p) + 1
      if (!spend(game.baitSkipPrice(), `New bait: ${BAITS.kinds[next].name}!`)) return false
      S.machine.p = next * BAITS.levelsPerKind
      S.machine.xp = 0
      snd.levelUp()
      fx.sparkle(MACHINE_AT, BAITS.kinds[next].accent, 50, 6, 0.6)
      fx.ring({ x: BASE.machine.x, y: T, z: BASE.machine.z }, '#7dff6a', 6)
      save()
      return true
    },

    // $/s a pet adds at the pen's current income (its cash bonus on the income without pets).
    petIncome(id) {
      const def = petDef(id)
      if (!def?.cash) return 0
      return (game.totalIncome() / (1 + petBonus('cash'))) * def.cash
    },
    // Equips the strongest owned pets (cash + luck bonus), up to PETS.equipMax.
    equipBest() {
      const score = (id) => (petDef(id)?.cash ?? 0) + (petDef(id)?.luck ?? 0)
      const best = [...S.pets.owned].filter(petDef).sort((a, b) => score(b) - score(a)).slice(0, PETS.equipMax)
      if (!best.length) {
        ui.toast('No pets yet! Claim the free Dino Buddy.', false)
        sfx.deny()
        return false
      }
      if (best.length === S.pets.equipped.length && best.every((id) => S.pets.equipped.includes(id))) {
        ui.toast('Your best pets are already equipped!', true)
        return true
      }
      S.pets.equipped = best
      syncFollowers()
      sfx.equip()
      save()
      return true
    },

    markIndexSeen() {
      if (!S.indexSeen) {
        S.indexSeen = true
        save()
      }
    },

    // Interact targets for interact.js: { x, y, z, r, info() -> { title, verb, price?, off?, hold? }, run() }
    targets() {
      const sp = base.spots
      const price = (amount) => ({ price: amount })
      return [
        { ...sp.pump, info: () => ({ title: 'Bait Machine', verb: 'Pump', hold: true }), run: () => game.pump() },
        {
          ...sp.claim,
          info: () => (S.baitReady ? { title: baitName(S.machine.p), verb: 'Claim', bar: S.machine.xp / xpNeed() } : { title: 'Growing...', verb: 'Claim', off: true }),
          run: () => game.claim(),
        },
        { ...sp.auto, info: () => (S.passes.autoClick ? { title: 'Auto Click', verb: 'Owned', off: true } : { title: 'Auto Click', verb: 'Buy', ...price(PASSES.autoClick.price) }), run: () => game.buyPass('autoClick') },
        { ...sp.xp, info: () => (S.passes.x2xp ? { title: '2X XP', verb: 'Owned', off: true } : { title: '2X XP', verb: 'Buy', ...price(PASSES.x2xp.price) }), run: () => game.buyPass('x2xp') },
        { ...sp.mult, info: () => (maxed.mult() ? { title: 'Cash Multiplier', verb: 'Maxed', off: true } : { title: `Cash x${multValue()} > x${multValue(S.up.mult + 1)}`, verb: 'Upgrade', ...price(cost.mult()) }), run: () => game.buyUpgrade('mult') },
        { ...sp.xpSign, info: () => (maxed.xp() ? { title: 'Bait XP', verb: 'Maxed', off: true } : { title: `Bait XP Level ${S.up.xp + 2}`, verb: 'Upgrade', ...price(cost.xp()) }), run: () => game.buyUpgrade('xp') },
        { ...sp.slot, info: () => (maxed.slot() ? { title: 'Pen Slots', verb: 'Maxed', off: true } : { title: `+1 Pen Slot (${capacity()}/${U.slot.max})`, verb: 'Buy', ...price(cost.slot()) }), run: () => game.buyUpgrade('slot') },
        { ...sp.autoBuy, enabled: () => !S.passes.autoMachine, info: () => ({ title: 'Auto Machine', verb: 'Buy', ...price(U.auto.price) }), run: () => game.buyPass('autoMachine') },
        {
          ...sp.autoSign,
          info: () =>
            !S.passes.autoMachine
              ? { title: 'Auto Speed', verb: 'Buy the Auto Machine first', off: true }
              : maxed.autoSpeed()
                ? { title: 'Auto Speed', verb: 'Maxed', off: true }
                : { title: `Auto Speed ${num(autoBase())} > ${num(autoBase(S.up.autoSpeed + 1))} xp/s`, verb: 'Upgrade', ...price(cost.autoSpeed()) },
          run: () => S.passes.autoMachine && game.buyUpgrade('autoSpeed'),
        },
        ...sp.autoClaims.map((spot, i) => ({
          ...spot,
          enabled: () => S.passes.autoMachine,
          info: () => (S.auto[i].ready ? { title: `Tank ${i + 1}: ${baitName(S.auto[i].p)}`, verb: 'Claim', bar: S.auto[i].xp / xpNeed(S.auto[i].p) } : { title: `Tank ${i + 1}: growing...`, verb: 'Claim', off: true }),
          run: () => game.claimAuto(i),
        })),
        { ...sp.sell, info: () => ({ title: 'Shopkeeper', verb: 'Sell' }), run: () => ui.openSell() },
        {
          ...sp.gymBoard,
          enabled: () => !S.gym.owned,
          info: () => (gymUnlocked() ? { title: 'Training Ring', verb: 'Buy', ...price(GYM.price) } : { title: 'Training Ring', verb: 'Catch an animal first', off: true }),
          run: () => game.buyGym(),
        },
        { ...sp.gym, enabled: () => S.gym.owned && !game.training?.active, info: () => ({ title: `${gymMove().name}: +${num(gymPerRep())} Strength`, verb: 'Train' }), run: () => ui.train() },
        {
          ...sp.gymPad,
          enabled: () => S.gym.owned,
          info: () => (gymMaxed() ? { title: 'Training', verb: 'Maxed', off: true } : { title: `Training Level ${S.gym.level} > ${S.gym.level + 1}`, verb: 'Upgrade', ...price(gymCost()) }),
          run: () => game.upgradeGym(),
        },
        { ...sp.offline, enabled: () => offline > 0, info: () => ({ title: `Offline Cash ${fmt(offline)}`, verb: 'Collect' }), run: () => collectOffline() },
        {
          ...harpoonSpot,
          enabled: () => !game.flow?.active,
          info: () => (S.baits.length ? { title: `Harpoon (${baitName(S.baits[Math.min(S.selected, S.baits.length - 1)])})`, verb: 'Attach Bait' } : { title: 'Harpoon', verb: 'Attach Bait', dim: true }),
          run: () => game.flow?.begin(),
        },
      ]
    },

    update(dt, t) {
      play += dt
      // Bait regrowth.
      if (!S.baitReady) {
        regrow -= dt
        base.machine.setGrow(1 - Math.max(0, regrow) / BAITS.regrow)
        if (regrow <= 0) {
          S.baitReady = true
          base.machine.setGrow(1)
          const { gain, pan } = spatial(camera, BASE.machine.x, BASE.machine.z, 30)
          if (gain > 0.1) snd.regrown(pan)
          fx.sparkle(MACHINE_AT, '#ffffff', 10, 2)
        }
      }
      // Auto Click: the machine pumps itself.
      if (S.passes.autoClick) {
        autoPump += dt * MACHINE.autoClickRate
        while (autoPump >= 1) {
          autoPump -= 1
          game.pump(true)
        }
      }
      // Auto Machine: each tank fills with XP by itself, levels its bait, regrows after a claim.
      if (S.passes.autoMachine) {
        const rate = autoRate()
        S.auto.forEach((tk, i) => {
          tk.xp += rate * dt
          let levelled = false
          while (tk.xp >= xpNeed(tk.p)) {
            tk.xp -= xpNeed(tk.p)
            tk.p++
            levelled = true
          }
          const at = BASE.autoMachine.tanks[i]
          if (levelled) {
            const { gain } = spatial(camera, at.x, at.z, 26)
            if (gain > 0.2) snd.levelUp()
            fx.sparkle({ x: at.x, y: T + 2, z: at.z }, BAITS.kinds[kindOf(tk.p)].accent, 24, 4)
          }
          if (!tk.ready) {
            autoRegrow[i] -= dt
            base.auto.tanks[i].setGrow(1 - Math.max(0, autoRegrow[i]) / BAITS.regrow)
            if (autoRegrow[i] <= 0) {
              tk.ready = true
              base.auto.tanks[i].setGrow(1)
              fx.sparkle({ x: at.x, y: T + 2, z: at.z }, '#ffffff', 8, 2)
            }
          }
        })
      }
      // Offline cash pile: shown while there is some, collected by walking into it.
      base.offline.set(offline > 0 ? `+${fmt(offline)}` : '')
      if (offline > 0 && Math.hypot(player.position.x - BASE.offline.x, player.position.z - BASE.offline.z) < 1.4) collectOffline()

      // The repeating OP offer.
      if (S.offerEnds < now()) S.offerEnds = now() + OFFER.minutes * 60000
      if (S.packEnds < now()) S.packEnds = now() + STORE.pack.minutes * 60000

      // Animals: wander, pay, call.
      const mult = cashMult()
      for (const a of animals) {
        a.update(dt, t, animals)
        if (a.state === 'fly') continue
        const inc = baseIncome(a.data) * mult
        a.setIncome(inc)
        a.nextPay -= dt
        if (a.nextPay <= 0) {
          a.nextPay += 1
          earn(inc)
          const p = a.root.position
          const { gain, pan, d } = spatial(camera, p.x, p.z, AUDIO.ambience.incomeNear)
          if (d < 60) fx.popup({ x: p.x, y: p.y + a.labelY + 0.9, z: p.z }, `+${fmt(inc)}`, '', 1)
          snd.income(gain, pan)
        }
        a.callIn -= dt
        if (a.callIn <= 0) {
          a.callIn = 10 + Math.random() * 20
          const p = a.root.position
          const { gain, pan } = spatial(camera, p.x, p.z, 26)
          snd.animalCall(a.def.id, gain * 0.6, pan)
        }
      }

      // Pet followers trail the player.
      let i = 0
      for (const [, f] of followers) {
        const side = i % 2 ? 1 : -1
        const back = 2.2 + Math.floor(i / 2) * 1.4
        const fx0 = player.renderPosition.x - Math.sin(player.facing) * back + Math.cos(player.facing) * side * 1.4
        const fz0 = player.renderPosition.z - Math.cos(player.facing) * back - Math.sin(player.facing) * side * 1.4
        const dx = fx0 - f.pos.x
        const dz = fz0 - f.pos.z
        const d = Math.hypot(dx, dz)
        const k = Math.min(1, dt * 5)
        f.pos.x += dx * k
        f.pos.z += dz * k
        f.pos.y = 0.15 + Math.abs(Math.sin(t * 5 + i)) * 0.25
        if (d > 0.05) f.rig.root.rotation.y = Math.atan2(dx, dz)
        f.rig.animate(dt, Math.min(8, d * 5), t, 'walk')
        i++
      }

      // Held bait follows the right hand.
      if (S.baits.length && !game.training?.active && !game.hideHeld) {
        const kind = kindOf(S.baits[Math.min(S.selected, S.baits.length - 1)])
        if (kind !== heldKind) {
          if (held) scene.remove(held)
          held = buildBait(kind)
          held.scale.setScalar(0.75)
          scene.add(held)
          heldKind = kind
        }
        held.visible = true
        if (hand) {
          hand.getWorldPosition(v)
          held.position.set(v.x, v.y - 0.2, v.z)
        } else {
          const r = player.renderPosition
          held.position.set(r.x + Math.cos(player.facing) * -0.55, r.y + 0.9, r.z - Math.sin(player.facing) * -0.55)
        }
        held.rotation.y = player.facing
        held.wiggle(t)
      } else if (held) held.visible = false

      // In-world displays.
      const kind = kindOf(S.machine.p)
      base.machine.setBait(kind)
      base.machine.setFill(S.machine.xp / xpNeed())
      base.machine.setLabel(baitName(S.machine.p), BAITS.kinds[kind].color, S.machine.xp, xpNeed(), num(S.machine.xp), num(xpNeed()))
      base.machine.setReady(S.baitReady)
      base.auto.setOwned(S.passes.autoMachine)
      if (S.passes.autoMachine) {
        S.auto.forEach((tk, i) => {
          const t = base.auto.tanks[i]
          const k = kindOf(tk.p)
          t.setBait(k)
          t.setFill(tk.xp / xpNeed(tk.p))
          t.setLabel(baitName(tk.p), BAITS.kinds[k].color, tk.xp, xpNeed(tk.p), num(tk.xp), num(xpNeed(tk.p)))
          t.setReady(tk.ready)
          if (tk.ready) t.setGrow(1)
        })
        base.auto.setScreen(S.auto.map((tk) => tk.xp / xpNeed(tk.p)), S.auto.map((tk) => tk.ready))
      }
      signsIn -= dt
      if (signsIn <= 0) {
        signsIn = 0.25
        base.tanks.auto.set(S.passes.autoClick, fmt(PASSES.autoClick.price))
        base.tanks.xp.set(S.passes.x2xp, fmt(PASSES.x2xp.price))
        const btn = (price, isMax, owned) => (owned ? { text: 'OWNED', style: 'done' } : isMax ? { text: 'MAX', style: 'done' } : { text: fmt(price), style: S.money >= price ? 'buy' : 'poor' })
        base.signs.mult.set({ title: 'Upgrades', lines: [`${multValue()}x > ${multValue(S.up.mult + 1)}x cash`], button: btn(cost.mult(), maxed.mult()) })
        base.signs.xp.set({ title: `Level ${S.up.xp + 2}`, lines: [`${num(xpBase())} xp > ${num(xpBase(S.up.xp + 1))} xp`], button: btn(cost.xp(), maxed.xp()) })
        base.signs.slot.set({ title: '+1 Slot', lines: [`${animals.length}/${capacity()} Animals`], button: btn(cost.slot(), maxed.slot()) })
        if (!S.passes.autoMachine) {
          base.auto.board.set({ title: 'Auto Machine', lines: ['3 tanks grow bait'], button: btn(U.auto.price, false) })
          base.signs.auto.set({ title: 'Auto Speed', lines: ['Needs the Auto Machine'], button: { text: 'LOCKED', style: 'poor' } })
        }
        else base.signs.auto.set({ title: 'Auto Speed', lines: [`${num(autoBase())} > ${num(autoBase(S.up.autoSpeed + 1))} xp/s`], button: btn(cost.autoSpeed(), maxed.autoSpeed()) })
        // Training ring: the buy board until owned, then the strength label + upgrade pad.
        base.gym.setOwned(S.gym.owned)
        if (!S.gym.owned) base.gym.board.set({ title: 'Training', lines: [gymUnlocked() ? 'Get stronger!' : 'Catch 1 animal'], button: gymUnlocked() ? btn(GYM.price, false) : { text: 'LOCKED', style: 'poor' } })
        else {
          base.gym.setLabel(`+${num(gymPerRep())} Strength`)
          if (gymMaxed()) base.gym.setPad({ top: `Level ${S.gym.level}`, name: '', price: 'MAX', style: 'done' })
          else {
            const next = gymMove(S.gym.level + 1)
            base.gym.setPad({ top: `Level ${S.gym.level} > Level ${S.gym.level + 1}`, name: next !== gymMove() ? next.name : 'Upgrade', price: fmt(gymCost()), style: S.money >= gymCost() ? 'buy' : 'poor' })
          }
        }
      }
      recordsIn -= dt
      if (recordsIn <= 0 && game.records) {
        recordsIn = 1
        const best = S.best ? `${S.best.shiny ? 'Shiny ' : ''}${animalDef(S.best.species).name}` : '-'
        game.records.update([
          ['Money earned', fmt(S.earned)],
          ['Animals caught', String(S.catches)],
          ['Best catch', best],
          ['Bait', baitName(S.machine.p)],
        ])
      }

      saveIn -= dt
      if (saveIn <= 0) {
        saveIn = SAVE.every
        save()
      }
    },
    save,
  }

  const harpoonSpot = { x: harpoon.root.position.x, y: 2.4, z: harpoon.root.position.z, r: 3.4 }

  let saving = true
  // Where saves go: this browser by default; net.js (setPersist) routes them to the game server
  // for signed-in players.
  let persist = (state) => {
    try {
      localStorage.setItem(SAVE.key, JSON.stringify(state))
    } catch {
      // Storage full or blocked: keep playing unsaved.
    }
  }
  function save() {
    if (!saving) return
    S.lastSeen = now()
    persist(S)
  }
  game.setPersist = (fn) => (persist = fn)
  // Replaces the whole state with a loaded save (the server's copy, or the browser's after a
  // sign-out): the pen, followers, timers and offline cash are rebuilt from it. S keeps its
  // identity (windows and the HUD hold it).
  game.hydrate = (raw) => {
    const next = load(raw ?? null)
    for (const a of [...animals]) removeAnimal(a.data.uid)
    for (const k of Object.keys(S)) delete S[k]
    Object.assign(S, next)
    for (const data of S.animals) spawnAnimal(data)
    uid = S.animals.reduce((m, a) => Math.max(m, a.uid ?? 0), 0) + 1
    regrow = S.baitReady ? 0 : BAITS.regrow
    S.auto.forEach((t, i) => (autoRegrow[i] = t.ready ? 0 : BAITS.regrow))
    syncFollowers()
    base.gym?.setOwned?.(!!S.gym?.owned)
    offline = offlineEarned()
    signsIn = 0
    recordsIn = 0
  }
  window.addEventListener('beforeunload', save)
  window.addEventListener('pagehide', save)

  // Wipes the save and restarts (dev console: __game.game.resetSave()).
  game.resetSave = () => {
    saving = false
    try {
      localStorage.removeItem(SAVE.key)
    } catch {
      // Storage blocked: nothing to wipe.
    }
    location.reload()
  }

  // Every rarity's display, for windows.
  game.rarityDef = rarityDef
  game.animalDef = animalDef
  return game
}

// Economy simulator (node tools/econ-sim.mjs sum | one <seed>): plays an efficient player
// against the rules in src/config.js + src/game.js and prints when each zone / max is reached.
// It copies the formulas and numbers by hand: when you change them in config.js, change the
// defaults below too. Override any of them with P='{"zm":4,"rk":42,...}' in the environment.
const P = JSON.parse(process.env.P || '{}')
const ZM = P.zm ?? 4
const ZONES = P.zones ?? Array.from({ length: 10 }, (_, i) => Math.round(Math.pow(ZM, i)))
const NEW = P.new ?? true
const FLOOR = P.floor ?? [0.06, 0.04, 0.03, 0, 0, 0, 0, 0]
const G = { base: P.gb ?? 1500, growth: P.gg ?? 2.6, perRep: P.gr ?? 1.2 }
const UP = { mult: [16, P.mg ?? 2.7], xp: [9, P.xg ?? 2.2], slot: [P.sb ?? 1000, P.sg ?? 2.8], pen: [P.pb ?? 50000, P.pg ?? 40], autoSpeed: [P.ab ?? 15000, P.ag ?? 2.7] }
const PR = { autoClick: 2500, x2xp: 3500, x2cash: 7500, x2luck: 9500, autoMachine: 9600, chick: 12000, mammoth: 45000, ...(P.prices || {}) }
const RK = P.rk ?? 42, S0 = P.s0 ?? 25, PCAP = P.pcap ?? 34, GMAX = P.gmax ?? 30, XR = P.xr ?? 1.2, XGN = P.xgn ?? 1.5, AR = P.ar ?? 1.22, XMAX = P.xmax ?? 40, MMAX = P.mmax ?? 40, AMAX = P.amax ?? 25
const SHINYCAP = NEW ? (P.shinyCap ?? 0.15) : 0.5
const ZNAME = ['Meadow', 'Coral', 'Snow', 'Desert', 'Crystal', 'Jungle', 'Golden', 'Ancient', 'Hell', 'Angelic']
const RAR = [
  [62, -0.03, 6], [28, 0.06, 20], [8, 0.12, 70], [1.6, 0.17, 220], [0.35, 0.21, 800], [0.05, 0.25, 3200], [0.008, 0.28, 16000], [0.0012, 0.3, 90000],
]
const RN = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'secret']
// [id, zone, rarity, f]
const ROSTER = `bunny 0 0 .8|duck 0 0 1.3|chicken 0 1 .95|pig 0 1 1.4|sheep 0 2 1|cow 0 3 1|pony 0 4 1|crab 1 0 1|turtle 1 1 1|axolotl 1 1 1.3|puffer 1 2 .9|jelly 1 2 1.2|swordfish 1 3 1|shark 1 4 1|hare 2 0 1|penguin 2 1 1|fox 2 2 .9|wolf 2 2 1.2|bear 2 3 1|orca 2 3 1.3|mammoth 2 4 1|lizard 3 1 .9|tortoise 3 1 1.3|camel 3 2 .9|ostrich 3 2 1.2|cobra 3 3 .9|kangaroo 3 3 1.2|scorpion 3 4 1|mole 4 1 1|gemhound 4 2 1|cavebat 4 2 1.2|prismcat 4 3 1|geodrake 4 3 1.3|crystalcorn 4 4 1|toucan 5 1 1|giraffe 5 2 1|gorilla 5 2 1.2|elephant 5 3 .9|croc 5 3 1.2|tiger 5 4 1|kong 5 5 1|goldchick 6 2 1|goldbunny 6 2 1.2|goldpig 6 3 1|goldeagle 6 3 1.2|goldowl 6 4 1|goldstallion 6 5 1|raptor 7 2 1|ankylo 7 2 1.2|stego 7 3 .9|ptero 7 3 1.1|brachio 7 3 1.3|trex 7 4 1|spino 7 5 1|skyrex 7 6 1|embercrow 8 2 1|hellbat 8 3 1|hellhound 8 5 1|dragon 8 6 1|pegasus 9 3 1|seraph 9 3 1.3|holydragon 9 6 1|griffin 9 7 1`
  .split('|').map((s) => { const [id, z, r, f] = s.split(' '); return { id, z: +z, r: +r, inc: Math.round(RAR[+r][2] * +f * ZONES[+z]) } })

const zoneStart = (i) => (i <= 0 ? 0 : 126 + (i - 1) * 70)
const zoneAt = (d) => Math.max(0, Math.min(9, d < 126 ? 0 : 1 + Math.floor((d - 126) / 70)))
const LANE = zoneStart(10)

function run(seed, opts = {}) {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const POWER = opts.power ?? 0.85 // average meter stop (0.62 = Great, 0.86 = Perfect)
  const CPS = opts.cps ?? 5 // reel clicks per second
  const OVERHEAD = opts.overhead ?? 5 // s per shot: claim bait, walk to harpoon, attach, aim wait

  const S = {
    t: 0, money: 0, strength: 0, gymOwned: false, gymLevel: 1, gymLv: 1, gymXp: 0,
    up: { mult: 0, xp: 0, slot: 0, pen: 0, autoSpeed: 0 },
    passes: { autoClick: 0, x2xp: 0, x2cash: 0, x2luck: 0, autoMachine: 0 },
    pets: ['dino'], owned: { chick: 0, mammoth: 0 },
    p: 0, mxp: 0, auto: [0, 0, 0], axp: [0, 0, 0],
    pen: [], seen: new Set(), claimed: new Set(),
    shots: 0, reps: 0, trainTime: 0, fishTime: 0, pumpTime: 0,
  }
  const log = []
  const milestone = (k) => { if (!log.find((x) => x[0] === k)) log.push([k, S.t, income(), S.money, S.strength, S.p]) }
  const cap = () => 4 + S.up.slot
  const pet = { dino: [0.25, 0], chick: [0, 0.3], mammoth: [1, 0.25] }
  const petB = (i) => S.pets.reduce((a, id) => a + pet[id][i], 0)
  const zonesDone = () => ZNAME.filter((_, z) => ROSTER.every((a) => a.z !== z || S.seen.has(a.id))).length
  const playBoost = () => Math.min(0.5, Math.floor(S.t / 180) * 0.05)
  const cashMult = () => (1 + 0.5 * S.up.mult) * (S.passes.x2cash ? 2 : 1) * (1 + petB(0)) * (1 + playBoost()) * (1 + 0.2 * zonesDone())
  const luck = () => (1 + petB(1)) * (S.passes.x2luck ? 2 : 1)
  const income = () => S.pen.reduce((a, x) => a + x, 0) * cashMult()
  const maxD = () => (NEW ? 1e9 : LANE - 8) > 0 ? Math.min(NEW ? 1e9 : LANE - 8, 55 + RK * Math.log2(1 + S.strength / S0)) : 0
  const xpNeed = (p) => (p >= PCAP ? Infinity : 40 * Math.pow(XGN, p))
  const xpPump = () => Math.pow(XR, S.up.xp) * (S.passes.x2xp ? 2 : 1)
  const autoRate = () => 1.2 * Math.pow(AR, S.up.autoSpeed) * (S.passes.x2xp ? 2 : 1)
  const gymRep = () => Math.pow(G.perRep, S.gymLevel - 1) * (1 + 0.05 * (S.gymLv - 1))
  const repTime = () => (S.gymLevel >= 15 ? 2.05 : S.gymLevel >= 5 ? 1.8 : 1.44)

  // Passive time: income, auto click, auto machine.
  function advance(dt) {
    S.t += dt
    S.money += income() * dt
    if (S.passes.autoClick) addXp(3 * dt * xpPump())
    if (S.passes.autoMachine) for (let i = 0; i < 3; i++) {
      S.axp[i] += autoRate() * dt
      while (S.axp[i] >= xpNeed(S.auto[i])) { S.axp[i] -= xpNeed(S.auto[i]); S.auto[i]++ }
      if (S.auto[i] >= PCAP) S.axp[i] = 0
    }
  }
  function addXp(x) {
    S.mxp += x
    // big jumps: solve levels in closed-ish form to avoid long loops
    while (S.mxp >= xpNeed(S.p)) { S.mxp -= xpNeed(S.p); S.p++ }
    if (S.p >= PCAP) S.mxp = 0
  }
  const baitP = () => Math.max(S.p, ...(S.passes.autoMachine ? S.auto : [0]))

  // --- shop ---
  const costs = () => {
    const U = []
    if (!S.gymOwned && S.pen.length >= 1) U.push(['gym', 150])
    if (S.gymOwned && S.gymLevel < GMAX) U.push(['gymUp', G.base * Math.pow(G.growth, S.gymLevel - 1)])
    if (!S.passes.autoClick) U.push(['autoClick', PR.autoClick])
    if (!S.passes.x2xp) U.push(['x2xp', PR.x2xp])
    if (!S.passes.x2cash) U.push(['x2cash', PR.x2cash])
    if (!S.passes.x2luck) U.push(['x2luck', PR.x2luck])
    if (!S.passes.autoMachine) U.push(['autoMachine', PR.autoMachine])
    if (!S.owned.chick) U.push(['chick', PR.chick])
    if (!S.owned.mammoth) U.push(['mammoth', PR.mammoth])
    if (S.up.mult < MMAX) U.push(['mult', UP.mult[0] * Math.pow(UP.mult[1], S.up.mult)])
    if (S.up.xp < XMAX) U.push(['xp', UP.xp[0] * Math.pow(UP.xp[1], S.up.xp)])
    if (cap() < 12) U.push(['slot', UP.slot[0] * Math.pow(UP.slot[1], S.up.slot)])
    if (S.up.pen < 5) U.push(['pen', UP.pen[0] * Math.pow(UP.pen[1], S.up.pen)])
    if (S.passes.autoMachine && S.up.autoSpeed < AMAX) U.push(['autoSpeed', UP.autoSpeed[0] * Math.pow(UP.autoSpeed[1], S.up.autoSpeed)])
    return U.map(([k, c]) => [k, Math.round(c)])
  }
  function buy(k, c) {
    S.money -= c
    if (k === 'gym') S.gymOwned = true
    else if (k === 'gymUp') S.gymLevel++
    else if (k in S.passes) S.passes[k] = 1
    else if (k === 'chick' || k === 'mammoth') { S.owned[k] = 1; S.pets = S.owned.mammoth && S.owned.chick ? ['mammoth', 'chick'] : S.owned.mammoth ? ['mammoth', 'dino'] : ['dino', 'chick'] }
    else S.up[k]++
  }
  function shop() {
    if (baitP() >= PCAP) milestone('max bait')
    if (S.up.xp >= XMAX) milestone('xp maxed')
    if (S.up.autoSpeed >= AMAX) milestone('auto maxed')
    if (S.up.mult >= MMAX) milestone('mult maxed')
    if (S.gymLevel >= GMAX) milestone('gym maxed')
    for (;;) {
      const U = costs()
      if (!U.length) { milestone('ALL UPGRADES MAXED'); return }
      const prio = U.find((x) => x[0] === 'gym' || x[0] === 'gymUp')
      const pick = prio && prio[1] <= S.money ? prio : U.filter((x) => x[1] <= S.money).sort((a, b) => a[1] - b[1])[0]
      if (!pick) return
      buy(...pick)
    }
  }

  // --- one shot ---
  function shot() {
    let pre = OVERHEAD
    if (!S.passes.autoClick) { S.pumpTime += 6; pre += 6; advance(0); addXp(6 * 7.7 * xpPump()) } // hold E for ~6 s
    advance(pre)
    const k = Math.min(1, Math.max(0, POWER + (rnd() - 0.5) * 0.25))
    let d = maxD() * (0.35 + 0.65 * k) + (rnd() * 2 - 1) * 4
    d = Math.max(18, Math.min(LANE - 8, d))
    // Target picker: zones below the farthest one reachable can be aimed at directly.
    const zf = maxD() >= LANE ? 10 : zoneAt(maxD())
    const dTyp = maxD() * (0.35 + 0.65 * POWER) - 4
    if (NEW && zf > 0 && zoneAt(dTyp) < zf - 1) d = zoneStart(zf - 1) + 6 + (zoneStart(zf) - zoneStart(zf - 1) - 12) * k
    const zone = zoneAt(d)
    if (zoneStart(zone) > 0 && d - zoneStart(zone) < 6) d = zoneStart(zone) + 6
    const powerLuck = 1 + k
    const flightLuck = powerLuck * (1 + d / 180)
    const b = rnd()
    const band = b < 0.6 ? [1.05, 1.9] : b < 0.9 ? [1.9, 4.5] : b < 0.985 ? [4.5, 10] : [10, 25]
    const bush = band[0] + rnd() * (band[1] - band[0])
    const shotLuck = flightLuck * bush
    const L = luck() * Math.sqrt(Math.max(1, shotLuck))
    const p = baitP()
    const pool = ROSTER.filter((a) => a.z === zone)
    const tiers = [...new Set(pool.map((a) => a.r))].sort((a, b) => a - b)
    // weights in log space (p can get large)
    const lw = tiers.map((r, j) => Math.log(RAR[r][0]) + RAR[r][1] * p + (j > 0 ? Math.log(L) : 0))
    const m = Math.max(...lw)
    let w = lw.map((x) => Math.exp(x - m))
    if (NEW) { const sum = w.reduce((a, c) => a + c, 0); w = w.map((x, j) => Math.max(x, FLOOR[tiers[j]] * sum)) }
    let x = rnd() * w.reduce((a, c) => a + c, 0), j = 0
    while (j < w.length - 1 && x >= w[j]) { x -= w[j]; j++ }
    const list = pool.filter((a) => a.r === tiers[j])
    const def = list[Math.floor(rnd() * list.length)]
    const shiny = rnd() < Math.min(SHINYCAP, 0.03 * luck() * Math.sqrt(Math.max(1, shotLuck)))
    // timings
    const flight = Math.min(5.2, 1.5 + 1.1 * Math.min(1, d / 140) + Math.max(0, d - 140) / 170)
    const charge = Math.min(4.5, 1.5 + 0.45 * Math.log2(bush))
    const far = 0.8 + Math.min(1.2, d / 400)
    const r = def.r
    const secs = (8 + 1.4 * Math.min(r, 6)) * far
    const click = Math.max(0.022, 0.05 - 0.005 * r) / far
    const rate = 1 / secs + CPS * click - 0.09 / 3.3 // tugs pull 0.09 roughly every 3.3 s
    const reel = 1 / Math.max(0.05, rate)
    const dur = 0.45 + 0.6 + flight + charge + 1.6 + 1.5 + reel + 0.85 + 1.6
    advance(dur)
    S.fishTime += pre + dur
    S.shots++
    const inc = def.inc * (shiny ? 3 : 1)
    if (!S.seen.has(def.id)) { S.seen.add(def.id); S.money += def.inc * 10 * 1 /* index claim, base income */ }
    if (S.pen.length < cap()) S.pen.push(inc)
    else {
      S.pen.sort((a, b) => a - b)
      if (inc > S.pen[0]) { S.money += S.pen[0] * 25; S.pen[0] = inc } else S.money += inc * 25 // sell the worse one
    }
    S.lastZone = Math.max(S.lastZone ?? 0, zone)
    milestone(`first ${ZNAME[zone]} catch`)
    if (S.seen.size === ROSTER.length) milestone('INDEX COMPLETE (63/63)')
    return zone
  }
  function trainBlock(n) {
    const rt = repTime()
    for (let i = 0; i < n; i++) {
      S.strength += gymRep(); S.gymXp++; S.reps++
      while (S.gymXp >= 4 + S.gymLv + Math.floor(S.gymLv * S.gymLv / 25)) { S.gymXp -= 4 + S.gymLv + Math.floor(S.gymLv * S.gymLv / 25); S.gymLv++ }
    }
    advance(n * rt + 1.85 / 3) // pickup/putdown amortised
    S.trainTime += n * rt
  }
  // zone a typical shot (at POWER) lands in
  const typicalZone = () => Math.max(zoneAt(maxD() * (0.35 + 0.65 * POWER)), NEW ? (maxD() >= LANE ? 10 : zoneAt(maxD())) - 1 : 0)
  const typicalZoneAt = (str) => zoneAt(Math.min(LANE - 8, 55 + 95 * Math.log2(1 + str / 25)) * (0.35 + 0.65 * POWER) - 4)

  const capped0 = () => maxD() * (0.35 + 0.65 * POWER) - 4 >= LANE - 8 || maxD() >= LANE
  const LIMIT = opts.limit ?? 3600 * 60
  while (S.t < LIMIT) {
    shop()
    const z = typicalZone()
    milestone(`reach ${ZNAME[z]}`)
    const full = S.pen.length >= cap()
    const worstZoneOk = full && Math.min(...S.pen) >= Math.min(...ROSTER.filter((a) => a.z === z).map((a) => a.inc))
    const done = !costs().length
    if (done && capped0() && (S.seen.size === ROSTER.length || !opts.index)) break
    const capped = typicalZone() >= 9 && (maxD() * (0.35 + 0.65 * POWER) - 4 >= LANE - 8 || maxD() >= LANE)
    if (capped) milestone('max harpoon reach')
    if (S.gymOwned && !capped && worstZoneOk) trainBlock(20)
    else shot()
  }
  return { S, log, maxD: maxD() }
}

const fmtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.round(s % 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(ss).padStart(2, '0')}s` }

const mode = process.argv[2] ?? 'one'
if (mode === 'sum') {
  const profiles = { casual: { power: 0.6, cps: 2, overhead: 9 }, typical: {}, tryhard: { power: 0.95, cps: 8, overhead: 3 } }
  const keys = [...ZNAME.slice(1).map((z) => `first ${z} catch`), 'ALL UPGRADES MAXED', 'max harpoon reach', 'max bait', 'xp maxed', 'auto maxed', 'mult maxed', 'gym maxed']
  console.log('profile  '.padEnd(9), keys.map((k) => k.replace('first ', '').replace(' catch', '').replace('ALL UPGRADES MAXED', 'MAXED').replace('max harpoon reach', 'reach').replace('max bait','bait').replace(' maxed','').padStart(8)).join(''))
  for (const [name, o] of Object.entries(profiles)) {
    const runs = Array.from({ length: Number(process.argv[3] ?? 15) }, (_, i) => run(i + 1, { ...o }))
    const med = (k) => { const ts = runs.map((r) => r.log.find((x) => x[0] === k)?.[1]).filter((x) => x != null).sort((a, b) => a - b); return ts.length < runs.length / 2 ? '-' : ts[Math.floor(ts.length / 2)] }
    const f = (s) => (s === '-' ? '-' : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`)
    console.log(name.padEnd(9), keys.map((k) => f(med(k)).padStart(8)).join(''), '  reps', Math.round(runs.reduce((a, r) => a + r.S.reps, 0) / runs.length), 'shots', Math.round(runs.reduce((a, r) => a + r.S.shots, 0) / runs.length))
  }
  process.exit(0)
}
if (mode === 'one') {
  const { S, log } = run(Number(process.argv[3] ?? 1), { index: process.argv[4] === 'index' })
  for (const [k, t, inc, m, st, p] of log) console.log(fmtT(t).padStart(9), k.padEnd(26), 'income/s', inc.toExponential(2), ' money', m.toExponential(2), ' str', Math.round(st), ' baitP', p, ' baitSell', (12*Math.pow(1.42,p)).toExponential(1))
  console.log('missing:', ROSTER.filter(a=>!S.seen.has(a.id)).map(a=>a.id+'('+RN[a.r]+')').join(' '))
  console.log({ shots: S.shots, reps: S.reps, fish: fmtT(S.fishTime), train: fmtT(S.trainTime), strength: Math.round(S.strength), gymLevel: S.gymLevel, baitP: S.p, money: S.money.toExponential(2), end: fmtT(S.t) })
} else {
  // many seeds, median milestone times, for several player skill profiles
  const profiles = { casual: { power: 0.6, cps: 2, overhead: 9 }, typical: {}, tryhard: { power: 0.95, cps: 8, overhead: 3 } }
  for (const [name, o] of Object.entries(profiles)) {
    const runs = Array.from({ length: 40 }, (_, i) => run(i + 1, { ...o }))
    const keys = [...new Set(runs.flatMap((r) => r.log.map((x) => x[0])))]
    console.log(`\n== ${name} ==`)
    const rows = keys.map((k) => { const ts = runs.map((r) => r.log.find((x) => x[0] === k)?.[1]).filter((x) => x != null).sort((a, b) => a - b); return [ts[Math.floor(ts.length / 2)], k, ts.length] })
    rows.sort((a, b) => a[0] - b[0]).forEach(([t, k, n]) => console.log(fmtT(t).padStart(9), k, n < runs.length ? `(${n}/${runs.length} runs)` : ''))
  }
}

import './windows.css'
import { ANIMALS, BAITS, PASSES, PETS, RARITIES, STORE, UPGRADES } from './config.js'
import { createWindow, replay } from './uiWindow.js'
import { ICONS } from './icons.js'
import { THUMBS } from './thumbs.js'
import { clock, minsSecs, money } from './format.js'
import { baitName, kindOf, levelOf } from './bait.js'
import { burst, centre } from './juice.js'

// The menu windows, all on the shared shell (uiWindow.js). Every window rebuilds
// its body when opened and after each action inside it.
//   store (Shop)  - panel skin: the limited Starter Pack, Upgrade Bait, the permanent passes,
//                   potions, the Lucky Chick and the Auto Machine
//   pets          - panel skin: "n/m Pets Active", equip / unequip / buy rows, Equip Best
//   sell          - panel skin: Animals / Baits tabs, grouped rows, total value + Sell All
//   index         - every animal (silhouettes until caught) + current bait odds
//   offer         - the limited OP pet
// Everything is priced in money (project rule: nothing costs premium currency).
const POTION_COLOR = { luck: '#62e34a', cash: '#ffd21f', xp: '#4fb6ff' }
const INK = '#1d1a22'

// Icons only these windows use.
const WI = {
  clover: `<svg viewBox="0 0 64 64"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"><path d="M32 30 Q18 32 14 22 Q10 10 22 10 Q30 10 32 20 Q34 10 42 10 Q54 10 50 22 Q46 32 32 30 Z" fill="#3fd44a"/><path d="M32 34 Q18 32 14 42 Q10 54 22 54 Q30 54 32 44 Q34 54 42 54 Q54 54 50 42 Q46 32 32 34 Z" fill="#2fbf3c"/><path d="M30 32 Q20 18 10 22 Q2 30 10 36 Q2 42 10 48 Q20 50 30 32 Z" fill="#46dd52"/><path d="M34 32 Q44 18 54 22 Q62 30 54 36 Q62 42 54 48 Q44 50 34 32 Z" fill="#37cc44"/></g><path d="M32 32 Q34 46 42 58" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  bolt: `<svg viewBox="0 0 64 64"><path d="M38 4 L12 36 H28 L22 60 L52 24 H36 Z" fill="#ffd21f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M36 12 L22 32" stroke="#fff6a8" stroke-width="4" stroke-linecap="round"/></svg>`,
  cursor: `<svg viewBox="0 0 64 64"><g stroke="#ffd21f" stroke-width="6" stroke-linecap="round"><path d="M14 12 L20 20"/><path d="M6 30 H15"/><path d="M30 4 V13"/><path d="M46 10 L40 18"/><path d="M12 48 L19 42"/></g><path d="M24 22 L54 40 L40 43 L48 58 L41 61 L33 46 L24 55 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  arrow: `<svg viewBox="0 0 64 64"><path d="M6 24 H34 V10 L60 32 L34 54 V40 H6 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  tank: `<svg viewBox="0 0 64 64"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"><rect x="6" y="18" width="14" height="34" rx="4" fill="#9ff6ff"/><rect x="25" y="12" width="14" height="40" rx="4" fill="#9ff6ff"/><rect x="44" y="18" width="14" height="34" rx="4" fill="#9ff6ff"/><rect x="4" y="50" width="56" height="10" rx="3" fill="#6b7280"/></g><rect x="9" y="34" width="8" height="15" fill="#ff8fb0"/><rect x="28" y="26" width="8" height="23" fill="#7bd34a"/><rect x="47" y="30" width="8" height="19" fill="#ffe14a"/></svg>`,
  // Side tabs: a white animal silhouette and a white worm.
  tabAnimal: `<svg viewBox="0 0 64 64"><path d="M10 44 Q8 30 18 24 Q22 14 32 14 Q40 14 44 20 L52 18 Q58 20 56 28 Q60 34 56 40 L54 50 H46 L44 42 H26 L24 52 H16 L16 46 Q10 48 10 44 Z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="49" cy="26" r="2.4" fill="${INK}"/></svg>`,
  tabWorm: `<svg viewBox="0 0 64 64"><path d="M8 40 Q20 22 32 34 Q44 46 56 26" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M8 40 Q20 22 32 34 Q44 46 56 26" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/></svg>`,
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.innerHTML = html
  return e
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// A buy button that reports success (stars) or shakes. onBuy returns true / false.
function buyButton(label, onBuy, { style = 'green', disabled = false } = {}) {
  const b = el('button', `win-buy ${style}`, label)
  b.type = 'button'
  b.disabled = disabled
  b.addEventListener('click', () => {
    const ok = onBuy()
    if (ok === false) replay(b, 'shake')
    else if (ok !== undefined) burst(...centre(b), 'stars')
  })
  return b
}
// The panel windows' chunky button (uiPanel.css .pw-btn).
function pwButton(label, onClick, style = 'green', cls = '') {
  const b = el('button', `pw-btn uiw-text ${style} ${cls}`.trim(), label)
  b.type = 'button'
  b.addEventListener('click', () => {
    const ok = onClick(b)
    if (ok === false) replay(b, 'shake')
    else if (ok === true && b.isConnected) burst(...centre(b), 'stars')
  })
  return b
}

export function createWindows(game) {
  const S = game.S
  // Timers that tick inside an open window (cleared when it closes).
  const ticking = new Map()
  const tick = (win, key, fn) => {
    clearInterval(ticking.get(key))
    ticking.set(
      key,
      setInterval(() => {
        if (!win.isOpen()) return clearInterval(ticking.get(key))
        fn()
      }, 500),
    )
  }

  // --- Shop ------------------------------------------------------------------------------------
  const store = createWindow({ title: 'Shop', icon: ICONS.basket, className: 'win-shop', skin: 'panel', onOpen: () => fillStore() })
  store.extra.innerHTML = `<span class="pw-sale uiw-text">-${Math.round(STORE.sale * 100)}% OFF!</span>`
  let shopScroll = 0
  function fillStore() {
    const body = store.body
    const prev = body.querySelector('.pw-scroll')
    if (prev) shopScroll = prev.scrollTop
    body.innerHTML = ''
    const scroll = el('div', 'pw-scroll shop-scroll')
    body.append(scroll)
    const redo = (ok) => {
      if (ok) fillStore()
      return ok
    }

    // Starter Pack: limited time, -50%, bought once.
    const P = STORE.pack
    const pack = el('div', 'shop-pack')
    const tiles = P.animals
      .map((id) => {
        const def = game.animalDef(id)
        if (!def) return ''
        return `<div class="pack-tile"><b class="uiw-text">${esc(def.name)}</b><img src="${THUMBS.animal[id] ?? ''}" alt=""><span class="uiw-text">${money(def.income)}/s</span></div>`
      })
      .join('')
    const flasks = Object.keys(STORE.potions).map((id) => ICONS.flask(POTION_COLOR[id])).join('')
    pack.innerHTML = `<div class="pack-head"><b class="uiw-text pack-title">${P.name}</b><span class="uiw-text pack-limited">Limited Time!</span></div>
      <div class="pack-row">${tiles}<div class="pack-tile potions"><b class="uiw-text">Potions</b><div class="pack-flasks">${flasks}</div><span class="uiw-text">${P.potionMinutes}m</span></div>
      <div class="pack-side"><span class="uiw-text pack-time"></span><s class="uiw-text pack-was">${money(game.packPrice() * 2)}</s></div></div>`
    const side = pack.querySelector('.pack-side')
    if (S.packBought) side.append(el('span', 'pw-btn done uiw-text pack-buy', 'OWNED'))
    else side.append(pwButton(money(game.packPrice()), () => redo(game.buyPack()), 'green', 'pack-buy'))
    scroll.append(pack)
    const packTime = pack.querySelector('.pack-time')
    const paintTime = () => (packTime.textContent = S.packBought ? 'Thanks!' : `${minsSecs(game.packLeft())} Left!`)
    paintTime()
    tick(store, 'pack', paintTime)

    // Upgrade Bait: the machine jumps to the next bait kind.
    const kind = kindOf(S.machine.p)
    const last = game.baitSkipMaxed()
    const next = Math.min(BAITS.kinds.length - 1, kind + 1)
    const up = el('div', 'shop-upgrade')
    up.innerHTML = `<div class="up-title"><span class="up-rainbow">UPGRADE</span> <span class="uiw-text">BAIT!</span></div>
      <div class="up-row"><figure><img src="${THUMBS.bait[kind] ?? ''}" alt=""><figcaption class="uiw-text">${BAITS.kinds[kind].name}</figcaption></figure>
      <span class="up-arrow">${WI.arrow}</span>
      <figure><img src="${THUMBS.bait[next] ?? ''}" alt=""><figcaption class="uiw-text">${last ? 'Maxed!' : BAITS.kinds[next].name}</figcaption></figure></div>`
    const upRow = up.querySelector('.up-row')
    if (last) upRow.append(el('span', 'pw-btn done uiw-text up-buy', 'MAX'))
    else upRow.append(pwButton(money(game.baitSkipPrice()), () => redo(game.skipBait()), 'red', 'up-buy'))
    scroll.append(up)

    // Permanent passes.
    const card = ({ color, icon, badge = '', name, desc, price, owned, buy }) => {
      const c = el('div', `shop-card ${color}${owned ? ' owned' : ''}`)
      c.innerHTML = `<div class="card-art">${icon}${badge ? `<b class="uiw-text card-badge">${badge}</b>` : ''}</div>
        <div class="card-text"><b class="uiw-text">${name}</b><span class="uiw-text">${desc}</span></div>`
      c.append(owned ? el('span', 'pw-btn done uiw-text card-buy', 'OWNED') : pwButton(money(price), () => redo(buy()), 'green', `card-buy${game.money < price ? ' poor' : ''}`))
      return c
    }
    const grid = el('div', 'shop-grid')
    grid.append(
      card({ color: 'green', icon: WI.clover, badge: '2x', name: '2x Luck', desc: 'Rarer Animals!', price: PASSES.x2luck.price, owned: S.passes.x2luck, buy: () => game.buyPass('x2luck') }),
      card({ color: 'green', icon: ICONS.cash, badge: '2x', name: '2x Cash', desc: 'Cash Forever!', price: PASSES.x2cash.price, owned: S.passes.x2cash, buy: () => game.buyPass('x2cash') }),
      card({ color: 'yellow', icon: WI.bolt, name: '2X XP', desc: '2x Bait XP!', price: PASSES.x2xp.price, owned: S.passes.x2xp, buy: () => game.buyPass('x2xp') }),
      card({ color: 'purple', icon: WI.cursor, name: 'Autoclicker', desc: 'Auto Pumps Machine!', price: PASSES.autoClick.price, owned: S.passes.autoClick, buy: () => game.buyPass('autoClick') }),
    )
    scroll.append(grid)

    // Potions (10 minutes, stack).
    scroll.append(el('h3', 'shop-h uiw-text', 'Potions'))
    const potions = el('div', 'shop-grid three')
    for (const [id, p] of Object.entries(STORE.potions)) {
      const on = game.potionOn(id)
      const c = card({ color: 'blue', icon: ICONS.flask(POTION_COLOR[id]), badge: '2x', name: p.name.replace(' Potion', ''), desc: on ? `Active ${clock((S.potions[id] - Date.now()) / 1000)}` : `${p.minutes} min`, price: p.price, owned: false, buy: () => game.buyPotion(id) })
      potions.append(c)
    }
    scroll.append(potions)

    // Pets & machines.
    scroll.append(el('h3', 'shop-h uiw-text', 'More'))
    const more = el('div', 'shop-grid')
    const chick = PETS.list.find((p) => p.id === 'chick')
    more.append(
      card({ color: 'orange', icon: `<img src="${THUMBS.pet.chick ?? ''}" alt="">`, name: chick.name, desc: `+${Math.round(chick.luck * 100)}% Luck Pet!`, price: chick.price, owned: S.pets.owned.includes('chick'), buy: () => game.buyPet('chick') }),
      card({ color: 'teal', icon: WI.tank, name: UPGRADES.auto.name, desc: '3 Tanks Grow Bait!', price: UPGRADES.auto.price, owned: S.passes.autoMachine, buy: () => game.buyPass('autoMachine') }),
    )
    scroll.append(more)
    scroll.scrollTop = shopScroll
  }

  // --- Pets ------------------------------------------------------------------------------------
  const pets = createWindow({ title: 'Pets', icon: ICONS.paw, className: 'win-pets2', skin: 'panel', onOpen: () => fillPets() })
  pets.extra.innerHTML = `<span class="pets-total"><small class="uiw-text">Total</small><b class="uiw-text"></b></span>`
  const petDef = (id) => PETS.list.find((p) => p.id === id)
  const petLine = (p) =>
    [p.cash ? `<span class="up">+${money(game.petIncome(p.id))}/s</span>` : '', p.luck ? `+${Math.round(p.luck * 100)}% Luck` : ''].filter(Boolean).join(' · ')
  function paintPetTotal() {
    const total = S.pets.equipped.reduce((s, id) => s + game.petIncome(id), 0)
    pets.extra.querySelector('b').textContent = `+${money(total)}/s`
  }
  function fillPets() {
    const body = pets.body
    body.innerHTML = ''
    pets.setTitle(`${S.pets.equipped.length}/${PETS.equipMax} Pets Active`)
    paintPetTotal()
    const scroll = el('div', 'pw-scroll')
    const rank = (p) => (S.pets.equipped.includes(p.id) ? 0 : S.pets.owned.includes(p.id) ? 1 : 2)
    const list = [...PETS.list].sort((a, b) => rank(a) - rank(b))
    for (const p of list) {
      const owned = S.pets.owned.includes(p.id)
      const eq = S.pets.equipped.includes(p.id)
      const row = el('div', `pw-row pet-row${owned ? '' : ' locked'}`)
      row.innerHTML = `<span class="pet-box"><img class="pw-thumb" src="${THUMBS.pet[p.id] ?? ''}" alt=""></span>
        <div class="pw-info"><b class="pw-name uiw-text">${esc(p.name)}</b><span class="pw-sub uiw-text">${petLine(p)}</span></div>`
      const again = (ok) => {
        if (ok) fillPets()
        return ok
      }
      if (owned) row.append(pwButton(eq ? 'Unequip' : 'Equip', () => again(game.toggleEquip(p.id)) && undefined, eq ? 'red' : 'green'))
      else if (p.source === 'free') row.append(pwButton('FREE', () => again(game.claimFreePet()), 'green'))
      else row.append(pwButton(money(p.price), () => again(game.buyPet(p.id)), p.source === 'offer' ? 'purple' : 'green', game.money < p.price ? 'poor' : ''))
      scroll.append(row)
    }
    const foot = el('div', 'pw-foot pets-foot')
    foot.append(pwButton('Equip Best', () => (game.equipBest() ? (fillPets(), undefined) : false), 'green'))
    body.append(scroll, foot)
    tick(pets, 'pets', paintPetTotal)
  }

  // --- Index -----------------------------------------------------------------------------------
  const index = createWindow({
    title: 'Index',
    icon: ICONS.book,
    className: 'win-index',
    onOpen: () => {
      fillIndex()
      game.markIndexSeen()
    },
  })
  function fillIndex() {
    const body = index.body
    body.innerHTML = ''
    const found = ANIMALS.filter((a) => S.index[a.id]?.n).length
    const head = el('div', 'index-head')
    head.innerHTML = `<b class="uiw-text">Discovered ${found}/${ANIMALS.length}</b>`
    // Odds with the best bait you can use right now.
    const p = S.baits.length ? Math.max(...S.baits) : S.machine.p
    const odds = game.odds(p)
    const oddsEl = el('div', 'index-odds')
    oddsEl.innerHTML = `<span>${baitName(p)} odds:</span>` + RARITIES.map((r, i) => `<i style="--c:${r.color}">${r.name} ${odds[i] < 0.1 ? odds[i].toFixed(2) : odds[i].toFixed(1)}%</i>`).join('')
    head.append(oddsEl)
    body.append(head)
    const scroll = el('div', 'win-scroll')
    const grid = el('div', 'win-grid index-grid')
    for (const a of ANIMALS) {
      const e = S.index[a.id]
      const r = RARITIES.find((x) => x.id === a.rarity)
      const card = el('div', `win-card animal${e?.n ? '' : ' unknown'}`)
      card.style.setProperty('--rc', r.color)
      card.innerHTML = `<img src="${(e?.n ? THUMBS.animal[a.id] : THUMBS.silhouette[a.id]) ?? ''}" alt="">
        <span class="card-rarity uiw-text">${r.name}</span>
        <b class="uiw-text">${e?.n ? a.name : '???'}</b>
        <span class="card-desc">${money(a.income)}/s</span>
        <span class="card-sub">${e?.n ? `Caught x${e.n}` : 'Not found yet'}${e?.shiny ? ` <span class="shiny">${ICONS.star}</span>` : ''}</span>`
      grid.append(card)
    }
    scroll.append(grid)
    body.append(scroll)
  }

  // --- Sell ------------------------------------------------------------------------------------
  // Two tabs (left of the body): Animals and Baits. Rows group identical baits / animals
  // ("2x Owned"); each Sell sells one. The footer totals the tab and sells all of it (animals
  // ask for a second tap first).
  const sell = createWindow({ title: 'Sell Baits', icon: ICONS.cash, className: 'win-sell2', skin: 'panel', onOpen: () => openSell() })
  const tabs = el('div', 'pw-tabs')
  tabs.innerHTML = `<button type="button" class="pw-tab" data-tab="animals" aria-label="Sell animals">${WI.tabAnimal}</button><button type="button" class="pw-tab" data-tab="baits" aria-label="Sell baits">${WI.tabWorm}</button>`
  sell.dialog.append(tabs)
  const sellFoot = el('div', 'pw-foot sell-foot')
  sell.dialog.append(sellFoot)
  let tab = 'baits'
  for (const b of tabs.querySelectorAll('.pw-tab')) {
    b.addEventListener('click', () => {
      if (tab === b.dataset.tab) return
      tab = b.dataset.tab
      replay(b, 'bump')
      fillSell()
    })
  }
  function openSell() {
    // The bag first; the pen when the bag is empty.
    if (!S.baits.length && game.animals.length) tab = 'animals'
    else if (S.baits.length) tab = 'baits'
    fillSell()
  }
  let confirmAt = 0
  function fillSell() {
    for (const b of tabs.querySelectorAll('.pw-tab')) b.classList.toggle('on', b.dataset.tab === tab)
    sell.setTitle(tab === 'baits' ? 'Sell Baits' : 'Sell Animals')
    const body = sell.body
    body.innerHTML = ''
    const scroll = el('div', 'pw-scroll')
    body.append(scroll)
    sellFoot.innerHTML = ''
    confirmAt = 0
    if (tab === 'baits') fillBaits(scroll)
    else fillAnimals(scroll)
  }
  const sellRow = ({ img, name, tag, tagColor, sub, value, count, onSell }) => {
    const row = el('div', 'pw-row sell-row')
    row.innerHTML = `<img class="pw-thumb" src="${img ?? ''}" alt="">
      <div class="pw-info"><b class="pw-name uiw-text">${esc(name)}${tag ? ` <em style="--tag:${tagColor}">${esc(tag)}</em>` : ''}</b><span class="pw-sub uiw-text">${sub}</span></div>
      <div class="pw-val"><b class="uiw-text">${money(value)}</b><span class="uiw-text">${count}x Owned</span></div>`
    row.append(pwButton('Sell', () => (onSell(), fillSell(), undefined), 'green'))
    return row
  }
  function fillBaits(scroll) {
    // Group the bag by bait level, best first.
    const groups = new Map()
    for (const p of S.baits) groups.set(p, (groups.get(p) ?? 0) + 1)
    const levels = [...groups.keys()].sort((a, b) => b - a)
    if (!levels.length) scroll.append(el('p', 'pw-empty uiw-text', 'No bait in your bag! Claim some at the bait machine.'))
    for (const p of levels) {
      const kind = BAITS.kinds[kindOf(p)]
      const odds = game.odds(p)
      const rarePlus = odds.slice(2).reduce((a, b) => a + b, 0)
      scroll.append(
        sellRow({
          img: THUMBS.bait[kindOf(p)],
          name: kind.name,
          tag: `Lv ${levelOf(p)}`,
          tagColor: '#ffd21f',
          sub: `${rarePlus < 10 ? rarePlus.toFixed(1) : Math.round(rarePlus)}% Rare+`,
          value: game.baitValue(p),
          count: groups.get(p),
          onSell: () => game.sellBait(S.baits.indexOf(p)),
        }),
      )
    }
    const total = S.baits.reduce((s, p) => s + game.baitValue(p), 0)
    sellFoot.append(el('span', 'pw-total uiw-text', `Bait Value: ${money(total)}`))
    sellFoot.append(pwButton('Sell All', () => (S.baits.length ? (game.sellAllBaits(), fillSell(), true) : false), 'green'))
  }
  function fillAnimals(scroll) {
    // Group the pen by species + shiny, dearest first.
    const groups = new Map()
    for (const a of game.animals) {
      if (a.state === 'fly') continue
      const key = `${a.data.species}:${a.data.shiny ? 1 : 0}`
      const g = groups.get(key) ?? { data: a.data, def: a.def, uids: [] }
      g.uids.push(a.data.uid)
      groups.set(key, g)
    }
    const list = [...groups.values()].sort((a, b) => game.animalValue(b.data) - game.animalValue(a.data))
    if (!list.length) scroll.append(el('p', 'pw-empty uiw-text', 'Your pen is empty! Attach bait to the harpoon to catch animals.'))
    for (const g of list) {
      const r = RARITIES.find((x) => x.id === g.def.rarity)
      scroll.append(
        sellRow({
          img: (g.data.shiny ? THUMBS.shiny : THUMBS.animal)[g.def.id],
          name: `${g.data.shiny ? 'Shiny ' : ''}${g.def.name}`,
          tag: r.name,
          tagColor: g.data.shiny ? '#ffd23a' : r.color,
          sub: `${money(game.incomeOf(g.data))}/s`,
          value: game.animalValue(g.data),
          count: g.uids.length,
          onSell: () => game.sellAnimal(g.uids[0]),
        }),
      )
    }
    const total = list.reduce((s, g) => s + game.animalValue(g.data) * g.uids.length, 0)
    sellFoot.append(el('span', 'pw-total uiw-text', `Pen Value: ${money(total)}`))
    sellFoot.append(
      pwButton(
        'Sell All',
        (b) => {
          if (!list.length) return false
          // Selling the whole pen asks for a second tap within 3 s.
          if (performance.now() - confirmAt > 3000) {
            confirmAt = performance.now()
            b.textContent = 'Sure?'
            b.classList.add('confirm')
            setTimeout(() => {
              if (b.isConnected && performance.now() - confirmAt >= 2900) {
                b.textContent = 'Sell All'
                b.classList.remove('confirm')
              }
            }, 3000)
            return undefined
          }
          game.sellAllAnimals()
          fillSell()
          return true
        },
        'green',
      ),
    )
  }

  // --- OP offer --------------------------------------------------------------------------------
  const offer = createWindow({ title: 'OP Offer', icon: ICONS.star, className: 'win-offer', onOpen: () => fillOffer() })
  function fillOffer() {
    const p = petDef('mammoth')
    const body = offer.body
    body.innerHTML = ''
    const owned = S.pets.owned.includes(p.id)
    const card = el('div', 'offer-card')
    card.innerHTML = `<div class="offer-art"><span class="offer-rays"></span><img src="${THUMBS.pet.mammoth ?? ''}" alt=""></div>
      <div class="offer-info"><b class="uiw-text offer-name">${p.name}</b><span class="offer-bonus uiw-text">+${Math.round(p.cash * 100)}% Cash<br>+${Math.round(p.luck * 100)}% Luck</span>
      <span class="offer-left">Offer ends in <b class="offer-clock">${clock(game.offerLeft())}</b></span></div>`
    const info = card.querySelector('.offer-info')
    info.append(owned ? el('span', 'win-owned uiw-text', 'OWNED') : buyButton(money(p.price), () => game.buyPet(p.id) && (fillOffer(), true), { style: 'purple' }))
    body.append(card)
    tick(offer, 'offer', () => {
      const c = body.querySelector('.offer-clock')
      if (c) c.textContent = clock(game.offerLeft())
    })
  }

  // Rebuild an open window after a world action (selling at the stall, money changing).
  return {
    open: {
      store: () => store.open(),
      pets: () => pets.open(),
      index: () => index.open(),
      sell: () => sell.open(),
      offer: () => offer.open(),
    },
    refresh() {
      if (sell.isOpen()) fillSell()
    },
  }
}

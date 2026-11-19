import './hud.css'
import { adsAvailable, showRewarded } from './bloxity.js'
import { requestAdReward } from './net.js'
import { AD_REWARD, BAITS, PASSES, PETS, PLAY_BOOST, STORE } from './config.js'
import { ICONS } from './icons.js'
import { THUMBS } from './thumbs.js'
import { clock, minsSecs, money, num } from './format.js'
import { baitName, kindOf, levelOf } from './bait.js'
import { burst, centre } from './juice.js'
import { replay } from './uiWindow.js'
import { isMuted, isMusicOn, toggleMuted, toggleMusic } from './audio/index.js'

// The on-screen HUD:
//  - left column: Store (sale badge), Pets, Index (new-discovery badge)
//  - the free starter pet bubble, the limited OP pet offer (top right, countdown)
//  - right column: permanent pass cards (x2 Cash, x2 XP), priced in money
//  - bottom left: strength (once the training ring is owned), money (counts up smoothly),
//    income per second, active potions
//  - while training: the Strength / Lv. / XP bar in place of the bait bag, Cancel at the top
//  - bottom centre: the bait bag (tap or 1-6 to pick the bait the harpoon uses)
//  - bottom right: the Play Boost and when it next grows
//  - toasts and the catch banner at the top centre
// Boxity's toolbar + chat own the top-left corner: the column starts below them.
//
// Phones get the usual mobile-game zones instead (arrange(): .hud.port / .hud.land):
//  - top-left under Boxity: currencies (money + rate, strength) with buffs (boost, potions)
//  - left edge: Store / Pets / Index (portrait: a column under the currencies; short
//    landscape: a row beside Boxity's toolbar)
//  - right edge: one compact rail of offers + passes (free pet, OP offer, x2 Cash, x2 XP, ad),
//    under the sound / day / respawn buttons; bought passes leave the HUD
//  - bottom corners: joystick + jump cluster; bottom centre: the bait bag / training bar
//  - the middle of the screen stays clear; toasts and banners pass over it briefly
export function createHud(game, open) {
  const root = document.createElement('div')
  root.className = 'hud'
  root.innerHTML = `
    <div class="hud-lcol"></div>
    <div class="hud-left">
      <button type="button" class="hud-btn store" data-open="store"><span class="hud-ico">${ICONS.basket}</span><span class="hud-label">Store</span><span class="hud-badge sale">-${Math.round(STORE.sale * 100)}%</span></button>
      <button type="button" class="hud-btn pets" data-open="pets"><span class="hud-ico">${ICONS.paw}</span><span class="hud-label">Pets</span></button>
      <button type="button" class="hud-btn index" data-open="index"><span class="hud-ico">${ICONS.book}</span><span class="hud-label">Index</span><span class="hud-badge alert" hidden>!</span></button>
    </div>
    <button type="button" class="hud-free"><span class="rays"></span><img alt=""><span class="free-top">PERMANENT</span><span class="free-word">FREE</span></button>
    <button type="button" class="hud-offer"><span class="rays"></span><span class="offer-price"></span><img alt=""><span class="offer-op">OP</span><span class="offer-time"></span></button>
    <div class="hud-right">
      <button type="button" class="hud-pass cash" data-pass="x2cash"><span class="pass-top">PERMANENT</span><span class="pass-name">x2 Cash</span><span class="pass-price"></span></button>
      <button type="button" class="hud-pass xp" data-pass="x2xp"><span class="pass-top">PERMANENT</span><span class="pass-name">x2 XP</span><span class="pass-price"></span></button>
      <button type="button" class="hud-pass ad" hidden><span class="pass-top">WATCH AD</span><span class="pass-name">x2 Cash</span><span class="pass-price"></span></button>
    </div>
    <button type="button" class="hud-music" aria-label="Music"></button>
    <button type="button" class="hud-sound" aria-label="Sound"></button>
    <div class="hud-bottom-left">
      <div class="hud-potions"></div>
      <div class="hud-str" hidden><span class="str-ico">${ICONS.muscle}</span><span class="str-num">0</span></div>
      <div class="hud-money"><span class="money-ico">${ICONS.cash}</span><span class="money-num">$0</span></div>
      <div class="hud-rate"></div>
    </div>
    <div class="hud-bag"></div>
    <div class="hud-train" hidden><div class="train-top"><span class="train-str"></span><span class="train-lv"></span></div><div class="train-bar"><i></i><span class="train-xp"></span></div></div>
    <button type="button" class="hud-cancel" hidden>Cancel</button>
    <div class="hud-boost"><span class="boost-title"></span><span class="boost-next"><span class="boost-ico">${ICONS.warn}</span><span class="boost-time"></span></span></div>
    <div class="hud-toast"></div>
    <div class="hud-banner"><span class="banner-rarity"></span><span class="banner-name"></span><span class="banner-new">NEW!</span></div>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)

  for (const b of root.querySelectorAll('[data-open]')) b.addEventListener('click', () => open[b.dataset.open]())
  for (const b of root.querySelectorAll('[data-pass]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.pass
      if (game.S.passes[id]) return
      if (game.buyPass(id)) burst(...centre(b), 'stars')
      else replay(b, 'shake')
    })
  }
  // Rewarded ad (Boxity only, while it can serve one): 2x Cash for AD_REWARD.minutes. The game server
  // checks the ad's token before it is granted; with no server to ask, Boxity's 'completed' is it.
  const adCard = $('.hud-pass.ad')
  let adBusy = false
  adCard.addEventListener('click', async () => {
    if (adBusy) return
    adBusy = true
    adCard.classList.add('busy')
    try {
      const r = await showRewarded(AD_REWARD.placement)
      if (r.status !== 'completed') {
        toast(r.status === 'denied' || r.status === 'no-fill' ? 'No ad right now, try again later!' : 'Ad not finished: no reward this time.', false)
        return
      }
      const checked = await requestAdReward(r.rewardToken ?? '')
      if (checked && !checked.ok) return toast('That ad could not be checked. Try again later!', false)
      game.grantPotion(AD_REWARD.potion, checked?.minutes ?? AD_REWARD.minutes)
      toast(`2x Cash for ${AD_REWARD.minutes} minutes!`, true)
      burst(...centre(adCard), 'stars')
    } finally {
      adBusy = false
      adCard.classList.remove('busy')
    }
  })
  $('.hud-cancel').addEventListener('click', () => game.training?.cancel())
  const free = $('.hud-free')
  free.querySelector('img').src = THUMBS.pet.dino ?? ''
  free.addEventListener('click', () => {
    if (game.claimFreePet()) burst(...centre(free), 'big')
  })
  const offer = $('.hud-offer')
  offer.querySelector('img').src = THUMBS.pet.mammoth ?? ''
  offer.addEventListener('click', () => open.offer())
  const sound = $('.hud-sound')
  const paintSound = () => (sound.innerHTML = isMuted() ? ICONS.soundOff : ICONS.soundOn)
  paintSound()
  sound.addEventListener('click', () => {
    toggleMuted()
    paintSound()
  })
  const music = $('.hud-music')
  const paintMusic = () => {
    music.innerHTML = isMusicOn() ? ICONS.musicOn : ICONS.musicOff
    music.setAttribute('aria-pressed', String(isMusicOn()))
    music.title = isMusicOn() ? 'Music: on' : 'Music: off'
  }
  paintMusic()
  music.addEventListener('click', () => {
    toggleMusic()
    paintMusic()
  })

  // Bait bag: one slot per carried bait.
  const bag = $('.hud-bag')
  bag.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.bag-slot')
    if (!slot) return
    e.stopPropagation()
    game.selectBait(Number(slot.dataset.i))
  })
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target instanceof HTMLInputElement) return
    const n = Number(e.key)
    if (n >= 1 && n <= BAITS.carryMax) game.selectBait(n - 1)
  })

  // --- Reserved corner (Boxity toolbar + chat) ----------------------------------------------
  function setReserved(areas) {
    let bottom = 0
    for (const a of areas) if (a.left < 200) bottom = Math.max(bottom, a.top + a.height)
    root.style.setProperty('--reserved', `${Math.round(bottom)}px`)
    // Short landscape screens lay the side buttons out in a row beside the toolbar.
    const bar = areas.find((a) => a.id === 'toolbar')
    root.style.setProperty('--toolbar-right', `${Math.round(bar ? bar.left + bar.width : 0)}px`)
    // How far down Boxity reaches along the right edge (its toolbar spans narrow phones): the
    // touch day/respawn row (touch.css) and the right rail start below it.
    let topRight = 0
    for (const a of areas) if (a.left + a.width > window.innerWidth - 100) topRight = Math.max(topRight, a.top + a.height)
    document.documentElement.style.setProperty('--bx-tr', `${Math.round(topRight)}px`)
  }

  // --- Toasts + banner ---------------------------------------------------------------------
  const toastEl = $('.hud-toast')
  let toastTimer = 0
  function toast(text, good = true) {
    toastEl.textContent = text
    toastEl.classList.toggle('good', good)
    toastEl.classList.toggle('bad', !good)
    replay(toastEl, 'show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200)
  }
  const bannerEl = $('.hud-banner')
  let bannerTimer = 0
  function banner(data, rarity, first) {
    const def = game.animalDef(data.species)
    bannerEl.querySelector('.banner-rarity').textContent = data.shiny ? `Shiny ${rarity.name}` : rarity.name
    bannerEl.querySelector('.banner-rarity').style.color = data.shiny ? '#ffe14a' : rarity.color
    bannerEl.querySelector('.banner-name').textContent = `${data.shiny ? 'Shiny ' : ''}${def.name}!`
    bannerEl.querySelector('.banner-new').hidden = !first
    bannerEl.style.setProperty('--glow', data.shiny ? '#ffd23a' : rarity.color)
    replay(bannerEl, 'show')
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 2600)
    if (RARITY_BIG(rarity) || data.shiny) burst(window.innerWidth / 2, window.innerHeight * 0.2, 'big')
  }
  const RARITY_BIG = (r) => ['epic', 'legendary', 'mythic'].includes(r.id)

  // --- Money ----------------------------------------------------------------------------------
  const moneyEl = $('.hud-money')
  const moneyNum = $('.money-num')
  let shown = game.money
  function gain(amount) {
    if (amount < 0) replay(moneyEl, 'spend')
    else if (amount > 0 && !moneyEl.classList.contains('gain')) replay(moneyEl, 'gain')
  }

  // --- Per frame ------------------------------------------------------------------------------
  const cache = {}
  const set = (key, el, value, prop = 'textContent') => {
    if (cache[key] === value) return
    cache[key] = value
    el[prop] = value
  }
  const potionsEl = $('.hud-potions')
  const strEl = $('.hud-str')
  const trainEl = $('.hud-train')
  const cancelEl = $('.hud-cancel')
  const trainFill = $('.train-bar i')
  let strShown = game.S.gym.strength
  let lastStr = game.S.gym.strength
  const passEls = { x2cash: $('.hud-pass.cash'), x2xp: $('.hud-pass.xp') }
  let slow = 0

  // --- Layout: desktop/tablet ('wide') or the phone zones ('port' / 'land') ------------------
  const lcol = $('.hud-lcol')
  const leftEl = $('.hud-left')
  const infoEl = $('.hud-bottom-left')
  const rightEl = $('.hud-right')
  const boostEl = $('.hud-boost')
  let layout = ''
  function arrange() {
    const w = window.innerWidth
    const h = window.innerHeight
    // Touch tablets in landscape get the phone zones too (joystick + jump cluster own the
    // bottom corners there); a mouse on a big screen keeps the full-size layout.
    const touch = document.body.classList.contains('touch-ui')
    const next = h > w ? 'port' : h <= 500 || touch ? 'land' : 'wide'
    if (next === layout) return
    layout = next
    root.classList.toggle('compact', next !== 'wide')
    root.classList.toggle('port', next === 'port')
    root.classList.toggle('land', next === 'land')
    // Moved pieces stay before the toast + banner so those draw on top.
    if (next === 'wide') {
      toastEl.before(leftEl, infoEl, boostEl, offer, free)
      infoEl.prepend(potionsEl)
      return
    }
    rightEl.prepend(free, offer)
    infoEl.append(boostEl, potionsEl)
    if (next === 'port') lcol.append(infoEl, leftEl)
    else toastEl.before(leftEl, infoEl)
  }
  arrange()
  window.addEventListener('resize', arrange)

  return {
    root,
    toast,
    banner,
    gain,
    setReserved,
    update(dt) {
      const S = game.S
      // Money counts up smoothly toward the real value.
      const target = game.money
      shown += (target - shown) * Math.min(1, dt * 10)
      if (Math.abs(target - shown) < 1) shown = target
      set('money', moneyNum, money(shown))
      // Strength: counts up like money, pops on every gain.
      const gym = S.gym
      strEl.hidden = !gym.owned && gym.strength <= 0
      if (gym.strength !== lastStr) {
        if (gym.strength > lastStr) replay(strEl, 'gain')
        lastStr = gym.strength
      }
      strShown += (gym.strength - strShown) * Math.min(1, dt * 12)
      if (Math.abs(gym.strength - strShown) < 0.01) strShown = gym.strength
      set('str', $('.str-num'), num(strShown))
      // Training: the bar replaces the bait bag; Cancel at the top.
      const training = !!game.training?.active
      trainEl.hidden = cancelEl.hidden = !training
      bag.hidden = training
      if (training) {
        set('train-str', $('.train-str'), `Strength: ${num(gym.strength)}`)
        set('train-lv', $('.train-lv'), `Lv. ${gym.lv}`)
        const need = game.gymXpNeed()
        set('train-xp', $('.train-xp'), `Xp ${gym.xp} / ${need}`)
        set('train-fill', trainFill.style, `${Math.round((gym.xp / need) * 1000) / 10}%`, 'width')
      }
      slow -= dt
      if (slow > 0) return
      slow = 0.2
      arrange() // touch-ui comes and goes with the last pointer type
      set('rate', $('.hud-rate'), `+${money(game.totalIncome())}/s`)
      // Passes.
      for (const [id, el] of Object.entries(passEls)) {
        const owned = S.passes[id]
        // Bought: the card leaves the HUD (the Store still lists it).
        el.hidden = owned
        el.classList.toggle('poor', !owned && game.money < PASSES[id].price)
        set(`pass-${id}`, el.querySelector('.pass-price'), owned ? 'OWNED' : money(PASSES[id].price))
      }
      // The ad card: only where Boxity can serve an ad.
      adCard.hidden = !adsAvailable()
      set('pass-ad', adCard.querySelector('.pass-price'), adBusy ? '...' : `FREE ${AD_REWARD.minutes} MIN`)
      // Offers.
      free.hidden = S.freeClaimed
      const mammoth = PETS.list.find((p) => p.id === 'mammoth')
      offer.hidden = S.pets.owned.includes('mammoth')
      set('offer-time', offer.querySelector('.offer-time'), clock(game.offerLeft()))
      set('offer-price', offer.querySelector('.offer-price'), money(mammoth.price))
      // Index badge.
      $('.hud-btn.index .hud-badge').hidden = S.indexSeen
      // Play boost.
      const boost = game.playBoost()
      set('boost', $('.boost-title'), `Play Boost +${Math.round(boost * 100)}%`)
      const next = game.playNext()
      set('boost-next', $('.boost-time'), boost >= PLAY_BOOST.max ? 'Maxed!' : `In ${minsSecs(next)}`)
      // Potions.
      const chips = Object.entries(STORE.potions)
        .filter(([id]) => game.potionOn(id))
        .map(([id, p]) => `<span class="chip ${id}">${ICONS.flask(id === 'luck' ? '#62e34a' : id === 'cash' ? '#ffd21f' : '#4fb6ff')}<b>x2 ${id === 'xp' ? 'XP' : id[0].toUpperCase() + id.slice(1)}</b><i>${clock((S.potions[id] - Date.now()) / 1000)}</i></span>`)
        .join('')
      set('potions', potionsEl, chips, 'innerHTML')
      // Bait bag.
      const slots = S.baits
        .map((p, i) => `<button type="button" class="bag-slot${i === Math.min(S.selected, S.baits.length - 1) ? ' sel' : ''}" data-i="${i}" title="${baitName(p)}"><span class="bag-key">${i + 1}</span><img src="${THUMBS.bait[kindOf(p)] ?? ''}" alt=""><span class="bag-lv">Lv ${levelOf(p)}</span></button>`)
        .join('')
      const empty = S.baits.length ? '' : '<span class="bag-empty">Claim bait at the machine</span>'
      set('bag', bag, slots + empty, 'innerHTML')
    },
  }
}

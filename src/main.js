import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three'
import * as config from './config.js'
import { BASE, CAMERA, graphicsPreset, PLOTS, RENDER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld, STATUE } from './world.js'
import { buildBase } from './base.js'
import { createHarpoon } from './harpoon.js'
import { buildAnimal } from './animals.js'
import { createEmitter, setParticleDensity, updateParticles } from './particles.js'
import { createFx } from './fx.js'
import { createGame } from './game.js'
import { createTraining } from './training.js'
import { createBaitFlow } from './baitFlow.js'
import { createInteract } from './interact.js'
import { renderThumbs, THUMBS } from './thumbs.js'
import { renderZoneThumbs } from './zones.js'
import { createHud } from './hud.js'
import { createWindows } from './windows.js'
import { initNet, tickPresence } from './net.js'
import { createRemotes } from './remote.js'
import { anyWindowOpen, closeTopWindow, onWindowChange, setWindowReserved } from './uiWindow.js'
import { EmotePlayer, loadEmotes } from './emotes.js'
import { sendFx } from './presence.js'
import { setAdMuted } from './audio/index.js'
import { audioCore, installAudio, updateAudio } from './audio/index.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { box, mat } from './voxel.js'
import { solidBox } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> hub + base + harpoon,
// lighting, player body -> thumbnails -> game state + HUD + windows + prompts ->
// avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let game = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    setParticleDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
// Esc closes an open window first, then opens the portal menu.
installInput(() => closeTopWindow() || bloxity.showMenu(), renderer.domElement)
installAudio()

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + world ---------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

bloxity.loadingStep('Building the hub')
lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // the hub: field, lane, cliffs, canyon, scenery, clouds
const base = buildBase(scene)
const harpoon = createHarpoon(scene, BASE.harpoon)
// The four other plots along the path: the same base (minus the upgrade signs, sell stall and
// buy boards) and harpoon. Empty until another player in the room holds one (remote.js).
const otherPlots = PLOTS.xs
  .filter((x) => x !== PLOTS.own)
  .map((x) => ({ x, base: buildBase(scene, { x, vacant: true, boards: false }), harpoon: createHarpoon(scene, { ...BASE.harpoon, x: BASE.harpoon.x + x }) }))
const fx = createFx(scene)

// A giant voxel dragon on a stone plinth in the park: the hub's landmark.
{
  const plinth = mat.studs('#9aa0ab')
  box(scene, 9, 1.6, 9, STATUE.x, 0.8, STATUE.z, plinth)
  box(scene, 7.4, 0.6, 7.4, STATUE.x, 1.9, STATUE.z, mat.studs('#b9bfca'))
  solidBox(4.5, 1.1, 4.5, STATUE.x, 1.1, STATUE.z)
  const statue = buildAnimal('dragon', { shiny: true })
  statue.root.scale.setScalar((STATUE.scale * 3.9) / statue.height) // as tall as the 3.9 m model at STATUE.scale, whatever the species size
  statue.root.position.set(STATUE.x, 2.2, STATUE.z)
  statue.root.rotation.y = 0.9
  statue.animate(0, 0, 1.2, 'idle')
  scene.add(statue.root)
  solidBox(2.6, 6, 4.2, STATUE.x, 6, STATUE.z, 0.9)
  createEmitter(scene, { boxes: [{ x: STATUE.x, y: 6, z: STATUE.z, sx: 6, sy: 5, sz: 6 }], count: 40, life: 3, velocity: [0, 0.6, 0], spread: [0.3, 0.3, 0.3], size: 0.35, color: '#ffe680', intensity: 2, twinkle: 6, sprite: 'sparkle', seed: 12 })
}
// Drifting pollen over the field and fireflies in the canyon.
createEmitter(scene, { boxes: PLOTS.xs.map((x) => ({ x, y: 3, z: 0, sx: 39, sy: 2.5, sz: 45 })), count: 260 * PLOTS.xs.length, life: 9, velocity: [0.35, 0.12, -0.2], spread: [0.3, 0.15, 0.3], size: 0.12, color: '#fffbe0', intensity: 1.4, twinkle: 3, seed: 21 })
createEmitter(scene, { boxes: PLOTS.xs.map((x) => ({ x, y: 2.5, z: -80, sx: 9, sy: 2, sz: 30 })), count: 70 * PLOTS.xs.length, life: 5, velocity: [0, 0.2, 0], spread: [0.5, 0.3, 0.5], size: 0.22, color: '#d8ff7a', intensity: 2.4, twinkle: 5, sprite: 'sparkle', seed: 33 })
setParticleDensity(preset.particles)

createPlayerBody()
syncYawToPlayer()

// --- Game, HUD, windows, prompts ------------------------------------------------
bloxity.loadingStep('Painting portraits')
renderThumbs()
THUMBS.zone = renderZoneThumbs(renderer, scene, world.zones.zones) // zone pictures for the Pet Index
game = createGame({ scene, base, harpoon, fx, camera })
game.records = world.records
const windows = createWindows(game)
const hud = createHud(game, windows.open)
Object.assign(game.ui, {
  toast: hud.toast,
  banner: hud.banner,
  gain: hud.gain,
  openSell: windows.open.sell,
})
// Saves: this browser, or the game server for signed-in players (net.js).
initNet(game)
// The training ring: lifting sessions (pose, weights in hand, reps -> strength).
const training = createTraining({ scene, game, base, fx, camera })
game.training = training
game.ui.train = () => training.start()
// The harpoon shot: aim meter, flight, luck bush, hooked + reel minigame (baitFlow.js).
const baitFlow = createBaitFlow({ scene, harpoon, game, fx, zones: world.zones })
// The other players in the room: their Bloxity characters, pets and plots.
const remotes = createRemotes({ scene, fx, plots: otherPlots })

// --- Boxity platform features (bloxity.js opts in right after init) --------------------------------
// Emotes picked in Boxity's wheel play on the player's character (and on everyone else's screen).
loadEmotes()
let localEmote = null
async function playLocalEmote(id) {
  if (!id) {
    if (localEmote?.active) {
      localEmote.stop()
      sendFx('emoteStop')
    }
    return
  }
  await loadEmotes()
  if (localEmote?.play(id)) sendFx('emote', { id })
}
bloxity.onEmote(playLocalEmote)
// Boxity chat: each message as a bubble over its sender's head (Boxity draws the chat itself).
bloxity.onChat((m) => {
  if (m?.isLocalPlayer) remotes.bubbleLocal(playerGroup, m)
  else remotes.bubble(m)
})
// Ad breaks: the game pauses and goes silent until the ad is over.
let adBreak = false
bloxity.onAdBreak((on) => {
  adBreak = on
  setAdMuted(on)
})
// Screen ads: banners around the full-screen panels; none while playing.
onWindowChange((open) => bloxity.adScreen(open ? 'panel' : 'gameplay'))
const presenceMe = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, vy: 0, grounded: true }
const baseSnapshot = () => game.baseSnapshot()
const hookState = () => baitFlow.hookState()
const interact = createInteract({ targets: () => game.targets(), getMoney: () => game.money })
bloxity.onReservedAreas((areas) => {
  hud.setReserved(areas)
  setWindowReserved(areas)
})

// Clicking the bait machine (or its big red button) with the mouse pumps it too.
{
  const ray = new Raycaster()
  const ndc = new Vector2()
  const down = { x: 0, y: 0, t: 0 }
  const targets = [base.buttons.pump.top, base.machine.group]
  renderer.domElement.addEventListener('pointerdown', (e) => {
    down.x = e.clientX
    down.y = e.clientY
    down.t = performance.now()
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(targets, true)[0]
    if (hit && hit.distance < 45) game.pump()
  })
}

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  localEmote = new EmotePlayer(avatar) // before the animator moves a bone: it reads the bind pose
  animator = makeAnimator(avatar)
  game?.setAvatar(avatar)
  training?.setAvatar(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  base.names.setName(bloxity.displayName() === 'Offline' ? 'Your' : bloxity.displayName(), bloxity.getPfp())
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
const audioState = { camera, player: { x: 0, y: 0, z: 0, vy: 0, grounded: true, speed: 0 }, windowOpen: false, night: false }

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  if (adBreak) return // a Boxity ad is playing over the game: everything waits
  const elapsed = clock.elapsedTime

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  training.update(dt)
  animator?.update(dt, {
    grounded: player.grounded,
    speed,
    verticalVelocity: player.velocity.y,
    turn: 0,
    custom: training.pose,
  })
  // An emote plays over the walk pose and stops as soon as the player moves (or trains / baits).
  if (localEmote?.playing && (speed > 0.6 || !player.grounded || training.active || baitFlow.active)) {
    localEmote.stop()
    sendFx('emoteStop')
  }
  localEmote?.update(dt)
  training.place(playerGroup)
  baitFlow.seat(playerGroup) // on the harpoon while baiting

  updateCamera(camera, dt)
  base.update(dt, elapsed)
  harpoon.update(dt, elapsed)
  for (const o of otherPlots) {
    o.base.update(dt, elapsed)
    o.harpoon.update(dt, elapsed)
  }
  game.update(dt, elapsed)
  baitFlow.update(dt, elapsed)
  remotes.update(dt, elapsed)
  const shown = playerGroup.position // where the avatar is drawn (on the harpoon's deck while baiting)
  Object.assign(presenceMe, { x: shown.x, y: shown.y, z: shown.z, yaw: playerGroup.rotation.y, speed, vy: player.velocity.y, grounded: player.grounded })
  tickPresence(elapsed, presenceMe, baseSnapshot, hookState)
  baitFlow.applyCamera(camera, dt) // blends from the chase cam to the shot's views
  world.update(dt, elapsed, camera) // Lane zone culling + fog (after the camera is final)
  interact.update(dt, camera, training.active || baitFlow.active ? null : p)
  hud.update(dt)
  fx.update(dt, camera, renderer.domElement.height)
  updateParticles(elapsed, renderer.domElement.height)
  lighting.update(dt, playerGroup.position)

  const a = audioState.player
  a.x = p.x
  a.y = p.y
  a.z = p.z
  a.vy = player.velocity.y
  a.grounded = player.grounded
  a.speed = speed
  audioState.windowOpen = anyWindowOpen()
  audioState.night = lighting.isNight()
  updateAudio(dt, audioState)

  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
      bloxity.adScreen('gameplay')
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { audio: audioCore, config, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, base, game, harpoon, fx, hud, windows, training, baitFlow, remotes, otherPlots, emote: playLocalEmote }
}

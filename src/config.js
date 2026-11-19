// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'bait-an-animal' // slug registered on bloxity.io
export const GAME_TITLE = 'Bait an Animal'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up; north = -Z) ---------------------
export const GROUND_Y = 0

// The hub: a flat studded field boxed in by terracotta cliffs. The yellow lane runs
// north-south through the middle and leaves through a canyon in the north wall
// into the Lane (the wild area the harpoon fires into; blocked out, not detailed yet).
export const HUB = {
  minX: -214, // wide enough for the five plots (PLOTS) plus the park at either end
  maxX: 214,
  minZ: -48, // north wall (the canyon cuts through it)
  maxZ: 48, // south wall
  wallHeight: 13, // first cliff tier
  wallHeight2: 22, // the taller tier set back behind it
  wallDepth: 9,
  stud: 0.42, // m per stud on every studded surface
  checker: 4, // studs per checker square on the grass and the lane
  colors: {
    grass: '#5ccf38',
    lane: '#ffcf1f',
    wall: '#e47b52',
    wallTop: '#6fd447',
    leaves: '#69c93a',
    leavesLight: '#9ee05a',
    trunk: '#d9773f',
    rock: '#a99cf0',
    log: '#e0743c',
    bush: '#3fb35a',
  },
  trees: 250, // scattered voxel trees (between the plots + edges)
  rocks: 160,
  flowers: 330,
}

// The yellow path runs east-west along the north side of the hub, in front of the
// north cliffs. North of the player's base a canyon cuts through the wall: the Lane,
// the wild area the harpoon fires into (blocked out, not detailed yet).
export const PATH = { z: -40, halfWidth: 5 }
// Five identical plots side by side along the path, each a base with its own harpoon,
// canyon and Lane. The player's is the middle one (x = 0): every BASE / LANE position
// below is for that plot; the other four are copies shifted by `xs` (decor for now).
// `spacing` = 2 * (wildHalf + 9): the Lanes' side cliffs meet exactly.
export const PLOTS = { spacing: 78, xs: [-156, -78, 0, 78, 156], own: 0 }
export const LANE = {
  canyonHalf: 10, // half-width of the gap in the north wall (centred on the base, x = 0)
  canyonEnd: -96, // z where the canyon opens into the first zone's wild area
  wildHalf: 30, // half-width of every zone
  firstZone: 126, // m from the harpoon where the Meadow ends (the canyon is part of it)
  zoneLength: 70, // m of every zone after the Meadow
  canyonWall: '#3d8de8', // the blue panels lining the canyon
  corridor: 9, // half-width kept clear of big props (the catch is reeled along it)
  viewDistance: 260, // zone scenery further than this from the camera is hidden (fog covers the cut)
  decorView: 200, // the same for the other four plots' Lanes (measured in x and z)
}

// The ten zones of the Lane, south to north. Each has its own ground, walls, props,
// particles and animals; the spear lands in a zone by distance (harpoon strength).
// mult: income multiplier of the zone's animals (x4 per zone; the rarer pools of the far
// zones add the rest, so a new zone pays roughly 6-10x the last one).
export const ZONES = [
  { id: 'meadow', name: 'Meadow', icon: '🌻', ground: '#47c46a', ground2: '#5fd47c', wall: '#e0774a', accent: '#ffe14a', mult: 1 },
  { id: 'coral', name: 'Coral', icon: '🐚', ground: '#f3dca0', ground2: '#ffe9b8', wall: '#36b6d8', accent: '#ff7fb3', mult: 4 },
  { id: 'snow', name: 'Snow', icon: '⛄', ground: '#eef6ff', ground2: '#ffffff', wall: '#9fd2ff', accent: '#bfe8ff', mult: 16 },
  { id: 'desert', name: 'Desert', icon: '🌵', ground: '#f2c76b', ground2: '#ffd889', wall: '#d98a3d', accent: '#5fbf3a', mult: 64 },
  { id: 'crystal', name: 'Crystal', icon: '💎', ground: '#9aa3b8', ground2: '#b4bccc', wall: '#7a5cc9', accent: '#c48bff', mult: 256 },
  { id: 'jungle', name: 'Jungle', icon: '🌴', ground: '#2f9e3e', ground2: '#3fb850', wall: '#3c7a2a', accent: '#ffd23a', mult: 1024 },
  { id: 'golden', name: 'Golden', icon: '👑', ground: '#ffe9a6', ground2: '#fff4cf', wall: '#f2b630', accent: '#fff07a', mult: 4096 },
  { id: 'ancient', name: 'Ancient', icon: '🦴', ground: '#5e8f4a', ground2: '#6fa058', wall: '#7d7466', accent: '#ff9f2e', mult: 16384 },
  { id: 'hell', name: 'Hell', icon: '😈', ground: '#b8423c', ground2: '#cf5148', wall: '#4a1414', accent: '#ff7a1f', mult: 65536 },
  { id: 'angelic', name: 'Angelic', icon: '👼', ground: '#ffffff', ground2: '#eef6ff', wall: '#bfe4ff', accent: '#ffe680', mult: 262144 },
]
// Zone index for a distance (m) from the harpoon, and the distance where zone i starts.
export const zoneStart = (i) => (i <= 0 ? 0 : LANE.firstZone + (i - 1) * LANE.zoneLength)
export const zoneAt = (d) => Math.max(0, Math.min(ZONES.length - 1, d < LANE.firstZone ? 0 : 1 + Math.floor((d - LANE.firstZone) / LANE.zoneLength)))
export const laneLength = () => zoneStart(ZONES.length)

// Player spawn: in the open field at the south end, looking north at the base.
export const SPAWN = { x: 0, y: 0.05, z: 15 }
export const SPAWN_FACING = Math.PI // yaw the character faces (PI = north, PI/2 = east)

// --- The player's base ----------------------------------------------------------------
// Seen from the south: the pen in front; north of its gate an aisle runs to the yellow
// path between two machine pads: the manual bait machine on the east pad (tanks along
// its east edge, buttons facing the aisle) and the Auto Machine on the west pad (empty
// with a hologram until bought). Then the path with the harpoon, then the canyon.
// Only one base for now. Positions in metres; yaw = where a prop's front faces.
const QUARTER = Math.PI / 2
export const BASE = {
  // gate on the north side. The Expand Pen upgrade (UPGRADES.pen) moves the south fence
  // `grow` m further south per level (penSouth); the big animals (dinosaurs...) need the room.
  pen: { x: 0, z: -4, half: 11, gate: { x: 0, half: 2.4 }, fenceHeight: 1.6, grow: 5 },
  pad: { x: 10.5, z: -25, w: 10, d: 12, h: 0.3 }, // manual machine pad (grey platform)
  autoPad: { x: -10.5, z: -25, w: 10, d: 12, h: 0.3 },
  machine: { x: 13, z: -25, yaw: -QUARTER }, // main bait tank, front facing the aisle (west)
  tanks: { auto: { x: 13.3, z: -29.1 }, xp: { x: 13.3, z: -20.9 } },
  buttons: { pump: { x: 7.3, z: -25, r: 1.15 }, auto: { x: 8, z: -29.1, r: 0.9 }, xp: { x: 8, z: -20.9, r: 0.9 } },
  // The Auto Machine: three self-filling tanks along the west edge, a pipe manifold
  // behind them, a generator at the north end and a control console facing the aisle.
  autoMachine: {
    yaw: QUARTER,
    size: 0.82,
    tanks: [
      { x: -12.4, z: -29.2 },
      { x: -12.4, z: -25 },
      { x: -12.4, z: -20.8 },
    ],
    console: { x: -7.4, z: -25 },
    forSale: { x: -9.8, z: -25, yaw: QUARTER }, // the buy board standing on the empty pad, facing the aisle
  },
  signs: {
    mult: { x: 8.6, z: -33.4, yaw: 0 }, // north end of the manual pad, facing south
    xp: { x: 13.2, z: -33.4, yaw: 0 },
    auto: { x: -8.6, z: -33.4, yaw: 0 }, // north end of the Auto Machine pad
    slot: { x: -13.2, z: -33.4, yaw: 0 },
  },
  sell: { x: 21, z: -31.4, yaw: Math.PI }, // stall on the path edge, facing the path
  nameSign: { x: -21, z: -31.4, yaw: Math.PI },
  harpoon: { x: 0, z: -40, yaw: Math.PI }, // on the path, aimed up the canyon
  offline: { x: 0, z: -19.5 }, // where the Offline Cash pile appears (the aisle)
  // The training ring, west of the Auto Machine pad (near its +1 Slot sign): a glowing
  // ring with the weights lying in it, and the blue upgrade pad south of it. facing =
  // the yaw the player trains facing (PI/2 = east, toward the aisle).
  gym: { x: -21, z: -26.2, r: 2.5, facing: QUARTER, pad: { x: -21, z: -20.4, r: 1.35 } },
}
// The pen's south fence (z) at an Expand Pen level; the spawn stays PEN_SPAWN_GAP m south of it.
export const penSouth = (level = 0) => BASE.pen.z + BASE.pen.half + BASE.pen.grow * level
export const PEN_SPAWN_GAP = 8

// Offline earnings: animals keep earning at `rate` of their normal income while you are
// away (from `minSeconds`, up to `maxHours`); the cash waits in a pile at the base.
export const OFFLINE = { rate: 0.5, minSeconds: 60, maxHours: 8 }

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 110, far: 380 } // view distance: Lane zones past LANE.viewDistance are culled inside the fog
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#2f8cf5',
    horizon: '#bfeaff',
    sunColor: '#fff3dc',
    sunIntensity: 2.5,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: 30, // degrees, 0 = from +Z
    hemiSky: '#e2f3ff',
    hemiGround: '#7fc25a',
    hemiIntensity: 0.95,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 1.0,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a2a1a',
    hemiIntensity: 0.4,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 46, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: tank liquids, sparkles, rarity beams. Sunlit grass stays under it.
export const BLOOM = { strength: 0.55, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.36, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 14, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 34,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
  // true: a click on the world grabs the cursor for mouse look and Esc gives it back (the
  // portal's "Click to control Camera / Esc to release" hint). false: the cursor stays free
  // (HUD + world clicks); left- or right-drag orbits.
  pointerLock: true,
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

// ==================================================================================
// Game rules
// ==================================================================================
// Currency: money ($) only. Nothing in the game costs a premium currency: every
// item that would be a paid pass elsewhere is priced in money here (project rule).

export const SAVE = { every: 4 } // autosave interval s (saves go to the game server only, never localStorage)

// Game server (net.js -> ../Bait-an-animal-backend, room "world"). VITE_SERVER_URL (e.g.
// ws://localhost:2567) overrides the Bloxity matchmaker; with neither, progress stays in this browser.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
// saveEvery: s between server saves while playing (also on tab hide / close). retry: first
// reconnect delay, doubling up to retryMax.
// Boxity leaderboards (bloxity.js declares them so the trophy button shows; the game server reports
// the scores from the saves it accepted: backend src/leaderboards.ts, same ids). The first
// declaration creates a board; later changes are made in the Boxity dashboard, not here.
export const LEADERBOARDS = [
  { id: 'earned', label: 'Money Earned', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
  { id: 'catches', label: 'Animals Caught', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
  { id: 'strength', label: 'Strength', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'index', label: 'Pet Index', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]
// Rewarded ad (HUD "Watch ad" button, only while Boxity can serve one): 2x Cash for `minutes`.
// The server checks the ad's token before it is granted (backend WorldRoom adReward).
export const AD_REWARD = { placement: 'cash-boost', potion: 'cash', minutes: 10 }

// moveEvery / baseEvery: s between presence updates (character / base display, net.js).
export const NET = { saveEvery: 10, retry: 3, retryMax: 60, moveEvery: 0.1, baseEvery: 0.25 }
export const START_MONEY = 0

// Bait: the machine grows one bait kind at a time; every kind has `levelsPerKind`
// levels, then the next kind starts. Overall level index p = kind * levelsPerKind + (lv - 1).
// The last kind's last level (Rainbow Slug Lv 5, p = maxLevel) is the top: the machine stops there.
export const BAITS = {
  levelsPerKind: 5,
  kinds: [
    { id: 'worm', name: 'Worm', color: '#ff8fb0', accent: '#ff5f8e' },
    { id: 'cricket', name: 'Cricket', color: '#7bd34a', accent: '#3e9a25' },
    { id: 'beetle', name: 'Beetle', color: '#3a6cff', accent: '#9cf2ff' },
    { id: 'firefly', name: 'Firefly', color: '#ffe14a', accent: '#fff8b8' },
    { id: 'grub', name: 'Golden Grub', color: '#ffb81f', accent: '#fff1a0' },
    { id: 'snail', name: 'Star Snail', color: '#b77bff', accent: '#ffe6ff' },
    { id: 'slug', name: 'Rainbow Slug', color: '#ff5fd2', accent: '#7ff6ff' },
  ],
  xpBase: 40, // XP for Worm Lv 1 -> Lv 2
  xpGrowth: 1.5, // each level needs this much more
  carryMax: 6, // baits the player can hold at once
  regrow: 3.2, // s for a new bait to grow after one is claimed
  sellBase: 12, // $ for a Worm Lv 1 at the sell stall; x sellGrowth per level
  sellGrowth: 1.35,
}
BAITS.maxLevel = BAITS.kinds.length * BAITS.levelsPerKind - 1

// Pumping the machine (the big red button) and its upgrades.
export const MACHINE = {
  xpPerPump: 1, // base XP per pump
  autoXpPerSecond: 1.2, // each Auto Machine tank, before Auto Speed / x2 XP / potions
  autoStagger: 0.25, // the three tanks start this far apart (fraction of a level) so they don't sync
  autoClickRate: 3, // pumps / s once Auto Click is owned
  holdRepeat: 0.13, // s between pumps while E / the prompt is held
}

// Rarities: weight at bait power 0, `k` = how fast the weight grows with bait power
// (weight * e^(k * p)); luck multiplies every rarity above Common. floor: the share of the
// catches a tier keeps however good the bait and luck get (so every animal stays findable).
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#d7dde6', dark: '#59626f', tile: ['#c7cdd6', '#7c848f'], weight: 62, k: -0.03, base: 6, floor: 0.06 },
  { id: 'uncommon', name: 'Uncommon', color: '#62e34a', dark: '#1f7a18', tile: ['#7ef06a', '#2fae3a'], weight: 28, k: 0.06, base: 20, floor: 0.04 },
  { id: 'rare', name: 'Rare', color: '#3eb0ff', dark: '#0b4f9a', tile: ['#3f8dff', '#1546c9'], weight: 8, k: 0.12, base: 70, floor: 0.03 },
  { id: 'epic', name: 'Epic', color: '#e46bff', dark: '#5a1a9e', tile: ['#f47dff', '#a52ad8'], weight: 1.6, k: 0.17, base: 220 },
  { id: 'legendary', name: 'Legendary', color: '#ffbf24', dark: '#8a5300', tile: ['#ffe14a', '#ff9f1a'], weight: 0.35, k: 0.21, base: 800 },
  { id: 'mythic', name: 'Mythic', color: '#ff4f5b', dark: '#8f0b1d', tile: ['#ff5a5a', '#c91f2a'], weight: 0.05, k: 0.25, base: 3200 },
  { id: 'celestial', name: 'Celestial', color: '#7fe0ff', dark: '#0b5a8f', tile: ['#9fe9ff', '#2f8de0'], weight: 0.008, k: 0.28, base: 16000 },
  { id: 'secret', name: 'Secret', color: '#ffffff', dark: '#202024', tile: ['#ffffff', '#3a3a40'], weight: 0.0012, k: 0.3, base: 90000 },
]

// The animals, by zone. base: the voxel model in animals.js; look: recolour + extras on it.
// income = rarity base * f * zone mult ($ per second in the pen).
// look: { tint: [hex, k], gold, glow: hex (emissive accents), extras: [horn, horns, halo,
//   wings, batwings, flames, crystals, hump, sail, plates, spikes, crown, stripes, mane, longnose, fin] }
const A = (id, name, zone, rarity, base, f = 1, look = {}) => ({ id, name, zone, rarity, base, f, look })
const ROSTER = [
  A('bunny', 'Bunny', 'meadow', 'common', 'bunny', 0.8),
  A('duck', 'Duck', 'meadow', 'common', 'duck', 1.3),
  A('chicken', 'Chicken', 'meadow', 'uncommon', 'chicken', 0.95),
  A('pig', 'Pig', 'meadow', 'uncommon', 'pig', 1.4),
  A('sheep', 'Sheep', 'meadow', 'rare', 'sheep'),
  A('cow', 'Cow', 'meadow', 'epic', 'cow'),
  A('pony', 'Meadow Pony', 'meadow', 'legendary', 'horse', 1, { tint: ['#c98a4a', 0.2], extras: ['mane'] }),
  A('crab', 'Crab', 'coral', 'common', 'crab'),
  A('turtle', 'Sea Turtle', 'coral', 'uncommon', 'turtle'),
  A('axolotl', 'Axolotl', 'coral', 'uncommon', 'frog', 1.3, { tint: ['#ff9fd0', 0.75], extras: ['fin'] }),
  A('puffer', 'Pufferfish', 'coral', 'rare', 'fish', 0.9, { tint: ['#ffd23a', 0.6], extras: ['spikes'] }),
  A('jelly', 'Jellyfish', 'coral', 'rare', 'jelly', 1.2, { glow: '#ff8fe0' }),
  A('swordfish', 'Swordfish', 'coral', 'epic', 'fish', 1, { tint: ['#7f9cff', 0.5], extras: ['longnose', 'fin'] }),
  A('shark', 'Shark', 'coral', 'legendary', 'fish', 1, { tint: ['#8a96a8', 0.65], extras: ['fin'] }),
  A('hare', 'Snow Hare', 'snow', 'common', 'bunny', 1, { tint: ['#e8f4ff', 0.6] }),
  A('penguin', 'Penguin', 'snow', 'uncommon', 'penguin'),
  A('fox', 'Arctic Fox', 'snow', 'rare', 'fox', 0.9, { tint: ['#f4fbff', 0.8] }),
  A('wolf', 'Snow Wolf', 'snow', 'rare', 'cat', 1.2, { tint: ['#c8d6e8', 0.7], extras: ['mane'] }),
  A('bear', 'Polar Bear', 'snow', 'epic', 'bear', 1, { tint: ['#f6f9ff', 0.85] }),
  A('orca', 'Orca', 'snow', 'epic', 'fish', 1.3, { tint: ['#1d2230', 0.8], extras: ['fin'] }),
  A('mammoth', 'Mammoth', 'snow', 'legendary', 'mammoth'),
  A('lizard', 'Desert Lizard', 'desert', 'uncommon', 'frog', 0.9, { tint: ['#7fc04a', 0.5], extras: ['spikes'] }),
  A('tortoise', 'Tortoise', 'desert', 'uncommon', 'turtle', 1.3, { tint: ['#c99a4a', 0.5] }),
  A('camel', 'Camel', 'desert', 'rare', 'horse', 0.9, { tint: ['#d9a55a', 0.7], extras: ['hump'] }),
  A('ostrich', 'Ostrich', 'desert', 'rare', 'bird', 1.2, { tint: ['#3a2f2a', 0.6] }),
  A('cobra', 'Cobra', 'desert', 'epic', 'snake', 0.9, { tint: ['#c9a23a', 0.5] }),
  A('kangaroo', 'Kangaroo', 'desert', 'epic', 'bunny', 1.2, { tint: ['#c98048', 0.75] }),
  A('scorpion', 'Scorpion King', 'desert', 'legendary', 'crab', 1, { tint: ['#2a2230', 0.7], extras: ['crown'] }),
  A('mole', 'Crystal Mole', 'crystal', 'uncommon', 'pig', 1, { tint: ['#7a6a9a', 0.7], extras: ['crystals'] }),
  A('gemhound', 'Gem Hound', 'crystal', 'rare', 'cat', 1, { tint: ['#5f8dff', 0.6], extras: ['crystals'] }),
  A('cavebat', 'Crystal Bat', 'crystal', 'rare', 'bird', 1.2, { tint: ['#4a3a7a', 0.7], extras: ['batwings'] }),
  A('prismcat', 'Prism Cat', 'crystal', 'epic', 'cat', 1, { tint: ['#e09bff', 0.6], glow: '#e7a8ff' }),
  A('geodrake', 'Geode Drake', 'crystal', 'epic', 'raptor', 1.3, { tint: ['#9d6bff', 0.6], extras: ['crystals'] }),
  A('crystalcorn', 'Crystal Unicorn', 'crystal', 'legendary', 'horse', 1, { tint: ['#e8d8ff', 0.7], glow: '#c9a8ff', extras: ['horn', 'mane'] }),
  A('toucan', 'Toucan', 'jungle', 'uncommon', 'bird', 1, { tint: ['#1d1d26', 0.5], extras: ['longnose'] }),
  A('giraffe', 'Giraffe', 'jungle', 'rare', 'longneck'),
  A('gorilla', 'Gorilla', 'jungle', 'rare', 'ape', 1.2, { tint: ['#2a2a30', 0.6] }),
  A('elephant', 'Elephant', 'jungle', 'epic', 'mammoth', 0.9, { tint: ['#9aa0ab', 0.85] }),
  A('croc', 'Crocodile', 'jungle', 'epic', 'raptor', 1.2, { tint: ['#4a7a2a', 0.7], extras: ['plates'] }),
  A('tiger', 'Tiger', 'jungle', 'legendary', 'cat', 1, { tint: ['#ff8a1f', 0.7], extras: ['stripes'] }),
  A('kong', 'Jungle Kong', 'jungle', 'mythic', 'ape', 1, { tint: ['#7a2a1a', 0.6], extras: ['crown'] }),
  A('goldchick', 'Gold Chick', 'golden', 'rare', 'chicken', 1, { gold: true }),
  A('goldbunny', 'Gold Bunny', 'golden', 'rare', 'bunny', 1.2, { gold: true }),
  A('goldpig', 'Gold Pig', 'golden', 'epic', 'pig', 1, { gold: true, extras: ['crown'] }),
  A('goldeagle', 'Gold Eagle', 'golden', 'epic', 'bird', 1.2, { gold: true }),
  A('goldowl', 'Gold Owl', 'golden', 'legendary', 'bird', 1, { gold: true, glow: '#fff1a0', extras: ['crown'] }),
  A('goldstallion', 'Gold Stallion', 'golden', 'mythic', 'horse', 1, { gold: true, glow: '#ffe680', extras: ['mane', 'horn'] }),
  A('raptor', 'Raptor', 'ancient', 'rare', 'raptor'),
  A('ankylo', 'Ankylosaur', 'ancient', 'rare', 'turtle', 1.2, { tint: ['#7a8a4a', 0.6], extras: ['spikes'] }),
  A('stego', 'Stegosaurus', 'ancient', 'epic', 'cow', 0.9, { tint: ['#6a9a5a', 0.8], extras: ['plates'] }),
  A('ptero', 'Pterodactyl', 'ancient', 'epic', 'bird', 1.1, { tint: ['#b0684a', 0.7], extras: ['batwings', 'longnose'] }),
  A('brachio', 'Brachiosaurus', 'ancient', 'epic', 'longneck', 1.3, { tint: ['#5a9a6a', 0.85] }),
  A('trex', 'T-Rex', 'ancient', 'legendary', 'raptor', 1, { tint: ['#5a6a3a', 0.6] }),
  A('spino', 'Spinosaurus', 'ancient', 'mythic', 'raptor', 1, { tint: ['#3a5a7a', 0.6], extras: ['sail'] }),
  A('skyrex', 'Sky Rex', 'ancient', 'celestial', 'raptor', 1, { tint: ['#9fe9ff', 0.7], glow: '#bff4ff', extras: ['wings', 'halo'] }),
  A('embercrow', 'Ember Crow', 'hell', 'rare', 'bird', 1, { tint: ['#1a1418', 0.8], glow: '#ff6a1f', extras: ['flames'] }),
  A('hellbat', 'Hell Bat', 'hell', 'epic', 'bird', 1, { tint: ['#5a0f1a', 0.8], extras: ['batwings', 'horns'] }),
  A('hellhound', 'Hellhound', 'hell', 'mythic', 'cat', 1, { tint: ['#1a1014', 0.85], glow: '#ff5a1f', extras: ['flames', 'horns'] }),
  A('dragon', 'Inferno Dragon', 'hell', 'celestial', 'dragon', 1, { glow: '#ff7a1f', extras: ['flames'] }),
  A('pegasus', 'Pegasus', 'angelic', 'epic', 'horse', 1, { tint: ['#ffffff', 0.85], extras: ['wings', 'mane'] }),
  A('seraph', 'Seraph Eagle', 'angelic', 'epic', 'bird', 1.3, { tint: ['#fffaf0', 0.85], extras: ['halo'] }),
  A('holydragon', 'Holy Dragon', 'angelic', 'celestial', 'dragon', 1, { tint: ['#fff8e0', 0.85], glow: '#ffe680', extras: ['halo'] }),
  A('griffin', 'Griffin', 'angelic', 'secret', 'cat', 1, { tint: ['#fff4d0', 0.7], glow: '#ffffff', extras: ['wings', 'halo', 'crown'] }),
]
// Calibrated sizes: each species' standing height in metres (the player is 1.8 m). Small
// critters stay readable (~1-1.5 m); real-world size order is kept, compressed: big mammals
// 3-5 m, the giants (Kong, dinosaurs, dragons) 6-9.5 m. buildAnimal scales its base model to it.
const SIZE = {
  bunny: 1.2, duck: 1.2, chicken: 1.4, pig: 1.5, sheep: 1.7, cow: 2.2, pony: 2.4,
  crab: 0.9, turtle: 1.3, axolotl: 1.1, puffer: 1.3, jelly: 1.9, swordfish: 1.9, shark: 2.8,
  hare: 1.25, penguin: 1.6, fox: 1.5, wolf: 2.2, bear: 3.0, orca: 3.2, mammoth: 4.6,
  lizard: 1.0, tortoise: 1.6, camel: 3.2, ostrich: 2.9, cobra: 1.7, kangaroo: 2.5, scorpion: 1.8,
  mole: 1.3, gemhound: 2.0, cavebat: 1.5, prismcat: 2.0, geodrake: 3.4, crystalcorn: 3.0,
  toucan: 1.5, giraffe: 5.8, gorilla: 2.8, elephant: 4.4, croc: 2.0, tiger: 2.4, kong: 6.2,
  goldchick: 1.4, goldbunny: 1.3, goldpig: 1.6, goldeagle: 2.2, goldowl: 2.0, goldstallion: 3.2,
  raptor: 2.4, ankylo: 2.8, stego: 4.0, ptero: 3.2, brachio: 9.5, trex: 7.2, spino: 8.0, skyrex: 8.6,
  embercrow: 1.7, hellbat: 2.2, hellhound: 3.2, dragon: 7.0,
  pegasus: 3.0, seraph: 2.8, holydragon: 7.4, griffin: 3.8,
}
export const ANIMALS = ROSTER.map((a, i) => {
  const z = ZONES.find((x) => x.id === a.zone)
  const r = RARITIES.find((x) => x.id === a.rarity)
  return { ...a, income: Math.round(r.base * a.f * z.mult), speed: 1.4 + ((i * 37) % 9) / 10, size: SIZE[a.id] }
})
// Index rewards: discovering an animal lets you claim income * claimSeconds once; a zone
// with every animal discovered adds zoneBonus to the cash multiplier.
export const INDEX = { claimSeconds: 10, zoneBonus: 0.2 }
export const SHINY = { chance: 0.03, mult: 3, cap: 0.15 } // golden variant: x3 income; luck raises the chance up to cap
export const ANIMAL_SELL_MULT = 25 // an animal sells for income * this

// Upgrades bought at the base signs. cost = base * growth^level. Paced (see the economy notes
// in CLAUDE.md) so a typical player reaches Angelic in ~5 h and maxes everything in ~10 h.
export const UPGRADES = {
  mult: { name: 'Cash Multiplier', base: 16, growth: 2.7, step: 0.5, max: 40 }, // x(1 + step * level)
  xp: { name: 'Bait XP', base: 9, growth: 2.2, ratio: 1.2, max: 40 }, // xp per pump * ratio^level
  slot: { name: 'Pen Slot', base: 1000, growth: 2.8, start: 4, max: 12 },
  // Expand Pen: the south fence moves BASE.pen.grow m south per level (sign on that fence).
  pen: { name: 'Expand Pen', base: 50000, growth: 40, max: 5 },
  auto: { name: 'Auto Machine', price: 9600 }, // the second machine: three tanks that grow bait by themselves
  autoSpeed: { name: 'Auto Speed', base: 15000, growth: 2.7, ratio: 1.22, max: 25 }, // Auto Machine XP/s * ratio^level
}

// The training ring (Strength). Bought once, cheap, after the first animal is in the pen.
// Each rep gives strength = perRep * perRepGrowth^(level - 1) * (1 + lvBonus * (lv - 1)),
// where level = the equipment level (upgrade pad) and lv = the training level, which
// climbs with XP (one per rep; lv needs xpBase + lv + lv^2 / 25). The equipment
// changes with the level: dumbbell curls, then barbell overhead press, then front squats.
export const GYM = {
  price: 150,
  needAnimals: 1,
  perRep: 1,
  perRepGrowth: 1.2,
  lvBonus: 0.05,
  xpBase: 4,
  upgrade: { base: 1500, growth: 2.6, max: 30 }, // $ for level L -> L + 1 = base * growth^(L - 1)
  moves: [
    { from: 1, move: 'curl', name: 'Dumbbells' },
    { from: 5, move: 'press', name: 'Barbell' },
    { from: 15, move: 'squat', name: 'Squat Bar' },
  ],
  plates: ['#2b2e38', '#d8323a', '#2f6fe0', '#f2c21f', '#2fae4a', '#8a3fe0', '#f08a1c', '#e8e8f0', '#ffd23a'], // plate colour per 4 levels
  // Seconds per phase of one rep (realistic tempo: quick lift, short squeeze, slow lower).
  tempo: {
    curl: { up: 0.5, hold: 0.14, down: 0.72, rest: 0.08 },
    press: { up: 0.62, hold: 0.2, down: 0.8, rest: 0.18 },
    squat: { down: 0.95, hold: 0.12, up: 0.68, rest: 0.3 },
  },
  pickup: 1.0, // s to squat down and pick the weights up
  putdown: 0.85,
}

// Permanent passes, priced in money (they are premium passes in similar games).
export const PASSES = {
  autoClick: { name: 'Auto Click', price: 2500, desc: 'The bait machine pumps itself, 3x a second.' },
  x2xp: { name: 'x2 XP', price: 3500, desc: 'Every pump gives double bait XP. Forever.' },
  x2cash: { name: 'x2 Cash', price: 7500, desc: 'Every animal earns double. Forever.' },
  x2luck: { name: 'x2 Luck', price: 9500, desc: 'Double luck on every catch. Forever.' },
}

// Follower pets: each adds to cash and/or luck while equipped.
export const PETS = {
  equipMax: 2,
  list: [
    { id: 'dino', name: 'Dino Buddy', cash: 0.25, luck: 0, source: 'free', desc: 'Free starter pet. +25% cash.' },
    { id: 'chick', name: 'Lucky Chick', cash: 0, luck: 0.3, source: 'store', price: 12000, desc: '+30% luck on every catch.' },
    { id: 'mammoth', name: 'OP Mammoth', cash: 1.0, luck: 0.25, source: 'offer', price: 45000, desc: '+100% cash and +25% luck.' },
  ],
}

// The OP offer (top right): a limited-time pet deal that runs on a repeating timer.
export const OFFER = { pet: 'mammoth', minutes: 20 }

// Store (left HUD button). Potions last `minutes`; price = max(price, the pen's income per
// second * incomeSeconds), so they stay a choice late in the game. The bundle is the -50% deal.
export const STORE = {
  sale: 0.5, // shown as the -50% badge
  potions: {
    luck: { name: 'Luck Potion', price: 900, incomeSeconds: 90, minutes: 10, desc: 'x2 luck for rarer catches.' },
    cash: { name: 'Cash Potion', price: 1200, incomeSeconds: 150, minutes: 10, desc: 'x2 cash from every animal.' },
    xp: { name: 'XP Potion', price: 600, incomeSeconds: 60, minutes: 10, desc: 'x2 bait XP per pump.' },
  },
  bundle: { name: 'Starter Bundle', potions: ['luck', 'cash', 'xp'], price: 1350, was: 2700 },
  // The Shop's limited Starter Pack (-50%): these animals jump into the pen, plus every potion
  // for potionMinutes. Bought once; the offer runs on a repeating `minutes` timer.
  // price = the animals' sell value * valueMult, rounded (shown next to twice that, struck out).
  pack: { name: 'Starter Pack', animals: ['jelly', 'pony'], potionMinutes: 30, valueMult: 1.2, minutes: 15 },
  // The Shop's "Upgrade Bait!" banner: jumps the bait machine to the next bait kind (Lv 1).
  // price = base * growth^(current kind).
  baitSkip: { base: 3000, growth: 3.6 },
}

// Playtime boost (bottom right): +step cash every `every` minutes played this session, up to max.
export const PLAY_BOOST = { step: 0.05, every: 3, max: 0.5 }

// The harpoon on the lane. Distances in metres, times in seconds.
export const HARPOON = {
  hop: 1.6, // the caught animal's jump from the harpoon over the machine into the pen
  // Aiming on the harpoon: the power meter's fill sweeps up and down (cycles per second);
  // where you stop it sets the shot's luck (x luck[0] empty .. x luck[1] full) and distance.
  meter: { speed: 0.8, luck: [1, 2], perfect: 0.86, great: 0.62, good: 0.38 },
  aim: 0.45, // s the turret takes to swing and raise the barrel before it fires
  // Longest shot at full power (m) = base + k * log2(1 + Strength / s0); empty power lands at minPower of it.
  // Not capped by the Lane: every zone below the one the longest shot reaches can be aimed at
  // directly (the Target picker), so a reach past the Lane's end makes Angelic a sure landing.
  reach: { base: 55, k: 42, s0: 25, minPower: 0.35 },
  jitter: 4, // +- m of random distance
  spread: { canyon: 4, wild: 10 }, // max sideways offset of the landing spot (in the canyon / the wild area)
  flight: [1.5, 2.6], // s in the air at the shortest .. longest shot
  arc: [7, 15], // m above the straight line at the top of the flight
  distLuck: 180, // the flight's luck = power luck * (1 + metres flown / distLuck)
  zone: 60, // m per cell of the distance bar
  // The bush where the spear lands charges up more luck: [chance, min, max] multiplier bands.
  bush: [[0.6, 1.05, 1.9], [0.3, 1.9, 4.5], [0.085, 4.5, 10], [0.015, 10, 25]],
  charge: { base: 1.5, perDouble: 0.45, max: 4.5 }, // s the count-up lasts: base + perDouble * log2(bush mult)
  luckPower: 0.5, // the roll uses (shot luck)^luckPower on top of potions/pets (the shown number is the hype)
  hook: 1.5, // s of "HOOKED!" before the reel starts
  // The bait lands `gap` m from a hiding spot; the catch jumps out, runs to it at `run` m/s,
  // sniffs for `sniff` s and bites.
  approach: { gap: 5.5, run: 6, sniff: 0.6 },
  // Reeling in: it reels by itself in `seconds` (+ perRarity per tier), each click adds `click`
  // (less for rarer catches), and every tug (random gap) the animal pulls back for tugTime s.
  reel: { seconds: 8, perRarity: 1.4, click: 0.05, clickRarity: 0.005, minClick: 0.022, tug: [1.6, 3.4], tugTime: 0.75, tugPull: 0.09 },
  caught: 0.85, // s the catch glows white at the harpoon before it jumps to the pen
}
// The "Next Shot 100x Luck" boost on the aim screen, bought with money (never premium currency):
// price = max(base, the pen's income per second * incomeSeconds), rounded.
export const NEXT_SHOT = { luck: 100, base: 900, incomeSeconds: 150 }

// The new-player tutorial (tutorial.js): pump the machine `pumps` times -> claim a bait ->
// attach it at the harpoon -> shoot -> reel the animal in -> keep catching until the Auto
// Machine is affordable -> buy it. Progress is S.tutorial (a step; `done` = finished or skipped).
export const TUTORIAL = { pumps: 5, done: 100 }

// Interact prompts: distance (m) at which each kind shows.
export const INTERACT = {
  toastSeconds: 2.2,
  radius: { pump: 1.45, claim: 1.3, pass: 1.25, sign: 2.6, sell: 2.8, harpoon: 3.4, offline: 2.4, gym: 2.5, gymPad: 1.6 },
}

// --- Audio (audio/) ---------------------------------------------------------------------
export const AUDIO = {
  volume: 0.8,
  storageKey: 'bait-an-animal.sound',
  buses: { ui: 0.8, sfx: 0.9, amb: 0.55, engine: 0.5 }, // per-bus levels before the master
  duck: 0.45, // world (ambience) level while a menu window is open
  maxVoices: 48, // one-shot sounds at once before low-priority ones are skipped
  maxVoicesTouch: 24,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  // Generated impulse response: pre-delay s, early reflections [ms, gain], tail decay s,
  // tail level, how fast the tail darkens, and the default send level.
  reverb: { seconds: 1.6, preDelay: 0.012, early: [[17, 0.45], [29, 0.32], [43, 0.26], [67, 0.18], [91, 0.1]], decay: 1.2, tail: 0.16, darken: 1.8, send: 0.8 },
  // Hub ambience: breeze level, birdsong gap range s, leaf rustle gap range s,
  // income clinks are heard up to `incomeNear` m from the pen.
  ambience: { breeze: 0.5, birdEvery: [2.5, 7], rustleEvery: [6, 14], incomeNear: 30 },
  stepEvery: 1.55, // m walked per footstep
}

// --- UI juice (juice.js) -------------------------------------------------------------
export const JUICE = { coins: 16, stars: 18, sparks: 12, big: 40, touchScale: 0.55, cascade: 28 }

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

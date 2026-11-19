---
canDie: false
hasScore: true
rewards: true
leaderboards:
  - earned
  - catches
  - strength
  - index
clientDir: .
buildCommand: npm run build
distDir: dist
notApplicable:
  gems: "No Gems or other premium currency, by design: every pass, potion, pet and upgrade is bought with in-game money (project rule)."
  deathScreen: "The player cannot die (canDie: false): there is no damage, fall death or game over."
  crazyGames: "The game ships on Boxity only; there is no CrazyGames build."
---

# Bait an Animal: Boxity integration

What the game does with each Boxity feature (docs.bloxity.io), and where.

| Feature | Where |
|---|---|
| SDK from `sdk.bloxity.io`, init, loading steps, `loadingEnd`, `gameplayStart` | `index.html`, `src/bloxity.js` |
| Auth (`onUserChanged`), settings, avatar + customizer, Escape -> portal menu, Reset Character | `src/bloxity.js`, `src/main.js` |
| Server identity: the join sends `auth.getToken()`, the server verifies it (`/v1/auth/game-token/verify`) and uses only `user._id` | `src/net.js`, backend `src/boxity.ts`, `WorldRoom.onAuth` |
| Matchmaker (`net.resolveEndpoint`), room size 5 (`roomSize`, never `seatCap`), party play through the matchmaker | `src/net.js`, backend `.github/workflows/deploy.yml` |
| `game.updateRoom`, `?roomId=` launch join through the room's pod (`/v1/dir/<id>/list`), friend toasts (`playerJoined` / `playerInRoom`) | `src/net.js`, `src/bloxity.js`, `src/remote.js` |
| Open Rooms: the room reporter pushes live rooms to the matchmaker every 2 s | backend `src/legion-room-reporter.ts` |
| Leaderboards: `leaderboard.define` on boot; scores reported by the server from accepted saves (Money Earned and Animals Caught weekly sums, Strength and Pet Index all-time bests) | `src/config.js` `LEADERBOARDS`, backend `src/leaderboards.ts` |
| Profile stats (Cash, Animals Caught, Strength, Pet Index), reported by the server every 60 s | backend `src/leaderboards.ts` |
| Remote players wear their Boxity look (`character.dress` from the outfit key; manual loader fallback) | `src/remote.js` |
| Emotes: `registerFeature('emotes')`, clips from `/v1/avatar/emotes` played on the rig, replicated to the room | `src/bloxity.js`, `src/emotes.js`, `src/main.js`, `src/remote.js` |
| Overhead chat bubbles (`chat.onMessage` + `chat.attachBubble`), matched to characters by the verified account id | `src/bloxity.js`, `src/remote.js`, `src/main.js` |
| Ad breaks pause the game and mute audio | `src/bloxity.js`, `src/main.js`, `src/audio/core.js` |
| Rewarded ad: "Watch ad" card = 2x Cash for 10 min, token checked by the server (`/v1/ads/reward/verify`) | `src/hud.js`, `src/net.js`, backend `WorldRoom` `adReward` |
| Screen ads: `declareScreens({ panel, gameplay })`; `panel` while a full-screen window is open, `gameplay` (no banners) otherwise | `src/bloxity.js`, `src/uiWindow.js`, `src/main.js` |
| HUD stays out of Boxity's reserved areas | `src/hud.js`, `src/uiWindow.js` |

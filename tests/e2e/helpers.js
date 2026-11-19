import { expect } from '@playwright/test'

// Boots the game on a fresh game (no server = nothing is saved or loaded),
// collects page errors, and waits until the world, player and HUD are up.
export async function boot(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    // Offline / blocked third-party resources (Bloxity SDK, Google Fonts) are not game bugs.
    if (/Failed to load resource|net::ERR|sdk\.bloxity|fonts\.g/i.test(text)) return
    errors.push(text)
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__game?.game && window.__game?.player && document.querySelector('.hud'), null, { timeout: 90_000 })
  // Let the first frames render and the avatar swap in.
  await page.waitForTimeout(1500)
  return { errors }
}

export const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.game.S)))

// Puts the player at (x, z) on the ground, facing `facing` (radians).
export async function teleport(page, x, z, facing = 0) {
  await page.evaluate(([x, z, f]) => window.__game.teleport(x, 1.2, z, f), [x, z, facing])
  await page.waitForTimeout(400)
}

export const playerPos = (page) =>
  page.evaluate(() => {
    const p = window.__game.player.renderPosition
    return { x: p.x, y: p.y, z: p.z }
  })

// Stands next to an interact spot (base.spots[key]), offset by (dx, dz).
export async function goToSpot(page, key, dx = 0, dz = 0) {
  const spot = await page.evaluate((k) => {
    const s = window.__game.base.spots[k]
    return { x: s.x, z: s.z }
  }, key)
  await teleport(page, spot.x + dx, spot.z + dz)
  return spot
}

export const prompt = (page) => page.locator('.ix-prompt')

// The proximity pill ("E  Bait Machine / Pump") is showing and mentions `title`.
export async function expectPrompt(page, title) {
  await expect(prompt(page)).toBeVisible()
  if (title) await expect(prompt(page).locator('.ix-title')).toContainText(title)
}

// Taps E once, or holds it for `ms`.
export async function pressE(page, ms = 0) {
  if (!ms) return page.keyboard.press('KeyE')
  await page.keyboard.down('KeyE')
  await page.waitForTimeout(ms)
  await page.keyboard.up('KeyE')
}

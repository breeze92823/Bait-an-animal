import { test, expect } from '@playwright/test'
import { boot, state, teleport, playerPos, goToSpot, expectPrompt, pressE } from './helpers.js'

test.describe('Bait an Animal: core loop', () => {
  test('boots, renders the world and shows the HUD with no errors', async ({ page }) => {
    const { errors } = await boot(page)
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('.hud')).toBeVisible()
    const S = await state(page)
    expect(S.money).toBe(0)
    expect(S.animals).toHaveLength(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the player walks with WASD and jumps with Space', async ({ page }) => {
    await boot(page)
    await page.locator('canvas').first().click({ position: { x: 640, y: 360 } })
    const a = await playerPos(page)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(900)
    await page.keyboard.up('KeyW')
    const b = await playerPos(page)
    expect(Math.hypot(b.x - a.x, b.z - a.z), 'moved on the ground with W').toBeGreaterThan(1)

    const y0 = (await playerPos(page)).y
    await page.keyboard.down('Space')
    await page.waitForTimeout(250)
    const y1 = (await playerPos(page)).y
    await page.keyboard.up('Space')
    expect(y1, 'left the ground with Space').toBeGreaterThan(y0 + 0.2)
  })

  test('pump the machine with E: xp rises and bait levels up', async ({ page }) => {
    await boot(page)
    await goToSpot(page, 'pump', -1.2, 0)
    await expectPrompt(page, 'Bait Machine')
    const before = await state(page)
    await pressE(page, 2500) // hold E = repeat pumping
    const after = await state(page)
    const gained = after.machine.p * 1000 + after.machine.xp - (before.machine.p * 1000 + before.machine.xp)
    expect(gained, 'pumping added xp / levels').toBeGreaterThan(0)
  })

  test('claim a bait from the machine, then it regrows', async ({ page }) => {
    await boot(page)
    await goToSpot(page, 'claim', -1.2, 0)
    await expectPrompt(page)
    expect((await state(page)).baits).toHaveLength(0)
    await pressE(page)
    await expect.poll(async () => (await state(page)).baits.length).toBe(1)
    expect((await state(page)).baitReady, 'machine starts regrowing').toBe(false)
  })

  test('full loop: pump -> claim -> harpoon -> catch -> pen earns money -> sell', async ({ page }) => {
    const { errors } = await boot(page)

    // 1. Pump and claim.
    await goToSpot(page, 'pump', -1.2, 0)
    await pressE(page, 1200)
    await goToSpot(page, 'claim', -1.2, 0)
    await pressE(page)
    await expect.poll(async () => (await state(page)).baits.length).toBe(1)

    // 2. Attach the bait at the harpoon (E), the aim screen shows, fire with Space.
    await teleport(page, 0, -37.5, Math.PI)
    await expectPrompt(page, 'Harpoon')
    await pressE(page)
    await expect.poll(() => page.evaluate(() => window.__game.game.flow.phase), { timeout: 15_000 }).toBe('aim')
    await page.waitForTimeout(800) // watch the power meter sweep
    await page.keyboard.press('Space')

    // 3. Flight, bite, reel: tap along until the catch is delivered to the pen.
    await expect
      .poll(
        async () => {
          const phase = await page.evaluate(() => window.__game.game.flow.phase)
          if (phase === 'reel' || phase === 'hooked') await page.keyboard.press('Space')
          return (await state(page)).animals.length
        },
        { timeout: 90_000, intervals: [250] },
      )
      .toBe(1)
    await expect.poll(() => page.evaluate(() => window.__game.game.flow.active), { timeout: 15_000 }).toBe(false)
    const caught = await state(page)
    expect(caught.catches).toBe(1)
    expect(caught.baits).toHaveLength(0)
    expect(Object.keys(caught.index).length, 'Pet Index records the animal').toBeGreaterThan(0)

    // 4. The animal earns money in the pen.
    await expect.poll(async () => (await state(page)).money, { timeout: 30_000 }).toBeGreaterThan(0)

    // 5. Sell it at the stall (E opens the Sell window on the Animals tab, Sell on the animal's row).
    await goToSpot(page, 'sell', 0, -2.5)
    await expectPrompt(page, 'Shopkeeper')
    await pressE(page)
    const win = page.locator('.win-sell2')
    await expect(win).toBeVisible()
    await expect(win.getByText('Pen Value')).toBeVisible()
    const moneyBefore = (await state(page)).money
    await win.getByRole('button', { name: 'Sell', exact: true }).click()
    await expect.poll(async () => (await state(page)).animals.length).toBe(0)
    expect((await state(page)).money).toBeGreaterThan(moneyBefore)

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('buy an upgrade with money at its sign', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => (window.__game.game.S.money = 1_000_000)) // setup shortcut, not the thing under test
    await goToSpot(page, 'mult', 0, 1)
    await expectPrompt(page, 'Cash')
    const before = await state(page)
    await pressE(page)
    await expect.poll(async () => (await state(page)).up.mult).toBe(before.up.mult + 1)
    expect((await state(page)).money).toBeLessThan(1_000_000)
  })

  // Progress is stored on the game server only (the backend's Mongo doc), never in the browser.
  test('progress is never written to localStorage', async ({ page }) => {
    await boot(page)
    await goToSpot(page, 'pump', -1.2, 0)
    await pressE(page, 1500)
    await page.evaluate(() => window.__game.game.save())
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('save')))
    expect(keys).toEqual([])
  })
})

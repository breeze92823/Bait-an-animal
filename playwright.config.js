import { defineConfig } from '@playwright/test'

// Gameplay E2E tests. They drive the real game in Chrome (WebGL, real keyboard input) against the
// Vite dev server (the `__game` dev hook is only there in dev). Watch them live:
//   npm run test:e2e:headed   (visible Chrome window, optionally slowed: SLOWMO=300)
//   npm run test:e2e:ui       (Playwright UI: timeline + live browser view)
//   npm run test:e2e          (headless, then `npm run test:e2e:report` for the HTML report)
const PORT = 5301
const slowMo = Number(process.env.SLOWMO || 0)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome', // the installed Chrome: real GPU, no browser download
    viewport: { width: 1280, height: 720 },
    launchOptions: { slowMo, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
    trace: 'on', // timeline + screenshots per step in the HTML report
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --mode development`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    env: { VITE_DEV_MODE: 'true' },
    timeout: 60_000,
  },
})

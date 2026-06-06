import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? process.env.E2E_STUDIO_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const healthURL = `${baseURL}/stories/subcurrent/write`;
const screenshotMode = (() => {
  const mode = process.env.PLAYWRIGHT_SCREENSHOT_MODE;
  if (mode === "off" || mode === "on" || mode === "only-on-failure") return mode;
  return process.env.CI ? "only-on-failure" : "on";
})();

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 40_000,
  expect: { timeout: 8_000 },
  retries: 2,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: process.env.CI ? true : process.env.PLAYWRIGHT_HEADLESS === "1",
    trace: "retain-on-failure",
    screenshot: screenshotMode,
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: healthURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

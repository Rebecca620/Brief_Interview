import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4187',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.BRIEF_CHROME_PATH
      ? { executablePath: process.env.BRIEF_CHROME_PATH }
      : {},
  },
  webServer: {
    command: 'python3 -m http.server 4187 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4187',
    stdout: 'ignore',
    stderr: 'ignore',
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
});

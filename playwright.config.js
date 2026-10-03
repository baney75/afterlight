import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', timeout: 60000, workers: 1,
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:4186', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: process.env.TEST_URL ? undefined : { command: 'npm run build && npm run preview -- --port 4186 --strictPort', url: 'http://127.0.0.1:4186', reuseExistingServer: !process.env.CI },
});

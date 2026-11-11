import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 180_000,
  use: {
    baseURL: process.env.SOUNDPAD_TEST_URL ?? 'http://127.0.0.1:3000',
    bypassCSP: false,
    trace: 'off',
  },
  projects: [
    { name: 'iPhone WebKit', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'Android Chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
});

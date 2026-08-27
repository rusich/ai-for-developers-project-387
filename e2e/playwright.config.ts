// Playwright e2e: реальный браузер против живых Rust-бэкенда (3000) и статики (8080).
// Серверы поднимаются сами (webServer) и гасятся после прогона.
// Бэкенд должен быть собран: just e2e делает это автоматически, в CI — отдельный шаг.

import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 3000;
const STATIC_PORT = 8080;
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;
const isCI = !!process.env.CI;

// На NixOS Playwright-браузер не стартует (нет системных библиотек в /nix/store).
// Указываем системный Chromium: PLAYWRIGHT_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium
const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${STATIC_PORT}`,
    timezoneId: 'UTC',
    trace: 'on-first-retry',
    ...(browserPath ? { launchOptions: { executablePath: browserPath } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: './target/debug/call-booking-backend',
      cwd: '../backend',
      port: BACKEND_PORT,
      reuseExistingServer: !isCI,
      env: {
        PORT: String(BACKEND_PORT),
        OWNER_TOKEN: process.env.OWNER_TOKEN || 'dev-token',
      },
      timeout: 120_000,
    },
    {
      command: `python3 -m http.server ${STATIC_PORT} --directory ../frontend`,
      url: `http://127.0.0.1:${STATIC_PORT}/`,
      reuseExistingServer: !isCI,
    },
  ],
});

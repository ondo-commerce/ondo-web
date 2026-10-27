import { defineConfig, devices } from "@playwright/test";

/**
 * e2e 는 **mock 모드**로 돈다 — `NEXT_PUBLIC_API_MOCK=1` 이면 MSW 가 스냅샷으로 답하므로
 * BE 서버 없이 CI 에서도 같은 결과가 나온다. 실서버 확인은 QA 가 따로 적는다.
 *
 * 프로젝트가 둘이다. **e2e 전용 포트** 도매 3100, 소매 3101 을 쓴다 — 3000/3001 은 다른 프로젝트의 dev 서버가
 * 차지하고 있을 수 있고, 실제로 첫 실행에서 3000 의 다른 앱을 온도로 착각해 실패했다(2026-10-27).
 * 전용 포트라 이미 떠 있는 서버는 온도뿐이므로 재사용한다(reuseExistingServer). `--project wholesale` 로 하나만 돌릴 수 있다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    {
      name: "wholesale",
      testMatch: /wholesale\/.*\.spec\.ts|smoke\/wholesale.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3100",
        viewport: { width: 1470, height: 900 },
      },
    },
    {
      name: "retail",
      testMatch: /retail\/.*\.spec\.ts|smoke\/retail.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3101",
        viewport: { width: 1470, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter wholesale exec next dev -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_MOCK: "1" },
      timeout: 120_000,
    },
    {
      command: "pnpm --filter retail exec next dev -p 3101",
      url: "http://localhost:3101/login",
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_MOCK: "1" },
      timeout: 120_000,
    },
  ],
});

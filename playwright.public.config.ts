import { defineConfig, devices } from "@playwright/test";

/**
 * **production 공개 URL** 스모크(`e2e/side-02/public/`). 로컬 dev 서버를 띄우지 않는다
 * (webServer 없음) — 평가위원이 여는 그 주소를 그대로 연다.
 *
 * 네트워크가 필요하고 production 상태에 따라 결과가 바뀌므로 CI에서 돌리지 않는다.
 * 기본 설정(`playwright.config.ts`)의 testMatch에도 걸리지 않고, spec은
 * `PUBLIC_SMOKE=1`이 없으면 통째로 건너뛴다. 돌리는 법: `pnpm e2e:public`.
 *
 * 주소는 환경변수로 바꿀 수 있다(`PUBLIC_BASE_W`, `PUBLIC_BASE_R`). 기본값은
 * 2026-09-20 첫 릴리스의 실도메인이다.
 */
const PUBLIC_BASE = {
  wholesale: process.env.PUBLIC_BASE_W ?? "https://pos.ddmondo.co.kr",
  retail: process.env.PUBLIC_BASE_R ?? "https://ddmondo.co.kr",
};

export default defineConfig({
  testDir: "./e2e/side-02/public",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  /* 콜드스타트(첫 요청 0.5~0.9s)와 서울 리전 왕복을 감안한다 */
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    {
      name: "public-wholesale",
      testMatch: /wholesale\.public\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: PUBLIC_BASE.wholesale,
        viewport: { width: 1470, height: 900 },
      },
    },
    {
      name: "public-retail",
      testMatch: /retail\.public\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: PUBLIC_BASE.retail,
        viewport: { width: 1470, height: 900 },
      },
    },
  ],
});

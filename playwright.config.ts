import { defineConfig, devices } from "@playwright/test";

/**
 * e2e 는 **mock 모드**로 돈다 — `NEXT_PUBLIC_API_MOCK=1` 이면 MSW 가 스냅샷으로 답하므로
 * BE 서버 없이 CI 에서도 같은 결과가 나온다. 실서버 확인은 QA 가 따로 적는다.
 *
 * 프로젝트가 둘이다. **e2e 전용 포트** 도매 3100, 소매 3101 을 쓴다 — 3000/3001 은 다른 프로젝트의 dev 서버가
 * 차지하고 있을 수 있고, 실제로 첫 실행에서 3000 의 다른 앱을 온도로 착각해 실패했다(2026-10-27).
 * 전용 포트라 이미 떠 있는 서버는 온도뿐이므로 재사용한다(reuseExistingServer). `--project wholesale` 로 하나만 돌릴 수 있다.
 *
 * 어느 앱의 spec 인지는 **파일 이름 접두어**가 말한다 — `smoke/wholesale-login.spec.ts` 처럼 `wholesale-` · `retail-` 로
 * 시작하거나, `wholesale/` · `retail/` 디렉터리 안에 있다. loop 회차 디렉터리(`e2e/<slug>/`)는 슬러그에 앱 이름이 없어
 * 접두어로 가른다(#250).
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
      testMatch: /wholesale[/-].*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3100",
        viewport: { width: 1470, height: 900 },
      },
    },
    {
      name: "retail",
      testMatch: /retail[/-].*\.spec\.ts/,
      /* 가짜 API가 있어야 도는 폴더는 아래 `retail-stub`이 맡는다 */
      testIgnore: /side-02\/retail\//,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3101",
        viewport: { width: 1470, height: 900 },
      },
    },
    {
      /*
       * 소매는 Server Component가 `API_ORIGIN`으로 직접 부른다 — 브라우저 MSW가 닿지
       * 않아 서버 쪽 응답은 가짜 API(`e2e/side-02/retail/stub-api.ts`, 3199)가 준다.
       * 예전엔 spec이 `API_ORIGIN`을 보고 스스로 skip해서 기본 `pnpm e2e`가 소매 검증
       * 0건으로 성공 종료했다(03-review F5). 이제 아래 webServer가 둘 다 띄우고, 연결이
       * 안 맞으면 spec이 **실패**한다.
       */
      name: "retail-stub",
      testMatch: /side-02\/retail\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3101",
        viewport: { width: 1470, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: "node --no-warnings e2e/side-02/retail/stub-server.ts",
      url: "http://localhost:3199/api/retail/auth/me",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
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
      /* 서버 fetch는 가짜 API로, 브라우저 fetch는 MSW로. dev API(`.env.development`)를
         보지 않는다 — 실서버 상태에 따라 e2e 결과가 바뀌면 안 된다 */
      env: { NEXT_PUBLIC_API_MOCK: "1", API_ORIGIN: "http://localhost:3199" },
      timeout: 120_000,
    },
  ],
});

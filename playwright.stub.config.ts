import { defineConfig, devices } from "@playwright/test";

/**
 * 소매 **가짜 API** e2e(`e2e/side-02/retail/`, `e2e/loop-05a-retail-chat/`). 실행: `pnpm e2e:stub`.
 *
 * 소매는 Server Component가 `API_ORIGIN`으로 직접 부른다 — 브라우저 MSW가 닿지 않아
 * 서버 쪽 응답(`/me`, 상품, 도매처 홈)은 가짜 API(`stub-api.ts`, 3199)가 준다. 이 설정이 그
 * 서버와 `API_ORIGIN=http://localhost:3199`인 retail 서버(3101)를 같이 띄운다.
 * 브라우저 MSW는 **채팅만** 받는다(loop-05a, `startRetailChatWorker`) — 다른 브라우저 요청은
 * 프록시를 지나 가짜 API로 간다.
 *
 * 기본 설정(`playwright.config.ts`)과 나눈 이유: 전역 webServer에 stub을 넣으면
 * `--project wholesale`까지 3199에 매달렸다(03-review F16). 예전엔 spec이 환경을 보고
 * skip해서 기본 실행이 검증 0건으로 성공했고(F5), 지금은 연결이 안 맞으면 spec이
 * 실패한다.
 *
 * `reuseExistingServer: false` — 3101에 다른 `API_ORIGIN`으로 뜬 서버(기본 설정의
 * 소매 서버)를 재사용하면 dev API를 본다. 포트가 차 있으면 시작 단계에서 실패시킨다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    {
      name: "retail-stub",
      /* loop-05a는 개발 spec(`retail-*`)과 QA spec(`qa-*`) 둘 다 여기서 돈다 — 따로 설정을 두면 한쪽이 안 돈다.
         loop-05b, loop-06, loop-07은 소매 spec(이름에 `retail`)만 — 같은 폴더의 도매 spec(#289, #299, #302)은 기본 설정이 돈다 */
      testMatch:
        /(side-02\/retail\/.*|loop-05a-retail-chat\/(retail|qa)-.*|(loop-05b-stock-reply|loop-06-backorder-reply|loop-07-receivable-reply|loop-06b-retail-notify)\/[^/]*retail[^/]*)\.spec\.ts$/,
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
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter retail exec next dev -p 3101",
      url: "http://localhost:3101/login",
      reuseExistingServer: false,
      /* 서버 fetch는 가짜 API로, 브라우저의 채팅 fetch는 MSW로(그 밖은 프록시 → 가짜 API) */
      /* `QA_MOCK_OFF=1`이면 목 없이 띄운다 — S5-10 확인용(채팅 spec이 skip이 아니라 실패해야 한다) */
      env: {
        NEXT_PUBLIC_API_MOCK: process.env.QA_MOCK_OFF === "1" ? "0" : "1",
        API_ORIGIN: "http://localhost:3199",
      },
      timeout: 120_000,
    },
  ],
});

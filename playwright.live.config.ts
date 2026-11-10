import { defineConfig, devices } from "@playwright/test";

/**
 * **실서버** e2e(`e2e/wire-01-live-server/live-*.spec.ts`). 실행: `LIVE_PW=<시드 비밀번호> pnpm e2e:live`.
 *
 * 서버 두 대(ondo-api 도매 :8081, 소매 :8080)가 먼저 떠 있어야 한다. 이 설정은 웹 두 앱만 띄운다.
 * CI에는 API 서버가 없어 **CI에선 안 돈다.** 서버 상태(채팅, 장바구니, 주문)를 바꾸고 되돌리지 않는다.
 *
 * 기본 설정(mock, 3100/3101)과 나눈 이유: mock 은 `NEXT_PUBLIC_API_MOCK=1`로 목이 답하고, 여기는
 * `NEXT_PUBLIC_API_MOCK=0`에 `API_ORIGIN`을 로컬 서버로 준다. 한 설정에 섞으면 어느 서버를 봤는지
 * 결과만으로 알 수 없다. 포트도 따로(3200/3201) — `reuseExistingServer: false`라 같은 포트에 다른
 * `API_ORIGIN`으로 뜬 서버(dev API를 보는 3000/3001 등)를 실수로 재사용하지 않는다. 포트가 차 있으면 시작 단계에서 실패한다.
 *
 * spec 은 `LIVE_W`, `LIVE_R`로 웹 주소를 받는다. 여기서 채운다(설정 파일은 워커에서도 읽혀 값이 전달된다).
 * 셸에 다른 값이 남아 있으면 시작 전에 멈춘다(#422) — 받아들이면 3200/3201을 띄워 놓고 다른 주소(3000/3001,
 * dev API를 보는 웹)를 검사해 실서버를 봤다고 거짓 통과한다. 조용히 덮어쓰지 않는 건 그 값을 넣은 사람이 다른
 * 주소를 보는 줄 알고 결과를 읽기 때문이다.
 */
const WHOLESALE_PORT = 3200;
const RETAIL_PORT = 3201;
const LIVE_ADDRESSES = {
  LIVE_W: `http://localhost:${WHOLESALE_PORT}`,
  LIVE_R: `http://localhost:${RETAIL_PORT}`,
} as const;
for (const [name, address] of Object.entries(LIVE_ADDRESSES)) {
  const given = process.env[name];
  if (given !== undefined && given !== address)
    throw new Error(
      `${name} 값은 ${address}이어야 한다(이 설정이 그 주소에 웹을 띄운다). 지금 값: ${given}. 셸에서 지우고 다시 돌린다`,
    );
  process.env[name] = address;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /wire-01-live-server\/live-[^/]*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  webServer: [
    {
      command: `pnpm --filter wholesale exec next dev -p ${WHOLESALE_PORT}`,
      url: `http://localhost:${WHOLESALE_PORT}/login`,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_MOCK: "0", API_ORIGIN: "http://localhost:8081" },
      timeout: 120_000,
    },
    {
      command: `pnpm --filter retail exec next dev -p ${RETAIL_PORT}`,
      url: `http://localhost:${RETAIL_PORT}/login`,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_MOCK: "0", API_ORIGIN: "http://localhost:8080" },
      timeout: 120_000,
    },
  ],
});

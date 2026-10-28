import { defineConfig, devices } from "@playwright/test";

/**
 * **production 공개 URL** 스모크(`e2e/side-02/public/`). 로컬 dev 서버를 띄우지 않는다
 * (webServer 없음) — 평가위원이 여는 그 주소를 그대로 연다.
 *
 * 네트워크가 필요하고 production 상태에 따라 결과가 바뀌므로 CI에서 돌리지 않는다.
 * 파일 끝이 `.public.ts`/`.setup.ts`라 기본 설정(`*.spec.ts`)에 걸리지 않고, spec은
 * `PUBLIC_SMOKE=1`이 없으면 건너뛴다.
 *
 * - `pnpm e2e:public:anon` 미로그인 점검만(`anon-*` project)
 * - `pnpm e2e:public` 전부. 로그인 점검은 앱마다 setup project가 한 번 로그인하고
 *   그 세션(`e2e/.auth/`, gitignore)을 재사용한다. `PUBLIC_PW`가 없으면 **실패**한다
 *
 * 주소는 `PUBLIC_BASE_W`, `PUBLIC_BASE_R`로 바꿀 수 있다. 기본값은 2026-09-20 첫
 * 릴리스의 실도메인이다.
 *
 * ⚠️ **trace를 끈다.** trace는 요청 본문까지 담아서 로그인이 실패하면 공개 계정
 *    비밀번호가 `test-results/`에 남았다(03-review F13). 스크린샷은 실패할 때만이고
 *    비밀번호 칸은 `type=password`라 가려진다. 영상도 남기지 않는다.
 */
const PUBLIC_BASE = {
  wholesale: process.env.PUBLIC_BASE_W ?? "https://pos.ddmondo.co.kr",
  retail: process.env.PUBLIC_BASE_R ?? "https://ddmondo.co.kr",
};

const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1470, height: 900 },
};

export default defineConfig({
  testDir: "./e2e/side-02/public",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  /* 콜드스타트(첫 요청 0.5~0.9s)와 dev API 지연(500까지 30초)을 감안한다 */
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    {
      name: "anon-wholesale",
      testMatch: /(anon|qa)-wholesale\.public\.ts$/,
      use: { ...desktop, baseURL: PUBLIC_BASE.wholesale },
    },
    {
      name: "anon-retail",
      testMatch: /(anon|qa)-retail\.public\.ts$/,
      use: { ...desktop, baseURL: PUBLIC_BASE.retail },
    },
    {
      name: "auth-wholesale",
      testMatch: /auth-wholesale\.setup\.ts$/,
      use: { ...desktop, baseURL: PUBLIC_BASE.wholesale },
    },
    {
      name: "auth-retail",
      testMatch: /auth-retail\.setup\.ts$/,
      use: { ...desktop, baseURL: PUBLIC_BASE.retail },
    },
    {
      name: "login-wholesale",
      testMatch: /login-wholesale\.public\.ts$/,
      dependencies: ["auth-wholesale"],
      use: {
        ...desktop,
        baseURL: PUBLIC_BASE.wholesale,
        storageState: "e2e/.auth/public-wholesale.json",
      },
    },
    {
      name: "login-retail",
      testMatch: /login-retail\.public\.ts$/,
      dependencies: ["auth-retail"],
      use: {
        ...desktop,
        baseURL: PUBLIC_BASE.retail,
        storageState: "e2e/.auth/public-retail.json",
      },
    },
  ],
});

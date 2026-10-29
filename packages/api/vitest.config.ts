import { defineConfig } from "vitest/config";

/**
 * 계약 테스트만 돈다 — 목 핸들러(`src/mocks/**`)를 `msw/node`로 띄워 HTTP로 부른다.
 * 화면이 아니라 "목이 계약대로 답하는가"를 본다. 앱 vitest(순수 함수)와 같은 node 환경이다.
 * `scripts/`의 테스트는 sync-spec 병합 규칙(초안이 BE 스펙에 덮여 사라지는지, loop-05b S7-1)을 본다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});

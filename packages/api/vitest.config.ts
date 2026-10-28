import { defineConfig } from "vitest/config";

/**
 * 계약 테스트만 돈다 — 목 핸들러(`src/mocks/**`)를 `msw/node`로 띄워 HTTP로 부른다.
 * 화면이 아니라 "목이 계약대로 답하는가"를 본다. 앱 vitest(순수 함수)와 같은 node 환경이다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

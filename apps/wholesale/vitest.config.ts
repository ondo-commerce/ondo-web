import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * 순수 함수만 돌린다(docs/08 규칙 7). 컴포넌트 렌더 테스트는 하지 않으므로
 * jsdom 도 React 플러그인도 들이지 않는다 — `features/*\/*.test.ts` 가 전부다.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

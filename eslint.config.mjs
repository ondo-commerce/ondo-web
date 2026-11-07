// 루트 eslint는 e2e/ 전용이다. 앱과 패키지는 각 workspace의 eslint.config가 맡는다 (#401)
import base from "@ondo/config/eslint/base.js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "apps/**",
      "packages/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  ...base,
  {
    files: ["e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./e2e/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // 빠뜨린 await는 단언이 안 돌고 통과하는 시험을 만든다. e2e에서 제일 값진 규칙이라 켠다
      "@typescript-eslint/no-floating-promises": "error",
      // Playwright fixture는 쓰지 않아도 `async ({}, testInfo)`처럼 객체 패턴을 받아야 한다
      "no-empty-pattern": "off",
      // `const { w: _w, ...shape } = a`처럼 칸 하나를 빼고 비교하는 rest 분해가 spec에 흔하다
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
];

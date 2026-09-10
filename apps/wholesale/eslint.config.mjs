import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import imports from "@ondo/config/eslint/imports.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...imports,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MSW가 생성한 파일(`msw init`). 손대지 않으므로 검사도 안 한다 — 맨 위 eslint-disable가
    // "쓸모없는 지시문" 경고를 낸다 (#218)
    "public/mockServiceWorker.js",
  ]),
]);

export default eslintConfig;

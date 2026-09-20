import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import imports from "./imports.js";

/**
 * Next 앱(`apps/wholesale`, `apps/retail`) 공용 ESLint 설정.
 *
 * 앱마다 같은 파일을 복사해 두면 한쪽만 고쳐도 아무 경고가 없다 — CI는 각 앱을 자기 설정으로
 * 검사하므로 둘 다 통과한다. 그래서 한 곳에 두고 앱은 가져다 쓰기만 한다 (#11).
 *
 * `packages/ui`는 여기를 쓰지 않는다. Next 규칙이 없고 `@ondo/api` 금지 규칙이 따로 있어 실제로 다르다.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...imports,
  // eslint-config-next의 기본 ignore를 덮어쓴다 — 아래 목록이 전부다
  globalIgnores([
    // eslint-config-next 기본값
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MSW가 생성한 파일(`msw init`). 손대지 않으므로 검사도 안 한다 — 맨 위 eslint-disable가
    // "쓸모없는 지시문" 경고를 낸다 (#218). 파일이 없는 앱에서는 무시할 게 없어 아무 영향이 없다
    "public/mockServiceWorker.js",
  ]),
]);

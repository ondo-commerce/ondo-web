/**
 * `playwright.config.ts`의 webServer가 띄우는 진입점(`node e2e/side-02/retail/stub-server.ts`).
 * Node 24의 타입 제거로 그대로 돈다 — 그래서 import에 `.ts`를 붙인다.
 * 서버 본체와 계정 표는 `stub-api.ts`. spec은 그쪽 상수만 읽는다.
 */
import { startStubApi, STUB_ORIGIN } from "./stub-api.ts";

await startStubApi();
process.stdout.write(`retail stub API: ${STUB_ORIGIN}\n`);

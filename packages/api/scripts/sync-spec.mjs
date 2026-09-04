// OpenAPI 스펙을 스냅샷으로 굳히고 타입을 다시 만든다.
//
// **로컬 전용이다.** CI와 Vercel에는 API 서버가 없다 — 그쪽은 커밋된 스냅샷만 보고
// `codegen`을 돌린다. 그래서 "밖에서 스펙을 가져오는 일"을 이 파일 하나에 몰아 뒀다.
//
//   pnpm --filter @ondo/api sync-spec                     # 뜬 서버에서 (기본 :8081)
//   pnpm --filter @ondo/api sync-spec ../받은스펙.json      # 받은 파일에서
//   OPENAPI_URL=https://api-dev.ondo.../v3/api-docs pnpm --filter @ondo/api sync-spec
//
// 파일 경로를 받는 이유: 도매 API 서버를 못 띄우는 환경이 있다(Docker·JDK 21 필요).
// BE에게 `curl :8081/v3/api-docs` 결과만 받아도 타입은 끝까지 만들 수 있어야 한다.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = resolve(PACKAGE_ROOT, "openapi/wholesale.json");
const DEFAULT_URL = "http://localhost:8081/v3/api-docs";

const source = process.argv[2] ?? process.env.OPENAPI_URL ?? DEFAULT_URL;
const isUrl = /^https?:\/\//.test(source);

/**
 * 키를 재귀적으로 정렬한다.
 *
 * springdoc은 같은 코드에서도 출력 순서가 흔들린다. 정렬하지 않으면 스펙이 하나도
 * 안 바뀌어도 스냅샷 diff가 나고, 그 diff에 익숙해지면 진짜 변경을 놓친다.
 */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

async function readSpec() {
  if (!isUrl) {
    const path = resolve(process.cwd(), source);
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (cause) {
      throw new Error(`${path} 를 읽지 못했다.`, { cause });
    }
  }

  const response = await fetch(source).catch((cause) => {
    throw new Error(
      `${source} 에 연결하지 못했다. 서버가 떠 있는지 확인하거나(ondo-api 레포에서 ` +
        `docker compose -f db/compose.yml up -d 후 cd wholesale-api && ./gradlew bootRun), ` +
        `받아 둔 스펙 파일 경로를 인자로 넘긴다.`,
      { cause },
    );
  });
  if (!response.ok) {
    throw new Error(`${source} 이 ${response.status} 를 냈다.`);
  }
  return response.json();
}

const spec = await readSpec();
if (typeof spec.openapi !== "string") {
  throw new Error(
    "받은 문서에 openapi 버전이 없다. /v3/api-docs 결과가 맞는지 확인한다.",
  );
}

mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortKeys(spec), null, 2)}\n`);
console.log(
  `스냅샷 갱신: openapi/wholesale.json  (openapi ${spec.openapi} ← ${source})`,
);

// 타입 생성은 `codegen` 한 곳에만 둔다. CI가 같은 명령으로 drift를 재는데, 여기서 다른
// 플래그로 만들면 로컬과 CI 결과가 갈려서 통과한 커밋이 CI에서 죽는다.
execFileSync("pnpm", ["run", "codegen"], {
  cwd: PACKAGE_ROOT,
  stdio: "inherit",
});

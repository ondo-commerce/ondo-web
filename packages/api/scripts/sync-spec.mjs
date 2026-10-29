// OpenAPI 스펙을 스냅샷으로 굳히고 타입을 다시 만든다.
//
// **로컬 전용이다.** CI와 Vercel에는 API 서버가 없다 — 그쪽은 커밋된 스냅샷만 보고
// `codegen`을 돌린다. 그래서 "밖에서 스펙을 가져오는 일"을 이 파일 하나에 몰아 뒀다.
//
//   pnpm --filter @ondo/api sync-spec wholesale                  # 뜬 도매 서버에서 (:8081)
//   pnpm --filter @ondo/api sync-spec retail                     # 뜬 소매 서버에서 (:8080)
//   pnpm --filter @ondo/api sync-spec retail ../받은스펙.json    # 받은 파일에서
//   pnpm --filter @ondo/api sync-spec retail https://…/v3/api-docs
//
// 첫 인자가 앱이다. 서버가 둘(도매 :8081 · 소매 :8080)이라 스냅샷도 둘이고, 어느 쪽을
// 갱신하는지 인자 없이 짐작하면 도매 파일에 소매 스펙을 덮어쓰는 사고가 난다.
//
// 파일 경로를 받는 이유: API 서버를 못 띄우는 환경이 있다(Docker·JDK 21 필요).
// BE에게 `curl :8080/v3/api-docs` 결과만 받아도 타입은 끝까지 만들 수 있어야 한다.
//
// 초안 op(`openapi/drafts/<app>.json`): BE가 아직 없는 op를 FE가 먼저 손으로 쓴 조각이다
// (`x-ondo-draft: true`). 받은 스펙으로 스냅샷을 통째로 덮은 **뒤에** 받은 스펙에 없는
// 초안 op와 그 스키마만 다시 합친다 — 덮어쓰기가 초안을 지우면 화면이 쓰는 타입이 사라진다.
// 받은 스펙에 같은 경로·메서드가 있으면 받은 쪽이 이긴다(BE가 구현했다는 뜻). 그 커밋에서
// drafts 조각을 지운다.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDraftSurvival, mergeDrafts, sortKeys } from "./merge-drafts.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 앱별 스냅샷 위치와 로컬 서버 기본 주소. 포트는 ondo-api 각 모듈의 설정을 따른다 */
const APPS = {
  wholesale: {
    snapshot: "openapi/wholesale.json",
    drafts: "openapi/drafts/wholesale.json",
    defaultUrl: "http://localhost:8081/v3/api-docs",
    bootHint: "cd wholesale-api && ./gradlew bootRun",
  },
  retail: {
    snapshot: "openapi/retail.json",
    drafts: "openapi/drafts/retail.json",
    defaultUrl: "http://localhost:8080/v3/api-docs",
    bootHint: "cd retail-api && ./gradlew bootRun",
  },
};

const appName = process.argv[2];
const app = APPS[appName];
if (app === undefined) {
  throw new Error(
    `첫 인자는 앱 이름이다: ${Object.keys(APPS).join(" | ")}. ` +
      `예) pnpm --filter @ondo/api sync-spec retail ../spec.json`,
  );
}

const SNAPSHOT_PATH = resolve(PACKAGE_ROOT, app.snapshot);
const source = process.argv[3] ?? process.env.OPENAPI_URL ?? app.defaultUrl;
const isUrl = /^https?:\/\//.test(source);

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
        `docker compose -f db/compose.yml up -d 후 ${app.bootHint}), ` +
        `받아 둔 스펙 파일 경로를 인자로 넘긴다.`,
      { cause },
    );
  });
  if (!response.ok) {
    throw new Error(`${source} 이 ${response.status} 를 냈다.`);
  }
  return response.json();
}

function readDrafts() {
  const path = resolve(PACKAGE_ROOT, app.drafts);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

const received = await readSpec();
if (typeof received.openapi !== "string") {
  throw new Error(
    "받은 문서에 openapi 버전이 없다. /v3/api-docs 결과가 맞는지 확인한다.",
  );
}

const drafts = readDrafts();
const {
  merged: spec,
  kept,
  dropped,
} = drafts === null
  ? { merged: received, kept: [], dropped: [] }
  : mergeDrafts(received, drafts);

// 스냅샷을 쓰기 **전에** 본다. 받은 스키마가 초안 칸을 지웠으면 덮어쓰지 않고 멈춘다 —
// 덮은 뒤 알리면 사람이 git 으로 되돌려야 하고, 그사이 codegen 이 그 칸을 이미 지운다(loop-05b S7-1)
const lost = drafts === null ? [] : checkDraftSurvival(spec, drafts);
if (lost.length > 0) {
  throw new Error(
    `받은 스펙이 초안을 지운다: ${lost.join(", ")}. ` +
      `BE 에 그 칸을 요청하거나, 초안을 버리기로 했으면 ${app.drafts} 에서 x-ondo-draft 칸을 지우고 다시 돈다.`,
  );
}

mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortKeys(spec), null, 2)}\n`);
console.log(
  `스냅샷 갱신: ${app.snapshot}  (openapi ${spec.openapi} ← ${source})`,
);
for (const label of kept) console.log(`초안 유지: ${label}  (${app.drafts})`);
for (const label of dropped) {
  console.log(
    `초안 폐기: ${label} — 받은 스펙에 같은 op가 있다. ${app.drafts} 에서 지운다.`,
  );
}

// 타입 생성은 `codegen` 한 곳에만 둔다. CI가 같은 명령으로 drift를 재는데, 여기서 다른
// 플래그로 만들면 로컬과 CI 결과가 갈려서 통과한 커밋이 CI에서 죽는다.
execFileSync("pnpm", ["run", "codegen"], {
  cwd: PACKAGE_ROOT,
  stdio: "inherit",
});

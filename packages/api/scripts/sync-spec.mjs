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

/**
 * 받은 스펙에 없는 초안 op와 그 스키마를 합친다. 받은 스펙은 손대지 않고 새 객체를 돌려준다.
 *
 * 합치는 단위는 **path × method**다. 받은 스펙에 같은 경로·메서드가 있으면 초안을 버린다 —
 * 경로만 같고 메서드가 다르면(예: BE가 GET만 먼저 구현) POST 초안은 살린다.
 * `x-ondo-draft`가 없는 op는 받지 않고 멈춘다 — 표시 없이 섞이면 스냅샷에서 BE 것과 구분이
 * 안 된다.
 *
 * 스키마는 살아남은 초안 op가 (중첩까지 따라가) 참조하는 것만, 받은 쪽에 같은 이름이 없을 때 넣는다. 같은 이름이
 * 있으면 받은 쪽이 이긴다 — BE가 이름을 선점한 것이고, 모양이 다르면 codegen 뒤 typecheck가 잡는다.
 */
function mergeDrafts(received, drafts) {
  const merged = { ...received, paths: { ...received.paths } };
  const kept = [];
  const dropped = [];

  for (const [path, operations] of Object.entries(drafts.paths ?? {})) {
    for (const [method, operation] of Object.entries(operations)) {
      const label = `${method.toUpperCase()} ${path}`;
      if (operation["x-ondo-draft"] !== true) {
        throw new Error(
          `${label} 에 "x-ondo-draft": true 가 없다. drafts 의 op는 전부 초안 표시가 있어야 한다.`,
        );
      }
      if (received.paths?.[path]?.[method] !== undefined) {
        dropped.push(label);
        continue;
      }
      merged.paths[path] = { ...merged.paths[path], [method]: operation };
      kept.push({ label, operation });
    }
  }

  const receivedSchemas = received.components?.schemas ?? {};
  const draftSchemas = drafts.components?.schemas ?? {};
  const schemas = { ...receivedSchemas };
  // 참조를 **끝까지** 따라간다. op가 직접 부르는 스키마만 넣으면 그 안의 `$ref`
  // (예: ChatSendResult → ChatMessage)가 빠져 codegen이 깨진다(#263, 채팅 계약이 처음으로 중첩 스키마를 들였다)
  const pending = refsIn(kept.map((k) => k.operation));
  const seen = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    if (name in receivedSchemas) continue;
    const schema = draftSchemas[name];
    if (schema === undefined) continue;
    schemas[name] = schema;
    pending.push(...refsIn(schema));
  }
  merged.components = { ...received.components, schemas };

  return { merged, kept: kept.map((k) => k.label), dropped };
}

/** 값 안의 `#/components/schemas/<이름>` 참조를 전부 뽑는다 */
function refsIn(value) {
  const names = [];
  const pattern = /"#\/components\/schemas\/([^"]+)"/g;
  for (const match of JSON.stringify(value).matchAll(pattern)) {
    names.push(match[1]);
  }
  return names;
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

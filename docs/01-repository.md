# 01. Repository 구조 · P0

## 결론

**내가 만들고 관리하는 레포는 `ondo-web` 1개.**

```
ondo-web  (모노레포)  ── 도매 앱 + 소매 앱 + 공유 패키지     ← 내 담당
ondo-api              ── Backend API 서버                    ← BE 담당 (내가 생성/관리하지 않음)
```

FE 레포는 BE 레포와 **코드로 연결되지 않는다.** 유일한 연결 고리는 `openapi.yaml` 하나뿐이다 → [05](05-api-contract.md)

---

## 왜 이 구조인가

### 도매 / 소매를 한 레포에 (모노레포)

| 근거 | 설명 |
|---|---|
| 코드 중복 | 두 앱이 **상품·주문·인증 도메인 타입과 UI를 70% 이상 공유**한다. 레포를 나누면 `packages/ui`를 npm에 배포하거나 복붙해야 함 |
| 인원 | FE가 1명이다. 레포 2개 = PR 2개, CI 2개, 의존성 업그레이드 2번. 전부 같은 사람이 함 |
| 원자적 변경 | "상품 스키마 필드 추가"가 두 앱을 동시에 건드림. 레포가 나뉘면 PR 2개 + 배포 순서 조율 필요 |
| 도구 지원 | Vercel이 Turborepo 모노레포를 1급으로 지원 (Root Directory 지정 + 영향받은 앱만 빌드) |

### FE / BE는 분리 (= BE를 내 모노레포에 넣지 않는다)

| 근거 | 설명 |
|---|---|
| 오너십 | 담당이 다르다. 내 레포의 CI·리뷰·릴리스 규칙을 BE 2명에게 강요할 이유가 없다 |
| 언어·툴체인 | Node 툴체인과 BE 런타임이 섞이면 CI 설정이 복잡해지고 Turborepo 캐시가 안 먹음 |
| 배포 주기 | Vercel(FE)은 PR마다, API 서버는 릴리스 단위. 태그·롤백 정책이 다름 |
| 알림 피로 | FE 1명이 BE PR 알림에 묻히면 내 PR 리뷰가 늦어짐 |
| 계약으로 연결 | 타입 공유는 **OpenAPI 코드젠**으로 해결 → [05](05-api-contract.md). 모노레포일 이유가 사라짐 |

> ❌ **폴리레포(레포 3개 이상) 금지 이유**: `ondo-wholesale`, `ondo-retail`, `ondo-ui`로 쪼개면 UI 패키지 버전 발행 → 두 앱에서 버전 올리기 → 3 PR. FE 1명이 하루를 여기 씀.

---

## ondo-web 최상위

```
ondo-web/
├── apps/
│   ├── wholesale/            # 도매 판매자용 (Vercel 프로젝트 A)
│   └── retail/               # 소매 구매자용 (Vercel 프로젝트 B)
├── packages/                 # 4개로 고정 → ADR-0004
│   ├── ui/                   # 토큰 + Tailwind preset + primitives/patterns
│   ├── api/                  # OpenAPI 생성 타입 + fetch 클라이언트 + MSW 핸들러
│   ├── shared/               # utils(포맷터·날짜·통화) + 범용 훅
│   └── config/               # eslint + tsconfig + prettier
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   └── conventions/          # 코딩/커밋/PR 규칙
├── .github/
│   ├── pull_request_template.md
│   ├── ISSUE_TEMPLATE/
│   ├── CODEOWNERS
│   └── workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .nvmrc                    # 22
└── package.json              # packageManager: pnpm@9.x
```

### 설정 파일 3종 (그대로 사용 가능)

**`pnpm-workspace.yaml`**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`package.json` (루트)**
```json
{
  "name": "ondo-web",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev:wholesale": "turbo dev --filter=wholesale",
    "dev:retail": "turbo dev --filter=retail",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "codegen": "turbo codegen",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  }
}
```

**`turbo.json`**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "codegen": { "cache": false },
    "build": {
      "dependsOn": ["^build", "codegen"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "typecheck": { "dependsOn": ["^build", "codegen"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

---

## Vercel 연결 (모노레포 함정 주의)

Vercel 프로젝트를 **2개** 만들고 각각:

| 설정 | wholesale | retail |
|---|---|---|
| Root Directory | `apps/wholesale` | `apps/retail` |
| Framework | Next.js | Next.js |
| Install Command | (기본값 — Vercel이 pnpm workspace 자동 감지) | 동일 |
| Ignored Build Step | `npx turbo-ignore` | `npx turbo-ignore` |

- **`turbo-ignore` 필수**: 소매 앱만 고친 PR에서 도매 앱까지 빌드되는 낭비를 막는다.
- **Remote Cache**: `vercel link` → `npx turbo login && npx turbo link`. CI 빌드 시간이 눈에 띄게 줄어든다.
- Preview 배포 URL은 PR 코멘트로 자동 등록됨 → PR 템플릿의 "확인 URL" 칸에 붙인다.

---

## BE 레포에 요청할 것 (내 작업 아님 — 받아내야 하는 의존성)

킥오프 때 이 5줄만 합의하면 FE는 BE 진행 속도와 무관하게 굴러간다.

- [ ] BE 레포 루트에 **`openapi.yaml`** 유지. 이게 계약의 원본
- [ ] main 머지 시 `openapi.yaml`을 **raw URL 또는 Release asset으로 상시 접근 가능하게** 공개
- [ ] 스테이징 API 도메인 1개 상시 제공 (`https://api-dev.ondo.xxx`)
- [ ] CORS에 Vercel preview 패턴(`https://*.vercel.app`) + localhost 허용
- [ ] 에러 응답 포맷 고정 → [05](05-api-contract.md#be에-요청할-것)

> 안 받아지면? **MSW로 계속 개발한다.** BE 지연이 FE 일정을 막지 않게 하는 게 [05](05-api-contract.md)의 목적이다.

---

## 체크리스트 (전부 FE 단독 실행)

- [ ] `ondo-web` 레포 생성 (private)
- [ ] Turborepo 스캐폴딩 + 위 설정 3종 커밋
- [ ] `apps/wholesale`, `apps/retail` 생성 (`create-next-app --ts --tailwind --app --src-dir`)
- [ ] `packages/*` **4개** 빈 패키지 생성 (`package.json`만) — 근거 [ADR-0004](adr/0004-package-consolidation.md)
- [ ] 공유 패키지의 React를 `peerDependencies`로 선언 (안 하면 `Invalid hook call`)
- [ ] `apps/*/next.config.ts`에 `transpilePackages` + tailwind `content`에 `packages/ui` 포함
- [ ] Vercel 프로젝트 2개 연결 + Root Directory + turbo-ignore 설정
- [ ] Turborepo Remote Cache 연결
- [ ] `main` 브랜치 보호: PR 필수 / CI green / force push 금지
- [ ] ADR-0001 작성 → [adr/0001](adr/0001-monorepo-for-web-apps.md)

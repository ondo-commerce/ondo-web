# onDo — 프론트엔드 기술 기반 (Frontend Engineering Foundation)

AI/SW 마에스트로 프로젝트 · 도매(Wholesale) / 소매(Retail) 웹
**내 담당: Frontend 1명** (BE 2명은 별도 레포·별도 오너)
Next.js(App Router) + TypeScript + TailwindCSS + Vercel · 6개월

> 이 폴더는 **기능 구현 전에 확정해야 할 프론트엔드 기술 기반**이다.
> 이론 설명이 아니라 **그대로 복사해서 레포에 넣으면 동작하는 수준**으로 작성했다.
> **범위: 프론트엔드만.** 백엔드 레포·서버·DB·인프라 구성은 이 문서에서 다루지 않는다.
> 단, FE 혼자 정할 수 없는 **API 계약**은 "BE에 요청할 것" 형태로만 정리한다 → [05](docs/05-api-contract.md)

---

## 0. 어디부터 읽나

| 상황 | 문서 |
|---|---|
| 지금 당장 뭘 해야 하나 | [docs/00-checklist.md](docs/00-checklist.md) ← **여기부터** |
| 레포를 몇 개 팔지 | [docs/01-repository.md](docs/01-repository.md) |
| 폴더를 어떻게 나눌지 | [docs/02-folder-structure.md](docs/02-folder-structure.md) |
| 브랜치/커밋/PR 규칙 | [docs/03-git.md](docs/03-git.md) |
| 컴포넌트를 어디에 둘지 | [docs/04-component-strategy.md](docs/04-component-strategy.md) |
| BE 안 기다리고 개발하려면 | [docs/05-api-contract.md](docs/05-api-contract.md) |
| 노션 vs GitHub | [docs/06-docs-structure.md](docs/06-docs-structure.md) |
| 개발 시작 전 결정 항목 | [docs/07-pre-dev-decisions.md](docs/07-pre-dev-decisions.md) |
| 기술 부채 방지 규칙 | [docs/08-tech-debt-rules.md](docs/08-tech-debt-rules.md) |
| **모노레포 아키텍처 설계·검토** (의존성/배포/CI/확장) | [docs/09-monorepo-architecture.md](docs/09-monorepo-architecture.md) |
| **Vercel 배포 직접 해보기 (실습)** | [docs/10-vercel-setup-lab.md](docs/10-vercel-setup-lab.md) |
| **초기 세팅 TODO (남은 작업)** | [docs/11-setup-todo.md](docs/11-setup-todo.md) |
| 기여 규칙 요약 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| ADR 쓰는 법 | [docs/adr/README.md](docs/adr/README.md) |

### 요청 항목 12개 ↔ 문서 매핑

| # | 항목 | 문서 |
|---|---|---|
| 1 | Repository 구조 | [01](docs/01-repository.md) |
| 2 | 폴더 구조 | [02](docs/02-folder-structure.md) |
| 3 | 브랜치 전략 | [03 § 브랜치 전략](docs/03-git.md#브랜치-전략) |
| 4 | Git Convention | [03 § Git Convention](docs/03-git.md#git-convention) |
| 5 | PR Template | [03 § PR Template](docs/03-git.md) · 파일 [`.github/pull_request_template.md`](.github/pull_request_template.md) |
| 6 | Issue Template | [03 § Issue Template](docs/03-git.md) · 파일 [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE) |
| 7 | ADR 관리 방식 | [adr/README](docs/adr/README.md) + 실제 ADR 3건 |
| 8 | 공통 컴포넌트 설계 전략 | [04](docs/04-component-strategy.md) |
| 9 | API 명세 관리 전략 | [05](docs/05-api-contract.md) |
| 10 | 문서 구조 (Notion/GitHub) | [06](docs/06-docs-structure.md) |
| 11 | 개발 시작 전 결정 항목 | [07](docs/07-pre-dev-decisions.md) |
| 12 | 기술 부채 감소 규칙 | [08](docs/08-tech-debt-rules.md) |

## 1. 바로 쓸 수 있는 파일

```
.github/
├── pull_request_template.md          → ondo-web 레포 .github/ 에 복사
├── ISSUE_TEMPLATE/
│   ├── config.yml
│   ├── 1-feature.yml
│   ├── 2-bug.yml
│   └── 3-chore.yml
├── CODEOWNERS
└── workflows/ci.yml
docs/adr/0000-template.md             → ADR 새로 쓸 때 복사
docs/adr/0001-*.md ~ 0003-*.md        → 이미 내린 결정 3건 (초안)
```

## 2. 우선순위 정의

| 등급 | 의미 | 타이밍 |
|---|---|---|
| **P0** | 이게 없으면 첫 코드를 못 짜거나, 나중에 바꾸면 전면 리팩터링 | 킥오프 주 (Week 0) |
| **P1** | 첫 스프린트 전에 있어야 협업이 안 깨짐 | Week 1 |
| **P2** | 기능 2~3개 나온 뒤 도입해야 효과 있음 | Week 3~6 |
| **P3** | 있으면 좋지만 없어도 MVP는 나감 | MVP 이후 |

**FE 1명 기준 원칙: P0/P1 외에는 전부 "나중에". 지금 안 하는 걸 명시적으로 정하는 게 더 중요하다.**

---

## 3. 핵심 결정 요약 (근거는 각 문서에)

| 항목 | 결정 | 한 줄 근거 |
|---|---|---|
| 레포 | **`ondo-web` 모노레포 1개** (도매+소매+공유패키지) | 두 앱이 UI·타입 70% 공유. 레포 나누면 1인이 PR·CI를 2배로 관리 |
| 공유 패키지 | **4개** — `ui` / `api` / `shared` / `config` | 8개로 나눌 이득(독립 버저닝·배포·팀)이 현재 없음 → [ADR-0004](docs/adr/0004-package-consolidation.md) |
| 툴 | pnpm + Turborepo | Vercel 1급 지원, 설정 최소 |
| 브랜치 | `main` / `dev` / `feat-*` | 중간발표 데모용 고정 브랜치가 필요 |
| 커밋 | Conventional Commits + scope=앱/패키지명 | PR 제목 재사용, 자동 CHANGELOG |
| API 계약 | **OpenAPI 3.1 소비자** + 타입 코드젠 + MSW | FE가 BE를 기다리면 6개월 안에 못 끝남 |
| 컴포넌트 | 3계층(primitives / patterns / feature) + **Rule of Two** | 1인 FE라 선(先)추상화 비용을 못 감당 |
| 상태 | TanStack Query(서버) + Zustand(클라) | 전역 상태를 서버 캐시로 착각하는 사고 차단 |
| 문서 | 코드와 함께 변하면 GitHub, 사람과 함께 변하면 Notion | 이중 관리 금지 |

---

## 4. Week 0 착수 순서 (FE 기준, 이대로만 하면 됨)

1. [ ] `docs/07-pre-dev-decisions.md`의 **FE 단독 결정 표를 혼자 30분 안에 확정**
2. [ ] 같은 문서의 **팀 합의 필요 표**(인증·에러포맷·페이지네이션)를 킥오프 회의 안건으로 올림
3. [ ] 되돌리기 비싼 결정 3건 ADR로 기록 (`0001`~`0003` 초안 수정)
4. [ ] `ondo-web` 레포 생성 → `docs/02-folder-structure.md` 트리대로 스캐폴딩
5. [ ] `.github/` 템플릿 4종 + CODEOWNERS + CI 복사, `main` 브랜치 보호 설정
6. [ ] BE에 `openapi.yaml` 스켈레톤 + 스테이징 도메인 요청 → 받기 전까지 **MSW로 착수**
7. [ ] Notion에 [docs/06-docs-structure.md](docs/06-docs-structure.md) 구조대로 페이지 생성

---

*작성: 2026-08-03 · 범위: Frontend*

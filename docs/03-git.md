# 03. 브랜치 전략 · Git Convention · PR/Issue 템플릿 · P0

---

## 브랜치 전략

### 결론: 2-tier + 기능 브랜치

```
main    ─── 항상 배포 가능. 데모/중간발표는 무조건 여기. 보호됨. 직접 push 금지
  ↑ (PR, squash merge)
dev     ─── 통합 브랜치. 고정 Preview 도메인 연결. 여기가 깨져도 데모는 안 죽음
  ↑ (PR, squash merge)
feat-*  ─── 기능 브랜치. 수명 3일 이내
```

### 왜 git-flow가 아닌가

`release/*`, `hotfix/*`까지 쓰는 git-flow는 **버전 릴리스를 배포하는 패키지**에 맞는 모델이다. 우리는 Vercel에 상시 배포하는 웹앱이고 FE가 1명이다. 브랜치를 5종류 유지하는 순간 머지 방향을 헷갈려서 실수가 난다.

### 왜 GitHub Flow(main 단독)도 아닌가

마에스트로는 **중간발표·데모 일정이 고정**되어 있다. `main` 하나만 쓰면 데모 전날 작업 중인 코드가 데모 브랜치에 섞인다. `dev`가 그 완충 역할을 한다.

### 브랜치 네이밍

```
<type><이슈번호>-<요약>

feat-12-product-list
fix-31-order-total-nan
chore-45-eslint-config
refactor-52-product-form
```

- `type`은 커밋 타입과 동일한 집합 사용
- **이슈번호 필수.** 이슈 없는 브랜치는 만들지 않는다 (= 추적 안 되는 작업 금지)
- 소문자 + 하이픈만. `/`를 쓰지 않는 이유: Vercel preview 서브도메인이 잘리는 경우가 있고, 일부 도구에서 이스케이프가 필요하다

### 브랜치 규칙

| 규칙                  | 값                                                  |
| --------------------- | --------------------------------------------------- |
| 기능 브랜치 수명      | **최대 3일**. 넘으면 쪼갠다                         |
| 동시 진행 브랜치      | **최대 2개**. 1명이 3개를 병렬로 하면 전부 늦어진다 |
| `dev` → `feat` 동기화 | `git rebase dev` (merge commit 금지)                |
| `feat` → `dev`        | **Squash merge**                                    |
| `dev` → `main`        | **Merge commit** (릴리스 단위 이력 보존)            |
| 머지된 브랜치         | 즉시 삭제 (GitHub 자동 삭제 ON)                     |

### `main` 브랜치 보호 설정 (GitHub Settings → Rules)

- [x] Require a pull request before merging
- [x] Require status checks to pass — `ci` 통과 필수
- [x] Require branches to be up to date before merging
- [x] Block force pushes
- [ ] ~~Require approvals~~ → **끈다.** 아래 참조

### 1인 FE의 리뷰 문제 — 어떻게 할 것인가

FE가 1명이라 "승인 1명 필수"를 켜면 내 PR이 BE 사람 손에 인질로 잡힌다. 그렇다고 리뷰를 없애면 품질 게이트가 CI뿐이다. 현실적인 절충:

| PR 성격                                                       | 규칙                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 일반 기능/버그                                                | **CI green + PR 템플릿 셀프 체크 완료 → 셀프 머지 OK**                     |
| 아키텍처 변경 (폴더 구조, 상태관리, 라우팅 규칙, 의존성 추가) | **ADR 링크 필수 + BE 1명 이상 승인**. 코드가 아니라 "결정"을 리뷰받는 것   |
| API 연동 PR                                                   | BE 담당자를 **reviewer가 아니라 mention**으로 태그 (계약 어긋남 조기 발견) |

> 셀프 머지를 허용하는 대신 **PR 템플릿 체크리스트를 반드시 채운다.** 리뷰어가 없을 때 체크리스트가 리뷰어 역할을 한다.

---

## Git Convention

### 커밋 메시지 — Conventional Commits

```
<type>(<scope>): <subject> #이슈번호

<body>          # 선택. "왜"를 적는다. "무엇"은 diff에 있다
```

**규칙**

- `subject`는 **한국어 명령형/개조식, 50자 이내, 마침표 없음**
  - 팀 공용어가 한국어이므로 영어 강제 안 함. 다만 `type`/`scope`는 영어로 고정
- 본문은 72자에서 줄바꿈
- **이슈번호는 `subject` 끝에 붙인다.** 맨 앞에 두면 commitlint가 `type`을 파싱하지 못해 커밋이 거부된다
- **1커밋 = 1논리 변경.** "작업 중", "wip", "수정" 금지

**type (9종 고정, 이외 금지)**

| type       | 용도                                                             | 릴리스 노트 노출 |
| ---------- | ---------------------------------------------------------------- | ---------------- |
| `feat`     | 새 기능                                                          | ✅               |
| `fix`      | 버그 수정                                                        | ✅               |
| `refactor` | 동작 변화 없는 구조 개선                                         |                  |
| `style`    | 포맷팅, 세미콜론 등 (CSS 아님)                                   |                  |
| `design`   | **UI/스타일 변경** (CSS·레이아웃) — FE 프로젝트라 `style`과 분리 | ✅               |
| `docs`     | 문서                                                             |                  |
| `test`     | 테스트                                                           |                  |
| `chore`    | 빌드/설정/의존성                                                 |                  |
| `perf`     | 성능 개선                                                        | ✅               |

**scope (앱·패키지명으로 고정)**
`wholesale` `retail` `ui` `api` `shared` `config` `deps`

**예시**

```
feat(wholesale): 상품 등록 폼 색상·무늬 토글 그룹 추가
fix(retail): 주문 합계가 수량 0일 때 NaN으로 표시되는 문제 수정
design(ui): Button primary variant 호버 대비 개선
refactor(api): 상품 쿼리 훅을 queryKey 팩토리로 통일
chore(deps): next 15.1.0으로 업그레이드
```

**금지**

```
❌ update
❌ fix bug
❌ 수정
❌ feat: 상품 등록 + 주문 목록 + 스타일 수정   ← 3개 커밋으로 쪼갤 것
```

### commitlint 설정 (`commitlint.config.cjs`)

```js
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "style",
        "design",
        "docs",
        "test",
        "chore",
        "perf",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      ["wholesale", "retail", "ui", "api", "shared", "config", "deps"],
    ],
    "scope-empty": [2, "never"],
    "subject-max-length": [2, "always", 50],
    "subject-full-stop": [2, "never", "."],
  },
};
```

### husky + lint-staged

`.husky/pre-commit`

```sh
pnpm lint-staged
```

`.husky/commit-msg`

```sh
pnpm commitlint --edit $1
```

`package.json`

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

> `pre-push`에 `tsc --noEmit`을 걸고 싶겠지만 **걸지 마라.** 1인 개발에서 push가 40초씩 걸리면 push를 안 하게 된다. 타입체크는 CI에서.

### PR 제목 = 커밋 컨벤션 동일 형식

Squash merge 시 PR 제목이 커밋 메시지가 되므로 **PR 제목도 `type(scope): subject` 형식**을 지킨다. GitHub Action(`amannn/action-semantic-pull-request`)으로 검사 가능하지만, 1인 규모면 습관으로 충분.

### PR 크기 규칙 (기술 부채 방지의 핵심)

| 변경 라인 수 | 조치                                                        |
| ------------ | ----------------------------------------------------------- |
| ~400줄       | 정상                                                        |
| 400~800줄    | PR 본문에 **왜 못 쪼갰는지** 1줄 설명                       |
| 800줄+       | 쪼갠다. 예외: 코드젠 산출물, 초기 스캐폴딩, 의존성 lockfile |

---

## PR Template

→ 실제 파일: [`.github/pull_request_template.md`](../.github/pull_request_template.md)

설계 의도:

- **리뷰어가 없다는 전제**로 만들었다. 체크리스트가 리뷰어 대신 방어선 역할
- "스크린샷" 칸을 필수로 둔 이유: FE PR에서 시각 결과 없이 머지되면 회귀를 못 잡는다
- "이번에 하지 않은 것" 칸: 스코프 크립 방지 + 부채를 명시적으로 남기기 위함

## Issue Template

→ 실제 파일: [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/)

3종만 둔다. 더 늘리면 아무도 안 쓴다.

| 파일            | 용도                                          |
| --------------- | --------------------------------------------- |
| `1-feature.yml` | 기능 개발. 완료 조건(AC)을 필수 입력으로 강제 |
| `2-bug.yml`     | 버그. 재현 절차 필수                          |
| `3-chore.yml`   | 설정/리팩터/부채. `debt` 라벨 자동 부여       |

**이슈 운영 규칙**

- 이슈 없는 브랜치 금지 → 모든 작업이 추적된다
- 기능 이슈는 **1~3일 단위**로 쪼갠다. "상품 관리 개발" 같은 이슈는 만들지 않는다
- 라벨은 3축만: `type`(feat/fix/chore/debt) × `priority`(P0~P3) × `area`(wholesale/retail/ui/api)
- GitHub Projects 보드 1개, 컬럼 4개: `Backlog / This Week / In Progress / Done`

---

## 체크리스트

- [ ] `main`, `dev` 브랜치 생성 + `main` 보호 규칙 설정
- [ ] GitHub 설정: Squash merge만 활성화, "Automatically delete head branches" ON
- [ ] `.github/pull_request_template.md` 커밋
- [ ] `.github/ISSUE_TEMPLATE/` 4개 파일 커밋
- [ ] `.github/CODEOWNERS` 커밋
- [ ] husky + lint-staged + commitlint 설치 및 동작 확인 (일부러 잘못된 커밋 메시지로 테스트)
- [ ] 라벨 세트 생성
- [ ] GitHub Projects 보드 1개 생성 (컬럼 4개)
- [ ] `CONTRIBUTING.md`에 이 문서 요약본 20줄 작성

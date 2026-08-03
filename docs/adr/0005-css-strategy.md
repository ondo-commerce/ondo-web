# ADR-0005: 스타일링은 Tailwind CSS v4 + cva + shadcn 복사 방식으로 한다

- **Status**: **Accepted**
- **Date**: 2026-08-03
- **Decider**: Frontend 담당 (단독 결정)
- **관련**: [04 컴포넌트 전략](../04-component-strategy.md), [07 사전 결정 A7·A8](../07-pre-dev-decisions.md), ADR-0004

## 맥락

### 제약 조건

| 조건 | 값 | 스타일 선택에 미치는 영향 |
|---|---|---|
| 인원 | **FE 1명** | 학습·유지 비용이 곧 일정. 리뷰어 없음 |
| 기간 | 6개월 | 새 패러다임 학습에 쓸 여유 적음 |
| 앱 | 2개 (도매 어드민 / 소매 커머스) | **디자인 토큰을 두 앱이 공유**해야 함 |
| 렌더링 | **Next.js App Router (RSC)** | 🔴 런타임 CSS-in-JS의 생사가 여기서 갈린다 |
| 구조 | 모노레포. `packages/ui`를 **빌드 없이 소스로 노출**(ADR-0004) | 스타일이 앱 빌드 시점에 처리되어야 함 |
| SEO | 소매 앱은 Server Component 우선 | 스타일이 SSR을 막으면 안 됨 |

### 왜 지금 결정하나

`docs/07` A7의 **바꾸는 비용 = 🔴 높음**. 컴포넌트를 30개 만든 뒤 바꾸면 전부 다시 쓴다.
그리고 이 결정은 **A8(Radix + shadcn 복사 방식)과 묶여 있다** — shadcn/ui는 Tailwind 전제라, A7이 Tailwind가 아니면 A8도 같이 무너진다.

### 결정 대상이 사실 2개다

- **D1. 스타일 작성 방식** — Tailwind / CSS Modules / CSS-in-JS / 제로런타임
- **D2. (D1이 Tailwind일 때만) Tailwind v3 vs v4** — 아래 §부록. 현행 문서는 v3 전제로 쓰여 있다

---

## 후보

### A. Tailwind CSS + cva

유틸리티 클래스를 JSX에 직접 쓴다. 빌드 타임에 쓰인 클래스만 추출.

- **장점**
  - **RSC 완전 호환.** 런타임이 0이라 Server Component에 그대로 쓴다
  - `packages/ui`를 빌드 없이 소스로 노출하는 ADR-0004 구조와 마찰이 없다 (앱이 스캔해서 처리)
  - **A8(Radix + shadcn 복사)을 그대로 쓸 수 있다.** shadcn 컴포넌트를 붙여넣으면 끝
  - 클래스명 작명이 없다 — 1인 개발에서 생각보다 큰 절약
  - 채용 시장 점유율 1위. 포트폴리오·면접에서 설명 부담이 없다
- **단점**
  - JSX가 길어진다 (`cva`로 variant를 분리해 완화)
  - **모노레포 함정**: 공용 패키지 경로를 스캔 대상에 넣지 않으면 `packages/ui` 스타일이 **통째로 사라진다**. 에러 없이 조용히
  - 임의값(`p-[13px]`)을 방치하면 디자인 시스템이 무너진다 → 린트/리뷰로 막아야 함
- **평가**: 제약 6개 중 6개 통과

### B. CSS Modules

`Button.module.css` + `styles.button` 참조. Next.js 기본 내장.

- **장점**
  - **추가 의존성 0.** Next.js가 기본 지원, RSC 호환
  - 그냥 CSS라 학습 비용 없음. 복잡한 선택자·애니메이션이 자연스럽다
  - 클래스 스코프가 파일 단위로 격리됨
- **단점**
  - **디자인 토큰 공유 수단이 CSS 변수뿐**이다. 두 앱 + `packages/ui`에 토큰을 일관되게 먹이려면 규약을 직접 만들어야 함 (Tailwind는 preset이 그 역할)
  - variant 처리에 표준이 없다 → `cva` 같은 도구 없이 조건부 클래스 조립 코드가 늘어난다 ([04 §1이 금지한 패턴](../04-component-strategy.md))
  - **A8(shadcn) 사용 불가.** Radix 위 스타일을 전부 직접 작성 → primitive 8종 + Modal/Select/Tabs 접근성 스타일을 1인이 짠다
  - 파일이 2배 (`.tsx` + `.module.css`)
- **평가**: 기술적으로 문제없지만 **A8을 포기하는 비용이 크다**

### C. 런타임 CSS-in-JS (styled-components / emotion)

- **장점**
  - JS 값으로 스타일을 만들 수 있다 (props 기반 동적 스타일이 가장 자연스럽다)
  - 컴포넌트와 스타일이 한 파일
- **단점**
  - 🔴 **RSC에서 못 쓴다.** 스타일 계산에 런타임이 필요해 모든 컴포넌트에 `"use client"`가 붙는다 → **소매 앱의 SEO·초기 로딩 전략(A17)이 통째로 무너진다**
  - Next.js 공식 문서가 App Router에서 권장하지 않는다. styled-components는 유지보수 모드
  - 런타임 스타일 계산 = 번들 증가 + 렌더 비용
- **평가**: **App Router라는 제약 하나로 탈락.** [07 A7](../07-pre-dev-decisions.md)의 "CSS-in-JS 금지"가 이 근거

### D. 제로런타임 CSS-in-JS (vanilla-extract / Panda CSS / StyleX)

TS로 스타일을 쓰되 **빌드 타임에 정적 CSS로 뽑는다.**

- **장점**
  - **RSC 호환** (런타임 0)
  - **타입 안전한 디자인 토큰.** 토큰 오타가 컴파일 에러로 잡힌다 — Tailwind보다 강한 지점
  - 스타일도 TS라 로직과 자연스럽게 붙는다
- **단점**
  - **번들러 플러그인 설정이 필요하다.** Next.js + Turbopack + 모노레포(`transpilePackages`로 소스 노출) 3중 조합에서 설정이 까다롭고, 깨지면 1인이 디버깅해야 한다
  - 생태계가 작다. 막혔을 때 검색으로 안 나온다
  - **A8(shadcn) 사용 불가**
  - 학습 곡선 — 6개월 일정에서 스타일 도구 학습에 쓸 시간이 아깝다
- **평가**: 기술적으로 가장 "옳은" 후보. 다만 **1인·6개월이라는 제약과 정면 충돌**

### E. 완성형 UI 라이브러리 (MUI / Ant Design / Mantine / Chakra)

- **장점**
  - 컴포넌트가 처음부터 다 있다. 도매 어드민(표·폼 중심)은 진도가 빠르다
  - 접근성이 기본 제공
- **단점**
  - **디자인 커스터마이징 비용이 어느 시점부터 직접 만드는 것보다 커진다.** 소매 커머스는 디자인 자유도가 필요
  - MUI/Chakra는 **런타임 CSS-in-JS 기반** → C의 RSC 문제를 그대로 상속 (Ant Design·Mantine은 사정이 다름)
  - 번들 크기. 소매 앱은 모바일 + SEO라 민감
  - **ADR-0004의 `packages/ui` 구조가 의미를 잃는다** — 공유할 게 라이브러리 래퍼뿐
- **평가**: 도매만 있었으면 유력. **소매(B2C, SEO, 디자인 자유도) 때문에 어긋난다**

---

## 비교표

| | A. Tailwind | B. CSS Modules | C. 런타임 CSS-in-JS | D. 제로런타임 | E. UI 라이브러리 |
|---|---|---|---|---|---|
| RSC 호환 | ✅ | ✅ | ❌ | ✅ | △ (라이브러리별) |
| 모노레포 토큰 공유 | ✅ preset | △ CSS 변수 수동 | ✅ | ✅ 타입 안전 | △ theme provider |
| `packages/ui` 소스 노출과 궁합 | ✅ | ✅ | ❌ | △ 플러그인 설정 | ✅ |
| A8 (Radix+shadcn) 재사용 | ✅ | ❌ | ❌ | ❌ | ❌ (대체됨) |
| 학습 비용 | 낮음 | **없음** | 낮음 | **높음** | 중간 |
| 디자인 자유도 | 높음 | 높음 | 높음 | 높음 | **낮음** |
| 번들 영향 | **거의 0** | 0 | 큼 | 0 | 큼 |
| 생태계·검색 가능성 | **최상** | 최상 | 상 | 하 | 상 |
| 초기 진도 속도 | 상 | 중 | 중 | 하 | **최상** |

## 판단 포인트 3개

1. **App Router를 쓴다면 C와 (MUI·Chakra 계열) E는 실질적으로 탈락**이다. 취향 문제가 아니라 SEO 전략이 깨진다.
2. **A8(Radix + shadcn 복사)을 유지할 거면 사실상 A뿐이다.** shadcn 생태계가 Tailwind 전제다. B·D를 고르면 primitive 8종과 Modal/Select/Tabs 접근성 스타일을 **직접 짜는 일정**이 추가된다.
3. **D는 "더 옳지만 더 비싸다".** 타입 안전 토큰은 실제 이점이지만, 얻는 대가가 번들러 설정 디버깅과 학습 시간이다. FE 2명 이상이면 후보였을 것.

---

## 결정

**A(Tailwind CSS) 를 채택한다. 버전은 v4.**

함께 확정하는 하위 규칙 4개:

1. **토큰 이름은 shadcn 규약을 따른다** — `--color-primary-foreground`, `--color-background`, `--color-border`.
   `docs/04`의 `-fg` 표기는 폐기. shadcn 컴포넌트를 붙여넣을 때마다 클래스명을 고쳐야 하면 "복사해서 소유" 이점이 사라진다.
2. **작업 순서: 토큰 정의 → shadcn 복사.** 반대로 하면 shadcn 기본 토큰과 자체 토큰이 공존해 어느 쪽이 진짜인지 알 수 없게 된다.
3. **`@apply` 금지.** 추상화 단위는 CSS 클래스가 아니라 React 컴포넌트이고, variant 분기는 `cva`가 맡는다.
   `@apply`로 클래스를 만들면 Tailwind를 쓰면서 CSS 파일 관리 문제를 다시 만든다.
4. **`cn()` = `clsx` + `tailwind-merge`.** `tailwind-merge`가 없으면 호출부에서 `className`으로 여백을 덮어쓸 수 없다(시트 순서가 이기므로). [04 §1](../04-component-strategy.md)의 "className을 마지막에 병합" 규칙이 성립하려면 필수.

C(런타임 CSS-in-JS)와 MUI/Chakra 계열 E는 **App Router 비호환으로 후보에서 제외**한다.

## 결과

**좋아지는 것**
- RSC 전략([07 A17](../07-pre-dev-decisions.md))이 그대로 유지된다. 소매 앱의 Server Component fetch·SEO에 스타일이 제약을 걸지 않는다
- [A8(Radix + shadcn 복사)](../07-pre-dev-decisions.md)이 그대로 성립 → primitive 8종과 Modal/Select/Tabs 접근성 스타일을 직접 짜는 일정이 사라진다
- v4에서 `@theme` 토큰이 **CSS 변수로 자동 노출**되므로, v3에서 필요했던 `hsl(var(--primary))` 2중 구조가 불필요해진다 → [07 C](../07-pre-dev-decisions.md)의 "다크모드는 나중에 싸게" 가 더 싸진다
- 막혔을 때 검색으로 답이 나온다. FE 1명 환경에서 실질적인 이점

**나빠지는 것 / 감수하는 비용**
- **타입 안전한 토큰을 포기한다.** `bg-primry` 오타는 컴파일이 아니라 화면으로만 잡힌다 (Panda/vanilla-extract 대비 명확한 손해)
- JSX가 길어진다. `cva`로 variant를 분리해 완화하되, 완전히 사라지진 않는다
- **임의값(`p-[13px]`, `bg-[#3B82F6]`)을 방치하면 디자인 시스템이 무너진다.** 린트/리뷰 체크리스트로 막아야 하는 지속 비용
- v4 브라우저 하한: **Safari 16.4+ / Chrome 111+ / Firefox 128+**. 이 미만에서는 스타일이 깨진다
- v3→v4로 `docs/02`·`docs/04`를 갱신해야 한다 (1회성)

**이 결정을 되돌려야 하는 신호**
- 토큰 오타로 인한 UI 버그가 반복적으로 운영까지 나간다 → 타입 안전 토큰(Panda) 재검토
- 소매 앱 트래픽에서 **Safari 16.4 미만 비중이 유의미하게** 잡힌다 → v3 다운그레이드 검토
- FE 인원이 3명 이상으로 늘고 디자인 시스템 전담이 생긴다 → 제로런타임 재검토 (당시 탈락 사유였던 "1인·6개월" 제약이 사라지므로)
- `cva` variant가 컴포넌트당 6개를 넘기 시작한다 → 스타일 도구가 아니라 **컴포넌트 경계 설계**의 문제. [04 승격 규칙](../04-component-strategy.md) 재점검

---

## 부록. D2 — Tailwind v3 vs v4 → **v4 채택**

현행 문서(`docs/02`, `docs/04`)는 **v3 문법 전제로 쓰여 있다.** 그런데 `create-next-app` 최신 버전은 **v4를 설치한다.** 그대로 진행하면 문서와 실제가 어긋난다.

| | v3 | v4 |
|---|---|---|
| 설정 위치 | `tailwind.config.ts` (JS 객체) | **CSS 파일 안** `@theme { }` |
| 스캔 대상 | `content: [...]` 배열에 **직접 명시** | 자동 감지 + `@source "..."` 로 추가 |
| 모노레포 공용 패키지 | `content`에 `../../packages/ui/src/**` 추가 | `@source "../../../packages/ui/src"` 추가 |
| 토큰 공유 | `tailwind-preset.ts`를 두 앱이 import | 공용 CSS를 `@import` |
| 빌드 속도 | — | 크게 빠름 (Rust 엔진) |

> ⚠️ **함정은 v3·v4 둘 다 동일하다.** 공용 패키지 경로를 스캔 대상에 넣지 않으면 `packages/ui`의 클래스가 **에러 없이 전부 사라진다.** 문법만 다르다.

### v4를 고른 이유

- `create-next-app`이 이미 v4를 설치한다. v3로 가려면 수동 다운그레이드
- shadcn이 v4를 지원한다 (`@theme inline` + oklch) → A8에 지장 없음
- `@theme` 토큰이 CSS 변수로 자동 노출 → v3의 2중 구조가 불필요
- 6개월짜리 신규 프로젝트를 이미 대체된 버전으로 시작할 이유가 없다

### 🔴 v3 기억으로 짜면 틀리는 지점

| v3 | v4 |
|---|---|
| `shadow-sm` | `shadow-xs` (**스케일이 한 칸 밀렸다**) |
| `shadow` | `shadow-sm` |
| `rounded-sm` / `rounded` | `rounded-xs` / `rounded-sm` |
| `bg-opacity-50` | `bg-black/50` |
| `outline-none` | `outline-hidden` |
| `border` 기본색 `gray-200` | **`currentColor`** (색을 항상 같이 쓸 것) |
| `ring` 기본 3px / `blue-500` | 1px / `currentColor` |

에러가 나지 않고 **"디자인이 미묘하게 다르다"** 로만 나타난다.

### 갱신 대상 문서

| 위치 | v3 → v4 |
|---|---|
| [02 트리](../02-folder-structure.md) | `tailwind.config.ts` 항목 삭제 |
| [02:33](../02-folder-structure.md) | `content` 배열 → `@source` |
| [04 §디자인 토큰](../04-component-strategy.md) | `tailwind-preset.ts` 상속 → 공용 CSS `@import` |
| [04 §디자인 토큰](../04-component-strategy.md) | `hsl(var(--primary))` 2중 구조 → `@theme` 직접 선언 |
| [04 토큰명](../04-component-strategy.md) | `primary.fg` → `--color-primary-foreground` |
| [07 A7](../07-pre-dev-decisions.md) | "Tailwind + cva" → "Tailwind **v4** + cva" (확정 표시) |

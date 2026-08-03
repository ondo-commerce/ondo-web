# 04. 공통 컴포넌트 설계 전략 · P1

## 1인 FE에서 공통 컴포넌트가 실패하는 방식

두 가지뿐이다.

1. **너무 일찍 추상화** — 화면 2개 보고 "재사용될 것 같다"며 `packages/ui`에 넣는다. 3번째 화면에서 요구가 달라 prop 12개짜리 괴물이 된다.
2. **끝까지 추상화 안 함** — 복붙으로 버티다가 디자인 토큰이 바뀌는 순간 30개 파일을 손으로 고친다.

**해법은 "언제 올릴지"를 규칙으로 못 박는 것.** 감으로 판단하지 않는다.

---

## 3계층 구조

```
packages/ui/primitives/     ← 원자. 도메인 지식 0. 두 앱 공용
packages/ui/patterns/       ← primitive 조합. 도메인 지식 0. 두 앱 공용
apps/*/src/shared/components/  ← 한 앱 안에서만 공용. 앱 특성 있음
apps/*/src/features/*/components/  ← 그 도메인 전용. 대부분의 코드가 여기
```

| 계층 | 판단 기준 | 예시 | 도메인 타입 import |
|---|---|---|---|
| **primitives** | HTML 요소 대체재 수준. `Product`를 몰라도 됨 | Button, Input, Select, Checkbox, Modal, Toast, Badge, Spinner, Table, Tabs | ❌ 금지 |
| **patterns** | primitive 2개 이상 조합, 여전히 도메인 무지 | FormField, ConfirmDialog, Pagination, SearchInput, DataTable, FileDropzone | ❌ 금지 |
| **shared/components** | 이 앱의 레이아웃·정책이 박힘 | AppShell, PageHeader, EmptyState, ErrorFallback | 앱 공통 타입만 |
| **feature/components** | 도메인 전용 | ProductTable, ProductForm, OrderStatusBadge | ✅ 당연 |

> **`packages/ui`가 `Product` 타입을 import 하는 순간 설계가 깨진 것이다.** 도메인이 필요하면 `feature`에 두거나, 제네릭/렌더prop으로 도메인을 밖으로 밀어낸다.

---

## 승격 규칙

**Rule of Two.** 일반적으로 "Rule of Three(3번 중복되면 추상화)"를 쓰지만, **FE 1명이면 Rule of Two로 당긴다.**
이유: 리뷰어가 없어서 중복이 3개까지 늘어난 걸 아무도 지적해주지 않는다. 그 사이 3개가 서로 다르게 변형된다.

```
[신규 컴포넌트]
      │
      ├─ 이 화면에서만 쓴다        → features/<domain>/components/
      │
      ├─ 같은 앱의 다른 화면에서   → 2번째 사용처가 생긴 그 PR에서
      │   또 필요해졌다              shared/components/ 로 이동
      │
      └─ 다른 앱에서도 필요해졌다  → packages/ui/ 로 승격
          + 도메인 지식이 없다        (도메인 지식 있으면 ❌ — 각 앱에 복붙 유지)
```

### 승격 판단 3문항 (전부 YES일 때만 올린다)

1. 실제 사용처가 **2곳 이상**인가? (앞으로 쓸 것 같다 ❌)
2. 두 사용처의 **동작이 실제로 같은가**? 겉모습만 비슷한 게 아니라?
3. 도메인 타입 없이 표현 가능한가?

**2번이 NO면 복붙을 유지한다.** 겉모습만 같은 두 컴포넌트를 합치면 반드시 `variant` + `isXxx` prop이 불어난다.

### 강등도 규칙에 넣는다
`packages/ui` 컴포넌트에 **앱 이름이 들어간 prop이 생기면**(`isWholesale`, `retailMode`) 잘못 올라온 것이다. 그 즉시 각 앱으로 내리고 복제한다.

---

## 컴포넌트 작성 규칙

### 1) variant는 `cva`로, 조건부 className 조립 금지

```tsx
// packages/ui/primitives/Button.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const button = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-fg hover:bg-secondary-hover",
        ghost: "hover:bg-muted",
        danger: "bg-danger text-danger-fg hover:bg-danger-hover",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  isLoading?: boolean;
}

export function Button({ className, variant, size, isLoading, children, ...props }: ButtonProps) {
  return (
    <button className={cn(button({ variant, size }), className)} disabled={isLoading || props.disabled} {...props}>
      {isLoading && <Spinner className="mr-2 size-4" />}
      {children}
    </button>
  );
}
```

**규칙**
- 모든 primitive는 **네이티브 props를 확장**한다 (`extends React.XxxHTMLAttributes`). `onFocus` 하나 때문에 컴포넌트를 고치는 일이 없어야 함
- `className`을 **마지막에 `cn()`으로 병합**해서 호출부가 여백을 조정할 수 있게 한다
- boolean prop 남발 금지. 3개 넘어가면 `variant`로 통합
- 🔴 **`@apply` 금지** (ADR-0005). `.btn-primary { @apply ... }` 로 클래스를 만들면 Tailwind를 쓰면서 CSS 파일 관리 문제를 다시 만든다 — 클래스명 작명이 돌아오고, JSX만 보고 스타일을 알 수 없어진다. **추상화 단위는 CSS 클래스가 아니라 React 컴포넌트이고, variant 분기는 `cva`가 맡는다**
- `cn()` = `clsx` + `tailwind-merge`. **`tailwind-merge`가 충돌 해결(`px-4` + `px-2` → 뒤엣것)을 담당**하므로, 이게 없으면 위의 "className을 마지막에 병합" 규칙이 실제로 동작하지 않는다 (CSS 우선순위는 작성 순서가 아니라 시트 순서라서)

### 2) 합성(Composition) 우선, prop 폭발 금지

```tsx
// ❌ prop으로 다 받는 방식 — 요구가 늘 때마다 prop이 늘어난다
<Modal title="확인" description="..." confirmText="삭제" onConfirm={fn} showCloseButton hideFooter />

// ✅ 합성
<Modal open={open} onOpenChange={setOpen}>
  <Modal.Header>주문 취소</Modal.Header>
  <Modal.Body>이 주문을 취소할까요?</Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" onClick={close}>닫기</Button>
    <Button variant="danger" onClick={cancel}>취소하기</Button>
  </Modal.Footer>
</Modal>
```

**prop 7개를 넘으면 합성으로 바꿀 신호.**

### 3) 접근성·동작이 어려운 것은 직접 만들지 않는다

Modal, Select, Combobox, Tabs, Tooltip, Popover, Dropdown은 **Radix UI 위에 스타일만 입힌다** (= shadcn/ui 방식, 코드를 레포에 복사해 소유).
포커스 트랩·키보드 내비·ARIA를 1인 FE가 6개월 안에 직접 만들 이유가 없다.

직접 만드는 것: Button, Input, Badge, Card, Spinner, Table 같은 **표현 전용 요소**.

### 4) Server/Client 경계

- `packages/ui` 컴포넌트는 **상태가 필요할 때만** 파일 최상단에 `"use client"`
- Button, Badge, Card처럼 상태 없는 건 client 지시어를 붙이지 않는다 → Server Component에서도 그대로 쓸 수 있다

### 5) 폼 컴포넌트는 react-hook-form에 결합하지 않는다

```tsx
// ✅ primitive는 순수하게 (value/onChange만)
<Input value={v} onChange={...} />

// ✅ RHF 결합은 patterns 레이어에서
<FormField control={control} name="price" label="단가" >
  {(field) => <Input {...field} />}
</FormField>
```
primitive가 `useFormContext`를 부르면 폼 밖(필터바, 검색창)에서 못 쓴다.

---

## 디자인 토큰 (Tailwind v4 — ADR-0005)

`packages/ui/src/styles/theme.css` **하나에서만** 정의하고 두 앱이 `@import` 한다.
v4는 `tailwind.config.ts`가 없다. 설정이 곧 CSS다.

```css
/* packages/ui/src/styles/theme.css */
@theme {
  --color-background:           oklch(1 0 0);
  --color-foreground:           oklch(0.15 0 0);
  --color-primary:              oklch(0.62 0.19 259);
  --color-primary-foreground:   oklch(0.98 0 0);
  --color-muted:                oklch(0.96 0 0);
  --color-muted-foreground:     oklch(0.55 0 0);
  --color-destructive:          oklch(0.58 0.22 27);
  --color-border:               oklch(0.92 0 0);
  --color-ring:                 oklch(0.62 0.19 259);

  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
```

```css
/* apps/wholesale/src/app/globals.css */
@import "tailwindcss";
@import "@ondo/ui/styles/theme.css";
@source "../../../../packages/ui/src";   /* 빠뜨리면 공용 스타일이 조용히 사라진다 */
```

**v4에서 달라진 점** — `@theme`에 선언한 토큰은 **자동으로 런타임 CSS 변수가 된다.**
`bg-primary` 클래스로도 쓰고, 임의 CSS에서 `var(--color-primary)`로도 쓴다.
v3처럼 CSS 변수를 따로 정의하고 config에서 `hsl(var(--primary))`로 참조하는 2중 구조가 **필요 없다.**
→ 다크모드는 나중에 `.dark { --color-background: ... }` 로 변수만 덮어쓰면 된다 ([07 C](07-pre-dev-decisions.md)).

**규칙**
- **토큰 이름은 shadcn 규약을 따른다** (`-foreground`, `background`, `border`, `ring`, `destructive`).
  이름이 다르면 shadcn 컴포넌트를 붙여넣을 때마다 클래스명을 5~10군데씩 고쳐야 한다 → "복사해서 소유"의 이점이 사라진다
- **순서: 토큰 정의 → shadcn 복사.** 반대로 하면 shadcn 기본 토큰과 자체 토큰이 공존해 어느 쪽이 진짜인지 알 수 없게 된다
- 컴포넌트 코드에 **원시 색상값 금지**: `bg-[#3B82F6]`, `text-blue-500` ❌ → `bg-primary` ✅
  - ESLint 또는 코드리뷰 체크리스트로 잡는다
- 여백은 Tailwind 기본 스케일(4px 배수)만. 임의값 `p-[13px]` 금지
- 타이포는 5단계로 제한: `text-xs / sm / base / lg / xl`. 그 이상 필요하면 디자이너와 먼저 합의
- **Figma 변수명과 토큰명을 같게 맞춘다.** 이름이 다르면 매번 번역하다가 어긋난다

> ⚠️ **v3 감각으로 짜면 틀리는 지점** — v4에서 `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded`→`rounded-sm` 으로 **스케일 이름이 한 칸 밀렸다.**
> `border` 기본색도 `gray-200`이 아니라 `currentColor`다 (`border border-border`처럼 색을 같이 쓸 것).
> 전체 목록은 [ADR-0005 부록](adr/0005-css-strategy.md).

---

## 도매 / 소매 UI 차이 처리

두 앱은 사용자도 기기도 다르다. **같아 보인다고 무리해서 합치지 않는다.**

| | wholesale (도매 판매자) | retail (소매 구매자) |
|---|---|---|
| 주 기기 | 데스크톱 | 모바일 |
| 성격 | 어드민 (밀도 높음, 표 중심) | 커머스 (여백 넓음, 카드 중심) |
| 기본 렌더링 | Client + TanStack Query | Server Component 우선 |

→ `packages/ui`는 **primitive와 토큰만 공유**하고, 레이아웃·밀도·페이지 구성은 각 앱이 따로 갖는다.
`Table`은 공유하되 `ProductTable`은 공유하지 않는다.

---

## Storybook — 언제 도입하나 (P2)

- **primitive가 8개 이상 쌓인 뒤에** 도입한다. 그 전엔 실제 화면이 곧 문서다
- 대상은 `packages/ui`만. feature 컴포넌트는 등록하지 않는다 (유지비만 나감)
- story는 `variant` 전수 나열 1개 + 상호작용 1개, 총 2개면 충분

---

## 체크리스트

- [ ] `packages/ui/src/styles/theme.css`에 `@theme` 토큰 정의(shadcn 규약 이름), 두 앱 `globals.css`에서 `@import` + `@source`
- [ ] Figma 변수명 ↔ 토큰명 매핑 표 1장 (Notion)
- [ ] `packages/ui` 생성, `cn()` + cva 패턴 확정
- [ ] primitive 8종 구현: Button, Input, Select, Checkbox, Modal, Toast, Badge, Spinner
- [ ] Radix 기반으로 만들 목록 확정 (Modal, Select, Tabs, Tooltip, Dropdown)
- [ ] `packages/ui`에서 도메인 타입 import 금지를 ESLint로 강제
- [ ] Rule of Two를 `CONTRIBUTING.md`에 3줄로 명시
- [ ] (P2) 승격 그루밍 1회 — 중복 2회 이상 컴포넌트 찾아 이동
- [ ] (P2) Storybook 도입 판단

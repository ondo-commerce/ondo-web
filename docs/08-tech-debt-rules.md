# 08. 기술 부채를 줄이기 위한 규칙 · P1

## 전제

1인 FE·6개월에서 **부채는 반드시 생긴다.** 목표는 "부채 0"이 아니라
> **부채를 눈에 보이게 만들고, 이자가 복리로 붙는 종류만 골라 막는 것.**

이자가 복리인 부채 3가지: **타입 구멍 / 중복 / 경계 위반.** 나머지는 나중에 갚아도 싸다.

---

## 규칙 1. 기계가 막을 수 있는 건 사람이 지키지 않는다

리뷰어가 없으므로 **린트·타입·CI가 유일한 리뷰어다.** 규칙은 문서가 아니라 설정에 넣는다.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // arr[0]이 T|undefined가 된다. 나중에 켜면 못 켠다
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

```js
// eslint — error로 둘 것 (warn은 아무도 안 본다)
rules: {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-non-null-assertion": "error",   // foo!.bar 금지
  "@typescript-eslint/no-floating-promises": "error",    // await 누락
  "no-console": ["error", { allow: ["warn", "error"] }],
  "no-restricted-imports": [/* feature 경계 → 02 문서 */],
  "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": true, "ts-expect-error": "allow-with-description" }],
}
```

**`@ts-ignore`는 금지, `@ts-expect-error`는 설명 필수로 허용.**
`ts-expect-error`는 문제가 해결되면 스스로 에러가 나서 사라진다. `ts-ignore`는 영원히 남는다.

### 탈출구는 열어두되 비용을 붙인다
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- #57 openapi 스키마 누락, 스펙 확정 후 제거
```
- disable 주석에는 **이슈 번호 + 사유**가 없으면 CI에서 실패시킨다 (`eslint-comments/require-description`)
- 이슈 번호가 붙어야 부채가 백로그에 나타난다

---

## 규칙 2. TODO는 코드가 아니라 이슈에 산다

```ts
// ❌ TODO: 나중에 에러 처리
// ✅ TODO(#57): 재고 0일 때 문구 분기 — 기획 확정 대기
```
- 이슈 번호 없는 `TODO`/`FIXME`는 **CI에서 실패**시킨다 (grep 스텝 한 줄)
- PR 템플릿의 "이번에 하지 않은 것" 칸에 적고 → 이슈를 만들고 → 번호를 코드에 남긴다

```yaml
# ci.yml에 추가할 스텝
- name: bare TODO check
  run: |
    ! grep -rnE "(TODO|FIXME)(?!\(#[0-9]+\))" --include="*.ts" --include="*.tsx" -P apps packages \
      || (echo "::error::TODO에 이슈 번호를 붙이세요: TODO(#123)" && exit 1)
```

---

## 규칙 3. 중복은 2번까지 허용, 3번째는 금지

→ [04 Rule of Two](04-component-strategy.md#승격-규칙)

- 같은 코드를 **3번째 복사하려는 순간** 멈추고 승격 이슈를 만든다
- 단, **"겉모습만 같은 것"은 중복이 아니다.** 억지 통합이 더 비싼 부채가 된다

---

## 규칙 4. PR을 작게 — 부채 예방의 80%

| 규칙 | 값 |
|---|---|
| PR 변경 라인 | 400줄 이하 (초과 시 사유 기재, 800줄 초과 시 분할) |
| 브랜치 수명 | 3일 이내 |
| 동시 진행 브랜치 | 2개 이하 |
| 1 PR = 1 목적 | 리팩터 + 기능을 한 PR에 섞지 않는다 |

**"지나가다 보여서 같이 고쳤어요"를 금지한다.** 보이스카웃 규칙은 리뷰어가 있는 팀의 것이다. 1인 개발에서 무관한 수정이 섞이면 나중에 revert가 불가능해진다. 별도 `chore` 이슈로 남긴다.

---

## 규칙 5. 의존성 추가에 마찰을 만든다

패키지 추가 전 3문항:
1. Next.js/React 표준 기능으로 30줄 안에 되나? → 되면 직접 짠다
2. 번들에 몇 KB 늘어나나? (bundlephobia 확인)
3. 마지막 릴리스가 1년 이상 됐나? → 그러면 안 쓴다

- 추가 시 **PR 본문에 사유 + 번들 영향 기재** (템플릿에 칸 있음)
- 같은 목적의 라이브러리 2개 공존 금지 (dayjs + date-fns, axios + fetch 래퍼)
- 애니메이션·차트·에디터처럼 무거운 건 반드시 **dynamic import**

---

## 규칙 6. 죽은 코드는 즉시 삭제한다 (주석 처리 금지)

- 주석 처리한 코드 블록 금지. **git이 기억한다**
- 안 쓰는 컴포넌트·훅·유틸은 지운다. `knip`을 P2에 도입해 미사용 export 탐지
- 기능 플래그로 꺼둔 코드는 **제거 기한을 코드에 적는다**: `// FLAG(#88): 2026-10-01까지 제거`

---

## 규칙 7. 테스트 범위

**좁게 고정한다.** 커버리지 목표는 1인 FE에서 그 자체가 부채가 된다. **쓸 것만 쓴다.**

| 대상 | 도구 | 개수 |
|---|---|---|
| 핵심 유저 플로우 | Playwright E2E | **3개만** (로그인 / 상품 등록 / 주문 생성) |
| 순수 함수 (가격 계산, 포맷터, 검증) | Vitest | 로직 있는 것 전부 |
| 컴포넌트 렌더 테스트 | — | **안 한다** (타입 + E2E가 대체) |
| API 훅 | — | **안 한다** (MSW + E2E로 커버) |

> 이유: 컴포넌트 렌더 테스트는 UI가 자주 바뀌는 초기 6개월에 **깨지는 비용 > 잡는 버그**다. 대신 **가격·수량·재고 계산 로직은 반드시 테스트한다.** 커머스에서 돈 계산이 틀리면 그건 부채가 아니라 사고다.

---

## 규칙 8. 주 1회 15분 부채 그루밍

매주 금요일 15분, 혼자서:
1. `debt` 라벨 이슈 훑기
2. 이번 주 새로 생긴 부채 이슈화 (PR "하지 않은 것" 칸에서 수집)
3. **P1 부채 1개를 다음 주 작업에 끼워 넣기**

> 규칙: **스프린트마다 부채 이슈 1개는 반드시 처리.** 0개인 주가 3주 연속이면 그 뒤엔 못 갚는다.

---

## 규칙 9. 성능 예산을 숫자로

| 항목 | 예산 | 확인 |
|---|---|---|
| 첫 로드 JS (retail) | < 200KB gzip | `@next/bundle-analyzer` |
| LCP (모바일, retail 상품 목록) | < 2.5s | Vercel Analytics |
| 이미지 | `next/image` 필수, 원본 `<img>` 금지 | ESLint `@next/next/no-img-element` |

숫자가 없으면 "느린 것 같은데"로 끝나고 아무도 안 고친다.

---

## 규칙 10. 부채를 남길 땐 3가지를 같이 남긴다

의도적으로 부채를 지는 건 괜찮다. **숨기는 게 문제다.**

```
1. 무엇을 (하드코딩한 배송비 3000원)
2. 왜 (정책 미확정, 기획 대기)
3. 언제 갚나 (#57, 정책 확정 후 / 늦어도 중간발표 전)
```
→ PR 본문 "이번에 하지 않은 것" + `chore` 이슈 + 코드 `TODO(#57)`. **3곳 다.**

---

## 안티패턴 모음 (이 프로젝트에서 실제로 나올 것들)

| ❌ | ✅ |
|---|---|
| API 응답 타입을 손으로 선언 | openapi 코드젠 타입 사용 → [05](05-api-contract.md) |
| `as` 캐스팅으로 타입 에러 무마 | zod로 런타임 검증 후 좁히기 |
| `useEffect`로 데이터 페칭 | TanStack Query |
| 서버 데이터를 Zustand에 복사 | Query 캐시가 원본. 복사하면 동기화 버그 |
| 페이지 최상단 `"use client"` | 잎 컴포넌트에만 |
| 컴포넌트 안에서 직접 `fetch` | `features/*/api/` 훅 경유 |
| 하드코딩된 색상·여백 | 토큰 → [04](04-component-strategy.md#디자인-토큰) |
| `try/catch` 없이 mutation | 전역 에러 핸들러 + 토스트 규약 |
| 매직 스트링 상태값 (`"배송중"`) | enum 상수 + 매핑 테이블 |
| 800줄짜리 페이지 컴포넌트 | feature 컴포넌트로 분해 |

---

## 체크리스트

- [ ] tsconfig strict + `noUncheckedIndexedAccess` ON
- [ ] ESLint 규칙 위 세트 `error`로 적용
- [ ] `eslint-comments/require-description` — disable 주석에 사유 강제
- [ ] CI에 bare TODO 검사 스텝 추가
- [ ] PR 템플릿의 "하지 않은 것" 칸 운영 시작
- [ ] `debt` 라벨 생성 + 주 1회 15분 그루밍 캘린더 등록
- [ ] 가격/수량 계산 유틸에 Vitest 테스트 (P1)
- [ ] E2E 3개 작성 (P2)
- [ ] 번들 예산 측정 1회 + CI 경고 (P2)
- [ ] `knip`으로 미사용 코드 1회 정리 (P2)

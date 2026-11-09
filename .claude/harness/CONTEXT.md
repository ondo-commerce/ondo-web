# 온도 하네스 공통 브리핑 — 도매(온도 ERP)

> **이 문서는 도매(`apps/wholesale`) 전용이다.**
> 소매(온도 마켓 / `apps/retail`) 작업은 이 문서 대신 **`CONTEXT-retail.md`**를 읽는다.
> 셸 구조·스크롤 규칙·SSOT 사양 파일이 서로 다르므로 **둘을 섞으면 안 된다.**

3단계(PM · FE · Verify)가 **회차 시작 전 반드시 읽는** 문서다.
에이전트끼리는 대화하지 않는다. 주고받는 것은 실행 디렉터리의 파일뿐이다.

---

## 1. 원본(SSOT) 우선순위

충돌하면 **위쪽이 이긴다.**

| 순위 | 원본 | 무엇의 원본인가 |
|---|---|---|
| 1 | `~/feature-spec/glossary.md` | 용어·상태값·업무 규칙·영문 코드명 |
| 2 | `~/feature-spec/wholesale_screen_spec.md` | 화면 확정 사양. 각 탭의 절 + §9(SSOT 조정 결과) |
| 3 | Figma 물보라 `vXFxONKv6pwXIdwpPsYSJq` | 화면에 **무엇이** 들어가는가 (필드·열·라벨·버튼) |
| 4 | `~/onDo/packages/ui/src/` + `apps/wholesale/src/shared/components/` | 화면이 **어떻게 보이는가** (셸·배치·스크롤·폭·컴포넌트) |
| 5 | `~/.claude/skills/ondo-design/` | 위에 없는 색·여백·타이포 값 |

**결정적 예외 — screen_spec §9.6.** 바깥 구조(셸·배치·스크롤·폭)는 **코드가 Figma를 이긴다.**
Figma는 아직 상단 GNB·1512px 고정·세로 1단 폼으로 그려져 있고 이건 폐기된 안이다.
반대로 **필드·상태값·업무 규칙은 여전히 Figma/SSOT가 이긴다.**

`~/.claude/skills/ondo-design/reference/ondo.css`는 **와이어프레임용**이다.
앱 코드에 그 CSS를 옮겨 붙이지 않는다 — 앱은 Tailwind v4 + `packages/ui`다.

---

## 2. 레포

**구조·커밋·브랜치·import 방향·색 토큰·`packages/ui` 읽기 전용은 `~/onDo/CLAUDE.md` 에 있다.**
세션마다 자동으로 읽히므로 여기 다시 적지 않는다.

이 회차에만 해당하는 것:

- 앱: `apps/wholesale` · 커밋 스코프 **`feat(wholesale):`** · dev `pnpm --filter wholesale dev`
- **선례: `apps/wholesale/src/features/product/`** — 폴더 구성·주석 밀도·네이밍의 기준이다.
  `apps/wholesale` 은 작업 대상이다.

## 3. 절대 규칙

2. **`Panel`이 화면의 유일한 표면이다.** 패널 밖에 본문을 두지 않는다. 스크롤은 `Panel.Body`만 받는다.
3. **화면 전체 스크롤 없음.** 검색줄·패널 제목·액션 버튼은 늘 같은 자리에 있어야 한다.
4. **Rule of Two.** 새 패턴은 처음 쓰는 탭 **안에** 둔다. 사용처가 2곳이 되는 PR에서 `packages/ui`로 올린다.
   지금 재고 탭 하나만 쓰는 컴포넌트를 `packages/ui`에 만들지 않는다.
7. **더미 데이터는 `fixtures.ts`에.** 컴포넌트 안에 데이터를 적지 않는다.
8. 주석은 **왜**를 적는다. 무엇은 코드에 있다. 한국어. `features/product/types.ts`가 밀도의 기준이다.

---

> **CLAUDE.md 와 훅이 대신 지키는 것** — feature 경계(ESLint) · 색 토큰 · `any`/`console.log` ·
> `packages/ui` 읽기 전용(PreToolUse 훅) · 저장 시 포맷(PostToolUse 훅) · 세션 끝 typecheck(Stop 훅).
> 여기 다시 적지 않는다. 규칙이 늘면 **문장이 아니라 장치를 먼저 만든다.**

## 4. 산출물 규약

실행 디렉터리: `~/onDo/.claude/harness/runs/<slug>/`

| 파일 | 쓰는 주체 | 읽는 주체 |
|---|---|---|
| `01-pm.md` | PM | FE · Verify |
| `02-fe.md` | FE | Verify |
| `03-verify.md` | Verify | 사용자 |
| **`findings.jsonl`** | Verify | **다음 회차 PM·Verify** · 결함 1건 = 한 줄, `exit` 없이 회차를 닫지 않는다 |

각 파일은 **다음 에이전트가 그것만 읽고 일할 수 있을 만큼** 자족적이어야 한다.
"위 문서 참고" 같은 문장으로 넘기지 않는다.

---

## 5. 재고 도메인 요약 (glossary §3 · §4.5)

- **SKU = 색상 × 사이즈.** 무늬 축은 폐기됐다.
- `현재고 stockOnHand` / `주문처리중 reservedQty` / `미송대기 backorderQty`
- **`판매가능 availableQty = 현재고 − 주문처리중 − 미송대기`** ← 마켓에 노출되는 값
- 가격 3필드: `판매가 salePrice` / `매입단가 purchaseUnitPrice`(입고 때 입력) / `평균원가 avgCostPrice`(이동평균, 읽기 전용)
- 재고 공식: `현재고 = 기초재고 + 재고입고 − 재고출고 ± 조정`
- **라벨 예외:** 재고 탭 변동 이력 유형만 `입고 / 출고 / 재고 조정` 3종. 코드는 `stockOut` 유지.
  재고 탭 **밖에서는** `출고`를 재고 뜻으로 쓰지 않는다(주문 이행 전용).

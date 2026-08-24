import type { AllocationDraft, BackorderLine, BackorderSku } from "./types";

/*
 * 미송 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 숫자가 좌측 목록 · 카운터 바 · 배분 표 · 우측 요약 **네 곳**에서 읽히는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다. 사장이 화면을 안 믿게 되는 지점이다.
 *
 * 기호: T = 총 미송 수량 · A = 가용재고 · b_i = 주문 i의 미송 수량 · x_i = 배분 수량 입력
 *
 *   배분 완료   = Σ x_i                       ← 입력 따라 실시간
 *   미배분      = T − Σ x_i  (= Σ 잔여 미송)   ← 입력 따라 실시간
 *   가용재고 A                                ← 입력과 무관하게 고정. 상한선이다
 *   잔여 미송_i = b_i − x_i
 *   항등식       미배분 + 배분 완료 = T
 *   제약         Σ x_i ≤ A     그리고     0 ≤ x_i ≤ b_i
 */

/** 총 미송 수량 `T` = Σ 미송 수량. SKU에 필드로 들고 있지 않고 항상 행에서 다시 센다 */
export function totalBackorderQty(lines: readonly BackorderLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

/**
 * 가용재고 `A` = 현재고 − 주문처리중. 미송에 **나눠줄 수 있는 실물**의 상한이다.
 *
 * ⚠️ **서버 계약 미확인 — glossary 미등재.** 이 수량의 정의는 아직 확정되지 않았다
 *    (2026-08-24 게이트 결정 G-1). 서버가 이 값을 내려줄지 FE가 두 필드로 계산할지도 미정이라
 *    glossary에 올리지 않고 이 탭 안에서만 `assignableQty`라는 이름으로 쓴다.
 *    화면 라벨은 Figma 실측대로 `가용재고`다.
 *
 * ⚠️ 재고 탭의 `판매가능`(= 현재고 − 주문처리중 − **미송대기**)이 아니다.
 *    저건 미송을 이미 뺀 값이라 배분 상한이 될 수 없고(미송이 재고보다 많으면 음수가 된다),
 *    재고 탭 `availableQty`는 그 음수를 감추지 않는다. 이름을 일부러 다르게 둔 이유다 —
 *    feature 경계상 import도 막혀 있지만, 같은 값으로 오해하는 쪽이 더 위험하다.
 */
export function assignableQty(sku: BackorderSku): number {
  return sku.stock - sku.reservedQty;
}

/** 배분 완료 = Σ 배분 수량 입력 */
export function allocatedQty(draft: AllocationDraft): number {
  return Object.values(draft).reduce((sum, qty) => sum + qty, 0);
}

/**
 * 미배분 = 총 미송 − 배분 완료.
 * **`T − A`가 아니다.** 목업에서는 `배분 완료 = 가용재고`라 두 값이 같아 보이지만,
 * `잔여 미송` 열의 합과 일치하는 쪽은 `T − 배분 완료`뿐이다.
 */
export function unallocatedQty(total: number, allocated: number): number {
  return total - allocated;
}

/** 잔여 미송_i = 미송 수량 − 배분 수량. 이 값들의 합이 곧 미배분이다 */
export function remainingQty(line: BackorderLine, allocated: number): number {
  return line.qty - allocated;
}

/**
 * 주문 일시 오래된 순 = 미송 경과일 큰 순. glossary §4.8의 "선착순이 기본형"이 이 정렬이다.
 * 화면에 정렬 컨트롤이 없으므로 이 순서가 유일한 순서다.
 *
 * `YYYY.MM.DD HH:mm`은 자릿수가 고정이라 문자열 비교만으로 시간순이 나온다 —
 * `new Date()`를 만들지 않는 편이 렌더 중 시각을 읽을 여지를 아예 없앤다.
 */
export function sortByOrderedAt(
  lines: readonly BackorderLine[],
): BackorderLine[] {
  return [...lines].sort((a, b) =>
    `${a.orderedDate} ${a.orderedTime}`.localeCompare(
      `${b.orderedDate} ${b.orderedTime}`,
    ),
  );
}

/**
 * 선착순 그리디 배분 — 오래된 주문부터 가용재고를 다 쓸 때까지 채운다.
 * `배분 수량` 입력칸의 **초기값**이자, 배분 확정 뒤 남은 행을 다시 채우는 값이다.
 * (화면에 `자동 배분` 버튼은 없다. 선착순은 정렬 + 이 초기값으로만 나타난다)
 */
export function firstComeAllocation(
  lines: readonly BackorderLine[],
  capacity: number,
): AllocationDraft {
  let rest = Math.max(0, capacity);
  const draft: AllocationDraft = {};
  for (const line of sortByOrderedAt(lines)) {
    const take = Math.min(line.qty, rest);
    draft[line.id] = take;
    rest -= take;
  }
  return draft;
}

/**
 * 배분 수량 한 칸을 고친 결과. **제약을 여기서 한 번만 건다** —
 * `0 ≤ x_i ≤ b_i` 이고 `Σ x_i ≤ A`. 화면은 막지 못한 값을 그리지 않는다.
 *
 * 넘치는 입력을 거절하지 않고 **상한으로 깎아서** 받는다. 거절하면 사장이 왜 안 써지는지
 * 모른 채 같은 키를 계속 누르지만, 깎아 주면 상한이 얼마인지가 그 자리에서 보인다.
 */
export function withAllocation(
  draft: AllocationDraft,
  lines: readonly BackorderLine[],
  capacity: number,
  lineId: string,
  next: number,
): AllocationDraft {
  const line = lines.find((l) => l.id === lineId);
  if (!line) return draft;

  const others = lines.reduce(
    (sum, l) => (l.id === lineId ? sum : sum + (draft[l.id] ?? 0)),
    0,
  );
  const ceiling = Math.min(line.qty, Math.max(0, capacity - others));
  return { ...draft, [lineId]: Math.min(Math.max(next, 0), ceiling) };
}

/**
 * 배분 수량 입력칸의 문자열 → 수량. **빈칸은 0이다.**
 * 재고 탭 `parseNumberInput`은 빈칸을 null로 돌려주지만(안 적은 것과 0원을 구분해야 해서),
 * 배분 수량에는 그 구분이 없다 — 안 적은 칸은 "이 주문엔 안 준다"는 뜻이라 0과 같다.
 * feature 경계를 넘지 않으려고 import 대신 규칙만 이 탭에 맞춰 새로 적었다.
 */
export function parseAllocationInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits === "" ? 0 : Number(digits);
}

/**
 * 주문 일시 표시(`7월 15일 09:30`).
 * fixtures의 `YYYY.MM.DD` + `HH:mm`을 문자열로만 조립한다 — `Date`를 만들면
 * 시간대에 따라 하루가 밀린다(재고 탭 fixtures의 UTC 주석과 같은 이유).
 */
export function formatOrderedAt(line: BackorderLine): string {
  const [, month = "", day = ""] = line.orderedDate.split(".");
  return `${Number(month)}월 ${Number(day)}일 ${line.orderedTime}`;
}

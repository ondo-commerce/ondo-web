import { isApiError } from "@ondo/api";
import { BACKORDER_ERROR_TEXT, PAGE_SIZE } from "./constants";
import type {
  AllocationDraft,
  AllocationRequest,
  Backorder,
  BackorderDetailView,
  BackorderLineView,
  BackorderList,
  BackorderSku,
  BackorderSkuView,
  BackorderStats,
  BackorderSummary,
  ExpectedInboundRequest,
} from "./types";
import { describeError } from "@/shared/api/describeError";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";

/*
 * 미송 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 숫자가 좌측 목록 · 카운터 바 · 배분 표 · 우측 요약 **네 곳**에서 읽히는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다. 사장이 화면을 안 믿게 되는 지점이다.
 *
 * 기호: T = 총 미송 수량(stats.backorderQty) · A = 가용재고(stats.availableQty) ·
 *       b_i = 미송 i의 잔여(remainingQty) · x_i = 배분 수량 입력
 *
 *   배분 완료   = Σ x_i                       ← 입력 따라 실시간
 *   미배분      = T − Σ x_i  (= Σ 잔여 미송)   ← 입력 따라 실시간
 *   가용재고 A                                ← 입력과 무관하게 고정. 상한선이다
 *   잔여 미송_i = b_i − x_i
 *   항등식       미배분 + 배분 완료 = T
 *   제약         Σ x_i ≤ A     그리고     0 ≤ x_i ≤ b_i
 *
 * T와 A는 서버 값이다. 가용재고의 정의(게이트 G-1)는 서버 계약이 닫았다 — 화면이 빼기 하지 않는다.
 */

/* ------------------------------------------------------------------------
 * 날짜 표기. 전부 KST 고정 — 사장의 브라우저 시간대가 어디든 동대문 날짜로 읽혀야 한다.
 * ------------------------------------------------------------------------ */

const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const KST_MONTH_DAY_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function partsOf(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = formatter.formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
}

/**
 * `YYYY-MM-DD`(스펙 `format: date`) → `YYYY.MM.DD`. 문자열 치환만 한다 —
 * `Date`를 만들면 시간대에 따라 하루가 밀린다. 값이 없으면(null) null.
 */
export function formatDate(wire: string | null | undefined): string | null {
  if (!wire) return null;
  return wire.replaceAll("-", ".");
}

/** 화면 입력 `YYYY.MM.DD` → 스펙 `YYYY-MM-DD` */
export function toWireDate(display: string): string {
  return display.trim().replaceAll(".", "-");
}

/** date-time → `YYYY.MM.DD`(KST). 요약의 최초·최근 주문일 */
export function formatDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const part = partsOf(KST_DATE, date);
  return `${part("year")}.${part("month")}.${part("day")}`;
}

/** date-time → `9월 4일 10:00`(KST). 배분 표의 주문 일시 */
export function formatOrderedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const part = partsOf(KST_MONTH_DAY_TIME, date);
  return `${part("month")}월 ${part("day")}일 ${part("hour")}:${part("minute")}`;
}

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/**
 * SKU 표기 `상품번호-SKU번호`. 스펙이 숫자 둘(`productNumber`·`variantNumber`)뿐이라
 * `variantNumber`만 쓰면 상품이 다른 SKU끼리 `1`·`1`로 겹친다. 표기 규칙은 미확정(04-wire.md §3).
 */
export function skuCode(productNumber: number, variantNumber: number): string {
  return `${productNumber}-${variantNumber}`;
}

export function toSkuView(sku: BackorderSku): BackorderSkuView {
  return {
    variantId: sku.variantId,
    sku: skuCode(sku.productNumber, sku.variantNumber),
    productName: sku.productName,
    color: sku.color,
    size: sku.size,
    backorderQty: sku.backorderQty,
    availableQty: sku.availableQty,
    eta: formatDate(sku.expectedInboundDate),
  };
}

export function toLineView(row: Backorder): BackorderLineView {
  return {
    id: row.id,
    orderNo: String(row.orderNumber),
    orderedAt: row.orderedAt,
    orderedAtLabel: formatOrderedAt(row.orderedAt),
    elapsedDays: row.elapsedDays,
    customer: row.retailerName,
    // 화면의 미송 수량은 남은 것이다. `qty`는 원래 미송량이라 배분 뒤에도 안 줄어든다
    qty: row.remainingQty,
  };
}

export function toSummary(stats: BackorderStats): BackorderSummary {
  return {
    sku: skuCode(stats.productNumber, stats.variantNumber),
    totalQty: stats.backorderQty,
    orderCount: stats.orderCount,
    customerCount: stats.retailerCount,
    assignable: stats.availableQty,
    eta: formatDate(stats.expectedInboundDate),
    etaReason: stats.expectedInboundReason ?? null,
    firstOrderedDate: formatDateOf(stats.firstOrderedAt),
    lastOrderedDate: formatDateOf(stats.lastOrderedAt),
    totalAmount: stats.backorderAmount,
  };
}

/** 펼침 응답 통째로 → 정렬된 행 + 요약. 표·카운터·요약·요청이 전부 이것 하나를 본다 */
export function toDetailView(list: BackorderList): BackorderDetailView {
  return {
    lines: sortByOrderedAt(list.data.map(toLineView)),
    summary: toSummary(list.stats),
  };
}

/* ------------------------------------------------------------------------
 * 목록 요청
 * ------------------------------------------------------------------------ */

export interface BackorderListParams {
  q: string;
  /** 1-base. 서버는 0-base라 보낼 때 1 뺀다 */
  page: number;
}

/** 서버에 보내는 모양이자 queryKey의 일부. `q`는 빈 문자열이면 아예 안 보낸다 */
export interface BackorderListQuery {
  q: string | undefined;
  page: number;
  size: number;
}

export function toListQuery(params: BackorderListParams): BackorderListQuery {
  return {
    q: params.q === "" ? undefined : params.q,
    page: Math.max(params.page - 1, 0),
    size: PAGE_SIZE,
  };
}

/* ------------------------------------------------------------------------
 * 배분 공식
 * ------------------------------------------------------------------------ */

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
export function remainingQty(
  line: BackorderLineView,
  allocated: number,
): number {
  return line.qty - allocated;
}

/**
 * 주문 일시 오래된 순 = 선착순. glossary §4.8의 "선착순이 기본형"이 이 정렬이다.
 * 서버 기본은 `createdAt,asc`(미송 발생 순)라 화면 규칙과 다를 수 있어 여기서 다시 정렬한다
 * (스펙: "제안일 뿐 강제가 아니다"). 화면에 정렬 컨트롤이 없으므로 이 순서가 유일한 순서다.
 *
 * ISO 8601은 자릿수가 고정이라 문자열 비교만으로 시간순이 나온다 — 같은 오프셋(KST)일 때.
 * 동률이면 미송 id로 가른다(F13) — 서버가 같은 행을 다른 순서로 줘도 우선순위가 안 뒤집힌다.
 */
export function sortByOrderedAt(
  lines: readonly BackorderLineView[],
): BackorderLineView[] {
  return [...lines].sort(
    (a, b) => a.orderedAt.localeCompare(b.orderedAt) || a.id - b.id,
  );
}

/**
 * 선착순 그리디 배분 — 오래된 주문부터 가용재고를 다 쓸 때까지 채운다.
 * 펼칠 때 `배분 수량` 입력칸의 **초기값**이다. 배분 확정 뒤에는 쓰지 않는다 — 다시 채우면
 * 한 번 더 눌렀을 때 사장이 정하지 않은 배분이 나간다(F1).
 * (화면에 `자동 배분` 버튼은 없다. 선착순은 정렬 + 이 초기값으로만 나타난다)
 */
export function firstComeAllocation(
  lines: readonly BackorderLineView[],
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
 * 화면이 그리는 입력 = 요청에 실리는 입력. 저장된 입력을 **지금 행·가용재고 기준으로** 다시
 * 자른다 — 다른 데서 배분이 먼저 나가 잔여가 줄었어도 화면에 상한 넘는 숫자가 남지 않고,
 * 없어진 행의 입력은 버린다. 순서는 표 순서(선착순)라 넘치는 몫은 뒷줄부터 깎인다.
 */
export function normalizeDraft(
  lines: readonly BackorderLineView[],
  capacity: number,
  draft: AllocationDraft,
): AllocationDraft {
  let rest = Math.max(0, capacity);
  const next: AllocationDraft = {};
  for (const line of lines) {
    const take = Math.min(Math.max(draft[line.id] ?? 0, 0), line.qty, rest);
    next[line.id] = take;
    rest -= take;
  }
  return next;
}

/**
 * 펼친 SKU의 실제 입력. 아직 손대지 않았으면(`undefined`) 선착순, 손댔으면 그 값을 상한으로 자른 것.
 * 배분 확정 직후는 `{}`라 전부 0이다.
 */
export function effectiveDraft(
  lines: readonly BackorderLineView[],
  capacity: number,
  stored: AllocationDraft | undefined,
): AllocationDraft {
  return stored === undefined
    ? firstComeAllocation(lines, capacity)
    : normalizeDraft(lines, capacity, stored);
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
  lines: readonly BackorderLineView[],
  capacity: number,
  lineId: number,
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
 * 안 적은 칸은 "이 주문엔 안 준다"는 뜻이라 0과 같다(재고 탭과 다른 규칙).
 * **숫자 아닌 글자가 섞이면 `null`** — 걸러서 이어 붙이면(`1.5` → `15`) 10배가 되므로(F11)
 * 그 키 입력은 통째로 버린다. 부르는 쪽은 `null`이면 직전 값을 그대로 둔다.
 */
export function parseAllocationInput(raw: string): number | null {
  if (raw === "") return 0;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * 배분 요청. **1 이상인 행만** 담는다 — 0은 400 `INVARIANT_VIOLATED`다.
 * 화면이 그리는 값(`effectiveDraft`)을 그대로 받으므로 보이는 숫자 = 보내는 숫자다.
 */
export function toAllocationRequest(draft: AllocationDraft): AllocationRequest {
  return {
    items: Object.entries(draft)
      .map(([id, qty]) => ({ backorderId: Number(id), allocateQty: qty }))
      .filter((item) => item.allocateQty >= 1),
  };
}

/** 펼친 SKU의 행이 응답의 `resolvedBackorderIds`로 전부 해소됐는가 → 아코디언을 닫을지 */
export function allResolved(
  lines: readonly BackorderLineView[],
  resolvedIds: readonly number[],
): boolean {
  const resolved = new Set(resolvedIds);
  return lines.length > 0 && lines.every((line) => resolved.has(line.id));
}

/* ------------------------------------------------------------------------
 * 예상 입고일
 * ------------------------------------------------------------------------ */

/**
 * 예상 입고일 입력 형식 검사(`YYYY.MM.DD`).
 * 달력 팝오버(DatePicker)가 `packages/ui`에 없고 Figma에도 없어서 텍스트 입력으로 받는다 —
 * 그래서 형식을 여기서 막지 않으면 서버까지 아무 문자열이나 간다.
 * 월·일의 범위까지 본다. 존재하지 않는 날(2월 30일)은 서버 `VALIDATION_FAILED`가 걸러 칸 아래 붙는다.
 */
export function isEtaFormat(raw: string): boolean {
  return /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])$/.test(raw.trim());
}

/**
 * 예상 입고일 요청. 빈 날짜는 **해제**다 — 스펙: "`expectedInboundDate: null` = 해제(사유도 함께 null)".
 * 생성 타입은 `string`(스펙에 nullable 없음)이라 `null`을 캐스팅해 보낸다(04-wire.md §3).
 */
export function toExpectedInboundRequest(
  eta: string,
  reason: string,
): ExpectedInboundRequest {
  const date = eta.trim() === "" ? null : toWireDate(eta);
  const trimmedReason = reason.trim();
  return {
    expectedInboundDate: date as unknown as string,
    expectedInboundReason: (date === null || trimmedReason === ""
      ? null
      : trimmedReason) as unknown as string,
  };
}

/* ------------------------------------------------------------------------
 * 오류 문구
 * ------------------------------------------------------------------------ */

/**
 * 배분 확정이 거절됐을 때 버튼 옆에 붙일 한 줄.
 *
 * 순서: `VALIDATION_FAILED`면 칸별 사유를 이어 붙인다(배분 표엔 폼 칸이 없다) → 아는 코드면
 * `BACKORDER_ERROR_TEXT` → 나머지는 `describeError`의 종류별 제목에 서버 문구를 덧붙인다.
 * **`message`로 가르지 않는다** — 코드로만 가른다.
 */
export function allocationErrorText(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === WHOLESALE_ERROR_CODE.VALIDATION_FAILED) {
      const reasons = error.fieldErrors.map((f) => f.message);
      return reasons.length > 0 ? reasons.join(" ") : error.message;
    }
    const known = BACKORDER_ERROR_TEXT[error.code];
    if (known !== undefined) return known;
  }
  const described = describeError(error);
  return described.detail
    ? `${described.title} (${described.detail})`
    : described.title;
}

/**
 * 서버 상태와 어긋나서 거절된 것인가(409·404). 이때는 화면이 든 값이 낡은 것이라
 * 다시 불러와야 한다 — 문구만 보이고 길이 없으면 같은 버튼을 다시 눌러 같은 답을 본다(F1, #198).
 * 다른 feature `derive.ts`에 같은 함수가 있지만 **복사해 왔다** — feature 경계를 넘어 import 하지 않는다.
 */
export function isStaleRejection(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

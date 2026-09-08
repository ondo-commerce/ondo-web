import { isApiError } from "@ondo/api";
import {
  INBOUND_ERROR_TEXT,
  MOVEMENT_PAGE_SIZE,
  PAGE_SIZE,
  FILTER_ALL,
} from "./constants";
import type {
  InboundCreateRequest,
  InboundDrafts,
  InboundEntry,
  InboundInput,
  InboundItemRequest,
  InboundNotice,
  InventoryProductView,
  InventoryRowView,
  InventorySkuView,
  ProductDetail,
  ProductSummary,
  StockMovement,
  StockMovementView,
  StockQuantities,
} from "./types";
import { describeError } from "@/shared/api/describeError";
import type { ProductListQuery } from "@/shared/api/product";

/*
 * 재고 탭의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 같은 공식이 좌측 표·우측 카드·확인 다이얼로그 세 곳에서 쓰이는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다.
 *
 * 입력이 비어 있을 수 있는 계산은 0이 아니라 **null**을 돌려준다.
 * 0원은 "공짜로 받았다"로 읽히기 때문에 화면에서 빈칸으로 그려야 한다(§7 Q5).
 */

/* ------------------------------------------------------------------------
 * 날짜
 * ------------------------------------------------------------------------ */

const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * date-time → `YYYY.MM.DD`(KST). 이력의 날짜 열.
 * 서버 시각을 KST로 고정해 그린다 — 브라우저 시간대에 따라 하루가 밀리면 안 된다.
 */
export function formatMovementDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = KST_DATE.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/**
 * SKU 표기 `상품번호-SKU번호`. 스펙이 숫자 둘(`productNumber`·`variantNumber`)뿐이라
 * fixtures의 `SU-18-블랙-M` 같은 코드는 없다. 미송 탭과 같은 임시 규칙이다(04-wire §3).
 */
export function skuCode(productNumber: number, variantNumber: number): string {
  return `${productNumber}-${variantNumber}`;
}

/**
 * 상세 응답 → 재고 목록의 상품. 색상은 SKU마다 붙인다(`color`·`colorHex`) — 표는 색상
 * 그룹으로 묶어 그리는데, 그룹의 첫 행만 색 점을 보이면 되니 색상 목록을 따로 들 이유가 없다.
 * 서버 정렬(색상은 그룹→색상, variant는 사이즈)을 그대로 믿는다. 여기서 다시 정렬하지 않는다.
 */
export function toProductView(detail: ProductDetail): InventoryProductView {
  return {
    id: detail.id,
    code: String(detail.productNumber),
    name: detail.name,
    skus: (detail.colorOptions ?? []).flatMap((option) =>
      (option.variants ?? []).map((v): InventorySkuView => ({
        id: v.id,
        code: skuCode(detail.productNumber, v.variantNumber),
        colorId: option.color.id,
        color: option.color.name,
        colorHex: option.color.hex,
        size: v.size,
        stock: v.stockQty,
        reservedQty: v.allocatedQty,
        backorderQty: v.backorderQty,
        availableQty: v.availableQty,
        avgCost: v.avgCost,
      })),
    ),
  };
}

/** 행 상세 쿼리에서 행이 읽는 것. TanStack 결과 통째가 아니라 이 셋만 받는다 — 순수 함수로 남기려고 */
export interface DetailQueryState {
  data: InventoryProductView | undefined;
  error: unknown;
}

/**
 * 목록 응답 한 줄 + 그 상품 상세 쿼리의 상태 → 표의 한 행.
 *
 * 순서가 중요하다: **데이터가 있으면 에러가 있어도 `ready`다.** 한 번 받아 둔 상세가
 * 배경 재조회에서 실패한 경우인데, 그때 합계를 `-`로 지우면 방금까지 보이던 숫자가 사라진다.
 * 옛 숫자라도 보이는 편이 낫고, 재조회 실패 신호는 우측 카드가 따로 낸다(`inboundNotice`).
 */
export function toInventoryRow(
  summary: ProductSummary,
  detail: DetailQueryState,
): InventoryRowView {
  const base = {
    id: summary.id,
    code: String(summary.productNumber),
    name: summary.name,
    skuCount: summary.variantCount,
  };
  if (detail.data) {
    return { ...base, detail: { state: "ready", product: detail.data } };
  }
  if (detail.error !== null && detail.error !== undefined) {
    const described = describeError(detail.error);
    return {
      ...base,
      detail: {
        state: "failed",
        title: described.title,
        retryable: described.retryable,
      },
    };
  }
  return { ...base, detail: { state: "loading" } };
}

export function toMovementView(m: StockMovement): StockMovementView {
  return {
    id: m.id,
    date: formatMovementDate(m.createdAt),
    type: m.type,
    beforeQty: m.qtyBefore,
    deltaQty: m.qtyChange,
    afterQty: m.qtyAfter,
  };
}

/* ------------------------------------------------------------------------
 * 목록 · 필터
 * ------------------------------------------------------------------------ */

export interface InventoryListParams {
  /** 서버에 보낸 검색어(트림됨). 빈 문자열 = 검색 없음 */
  q: string;
  /** 1-base. 화면이 보는 값 */
  page: number;
}

export function toListQuery(params: InventoryListParams): ProductListQuery {
  return {
    q: params.q === "" ? undefined : params.q,
    page: Math.max(params.page - 1, 0),
    size: PAGE_SIZE,
  };
}

/** 변동 이력 요청. 페이저가 없어 첫 페이지 하나다 */
export function toMovementQuery() {
  return { page: 0, size: MOVEMENT_PAGE_SIZE };
}

/** 색상 단위로 묶는다. SKU = 색상 × 사이즈라서 색상이 그룹 축이 된다 */
export function groupByColor(
  skus: readonly InventorySkuView[],
): [string, InventorySkuView[]][] {
  const map = new Map<string, InventorySkuView[]>();
  for (const s of skus) {
    const list = map.get(s.color);
    if (list) list.push(s);
    else map.set(s.color, [s]);
  }
  return [...map];
}

/** 색상·사이즈 단일 필터. `전체`는 거르지 않는다 */
export function filterSkus(
  skus: readonly InventorySkuView[],
  color: string,
  size: string,
): InventorySkuView[] {
  return skus.filter(
    (s) =>
      (color === FILTER_ALL || s.color === color) &&
      (size === FILTER_ALL || s.size === size),
  );
}

/* ------------------------------------------------------------------------
 * 수량
 * ------------------------------------------------------------------------ */

/**
 * 색상 그룹 접힘 행·상품 행의 수량 4열. 판매가능도 **서버 값끼리 더한다** —
 * `Σ현재고 − Σ주문처리중 − Σ미송대기`와 같은 값이지만 공식을 화면이 다시 들지 않는다.
 */
export function sumQuantities(
  list: readonly StockQuantities[],
): StockQuantities {
  return list.reduce<StockQuantities>(
    (acc, q) => ({
      stock: acc.stock + q.stock,
      reservedQty: acc.reservedQty + q.reservedQty,
      backorderQty: acc.backorderQty + q.backorderQty,
      availableQty: acc.availableQty + q.availableQty,
    }),
    { stock: 0, reservedQty: 0, backorderQty: 0, availableQty: 0 },
  );
}

/** 모드 A 예상 금액 = 입고수량 × 매입단가. 하나라도 비면 빈칸(null) */
export function estimatedAmount(
  qty: number | null,
  unitPrice: number | null,
): number | null {
  if (qty === null || unitPrice === null) return null;
  return qty * unitPrice;
}

/** 모드 B 총 금액 = 입력재고 × 매입단가. 하나라도 비면 빈칸(null) */
export function totalAmount(
  qty: number | null,
  unitPrice: number | null,
): number | null {
  return estimatedAmount(qty, unitPrice);
}

/** 모드 B 변동 후 재고 = 현재고 + 추가 재고. 아직 안 적었으면 현재고 그대로 */
export function stockAfterInbound(stock: number, added: number | null): number {
  return stock + (added ?? 0);
}

/* ------------------------------------------------------------------------
 * 입력 → 요청
 * ------------------------------------------------------------------------ */

/** 칸에 들어갈 수 있는 글자 — 0 이상 정수의 숫자뿐. 소수점·부호·쉼표는 키 단위로 막는다(Q-03) */
export function isDigits(text: string): boolean {
  return /^\d*$/.test(text);
}

/**
 * 숫자 입력칸의 문자열 → 수량/금액.
 * 빈칸과 0을 구분해야 해서 빈칸은 null이다 — "안 적었다"와 "0을 적었다"는 다르다.
 * 숫자가 아닌 글자가 섞여 있으면(붙여넣기) null — 일부만 살려 `45.5`가 `455`가 되지 않게.
 */
export function parseNumberInput(raw: string): number | null {
  if (raw === "" || !isDigits(raw)) return null;
  return Number(raw);
}

export const EMPTY_INPUT: InboundInput = { qty: "", unitPrice: "" };

export function inputOf(
  drafts: InboundDrafts,
  variantId: number,
): InboundInput {
  return drafts[variantId] ?? EMPTY_INPUT;
}

/**
 * 입고 대상 줄. **수량과 단가를 둘 다 적은 줄만**이다 — 단가만 적힌 줄은 입고가 아니고,
 * 수량만 적힌 줄은 `missingUnitPriceCount`가 세어 버튼을 잠근다(서버가 단가 없는 줄을 거절한다).
 * `skus`가 범위를 정한다: 모드 A는 그 상품의 SKU 전부, 모드 B는 고른 SKU 하나.
 * 다른 상품에 남아 있는 입력은 여기 못 들어온다.
 */
export function inboundEntries(
  skus: readonly InventorySkuView[],
  drafts: InboundDrafts,
): InboundEntry[] {
  return skus.flatMap((s) => {
    const input = inputOf(drafts, s.id);
    const qty = parseNumberInput(input.qty);
    const unitPrice = parseNumberInput(input.unitPrice);
    if (qty === null || qty === 0 || unitPrice === null) return [];
    return [{ variantId: s.id, qty, unitPrice }];
  });
}

/**
 * 수량은 적었는데 단가가 빈 줄 수. 하나라도 있으면 입고를 막는다 — 일부만 보내면
 * 사장은 다 들어간 줄 안다. 문구에 줄 수를 적어 어디를 채울지 알린다.
 */
export function missingUnitPriceCount(
  skus: readonly InventorySkuView[],
  drafts: InboundDrafts,
): number {
  return skus.filter((s) => {
    const input = inputOf(drafts, s.id);
    const qty = parseNumberInput(input.qty);
    return (
      qty !== null && qty > 0 && parseNumberInput(input.unitPrice) === null
    );
  }).length;
}

export function totalInboundQty(entries: readonly InboundEntry[]): number {
  return entries.reduce((sum, e) => sum + e.qty, 0);
}

/**
 * 입고 요청 본문. `receivedAt`은 **입고 처리 버튼을 누른 순간**의 시각을 받는다 —
 * 렌더 중에 만들면 서버 렌더와 브라우저 렌더가 달라 하이드레이션이 깨진다.
 *
 * `unitCost`는 항상 싣는다 — 빈 단가를 키 생략으로 보내던 가정(04-wire §3-3, §7 Q3)은
 * dev에서 400으로 틀렸다(dev-verify-bis F1). 빈 줄은 `inboundEntries`가 이미 걸렀다.
 */
export function toInboundRequest(
  entries: readonly InboundEntry[],
  receivedAt: string,
): InboundCreateRequest {
  return {
    receivedAt,
    items: entries.map((e): InboundItemRequest => ({
      variantId: e.variantId,
      qty: e.qty,
      unitCost: e.unitPrice,
    })),
  };
}

/** 처리된 줄의 입력만 지운다. 안 보낸 줄(단가만 적은 줄 등)은 남는다(Q-02) */
export function clearDrafts(
  drafts: InboundDrafts,
  entries: readonly InboundEntry[],
): InboundDrafts {
  const next = { ...drafts };
  for (const e of entries) delete next[e.variantId];
  return next;
}

/* ------------------------------------------------------------------------
 * 오류
 * ------------------------------------------------------------------------ */

/**
 * 입고가 거절됐을 때의 문구. 도메인 코드는 `INBOUND_ERROR_TEXT`, 그 밖(네트워크·5xx)은
 * `describeError`의 제목. `VALIDATION_FAILED`는 여기 오기 전에 `toFieldErrors`가 가져간다.
 */
export function inboundErrorText(error: unknown): string {
  if (isApiError(error)) {
    const known = INBOUND_ERROR_TEXT[error.code];
    if (known) return known;
  }
  return describeError(error).title;
}

/**
 * 입고 버튼 왼쪽 한 줄. 뮤테이션 결과(`isSuccess`)와 상품 상세의 재조회 실패(`isRefetchError`)를
 * 같이 본다 — 입고 201 뒤 상세 재조회가 실패하면 캐시엔 옛 숫자가 남고 경계는 안 떨어진다
 * (데이터가 있어 `useSuspenseQuery`가 던지지 않는다). 그때 `입고 처리했어요`만 보이면 사장은
 * 숫자가 안 바뀐 걸 보고 한 번 더 눌러 중복 입고를 낸다(wire-inventory F2).
 *
 * 재조회 실패는 입고와 무관하게도 온다(진입 30초 뒤 배경 재조회). 그때도 숫자가 낡은 건 같아서
 * 문구만 다르다.
 */
export function inboundNotice(
  received: boolean,
  refreshFailed: boolean,
): InboundNotice | null {
  if (refreshFailed) {
    return {
      tone: "stale",
      text: received
        ? "입고는 됐지만 화면을 새로 못 불러왔어요"
        : "최신 재고를 못 불러왔어요",
    };
  }
  if (received) return { tone: "done", text: "입고 처리했어요" };
  return null;
}

/**
 * 서버 상태와 어긋나서 거절된 것인가(409·404). 이때는 화면이 든 값이 낡은 것이라
 * 다시 불러와야 한다 — 문구만 보이고 길이 없으면 같은 버튼을 다시 눌러 같은 답을 본다(wire-order F3).
 */
export function isStaleRejection(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

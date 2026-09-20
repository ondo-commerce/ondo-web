import { isApiError } from "@ondo/api";
import { OUTBOUND_ERROR_TEXT, RECEIVE_BY_ORDER } from "./constants";
import type {
  OutboundCreateRequest,
  OutboundDetail,
  OutboundItem,
  OutboundRetailer,
  OutboundRowView,
  OutboundSummary,
  OutboundView,
  PackingRetailer,
  PackingRow,
  PackingRowView,
  PackingSelection,
  ReceiveBy,
  RetailerRowView,
  ShipmentNotice,
  Statement,
  StatementItem,
  StatementLineView,
  StatementView,
} from "./types";
import { describeError } from "@/shared/api/describeError";

/*
 * 출고 탭의 파생값은 전부 여기 있다. JSX 안에서 계산하지 않는다 —
 * 같은 수량 합이 아코디언 꼬리 · 표의 수량 열 · 우측 패널의 `선택 상품 합계`에서 쓰이는데,
 * 흩어 놓으면 한 곳만 고쳐도 화면끼리 숫자가 갈린다.
 *
 * wire → 뷰 변환도 여기다. 화면은 wire 모양을 모른다.
 *
 * ⚠️ 날짜는 서버 ISO(date-time)를 **KST 고정** Intl로만 그린다. 사장의 브라우저 시간대가
 *    어디든 동대문 날짜로 읽혀야 하고, 렌더 중에 `new Date()`(지금)를 읽는 함수는 없다 —
 *    서버(UTC)와 브라우저의 값이 갈리면 하이드레이션이 깨진다.
 */

/* ------------------------------------------------------------------------
 * 날짜
 * ------------------------------------------------------------------------ */

const KST = "Asia/Seoul";

/** 표의 일시 열 `9/7 08:00` */
const SHORT_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 장끼번호 날짜부 `20260907` */
const DATE_PART_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parts(format: Intl.DateTimeFormat, iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const list = format.formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) =>
    list.find((p) => p.type === type)?.value ?? "";
}

/** 표의 일시 열 `9/7 08:00` */
export function formatDateTime(iso: string): string {
  const part = parts(SHORT_FORMAT, iso);
  if (!part) return "-";
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

/** 패널·장끼의 일시 `9월 7일 08:00` — 표보다 자리가 넉넉해 말로 적는다 */
export function formatDateLabel(iso: string): string {
  const part = parts(SHORT_FORMAT, iso);
  if (!part) return "-";
  return `${part("month")}월 ${part("day")}일 ${part("hour")}:${part("minute")}`;
}

/**
 * 장끼번호 `JG-YYYYMMDD-NNN`. 서버는 날짜별 순번(`statementNumber`, 1부터)만 주고
 * "표시 코드 조립용으로 `shippedAt`을 항상 함께 내린다"(스펙). 날짜부는 출고일(KST)이다(판정 D6).
 */
export function statementCode(
  shippedAt: string,
  statementNumber: number,
): string {
  const part = parts(DATE_PART_FORMAT, shippedAt);
  const datePart = part ? `${part("year")}${part("month")}${part("day")}` : "";
  return `JG-${datePart}-${String(statementNumber).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/** `품번-SKU번호`. 서버에 SKU 코드 문자열이 없어 두 번호를 붙인다 — 재고·미송 탭과 같은 표기 */
export function skuCode(productNumber: number, variantNumber: number): string {
  return `${productNumber}-${variantNumber}`;
}

/** 봉투 표기 `#N`. `PKG-001` 같은 코드 문자열이 서버에 없다 */
export function outboundLabel(outboundNumber: number): string {
  return `#${outboundNumber}`;
}

export function toPackingRetailerRow(row: PackingRetailer): RetailerRowView {
  return {
    retailer: {
      id: row.retailerId,
      name: row.retailerName,
    },
    count: row.itemCount,
    qty: row.totalQty,
  };
}

export function toOutboundRetailerRow(row: OutboundRetailer): RetailerRowView {
  return {
    retailer: {
      id: row.retailerId,
      name: row.retailerName,
    },
    count: row.outboundCount,
    qty: row.totalQty,
  };
}

export function toPackingRowView(row: PackingRow): PackingRowView {
  return {
    id: row.id,
    sku: skuCode(row.productNumber, row.variantNumber),
    productName: row.productName,
    receiveBy: row.receiveBy,
    orderedAt: formatDateTime(row.orderedAt),
    orderedAtIso: row.orderedAt,
    orderId: row.orderId,
    orderNumber: String(row.orderNumber),
    qty: row.qty,
  };
}

/** 표의 `상품 요약`. 앞부분은 서버가 만든다(`summaryProductName`), 둘 이상이면 `외 N건` */
export function outboundSummaryLabel(summary: OutboundSummary): string {
  const rest = summary.additionalItemCount;
  return rest > 0
    ? `${summary.summaryProductName} 외 ${rest}건`
    : summary.summaryProductName;
}

export function toOutboundRowView(summary: OutboundSummary): OutboundRowView {
  // 스펙에 nullable이 없어 타입은 string이지만 출고 전엔 null이 온다
  const shippedAtIso = summary.shippedAt ?? null;
  return {
    id: summary.id,
    label: outboundLabel(summary.outboundNumber),
    summary: outboundSummaryLabel(summary),
    receiveBy: summary.receiveBy,
    createdAt: formatDateTime(summary.createdAt),
    createdAtIso: summary.createdAt,
    shippedAt: shippedAtIso === null ? null : formatDateTime(shippedAtIso),
    shippedAtIso,
    totalQty: summary.totalQty,
  };
}

function toOutboundLineView(item: OutboundItem) {
  return {
    variantId: item.variantId,
    sku: skuCode(item.productNumber, item.variantNumber),
    productName: item.productName,
    qty: item.qty,
  };
}

export function toOutboundView(detail: OutboundDetail): OutboundView {
  const shippedAt = detail.shippedAt ?? null;
  const statementNumber = detail.statementNumber ?? null;
  return {
    id: detail.id,
    label: outboundLabel(detail.outboundNumber),
    retailerId: detail.retailerId,
    retailerName: detail.retailerName,
    createdAt: formatDateLabel(detail.createdAt),
    lines: (detail.items ?? []).map(toOutboundLineView),
    totalQty: detail.totalQty,
    isShippable: detail.isShippable,
    shippedAt: shippedAt === null ? null : formatDateLabel(shippedAt),
    // 둘 다 있어야 장끼번호가 된다 — 출고 확정이 두 값을 한 번에 채운다(스펙)
    statementCode:
      shippedAt !== null && statementNumber !== null
        ? statementCode(shippedAt, statementNumber)
        : null,
  };
}

/** 장끼 품목표의 `옵션` 열. SKU = 색상 × 사이즈라 두 축을 합쳐 적는다(glossary §3) */
export function optionLabel(
  item: Pick<StatementItem, "color" | "size">,
): string {
  return `${item.color} / ${item.size}`;
}

function toStatementLineView(item: StatementItem): StatementLineView {
  return {
    productName: item.productName,
    option: optionLabel(item),
    qty: item.qty,
  };
}

export function toStatementView(statement: Statement): StatementView {
  return {
    statementCode: statementCode(
      statement.shippedAt,
      statement.statementNumber,
    ),
    outboundLabel: outboundLabel(statement.outboundNumber),
    shippedAt: formatDateLabel(statement.shippedAt),
    sellerName: statement.sellerName,
    retailerName: statement.retailerName,
    receiveBy: statement.receiveBy,
    lines: (statement.items ?? []).map(toStatementLineView),
    totalQty: statement.totalQty,
  };
}

/* ------------------------------------------------------------------------
 * 집계·정렬·필터 (받은 목록 안에서)
 * ------------------------------------------------------------------------ */

/** 칩 건수 = 그 단계에 있는 **행의 개수**(판정 D5). 소매처별 건수를 더한다 — 집계 엔드포인트가 없다 */
export function sumCounts(rows: readonly RetailerRowView[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

/** 수량 합. 대기 줄이든 선택 스냅샷이든 같은 함수를 쓴다 */
export function sumQty(rows: readonly { qty: number }[]): number {
  return rows.reduce((total, row) => total + row.qty, 0);
}

/**
 * 표의 줄 순서: **수령 방식으로 먼저 묶고**(직접 수령 → 사입삼촌) 묶음 안에서 주문 일시 최신순.
 * 수령 방식이 포장 단위를 가르는 축이라(판정 D7) 같은 방식끼리 붙어 있어야 한 번에 고른다.
 * 서버에 정렬 파라미터가 없어 받은 목록(페이징 없음) 안에서 한다.
 */
export function sortReadyRows(
  rows: readonly PackingRowView[],
): PackingRowView[] {
  return [...rows].sort((a, b) => {
    const order =
      RECEIVE_BY_ORDER.indexOf(a.receiveBy) -
      RECEIVE_BY_ORDER.indexOf(b.receiveBy);
    if (order !== 0) return order;
    return b.orderedAtIso.localeCompare(a.orderedAtIso);
  });
}

/** 일시 최신순. 출고 대기는 포장 일시, 출고 완료는 출고 일시로 정렬한다(판정 D8) */
export function sortOutboundRows(
  rows: readonly OutboundRowView[],
  key: (row: OutboundRowView) => string,
): OutboundRowView[] {
  return [...rows].sort((a, b) => key(b).localeCompare(key(a)));
}

/** 수령방식 단일 선택 필터. `전체`(FILTER_ALL)는 여기까지 오지 않고 호출부가 거른다 */
export function filterByReceiveBy(
  rows: readonly PackingRowView[],
  receiveBy: ReceiveBy,
): PackingRowView[] {
  return rows.filter((row) => row.receiveBy === receiveBy);
}

/* ------------------------------------------------------------------------
 * 선택 → 포장
 * ------------------------------------------------------------------------ */

/** 선택 스냅샷 → 줄 목록(고른 순서). 우측 패널·요청 본문이 이 배열을 읽는다 */
export function selectedRows(selection: PackingSelection): PackingRowView[] {
  return Object.values(selection);
}

/**
 * 선택한 줄의 수령 방식이 섞였는가.
 * 봉투의 수령 방식이 단일 값이라 섞인 선택은 한 묶음이 될 수 없다(판정 D7 · 서버 400 `RECEIVE_BY_MIXED`).
 */
export function hasMixedReceiveBy(rows: readonly PackingRowView[]): boolean {
  return new Set(rows.map((row) => row.receiveBy)).size > 1;
}

/**
 * 포장할 수 있는 선택인가. 고른 게 없거나 수령 방식이 섞였으면 못 한다.
 *
 * 고르는 것 자체는 막지 않는다(게이트 Q3) — 체크박스를 회색으로 만들면 왜 회색인지
 * 설명할 자리가 없어서, 고르게 두고 버튼 옆에서 이유를 말한다.
 */
export function canPack(rows: readonly PackingRowView[]): boolean {
  return rows.length > 0 && !hasMixedReceiveBy(rows);
}

/**
 * 선택 중 지금 표에 없는 줄의 수. 검색어가 바뀌어 목록에서 빠진 줄이다 — 선택은 살리되
 * 우측 패널이 그 사실을 말해야 한다(#198 계열).
 *
 * 소매처 자체가 목록에서 빠졌으면(`retailerInList=false`) 펼침 표가 내려가 `visibleIds`가 null인데,
 * 그건 "못 받았다"가 아니라 "한 줄도 안 보인다"다 — 선택 전부가 목록 밖이다(wire-shipment F2, #205).
 * 소매처는 있는데 표를 아직 못 받았으면(null) 0 — 기다리는 동안 안내가 깜빡이지 않게.
 */
export function missingCount(
  rows: readonly PackingRowView[],
  visibleIds: ReadonlySet<number> | null,
  retailerInList: boolean,
): number {
  if (!retailerInList) return rows.length;
  if (visibleIds === null) return 0;
  return rows.filter((row) => !visibleIds.has(row.id)).length;
}

export function toOutboundCreateRequest(
  rows: readonly PackingRowView[],
): OutboundCreateRequest {
  return { packingItemIds: rows.map((row) => row.id) };
}

/* ------------------------------------------------------------------------
 * 결과 문구
 * ------------------------------------------------------------------------ */

/**
 * 거절 사유 한 줄. 아는 코드면 코드 표, 모르면 `describeError`의 종류별 제목.
 * `VALIDATION_FAILED`는 여기 오기 전에 `toFieldErrors`가 칸으로 보낸다.
 */
export function outboundErrorText(error: unknown): string {
  if (isApiError(error)) {
    const known = OUTBOUND_ERROR_TEXT[error.code];
    if (known !== undefined) return known;
  }
  return describeError(error).title;
}

/**
 * 서버 상태와 어긋나서 거절된 것인가(409·404). 이때는 화면이 든 값이 낡은 것이라
 * 다시 불러와야 한다 — 문구만 보이고 길이 없으면 같은 버튼을 다시 눌러 같은 답을 본다(wire-order F3).
 */
export function isStaleRejection(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

/**
 * 우측 빈 자리에 남길 처리 결과 문구. 재조회 실패면 옛 목록임을 먼저 말한다.
 *
 * 포장 완료는 `출고 대기`로 가라고 하는데, 검색어가 걸려 있으면 그 칩이 `(0)`일 수 있다 —
 * 검색은 봉투 상품명에도 걸려서 방금 포장한 봉투가 안 잡힌다(wire-shipment F5, #205).
 * 그래서 검색 중(`searching`)이면 "검색을 지우면"을 앞에 둔다. 검색을 지우는 순간 원래 문구로 돌아간다.
 */
export function noticeText(
  notice: ShipmentNotice,
  searching: boolean = false,
): string {
  if (notice.kind === "packed") {
    if (!notice.refreshed) {
      return `${notice.outboundLabel} 포장은 됐지만 목록을 새로 못 불러왔어요`;
    }
    return searching
      ? `${notice.outboundLabel} 포장 완료했어요 — 검색을 지우면 출고 대기에서 보여요`
      : `${notice.outboundLabel} 포장 완료했어요 — 출고 대기에서 확인하세요`;
  }
  return notice.refreshed
    ? `출고 완료 — 장끼 ${notice.statementCode} 발행했어요`
    : `출고는 됐지만 목록을 새로 못 불러왔어요 (장끼 ${notice.statementCode})`;
}

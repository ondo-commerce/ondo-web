import {
  BUSINESS_DAY_START_HOUR,
  DASHBOARD_TITLE,
  ELAPSED_UNKNOWN,
  NO_DATE_TOP,
  OVERDUE_TOP,
  RECEIVE_BY_LABEL,
  RECEIVE_BY_ORDER,
  TILE_HREF,
  TILE_LINK_LABEL,
  TILE_TEXT,
  TILE_TITLE,
  TILE_UNIT,
} from "./constants";
import type {
  AttentionSkuView,
  AttentionView,
  BackorderSku,
  DashboardSummary,
  DashboardSummaryPeek,
  DashboardSummaryView,
  NewOrderRowView,
  NewOrderSummary,
  RatioSegment,
  TodayView,
  TodoTileKey,
  TodoTileView,
} from "./types";
import { formatNumber } from "@/shared/lib/format";

/*
 * 대시보드의 파생값은 전부 여기 있다. 컴포넌트 JSX 안에서 계산하지 않는다 —
 * 경과 시간·영업일·비율은 타일·큐·주의 패널이 같이 쓰는 공식이라 흩어 두면 자리마다 숫자가 갈린다.
 *
 * 시각은 **서버 `now`** 기준이다. 브라우저 시계로 재면 사장 PC의 시계 오차가 "N분 대기"에 실린다.
 * wire → 뷰 변환도 여기다. 화면은 wire 모양을 모른다.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------------
 * 시각·날짜. 전부 KST 고정 — 사장의 브라우저 시간대가 어디든 동대문 시각으로 읽혀야 한다.
 * ------------------------------------------------------------------------ */

const KST_CLOCK = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  /* `hour12: false`는 엔진에 따라 자정을 `24:05`로 준다 — h23이 `00:05`로 고정한다 */
  hourCycle: "h23",
});

const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseIso(iso: string): number | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function partsOf(formatter: Intl.DateTimeFormat, time: number) {
  const parts = formatter.formatToParts(new Date(time));
  return (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
}

/** epoch ms → KST 달력 날짜 `YYYY-MM-DD`. 스펙 `format: date`와 같은 꼴이라 문자열 비교가 그대로 날짜 비교다 */
function kstDateOf(time: number): string {
  const part = partsOf(KST_DATE, time);
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** ISO → KST 달력 날짜 `YYYY-MM-DD`. 값이 깨졌으면 null */
export function kstDate(iso: string): string | null {
  const time = parseIso(iso);
  return time === null ? null : kstDateOf(time);
}

/** ISO → `21:05`(KST). 값이 깨졌으면 `-` — 보조 표기라 화면을 죽일 일이 아니다 */
export function formatClock(iso: string): string {
  const time = parseIso(iso);
  if (time === null) return ELAPSED_UNKNOWN;
  const part = partsOf(KST_CLOCK, time);
  return `${part("hour")}:${part("minute")}`;
}

/**
 * 영업일 날짜 `YYYY-MM-DD`. 낮 12시 전이면 전날이 영업일이다 —
 * 12시간을 뺀 시각의 KST 달력 날짜를 읽으면 그게 영업일이라 경계 비교를 따로 안 한다.
 */
export function businessDate(now: string): string | null {
  const time = parseIso(now);
  if (time === null) return null;
  return kstDateOf(time - BUSINESS_DAY_START_HOUR * HOUR_MS);
}

/** `YYYY-MM-DD` → `9-18`. 앞자리 0을 뗀다 — 연도는 화면에 안 쓴다 */
function shortDate(ymd: string): string {
  const parts = ymd.split("-");
  const month = parts[1];
  const day = parts[2];
  if (month === undefined || day === undefined) return ymd;
  return `${Number(month)}-${Number(day)}`;
}

/** 오늘 패널 제목 옆 `9-18` */
export function formatBusinessDateLabel(now: string): string {
  const ymd = businessDate(now);
  return ymd === null ? ELAPSED_UNKNOWN : shortDate(ymd);
}

/**
 * 경과 표기 `42분` / `3시간` / `2일`. 한 단위만 쓴다 — `1시간 12분`처럼 두 단위를 붙이면
 * 큐에서 세로로 훑을 때 자릿수가 흔들린다. 서버 시각보다 미래면 0으로 본다.
 */
export function elapsedLabel(from: string, now: string): string {
  const a = parseIso(from);
  const b = parseIso(now);
  if (a === null || b === null) return ELAPSED_UNKNOWN;
  const ms = Math.max(0, b - a);
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}분`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)}시간`;
  return `${Math.floor(ms / DAY_MS)}일`;
}

/** 달력 날짜 차이(일). `YYYY-MM-DD` 둘을 UTC 자정으로 읽어 시간대·서머타임 영향 없이 뺀다 */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** 미송이 생긴 뒤 며칠째인가. 오늘 생겼으면 1일째 — "0일째"는 사장에게 뜻이 없다 */
export function daysSince(iso: string, now: string): number {
  const from = kstDate(iso);
  const to = kstDate(now);
  if (from === null || to === null) return 0;
  return Math.max(0, daysBetween(from, to)) + 1;
}

/** 큐의 접수 시각. 오늘(달력) 접수면 `21:00`, 아니면 `9-17 21:00` — 시각만으로는 어제 것과 헷갈린다 */
export function formatReceivedAt(iso: string, now: string): string {
  const date = kstDate(iso);
  if (date === null) return ELAPSED_UNKNOWN;
  const clock = formatClock(iso);
  return date === kstDate(now) ? clock : `${shortDate(date)} ${clock}`;
}

/* ------------------------------------------------------------------------
 * summary → 타일 4장 · 오늘 · 엿보기
 * ------------------------------------------------------------------------ */

function tile(
  key: TodoTileKey,
  body: Pick<
    TodoTileView,
    "value" | "valueTail" | "sub" | "subEmphasized" | "ratio"
  >,
): TodoTileView {
  return {
    key,
    title: TILE_TITLE[key],
    unit: TILE_UNIT[key],
    href: TILE_HREF[key],
    linkLabel: TILE_LINK_LABEL[key],
    ...body,
  };
}

function newOrdersTile(summary: DashboardSummary): TodoTileView {
  const { count, oldestOrderedAt, oldestRetailerName } = summary.newOrders;
  // 스펙엔 nullable이 없어 타입은 string이지만 0건이면 둘 다 null이 온다(dev 실응답)
  const oldest: string | null = oldestOrderedAt ?? null;
  const retailer: string | null = oldestRetailerName ?? null;
  const sub =
    count === 0 || oldest === null
      ? TILE_TEXT.noNewOrders
      : [
          `${TILE_TEXT.oldestPrefix} ${elapsedLabel(oldest, summary.now)} ${TILE_TEXT.oldestSuffix}`,
          retailer,
        ]
          .filter((part) => part !== null)
          .join(" · ");
  return tile("newOrders", {
    value: count,
    valueTail: null,
    sub,
    subEmphasized: false,
    ratio: null,
  });
}

function packingTile(summary: DashboardSummary): TodoTileView {
  const { retailerCount, qty, byReceive } = summary.packing;
  return tile("packing", {
    value: retailerCount,
    valueTail: `${formatNumber(qty)}장`,
    sub: RECEIVE_BY_ORDER.map(
      (key) => `${RECEIVE_BY_LABEL[key]} ${formatNumber(byReceive[key] ?? 0)}`,
    ).join(" · "),
    subEmphasized: false,
    ratio: null,
  });
}

/** 포장 직후엔 당연히 미출고라 봉투 수 자체는 강조하지 않는다 — 묵은 봉투가 있을 때만 둘째 줄이 진해진다 */
function outboundTile(summary: DashboardSummary): TodoTileView {
  const { notShippedCount, staleCount } = summary.outbound;
  return tile("outbound", {
    value: notShippedCount,
    valueTail: null,
    sub: `${TILE_TEXT.stalePrefix} ${formatNumber(staleCount)}봉투`,
    subEmphasized: staleCount > 0,
    ratio: null,
  });
}

/**
 * 미송 구성 막대. 지남 → 미등록 → 정상 세 구간, 합이 100이 되게 마지막 구간이 나머지를 받는다 —
 * 셋을 각각 반올림하면 99나 101이 나와 끝이 비거나 넘친다. 미송이 0이면 막대 자체를 안 그린다.
 */
export function backorderRatio(
  overdue: number,
  noDate: number,
  onTrack: number,
): RatioSegment[] | null {
  const total = overdue + noDate + onTrack;
  if (total <= 0) return null;
  const overduePct = Math.round((overdue / total) * 100);
  const noDatePct = Math.round((noDate / total) * 100);
  return [
    { key: "overdue", percent: overduePct },
    { key: "noDate", percent: noDatePct },
    { key: "onTrack", percent: Math.max(0, 100 - overduePct - noDatePct) },
  ];
}

function backorderTile(summary: DashboardSummary): TodoTileView {
  const { skuCount, qty, overdueSkuCount, noDateSkuCount } = summary.backorder;
  /* 정상 = 나머지. 서버가 세 값을 따로 주지만 합이 skuCount를 넘는 응답이 와도 음수는 안 그린다 */
  const onTrack = Math.max(0, skuCount - overdueSkuCount - noDateSkuCount);
  return tile("backorder", {
    value: skuCount,
    valueTail: `${formatNumber(qty)}장`,
    sub: [
      `${TILE_TEXT.overdue} ${formatNumber(overdueSkuCount)}`,
      `${TILE_TEXT.noDate} ${formatNumber(noDateSkuCount)}`,
      `${TILE_TEXT.onTrack} ${formatNumber(onTrack)}`,
    ].join(" · "),
    subEmphasized: false,
    ratio: backorderRatio(overdueSkuCount, noDateSkuCount, onTrack),
  });
}

/** 업무 순서 그대로 — 확정 → 포장 → 출고 → 미송. 타일 순서가 곧 오늘 저녁 할 일 순서다 */
export function toTodoTiles(summary: DashboardSummary): TodoTileView[] {
  return [
    newOrdersTile(summary),
    packingTile(summary),
    outboundTile(summary),
    backorderTile(summary),
  ];
}

export function toTodayView(summary: DashboardSummary): TodayView {
  const { orders, shipped, cancelled } = summary.today;
  return {
    dateLabel: formatBusinessDateLabel(summary.now),
    updatedAtLabel: formatClock(summary.now),
    orderCount: orders.count,
    orderAmount: orders.amount,
    shippedCount: shipped.count,
    shippedQty: shipped.qty,
    cancelled,
  };
}

export function toSummaryView(summary: DashboardSummary): DashboardSummaryView {
  return {
    now: summary.now,
    tiles: toTodoTiles(summary),
    today: toTodayView(summary),
    newOrderCount: summary.newOrders.count,
  };
}

export function toSummaryPeek(summary: DashboardSummary): DashboardSummaryPeek {
  return {
    now: summary.now,
    newOrderCount: summary.newOrders.count,
    cancelledToday: summary.today.cancelled,
  };
}

/** 탭 제목. 신규 주문이 있으면 `(4) 대시보드 · 온도 ERP` — 다른 탭을 보고 있어도 건수가 보인다 */
export function documentTitle(newOrderCount: number): string {
  return newOrderCount > 0
    ? `(${newOrderCount}) ${DASHBOARD_TITLE}`
    : DASHBOARD_TITLE;
}

/* ------------------------------------------------------------------------
 * 확정 대기 큐
 * ------------------------------------------------------------------------ */

/** `첫 라인 상품명 외 N건`. 앞부분은 서버가 만들어 준다(`summaryProductName`). 주문 탭과 같은 규칙 */
export function orderProductSummary(order: NewOrderSummary): string {
  const rest = order.additionalItemCount;
  return rest > 0
    ? `${order.summaryProductName} 외 ${rest}건`
    : order.summaryProductName;
}

/** 서버가 오래된 순으로 준다(`sort=orderedAt,asc`). 여기서 다시 정렬하지 않는다 — 우선순위는 그 순서 하나다 */
export function toNewOrderRows(
  orders: readonly NewOrderSummary[],
  now: string,
): NewOrderRowView[] {
  return orders.map((order) => ({
    id: order.id,
    waitingLabel: elapsedLabel(order.orderedAt, now),
    retailerName: order.retailerName,
    productSummary: orderProductSummary(order),
    orderAmount: order.orderAmount,
    receivedAtLabel: formatReceivedAt(order.orderedAt, now),
  }));
}

/* ------------------------------------------------------------------------
 * 주의 — 입고일 지난 미송 · 입고일 안 적은 미송
 * ------------------------------------------------------------------------ */

/**
 * 스펙엔 nullable이 없어 타입은 string이지만 입고일을 안 적은 SKU는 null이 온다.
 * 타입 가드로 만들지 않는다 — 생성 타입이 이미 string이라 부정 쪽이 `never`로 좁혀진다.
 */
function hasEta(sku: BackorderSku): boolean {
  return (
    typeof sku.expectedInboundDate === "string" &&
    sku.expectedInboundDate !== ""
  );
}

function toAttentionSku(
  sku: BackorderSku,
  agingLabel: string,
): AttentionSkuView {
  return {
    variantId: sku.variantId,
    productName: sku.productName,
    optionLabel: `${sku.color} · ${sku.size}`,
    qty: sku.backorderQty,
    agingLabel,
  };
}

/**
 * 받은 한 페이지(오래된 순) 안에서 고른다.
 *
 * - 입고일 지남: `expectedInboundDate < 영업일`. 많이 지난 순, 같으면 장수 많은 순 — 소매처가 먼저 물어볼 것부터
 * - 입고일 없음: 서버 순서(미송이 오래된 순) 그대로
 *
 * 건수는 이 페이지 안에서 센다. 미송 SKU가 100을 넘으면 실제보다 적게 셀 수 있다 — 타일의 건수는
 * 서버 집계(`overdueSkuCount`)라 정확하고, 여기 건수는 목록 제목의 보조값이다.
 */
export function toAttentionView(
  skus: readonly BackorderSku[],
  now: string,
): AttentionView {
  const today = businessDate(now);
  const overdue =
    today === null
      ? []
      : skus
          .filter((sku) => hasEta(sku) && sku.expectedInboundDate < today)
          .sort(
            (a, b) =>
              a.expectedInboundDate.localeCompare(b.expectedInboundDate) ||
              b.backorderQty - a.backorderQty,
          );
  const noDate = skus.filter((sku) => !hasEta(sku));
  return {
    overdue: overdue
      .slice(0, OVERDUE_TOP)
      .map((sku) =>
        toAttentionSku(
          sku,
          `D+${daysBetween(sku.expectedInboundDate, today ?? sku.expectedInboundDate)}`,
        ),
      ),
    overdueCount: overdue.length,
    noDate: noDate
      .slice(0, NO_DATE_TOP)
      .map((sku) =>
        toAttentionSku(sku, `${daysSince(sku.latestBackorderedAt, now)}일째`),
      ),
    noDateCount: noDate.length,
  };
}

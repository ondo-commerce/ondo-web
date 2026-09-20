import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response 타입은 없다 — 아래
 * `PackingSummary` 하나만 예외고 그 이유를 거기 적었다.
 * ------------------------------------------------------------------------ */

type SummaryWire = WholesaleSchema<"DashboardSummaryResponse">;

/** 수령 방식. `AGENT` = 사입삼촌, `RETAILER` = 직접 수령. 주문·출고 feature에도 같은 별칭이 있지만 feature끼리는 import 하지 않는다 */
export type ReceiveBy = WholesaleSchema<"OrderDetailResponse">["receiveBy"];

/**
 * 포장 대기 집계. **생성 타입을 안 쓴다.**
 *
 * 스냅샷에서 이 객체의 스키마 이름이 `Packing`인데, 포장 대기열의 `Packing`(id·items·orderId…)과
 * 이름이 같아 생성기가 `DashboardSummaryResponse.packing`에 그쪽 모양을 붙였다.
 * dev 실응답(2026-09-18)은 이 모양이다. BE가 스키마 이름을 갈라 주면 이 타입을 지우고 별칭으로 되돌린다.
 */
export interface PackingSummary {
  retailerCount: number;
  qty: number;
  byReceive: Record<ReceiveBy, number>;
}

/** `GET /dashboard/summary`. `now`는 서버 시각 — 경과 시간은 전부 이 값 기준이다 */
export type DashboardSummary = Omit<SummaryWire, "packing"> & {
  packing: PackingSummary;
};
/** 확정 대기 큐 한 행. 주문 탭 목록과 같은 스키마다 */
export type NewOrderSummary = WholesaleSchema<"OrderSummaryResponse">;
/** 미송 SKU 한 행. `latestBackorderedAt`이 "며칠째"의 기준이다 */
export type BackorderSku = WholesaleSchema<"BackorderSkuResponse">;

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/** 할 일 타일 4장의 키. 업무 순서(확정 → 포장 → 출고 → 미송)가 곧 배열 순서다 */
export type TodoTileKey = "newOrders" | "packing" | "outbound" | "backorder";

/** 미송 구성 막대의 한 구간. 지남 → 미등록 → 정상 순 */
export interface RatioSegment {
  key: "overdue" | "noDate" | "onTrack";
  /** 0~100. 세 구간 합이 100이 되게 마지막 구간이 나머지를 받는다 */
  percent: number;
}

/**
 * 타일 한 장. 네 타일의 모양이 조금씩 달라(보조 값·강조·막대) 슬롯을 nullable로 뒀다 —
 * 타일마다 컴포넌트를 따로 만들면 배치·글자 크기가 넷으로 갈린다.
 */
export interface TodoTileView {
  key: TodoTileKey;
  title: string;
  /** 큰 숫자 */
  value: number;
  /** 큰 숫자 뒤 단위(`건`·`소매처`·`봉투`·`SKU`) */
  unit: string;
  /** 큰 숫자 옆 두 번째 값(`86장`). 없으면 null */
  valueTail: string | null;
  /** 둘째 줄 — 가장 오래 기다린 주문·수령 방식별·묵은 봉투·미송 구성 */
  sub: string;
  /** 둘째 줄을 강조 톤으로. 출고 확정 안 한 봉투 중 이번 영업일 전에 포장한 것이 있을 때만 */
  subEmphasized: boolean;
  /** 미송 타일에만. 미송이 0이면 null — 빈 막대는 안 그린다 */
  ratio: RatioSegment[] | null;
  href: string;
  linkLabel: string;
}

/** 확정 대기 큐 한 행. 수량 열이 없다 — 목록 응답에 수량이 없어서 열을 만들지 않았다 */
export interface NewOrderRowView {
  id: number;
  /** `42분` / `3시간` / `2일`. 서버 `now` 기준 경과 */
  waitingLabel: string;
  retailerName: string;
  /** `첫 라인 상품명 외 N건` */
  productSummary: string;
  orderAmount: number;
  /** `21:00`. 오늘 접수가 아니면 `9-17 21:00` */
  receivedAtLabel: string;
}

/** 우상 `오늘` 패널. 영업일 경계(낮 12시)는 서버가 이미 반영했다 — 여기선 표시용 날짜만 */
export interface TodayView {
  /** `9-18`. 낮 12시 전이면 전날이 영업일이라 달력 날짜와 다를 수 있다 */
  dateLabel: string;
  /** 서버 `now`를 `HH:MM`으로 — "마지막 갱신" 표기 */
  updatedAtLabel: string;
  orderCount: number;
  orderAmount: number;
  shippedCount: number;
  shippedQty: number;
  cancelled: number;
}

/** 주의 목록의 SKU 한 줄 */
export interface AttentionSkuView {
  variantId: number;
  productName: string;
  /** `블랙 · M` */
  optionLabel: string;
  /** 남은 미송 장수 */
  qty: number;
  /** 입고일 지남은 `D+2`(예정일 대비), 입고일 없음은 `5일째`(미송 발생 대비) — 기준이 달라 표기도 다르다 */
  agingLabel: string;
}

/** 우하 `주의` 패널. 상위 몇 개만 보이고 건수는 받은 페이지 안에서 센다 */
export interface AttentionView {
  overdue: AttentionSkuView[];
  overdueCount: number;
  noDate: AttentionSkuView[];
  noDateCount: number;
}

/**
 * summary 전체를 화면 모양으로. 타일·오늘 패널·큐 하단·탭 제목 배지가 전부 이 하나를 본다 —
 * 같은 응답을 자리마다 다르게 가공하면 숫자가 갈린다.
 */
export interface DashboardSummaryView {
  /** 서버 시각 ISO. 큐·주의 패널의 경과 계산이 이 값을 받는다 */
  now: string;
  tiles: TodoTileView[];
  today: TodayView;
  newOrderCount: number;
}

/**
 * summary 중 **경계 밖**에서도 필요한 조각 — 큐·주의 패널의 경과 기준 시각, 탭 제목 배지, 큐 하단 취소 건수.
 * summary가 실패해도 큐·주의는 살아야 해서 이 조각만 기다리지 않고(non-suspense) 엿본다.
 */
export interface DashboardSummaryPeek {
  now: string;
  newOrderCount: number;
  cancelledToday: number;
}

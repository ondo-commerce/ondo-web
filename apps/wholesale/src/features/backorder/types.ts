import type { WholesaleSchema } from "@ondo/api";

/* ------------------------------------------------------------------------
 * wire — 스펙에서 생성한 타입의 별칭(ADR-0002). 손으로 쓴 Response/Request 타입은 없다.
 * 서버가 필드를 바꾸면 여기가 아니라 `codegen`이 알려준다.
 * ------------------------------------------------------------------------ */

/** 목록 한 행 = 미송이 남은 SKU. 라인이 없다 — 펼치면 그 SKU의 미송 건을 따로 부른다 */
export type BackorderSku = WholesaleSchema<"BackorderSkuResponse">;
/** SKU를 기다리는 미송 하나. 화면의 `미송 수량`은 `qty`(원래 미송량)가 아니라 `remainingQty`다 */
export type Backorder = WholesaleSchema<"BackorderResponse">;
/** 우측 요약 8지표의 원본. 총액은 서버가 주문 시점 단가로 곱해 준다 */
export type BackorderStats = WholesaleSchema<"BackorderStatsResponse">;
/** 펼침 응답 봉투 — `{ data, stats }`. `meta`가 아니라 `stats`라 `apiFetchBody`로 받는다 */
export type BackorderList = WholesaleSchema<"BackorderListResponse">;
export type AllocationRequest = WholesaleSchema<"BackorderAllocationRequest">;
export type AllocationRequestItem = WholesaleSchema<"BackorderAllocationItem">;
export type AllocationBatch = WholesaleSchema<"AllocationBatchResponse">;
export type ExpectedInboundRequest = WholesaleSchema<"ExpectedInboundRequest">;
export type ExpectedInbound = WholesaleSchema<"ExpectedInboundResponse">;
export type SkuSize = BackorderSku["size"];

/* ------------------------------------------------------------------------
 * 뷰 — 화면이 받는 모양. wire → 뷰 변환은 derive.ts의 순수 함수가 한다.
 * ------------------------------------------------------------------------ */

/**
 * 좌측 목록의 SKU 한 행. 미송의 관리 단위가 SKU다(glossary §4.8).
 *
 * `총 미송 수량`은 이제 **서버 값**(`backorderQty`)이다. fixtures 시절엔 `Σ lines[].qty`로만 얻었지만
 * 목록 응답에 라인이 없다. 펼침의 `stats.backorderQty`와 같은 값이어야 하고, 그건 서버가 보증한다.
 */
export interface BackorderSkuView {
  variantId: number;
  /** `상품번호-SKU번호`(`18-1`). 스펙이 숫자 둘이라 `SKU-001` 같은 표기는 없다 */
  sku: string;
  productName: string;
  color: string;
  size: SkuSize;
  backorderQty: number;
  /** 가용재고. 좌측 표에 칸은 없지만 펼치기 전에 배분 가능 여부를 알 수 있게 서버가 준다 */
  availableQty: number;
  /** 예상 입고일 `YYYY.MM.DD`. 미등록이면 null이고 화면에 `-`로 그린다 */
  eta: string | null;
}

/**
 * 미송 한 줄 = **주문 라인의 스냅샷**이다. 상품 마스터를 참조하지 않는다 —
 * 미송은 "그때 그 값으로 팔린 것"이라 상품이 바뀌어도 따라 움직이면 안 되고,
 * 수명도 다르다(다 채워 주면 사라진다).
 */
export interface BackorderLineView {
  /** 미송 id. 배분 요청의 키(`backorderId`) */
  id: number;
  /** 주문번호. 도매처별 연번이라 숫자만 있다. **링크가 아니다** */
  orderNo: string;
  /** 정렬 키. ISO 그대로 — 화면 표기는 `orderedAtLabel` */
  orderedAt: string;
  /** `9월 4일 10:00`(KST) */
  orderedAtLabel: string;
  /** 미송 경과일. **서버 값** — 기준이 미송 발생일(`createdAt`)이지 주문 시각이 아니다 */
  elapsedDays: number;
  /** 거래처(소매처) 이름 */
  customer: string;
  /** 미송 수량 `b_i` = `remainingQty`. 배분 상한이자 잔여 미송의 기준 */
  qty: number;
}

/**
 * 미송 요약 8지표. **펼친 SKU 하나에 대한 값이다** — 탭 전체 합계가 아니다.
 * 전부 `stats`에서 온다. 화면이 행을 더해 다시 만들지 않는다 — 총액은 주문마다 단가가 달라
 * 서버가 곱한 값만 맞다.
 */
export interface BackorderSummary {
  /** `상품번호-SKU번호`. 어느 SKU의 요약인지 카드 제목에 붙인다 */
  sku: string;
  totalQty: number;
  /** OPEN 미송을 가진 **주문** 수. 행 수와 다를 수 있다 */
  orderCount: number;
  customerCount: number;
  /** 가용재고. 카운터 바의 값과 같아야 한다 */
  assignable: number;
  eta: string | null;
  /** 저장된 변동 사유. 폼의 초기값 — 다시 보이는 자리가 이제 생겼다 */
  etaReason: string | null;
  firstOrderedDate: string | null;
  lastOrderedDate: string | null;
  totalAmount: number;
}

/** 펼침 응답을 화면용으로 — 정렬된 행 + 요약 */
export interface BackorderDetailView {
  /** 주문 일시 오래된 순으로 이미 정렬돼 있다. 표·카운터·요청이 같은 순서를 본다 */
  lines: BackorderLineView[];
  summary: BackorderSummary;
}

/**
 * 배분 수량 입력 묶음 — 미송 id → 배분 수량.
 *
 * 재고 탭 입고와 달리 **숫자다(빈칸 = null이 아니다).** 배분 수량은 빈칸을 0으로 읽기로
 * 정해져 있어서 "안 적었다"와 "0을 적었다"를 구분할 필요가 없고, 오히려 구분하면
 * 카운터 3개(미배분·가용재고·배분 완료)가 null을 만나 합이 어긋난다.
 */
export type AllocationDraft = Record<number, number>;

/**
 * SKU별 입력. `undefined` = 아직 손대지 않았다(펼칠 때 선착순으로 채운다),
 * `{}` = 전부 0(배분 확정 직후). 둘을 구분해야 확정 뒤 자동 재충전이 안 일어난다(F1).
 */
export type AllocationDrafts = Record<number, AllocationDraft | undefined>;

/** 예상 입고일 폼 칸 이름 = 요청 DTO 필드명. `toFieldErrors`가 이 이름으로 서버 오류를 붙인다 */
export type EtaField = keyof ExpectedInboundRequest;

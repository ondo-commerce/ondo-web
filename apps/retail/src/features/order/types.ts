/**
 * 주문 도메인 타입.
 *
 * **`shared/`가 아니라 여기 있다.** 이 폴더를 지우면 주문서·주문 완료·주문
 * 내역·주문 상세가 통째로 사라져야 한다(`docs/02-folder-structure.md` 원칙 2).
 * 직전 회차에서 장바구니 지식이 `shared/`에 남아 결함으로 잡힌 자리라 같은 길을
 * 다시 가지 않는다.
 *
 * **`features/cart`를 import 하지 않는다.** 주문서가 읽는 것은 장바구니지만,
 * feature끼리 직접 참조하는 대신 `app/(shop)/checkout/page.tsx`가 조립해서
 * `CheckoutLine[]`으로 바꿔 넘긴다 — `app/(shop)/layout.tsx`가 헤더 뱃지를
 * 끼워 넣는 것과 같은 방식이다.
 */

/**
 * 수령 2종. **택배가 없다** — 동대문 도매는 직접 가져가거나 사입삼촌이 대신
 * 간다(glossary). 표준어는 `사입삼촌`(붙여 씀).
 */
export type PickupMethod = "DIRECT" | "AGENT";

/**
 * 결제 2종. 둘 다 **안내**일 뿐이다 — 소매는 금액을 쓰지만 돈을 움직이지 않고
 * 입금 확인은 도매처가 건별로 한다(게이트 D2). `현장 결제`는 폐기된 낱말이다.
 */
export type PaymentMethod = "TRANSFER" | "CASH";

/**
 * 도매처별 드롭다운이 들고 있는 값.
 *
 * `"BULK"`는 방법이 아니라 **"일괄 설정을 따른다"는 상태**다. 이걸 값으로 두지
 * 않고 일괄 값을 복사해 넣으면, 일괄 설정을 바꿨을 때 따라와야 할 도매처와
 * 따로 정한 도매처를 구분할 수 없다 — `전체 적용`이 무엇을 되돌리는지도
 * 말할 수 없게 된다.
 */
export type PickupChoice = PickupMethod | "BULK";
export type PaymentChoice = PaymentMethod | "BULK";

/**
 * 주문서에 오르는 조합 한 줄 = SKU 하나(색상 × 사이즈).
 *
 * **수량이 글자가 아니라 숫자다.** 장바구니의 `qtyText`는 사장이 친 글자
 * 그대로지만, 주문서에는 수량 입력칸이 아예 없어서(RT-37) 여기까지 올 때는
 * 이미 읽힌 값이어야 한다. 읽는 곳은 `shared/qty.ts`의 `parseQty` 하나뿐이고,
 * 그 변환은 `app/`의 조립부가 한다.
 */
export interface CheckoutLine {
  /** 도매처 + SKU. 같은 조합을 두 도매처에서 담을 수 있어 SKU만으로는 안 된다 */
  lineId: string;
  wholesalerId: string;
  wholesalerName: string;
  /** 상가 · 층 · 호. 사입삼촌에게 넘길 주소라 화면마다 같아야 한다 */
  wholesalerLocation: string;
  productId: string;
  productName: string;
  /** 노출용 색상 표기(자유 텍스트). 팔레트 키가 아니라 도매 현장의 색 이름이다 */
  colorLabel: string;
  size: string;
  price: number;
  qty: number;
}

/**
 * 도매처 하나의 접수 결과 3종.
 *
 * **`실패`가 없다**(RT-43). 안 된 것은 `접수 안 됨`이고, 늦는 것은
 * `접수 확인 중…`이다 — 사장이 다시 시도할 수 있는 일을 실패라고 부르지 않는다.
 */
export type AcceptStatus = "ACCEPTED" | "CHECKING" | "REJECTED";

/** 접수된 주문의 도매처 한 건. 확정·출고는 여기서부터 도매처마다 따로 돈다 */
export interface ReceiptLeg {
  wholesalerId: string;
  wholesalerName: string;
  wholesalerLocation: string;
  /** 도매처별 주문번호. 통합 주문번호와 **같이** 보인다(RT-40) */
  orderNo: string;
  status: AcceptStatus;
  /** 주문서에서 고른 값 그대로다. 완료 화면이 지어내지 않는다 */
  pickup: PickupMethod;
  payment: PaymentMethod;
  /** 접수가 안 된 이유. `REJECTED`에만 있다 */
  rejectedReason?: string;
  lines: readonly CheckoutLine[];
}

/**
 * 방금 접수한 주문 한 벌. **새로고침하면 사라진다** — 세션 스토어지 서버가
 * 아니다. 사라졌을 때 빈 화면을 주지 않고 `방금 접수한 주문이 없어요`로
 * 말하는 것이 완료 화면의 몫이다(S4-7).
 */
export interface OrderReceipt {
  /** 통합 주문번호 `YYYYMMDD-HHMM-NNNN` */
  orderNo: string;
  /** `2026.08.31 14:20` */
  placedAt: string;
  /** 주문서에서 입력한 수령인. 사입삼촌 방문이 하나도 없으면 빈 문자열이다 */
  agentName: string;
  agentPhone: string;
  legs: readonly ReceiptLeg[];
}

/**
 * 접수 결과를 무엇으로 그릴지. **주소 쿼리로만 고른다**(`?scenario=`).
 *
 * 화면 안에 "시나리오 고르기" 컨트롤을 두지 않는다 — 직전 회차에서 화면 확인용
 * 안내가 그대로 프로덕션 화면에 남은 적이 있다. 서버가 붙으면 이 타입과
 * `resolveScenario`만 지우면 된다.
 */
export type OrderScenario = "default" | "partial" | "delayed";

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 주문 내역 · 주문 상세가 읽는 모양
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 통합 주문 한 줄에 뜨는 진행 단계.
 *
 * **한 행에 배지는 하나다.** 도매처마다 상태가 다를 때 무엇을 보여 줄지는
 * `derive.orderStatus`가 규칙 하나로 정한다 — 원본 §6-2·§6-3이 "배지가 어긋난다 /
 * 규칙이 없다"고 지목한 자리라, 규칙을 코드 한 곳에 못박는다.
 *
 * `주문 확정`에 해당하는 소매 표기는 **없다**(§3-0 C). 확정되면 라인이
 * `수령 가능`과 `재고 소진 · 미송`으로 갈리기 때문에 통합 행에는 안 뜬다.
 */
export type OrderStatus =
  "PENDING" | "PARTIAL_SHIPPED" | "READY" | "SHIPPED" | "CANCELED";

/**
 * 라인(SKU) 하나의 상태.
 *
 * 와이어프레임에는 4종이 그려져 있는데 여기 다섯 번째(`CANCELED`)가 있다 —
 * 그 화면이 취소되지 않은 주문 하나만 그렸기 때문이다. 취소된 주문의 라인이
 * `확정 대기`로 남으면 머리 배지(`취소됨`)와 라인이 서로 반대되는 말을 한다.
 */
export type OrderLineStatus =
  "SHIPPED" | "BACKORDER" | "READY" | "PENDING" | "CANCELED";

/** 다시 담기 판정 4종. `제외` 둘은 담기지 않는다 */
export type ReorderResult = "ADDED" | "PRICE_UP" | "SEASON_ENDED" | "DELISTED";

/**
 * 통합 주문 안의 도매처 한 건.
 *
 * `confirmed`가 false면 **수령·결제가 아직 정해지지 않았다**(`null`). 도매처가
 * 확정할 때 정해지는 값이라, 확정 전에 값을 채워 두면 사장이 이미 정해진
 * 것으로 읽는다 — 그 도매처는 상세의 `결제 · 수령` 패널에서 조용히 빠지지 않고
 * "확정하면 여기에 표시돼요"로 말한다(가정 A5-d).
 */
export interface OrderLeg {
  wholesalerId: string;
  wholesalerName: string;
  /** 상가 · 층 · 호. **라인 표와 결제 패널이 같은 이 값을 읽는다**(가정 A5-e) */
  wholesalerLocation: string;
  phone: string;
  businessHours: string;
  orderNo: string;
  canceled: boolean;
  /** 도매처가 주문을 확정했는가. 미송이 생기는 시점이기도 하다(RT-59) */
  confirmed: boolean;
  /** 소매가 물건을 실제로 받아 갔는가. `수령 가능`과 `출고 완료`를 가른다 */
  received: boolean;
  pickup: PickupMethod | null;
  payment: PaymentMethod | null;
}

/** 주문 라인 한 줄 = SKU 하나. 값은 **주문 시점 스냅샷**이라 지금 판매가와 다를 수 있다 */
export interface OrderLine {
  lineId: string;
  wholesalerId: string;
  productId: string;
  productName: string;
  /** 품번 (SU-18 형태) */
  productCode: string;
  colorLabel: string;
  size: string;
  qty: number;
  price: number;
  status: OrderLineStatus;
  /** 다시 담을 때의 판정. 없으면 담긴다 — 판정 근거는 서버에 없다(가정 A7) */
  reorder?: ReorderResult;
  /** `PRICE_UP`일 때 지금 판매가. 오르지 않은 줄에는 없다 */
  currentPrice?: number;
  /** 재고 소진 여부. 다시 담을 때 장바구니로 그대로 넘어간다 */
  soldOut?: boolean;
}

/** 장끼 한 장에 실리는 품목 */
export interface ShipmentLine {
  productName: string;
  colorLabel: string;
  size: string;
  qty: number;
  price: number;
}

/**
 * 출고 한 건 = 거래명세서(장끼) 한 장.
 *
 * **시스템이 자동 발행하고 고칠 수 없다**(RT-54). 번호는 `JG-YYYYMMDD-NNN`(§4).
 * 미수는 이 시점에 생긴다(RT-64) — 주문 금액 전체가 미수가 아니다.
 */
export interface Shipment {
  statementNo: string;
  wholesalerId: string;
  /** `2026.08.26 21:40` */
  shippedAt: string;
  lines: readonly ShipmentLine[];
}

/** 접수된 주문 한 벌. 목록 한 줄과 상세 한 장이 **같은 이 값**을 읽는다 */
export interface OrderRecord {
  /** 통합 주문번호. 그대로 상세의 주소가 된다 */
  orderId: string;
  /** `2026.08.24 10:10` */
  orderedAt: string;
  legs: readonly OrderLeg[];
  lines: readonly OrderLine[];
  shipments: readonly Shipment[];
}

/** 주문 내역 툴바의 3축 + 정렬. 전부 주소에 실린다 */
export interface OrderFilter {
  period: string;
  wholesaler: string;
  status: string;
}

export type OrderSort = "latest" | "oldest";

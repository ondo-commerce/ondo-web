import type { SizeName } from "@/features/product";

/**
 * 주문 이행 상태 5종 (glossary §4.3).
 * 코드값은 `settlement_data_model.md` §2.2의 `order.status` 그대로다 —
 * 화면 라벨(`신규 주문` …)은 constants.ts의 표에만 둔다.
 *
 * `PARTIALLY_SHIPPED` · `SHIPPED`로 가는 전이는 **주문 탭에서 만들 수 없다.**
 * 포장 묶음을 실제로 내보내는 건 출고 탭 몫이라(§3.1) 여기서는 더미로 온 상태를 그리기만 한다.
 */
export type OrderStatus =
  "PLACED" | "CONFIRMED" | "PARTIALLY_SHIPPED" | "SHIPPED" | "CANCELED";

/** 정산 상태 3종 (glossary §5.1). `정산 대기`·`미정산`은 이 화면 어디에도 없다 */
export type SettlementStatus = "UNPAID" | "PARTIAL" | "SETTLED";

/** 결제 방식. Figma의 `현장 결제`는 어느 SSOT에도 없어서 쓰지 않는다(01-pm.md §5 Q4) */
export type PaymentMethod = "CASH" | "BANK_TRANSFER";

/** 수령 방식. 표준어는 `사입삼촌`(붙여쓰기)이다 — glossary §4.3이 SSOT 1순위다 */
export type ReceiveMethod = "AGENT_VISIT" | "SELF_PICKUP";

/**
 * 주문 라인 한 줄. 컬럼 이름은 `settlement_data_model.md` §2.3을 그대로 따른다.
 *
 * **항등식: `qty = allocatedQty + 미할당`, 그리고 확정된 주문에서는 `미할당 = backorderQty`다.**
 * 화면의 `미할당` 열은 미송을 포함한 값이라 둘이 같은 숫자로 두 자리에 그려진다(01-pm.md §1.4).
 */
export interface OrderLine {
  id: string;
  skuId: string;
  /** 품명. 라인 표 첫 열의 윗줄 */
  productName: string;
  color: string;
  size: SizeName;
  /** 주문수량 */
  qty: number;
  /** 출고진행 — 포장 대기로 잡혔거나 이미 나간 수량 */
  allocatedQty: number;
  /** 이미 출고 완료된 수량. 주문 탭에서는 바뀌지 않는다(출고 탭 몫) */
  shippedQty: number;
  /** 미송대기 — 팔았지만 못 내보내기로 확정한 수량 */
  backorderQty: number;
  /** 단가. 라인 표 첫 열의 아랫줄(`₩30,000`) */
  unitPrice: number;
  /** 라인 금액 = qty × unitPrice. 서버가 내려주는 값이라 화면에서 곱하지 않는다 */
  lineAmount: number;
  /**
   * SKU 재고 스냅샷 — 현재고.
   * 서버가 붙으면 라인이 아니라 SKU 조회로 오는 값이다. 더미 단계에서는
   * 주문 하나만 펼쳐도 `가용재고`를 그릴 수 있게 라인에 얹어 둔다.
   */
  stockOnHand: number;
  /** SKU 재고 스냅샷 — 주문처리중. `가용재고`의 두 번째 항이다(derive.assignableQty) */
  reservedQty: number;
}

/**
 * 포장 대기 회차 한 줄.
 *
 * `backorderUsed`는 화면에 그리지 않는다 — **삭제로 정확히 되돌리기 위한 값이다.**
 * 회차를 만들 때 미송에서 몇 장을 뺐는지 적어 두지 않으면, 삭제할 때 미송을
 * 얼마나 복구해야 하는지 알 수 없다(`min(n, bo)`는 되돌릴 수 없는 계산이다).
 */
export interface PackingBatchLine {
  /** 어느 주문 라인에서 뺀 수량인지. **삭제로 되돌릴 때 이 값으로 라인을 찾는다** —
   *  한 주문에 같은 SKU가 두 줄로 들어올 수 있어 skuId로 찾으면 엉뚱한 줄이 걸린다 */
  lineId: string;
  skuId: string;
  /** `상품명 (색상 - 사이즈)`. 회차 카드는 SKU 코드가 아니라 이 표기를 쓴다(Figma 실측) */
  label: string;
  qty: number;
  backorderUsed: number;
}

/**
 * 포장 대기 회차. 서버가 붙으면 `package_id = null`인 `packing_item` 묶음이 된다(§2.7).
 * 번호는 재사용하지 않는다 — `#2`를 지우고 새로 만들면 `#4`다.
 */
export interface PackingBatch {
  id: string;
  no: number;
  lines: PackingBatchLine[];
}

/** 주문 한 건. `settlement_data_model.md` §2.2 컬럼 + 카드에 필요한 거래처 정보 */
export interface Order {
  /** `ORD-001` 표시 그대로가 곧 id다 */
  id: string;
  /** `2024.08.01` 표시 문자열. 정렬은 파싱이 아니라 배열 순서(최신순)로 한다 */
  placedAt: string;
  /** 거래처(소매처) 상호 */
  customerName: string;
  contact: string;
  paymentMethod: PaymentMethod;
  receiveMethod: ReceiveMethod;
  status: OrderStatus;
  settlementStatus: SettlementStatus;
  lines: OrderLine[];
  /** 포장 대기 회차. 최신이 맨 위로 그려지지만 배열은 만든 순서(오름차순)로 둔다 */
  batches: PackingBatch[];
  /** 다음 회차에 붙일 번호. 삭제해도 줄지 않는다 */
  nextBatchNo: number;
}

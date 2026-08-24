/**
 * 재고가 움직인 이유. **코드값은 glossary §4.5 그대로 두고 라벨만 재고 탭에서 다르다** —
 * 재고 탭 안에서만 `stockOut`을 "출고"라고 부르고, 밖에서 "출고"는 주문 이행을 뜻한다.
 * 이름을 화면 라벨에 맞춰 바꾸면 주문·출고 탭과 같은 단어가 두 뜻이 된다.
 */
export type StockMovementType = "stockIn" | "stockOut" | "adjust";

/** 재고 변동 이력 한 줄. 서버가 붙으면 이 모양 그대로 내려온다고 보고 화면을 짠다 */
export interface StockMovement {
  id: string;
  /** `2023.10.24` 표시 문자열. 정렬은 파싱이 아니라 배열 순서(최신순)로 한다 */
  date: string;
  type: StockMovementType;
  /** 변동 전 재고 */
  beforeQty: number;
  /** 부호 있는 변동량. 출고·차감 조정이면 음수다 */
  deltaQty: number;
  /** 변동 후 재고 = beforeQty + deltaQty */
  afterQty: number;
}

/**
 * 입고 처리 한 건. 확인 다이얼로그를 거쳐 한 번에 반영한다.
 * 모드 A는 여러 건, 모드 B는 한 건을 만든다 — 반영하는 쪽 코드는 하나다.
 */
export interface InboundEntry {
  skuId: string;
  /** 입고수량. 0이나 빈칸인 줄은 여기까지 오지 않는다 */
  qty: number;
  /**
   * 매입단가. **비워 둘 수 있다.**
   * 이번 범위에서 금액은 재고를 바꾸지 않는다 — 평균원가 재계산은 서버 몫이다(glossary §3.1).
   */
  unitPrice: number | null;
}

/**
 * 수량 3종 묶음. 색상 그룹 접힘 행은 SKU 하나가 아니라 합계라서
 * `Sku`를 그대로 쓰지 못한다 — 파생 함수가 둘 다 받게 하려고 이 모양으로 좁힌다.
 */
export interface StockQuantities {
  /** 현재고 */
  stock: number;
  /** 주문처리중 */
  reservedQty: number;
  /** 미송대기 */
  backorderQty: number;
}

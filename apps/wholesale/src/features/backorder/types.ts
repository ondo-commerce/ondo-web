/**
 * 미송 한 줄 = **주문 라인의 스냅샷**이다. 상품 마스터(`features/product`)를 참조하지 않는다 —
 * 미송은 "그때 그 값으로 팔린 것"이라 상품이 바뀌어도 따라 움직이면 안 되고,
 * 수명도 다르다(다 채워 주면 사라진다).
 */
export interface BackorderLine {
  /** `SKU-001-ORD-1001` 형태. 주문 하나가 여러 SKU를 미송으로 남길 수 있어 SKU와 묶어야 유일해진다 */
  id: string;
  /** 주문번호. **링크가 아니다** — 주문 탭이 아직 없고 Figma에도 평문으로 그려져 있다 */
  orderNo: string;
  /** 주문 일자 `YYYY.MM.DD`. 요약의 `최초/최근 주문일`이 이 값을 그대로 쓴다 */
  orderedDate: string;
  /** 주문 시각 `HH:mm`. 날짜와 붙여야 같은 날 주문의 선착순이 갈린다 */
  orderedTime: string;
  /**
   * 미송 경과일. **fixtures가 고정 기준일로 미리 계산한 값이다.**
   * 렌더 중에 `new Date()`를 읽으면 서버와 브라우저의 시각이 갈려 하이드레이션이 깨진다
   * (재고 탭 `derive.ts`의 `formatMovementDate` 주석과 같은 이유).
   */
  elapsedDays: number;
  /** 거래처(소매처) 이름. 요약의 `거래처 수`는 이 값을 중복 제거해 센다 */
  customer: string;
  /** 미송 수량 `b_i` — 이 주문이 아직 못 받은 수량. 배분 확정 때 이 값이 잔여 미송으로 줄어든다 */
  qty: number;
  /**
   * 주문 시점 판매가 스냅샷(`order_line.unit_price`, settlement_data_model §2.3).
   * **주문마다 다르다** — 요약의 `미송 총액`은 단일 단가 × 총 수량이 아니라 행별 곱의 합이다.
   */
  unitPrice: number;
}

/**
 * 미송이 걸린 SKU 하나. 미송의 관리 단위가 SKU다(glossary §4.8).
 *
 * `총 미송 수량`을 필드로 두지 않는다 — `Σ lines[].qty`로만 얻는다.
 * 따로 들고 있으면 배분 확정 뒤 합계와 행이 갈린다.
 */
export interface BackorderSku {
  /** `SKU-001` */
  id: string;
  productName: string;
  color: string;
  size: string;
  /** 현재고(stockOnHand). `가용재고` 계산에 쓰인다 */
  stock: number;
  /** 주문처리중(reservedQty). 배분 확정으로 포장 대기가 생기면 이쪽이 늘어난다 */
  reservedQty: number;
  /** 예상 입고일 `YYYY.MM.DD`. 등록 전에는 null이고 화면에 `-`로 그린다 */
  eta: string | null;
  /** 이 SKU를 기다리는 주문들. 화면 정렬(주문 일시 오래된 순)은 derive가 맡는다 */
  lines: BackorderLine[];
}

/**
 * 미송 = **도매처가 주문을 확정할 때** 생기는, 아직 못 받은 SKU 잔량이다(RT-59).
 *
 * 소매는 이것을 **만들지도 고치지도 못한다.** 배분(어느 주문에 몇 장씩 나눠 줄지)은
 * 도매의 일이고(`glossary` §4.8), 도매 배분 화면은 아직 없다(§3-0 E). 그래서 이
 * feature의 타입에는 **쓰기용 필드가 하나도 없다** — 화면도 입력칸 없이 읽기만 한다.
 */

/** 미송 목록 한 줄 = SKU 하나(상품 × 색상 × 사이즈). 옵션 축은 색상 × 사이즈뿐이다 */
export interface BackorderLine {
  id: string;
  productName: string;
  /** 도매처 ID. `features/catalog`가 쓰는 값과 같은 축이다 — 거래처 관리(RT-66)가 이 키로 링크를 건다 */
  wholesalerId: string;
  wholesalerName: string;
  colorName: string;
  /** 사이즈 표시명. `F`가 아니라 `Free`다(사양 §4 라벨 통일) */
  sizeName: string;
  /** 못 받은 장수. 단위는 `장`(`shared/qty.ts`의 `QTY_UNIT`) */
  qty: number;
  /** 주문일 (ISO). 정렬 축이 이것이다(RT-56) */
  orderedAt: string;
  /**
   * 도매처가 안내한 예상 입고일 (ISO). 아직 못 정했으면 `null`이다.
   *
   * **지난 날짜도 그대로 들고 있는다.** 화면은 `지연` 배지만 보여주고 날짜를 숨기지만
   * (§5-2 — 소매 화면에 변동 사유를 적을 자리가 없다), 판정 자체가 이 값에서
   * 나오므로 데이터에서 지우면 `지연`을 셀 수 없다.
   */
  etaDate: string | null;
  /** 통합 주문번호 `20260824-1010-0098`. `주문 보기`의 목적지가 된다 */
  orderNo: string;
}

/**
 * 예상 입고일 3상태(RT-58). **색과 모양으로 갈린다** — 셋이 같은 회색이면
 * 사장이 "언제 오는지"를 세 단계로 못 읽는다.
 */
export type EtaState =
  /** 날짜가 잡혔고 아직 안 지났다 → 날짜 평문 */
  | "SCHEDULED"
  /** 날짜가 잡혔는데 오늘보다 이전이다 → 빨간 테두리 `지연` */
  | "DELAYED"
  /** 날짜가 없다 → 회색 테두리 `확인 중` */
  | "CHECKING";

/** 정렬 축은 주문일 하나다. 미송은 오래 기다린 것이 급해서 기본이 `오래된 순`이다(RT-56) */
export type BackorderSort = "oldest" | "latest";

/**
 * 요약 3카드 · 툴바 카운터 · 표 합계가 **같이 읽는** 한 덩어리.
 *
 * 카드마다 따로 세지 않는 것이 이 화면의 핵심이다 — 도매처 칩으로 좁혔는데
 * 카드만 전체 값으로 남으면 "목록은 1줄인데 카드는 3건"이 된다(shipments F8).
 */
export interface BackorderSummary {
  /** 지금 표에 서 있는 행 수 */
  waitingCount: number;
  /** 그 행들의 장수 합 */
  totalQty: number;
  /** 그중 예상 입고일이 확정됐고 아직 안 지난 행 수 */
  scheduledCount: number;
  /** 그 확정된 것 중 가장 이른 날짜 (ISO). 없으면 `null` */
  earliestEta: string | null;
  /** 그중 예상 입고일이 지난 행 수 */
  delayedCount: number;
}

/** 도매처 필터 칩 하나. 목록은 미송 데이터에서 만든다 — 상호를 두 번 적지 않는다 */
export interface WholesalerChip {
  id: string;
  name: string;
}

/**
 * 주소의 `?wholesaler=`가 **걸리지 않고 `전체`로 떨어진 사실**.
 *
 * 떨어뜨리는 것 자체는 맞는 동작이다(S2-AC5) — 칩 하나도 안 켜진 0건 화면보다 낫다.
 * 문제는 그 사실을 화면이 말하지 않는 것이었다. 이 타입이 있어야 뷰가
 * "걸렀다"와 "원래 전체였다"를 구분할 수 있다.
 */
export interface DroppedWholesaler {
  /** 주소에 실려 있던 값. `w-basic` 같은 실제 id일 수도, 오타일 수도 있다 */
  id: string;
  /**
   * 거래처 목록에서 찾은 상호. **모르는 값이면 `null`이다** —
   * 없는 상호를 지어내 `zzz 미송은 지금 없어요`라고 말하지 않는다.
   */
  name: string | null;
}

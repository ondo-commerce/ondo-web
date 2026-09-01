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

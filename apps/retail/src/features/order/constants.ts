import { QTY_UNIT } from "@/shared/qty";
import type {
  CancelLock,
  OrderLineStatus,
  OrderStatus,
  OrderSort,
  PaymentMethod,
  PickupMethod,
} from "./types";

/**
 * 주문 화면들의 고정 문구.
 *
 * **컴포넌트 안에 상태 문자열과 문장을 적지 않는다.** 같은 말이 화면 넷과
 * 모달 둘에 흩어지면 한쪽만 고쳐진다 — 원본의 §6-2·§6-3(배지 표기가 화면마다
 * 어긋남)이 정확히 그 사고였다.
 */

/** 이 feature가 부르는 path 전부. 서버(page)와 브라우저(mutations) 양쪽이 쓴다 */
export const ORDER_API_PATH = {
  checkout: "/api/retail/checkout",
  orders: "/api/retail/orders",
  order: (orderId: number) => `/api/retail/orders/${orderId}`,
  cancel: (orderId: number) => `/api/retail/orders/${orderId}/cancel`,
} as const;

/** 화면 경로. 목록·상세·주문서·완료가 서로를 가리킬 때 여기서 만든다 */
export const ORDER_PATH = {
  orders: "/orders",
  order: (orderId: number) => `/orders/${orderId}`,
  /** 장바구니에서 고른 `cartItemId`를 쉼표로 잇는다 — `GET /checkout?cartItemIds=`로 간다 */
  checkout: (cartItemIds: readonly number[]) =>
    cartItemIds.length === 0
      ? "/checkout"
      : `/checkout?ids=${cartItemIds.join(",")}`,
  complete: (orderId: number) => `/checkout/complete?orderId=${orderId}`,
} as const;

/**
 * 한 번에 받는 장수. **BE 상한이 100이다**(`OrderController.MAX_PAGE_SIZE` — 넘기면
 * `VALIDATION_FAILED`). 스펙에는 상한이 안 적혀 있어 여기 적어 둔다(`04-wire.md` §3).
 *
 * 기본값 20 대신 상한을 쓰는 이유: 도매처·상태 필터가 서버에 없어서 **받은 장 안에서**
 * 걸린다. 20건씩 자르면 필터가 "지금 장"만 보는 폭이 넓어진다.
 */
export const ORDERS_PAGE_SIZE = 100;

/** 첫 장. 주소의 `?page=`는 1-base이고 서버는 0-base라 여기서 한 번 뺀다 */
export const FIRST_PAGE = 1;

/** `이전 · 다음` 링크. 2장 이상일 때만 보인다 */
export const PAGER_LABEL = {
  prev: "이전",
  next: "다음",
  position: (page: number, totalPages: number) =>
    `${page} / ${totalPages} 페이지`,
} as const;

export const PICKUP_LABEL: Record<PickupMethod, string> = {
  RETAILER: "직접 수령",
  AGENT: "사입삼촌 방문",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "계좌 이체",
  CASH: "현금",
};

/** 도매처 드롭다운의 첫 항목. 값이 아니라 상태다 — `types.ts`의 `PickupChoice` 참조 */
export const FOLLOW_BULK_LABEL = "일괄 설정 따름";

/** 계좌 미등록 도매처의 결제 줄 옆에 서는 말. 계좌 이체 항목이 왜 없는지를 말한다 */
export const BANK_UNREGISTERED = "계좌 미등록 · 현금만 가능";

/**
 * 접수 결과 배지 표기.
 *
 * `실패`라는 낱말을 쓰지 않는다(RT-43). 안 된 건은 다시 시도하면 되는 일이고,
 * 실패라고 부르면 사장이 주문 전체가 날아갔다고 읽는다.
 */
export const ACCEPT_LABEL = {
  accepted: "접수됨",
  rejected: "접수 안 됨",
} as const;

/** 주문서 한 장에 박히는 문장 전부 */
export const CHECKOUT_TEXT = {
  title: "주문서",
  sub: "수령·결제는 도매처별로 정해요. 위에서 한 번에 정하고, 다른 도매처만 따로 바꿀 수 있어요.",
  bulkSection: "일괄 설정",
  bulkApply: "전체 적용",
  wholesalerSection: "도매처별 확인",
  /** 명세가 읽기 전용인 이유를 상자 아래에서 말한다(RT-37) */
  readOnlyHint:
    "주문 상품은 여기서 고칠 수 없어요. 수량·옵션을 바꾸려면 장바구니로 돌아가세요.",
  /** 단가를 서버에서 다시 받는다는 사실(스펙). 장바구니와 금액이 다를 수 있다 */
  repriced:
    "단가는 지금 도매처 가격으로 다시 받았어요. 장바구니에서 본 금액과 다를 수 있어요.",
  agentSection: "사입삼촌 정보",
  agentNotice:
    "한 도매처라도 사입삼촌 방문이면 꼭 입력해야 해요. 출고 문서(장끼)에 수령인으로 적혀요.",
  paymentSection: "결제 요약",
  finalAmount: "최종 결제 금액",
  /** 되돌릴 수 없는 실행이라 **누르기 전에** 말한다(`retail-cart` F1) */
  irreversible: "접수한 뒤에는 주문서에서 고칠 수 없어요.",
  submit: "주문 접수하기",
  submitting: "접수하는 중…",
  backToCart: "장바구니로",
  bankLabel: "입금 계좌",
  copy: "복사",
  /** 클립보드가 막힌 브라우저에서도 버튼이 조용히 아무 일도 안 하지 않는다 */
  copied: "복사했어요",
  copyFailed: "복사가 막혀 있어요. 계좌번호를 직접 옮겨 적어 주세요.",
} as const;

/** 빈 주문서. 장바구니에서 아무것도 안 고르고 주소로 직접 들어온 자리다 */
export const CHECKOUT_EMPTY = {
  title: "주문할 조합이 없어요",
  description: "장바구니에서 살 조합을 고르고 다시 오세요.",
} as const;

/** `주문 접수하기`를 못 누르는 이유. `disabled`만 걸고 이유를 안 적지 않는다 */
export const CHECKOUT_BLOCKED = {
  empty: "주문할 조합이 없어요.",
  agent: "사입삼촌 정보를 입력해 주세요.",
} as const;

/** 접수 요청 자체가 안 갔을 때. 서버가 문구를 안 줬을 때만 쓴다 */
export const PLACE_FAILED =
  "주문을 접수하지 못했어요. 잠시 후 다시 눌러 주세요.";

/**
 * `전체 적용` 안내 두 벌.
 *
 * **누르기 전과 누른 뒤의 말이 다르다.** 직전 회차에서 아직 안 한 일을 완료형으로
 * 말하는 화면이 결함으로 잡혔다(`500장으로 맞췄어요`인데 값은 900) — 예고는
 * 예고형으로, 결과는 과거형으로 적는다.
 */
export function bulkOverwriteHint(count: number): string {
  return `개별로 정한 ${count}곳도 일괄 설정으로 돌아가요.`;
}

export function bulkAppliedNotice(count: number): string {
  return count === 0
    ? "이미 모든 도매처가 일괄 설정을 따르고 있어요."
    : `${count}곳을 일괄 설정으로 맞췄어요.`;
}

/** 사입삼촌 2칸. 라벨·placeholder를 화면이 아니라 여기서 갖는다 */
export const AGENT_FIELD = {
  name: { label: "이름", placeholder: "예: 박삼촌" },
  phone: { label: "연락처", placeholder: "010-0000-0000" },
} as const;

/**
 * 사입삼촌 이름의 상한. **넘으면 자르지 않고 이유를 붙인다**(`derive.isAgentNameAcceptable`).
 * 값은 `features/account`의 `STORE_NAME_MAX`와 같은 40자다.
 */
export const AGENT_NAME_MAX = 40;

/**
 * 두 칸의 도움말과 이유.
 *
 * **친 글자를 조용히 고치지 않는다.** 하이픈·공백을 지우거나 숫자만 남기면
 * 사장이 자기가 무엇을 쳤는지 못 본다 — 수량 칸에서 다섯 회차 내리 재발한
 * 결함과 같은 종류라, 값은 그대로 두고 못 받는 값이면 이유만 붙인다.
 *
 * 글자 종류만 보던 때는 **`-` 한 글자가 두 칸을 다 통과했다**(F6). 이 값은
 * 장끼에 수령인으로 적혀서(RT-38) 사입삼촌이 물건을 못 받는다 — 그래서 이유가
 * "무슨 글자를 받는가"가 아니라 **"연락처·이름으로 쓸 수 있는가"**를 말한다.
 */
export const AGENT_PHONE_HELP =
  "하이픈 없이 숫자만 적어도 돼요. 예: 010-1234-5678";
export const AGENT_PHONE_ISSUE =
  "연락처로 쓸 수 없는 값이에요. 010-1234-5678처럼 자리수를 맞춰 주세요. 친 글자는 그대로 두었어요.";

export const AGENT_NAME_HELP = "장끼에 수령인으로 적히는 이름이에요.";
export const AGENT_NAME_ISSUE = `이름에는 글자나 숫자가 한 자는 있어야 하고 ${AGENT_NAME_MAX}자까지 적을 수 있어요. 친 글자는 그대로 두었어요.`;

/** 주문 완료 화면의 문장 전부 */
export const COMPLETE_TEXT = {
  title: "주문이 접수됐어요",
  /** 30분은 안내 문구일 뿐이다 — 소매에 알림 채널이 없어 타이머를 만들지 않는다(§5-6) */
  notice:
    "도매처가 영업시간 안에 30분 안으로 확인해요. 확정될 때 재고가 모자라면 그만큼 미송으로 넘어가요.",
  viewOrders: "주문 내역 보기",
  viewDetail: "이 주문 상세 보기",
} as const;

/**
 * 접수 결과가 없을 때. `?orderId=`가 없거나 그 주문이 서버에 없는 자리다 —
 * 빈 화면이나 0원짜리 주문서를 그리지 않고 사실을 말한다.
 */
export const COMPLETE_EMPTY = {
  title: "방금 접수한 주문이 없어요",
  description:
    "이 화면은 주문을 접수한 직후에만 보여요. 지난 주문은 주문 내역에서 볼 수 있어요.",
} as const;

/**
 * 모달을 닫은 뒤 포커스를 옮길 자리.
 *
 * 부분 접수 모달은 **누른 버튼이 없다** — 접수 결과에 안 된 건이 있으면 화면이
 * 열리자마자 뜬다. Radix는 닫을 때 열기 전에 포커스가 있던 곳으로 되돌리는데,
 * 그 자리가 방금 떠나온 주문서라 포커스가 `<body>`로 떨어진다. 그러면 키보드
 * 사용자는 닫은 뒤 문서 맨 위부터 Tab을 다시 밟아야 한다(WCAG 2.4.3 · 직전
 * 회차 F3). 조건부 렌더라 `onCloseAutoFocus`로 **부르는 쪽이 정한 자리**로 보낸다(F4).
 */
export const COMPLETE_ACTION_ID = "order-complete-view-orders";

/**
 * 취소 흐름 버튼에 박는 id.
 *
 * 되돌릴 수 없는 실행 전후에 포커스를 옮길 자리를 찾는 데 쓴다 — 확인 단계가
 * 나타나고 사라질 때 그냥 두면 포커스가 `<body>`로 떨어진다(WCAG 2.4.3).
 * `packages/ui`의 `Button`은 ref를 받지 않으므로 장바구니 `선택 삭제`와 같은
 * 방식으로 id를 쓴다(`retail-cart`).
 */
export const CANCEL_ACTION_ID = {
  cancel: "order-detail-cancel",
  confirm: "order-detail-cancel-confirm",
} as const;

/** 부분 접수 모달. **제목·본문·버튼 어디에도 `실패`가 없다**(RT-43) */
export const PARTIAL_TEXT = {
  title: "일부 도매처에서 접수가 안 됐어요",
  sub: "접수된 건은 그대로 진행돼요. 안 된 건만 다시 시도하면 되고, 그 상품은 장바구니에 남아 있어요.",
  viewInCart: "장바구니에서 보기",
  toCart: "장바구니로",
  /** 안 된 도매처의 조합만 실은 주문서로 간다 — 서버 없이 "다시 보냈다"고 단정하지 않는다 */
  retry: "안 된 건만 다시 주문서로",
  noticeTail: "로 접수된 건은 주문 내역에서 확인할 수 있어요.",
} as const;

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 상태 어휘. **표기를 컴포넌트에 적지 않는다**
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 통합 행 배지 표기. 키는 서버 enum(`ActionBadge`) 그대로다.
 *
 * `WAITING_SHIPMENT`(전부 확정 이상, 아직 아무것도 안 나감)는 사양 §4 라벨 통일
 * 5종(확정 대기 · 접수됨 · 수령 가능 · 출고 완료 · 취소됨)에 없는 상태다. `접수됨`은
 * 완료 화면의 접수 결과와 겹쳐서 못 쓰고, BE 주석("준비 중이에요")을 따랐다 —
 * 매핑표 확정은 `04-wire.md` §3에 남겼다.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_ACCEPT: "확정 대기",
  WAITING_SHIPMENT: "준비 중",
  READY_TO_PICK_UP: "수령 가능",
  DONE: "출고 완료",
  CANCELLED: "취소됨",
};

/**
 * 라인 상태 표기.
 *
 * `BACKORDER`가 **`재고 소진 · 미송`**이다 — 장바구니·상품 상세의
 * `재고 소진 · 미송 가능`(게이트 Q2)과 **일부러 다른 말**이다. 담기 전은
 * "미송으로 주문할 수 있다"는 가능성이고, 여기는 "이미 미송으로 넘어갔다"는
 * 사실이다(RT-59: 미송은 도매처가 확정할 때 생긴다). 같은 말로 적으면 사장이
 * 주문한 물건이 아직 살 수 있는 상태인 줄 안다.
 */
export const LINE_STATUS_LABEL: Record<OrderLineStatus, string> = {
  SHIPPED: "출고 완료",
  READY: "수령 가능",
  BACKORDER: "재고 소진 · 미송",
  PARTIAL: "부분 출고",
  PENDING: "확정 대기",
  PREPARING: "준비 중",
  CANCELED: "취소됨",
};

/** 확정 전 라인이 지금 무엇을 기다리는지. 상태 배지만으론 알 수 없다 */
export const LINE_PENDING_NOTE = "도매처 재고 확인 중";

/** 포장은 끝났는데 아직 안 나간 장끼(`shippedAt: null`)의 시각 자리 */
export const SHIPMENT_PACKED = "포장 완료 · 출고 전";

/** 주문 내역 화면의 문장 전부 */
export const ORDERS_TEXT = {
  title: "주문 내역",
  sub: "여러 도매처에 한 번에 넣은 주문은 한 줄로 묶여요. 펼치면 어느 도매처에 넣었는지 볼 수 있어요.",
  reset: "초기화",
  /* 좁은 폭 카드의 펼침 버튼. 표에서는 chevron이 하던 일이라 글자가 필요 없었다 */
  expand: "도매처 보기",
  collapse: "도매처 접기",
  /** 펼친 줄 끝. 도매처별 상태는 요약 응답에 없어 상세로 안내한다 */
  legDetail: "도매처별 상태는 상세에서 볼 수 있어요.",
  /**
   * 통합 행 배지 규칙 안내.
   *
   * 배지는 서버가 "지금 사장이 할 일"로 정한다 — 도매처마다 상태가 다를 때 어느
   * 상태 이름을 골라도 나머지에 대해 거짓이 되기 때문이다(BE `ActionBadge`).
   * 출고 칸은 장수를 센다 — `3장 / 12장`은 12장 중 3장을 받았다는 뜻이다.
   */
  rule: "도매처마다 상태가 다를 때는 지금 할 일 하나를 배지로 보여줘요. 출고 칸은 장수를 세요 — “3장 / 12장”은 12장 중 3장을 받았다는 뜻이에요. 도매처별 상태는 상세에서 보세요.",
  empty: {
    title: "조건에 맞는 주문이 없어요",
    description: "기간·도매처·상태를 바꾸거나 조건을 지워 보세요.",
  },
  /** 담긴 것이 아예 없을 때. 조건 문제가 아니라 아직 주문한 적이 없는 것이다 */
  noOrders: {
    title: "아직 주문한 적이 없어요",
    description: "마음에 드는 상품을 담고 주문해 보세요.",
  },
} as const;

/**
 * 주문 내역 열 이름. **표와 카드가 같은 이 상수를 읽는다.**
 *
 * 960px 아래에서 표가 세로 카드로 바뀌는데(F1), 카드가 라벨을 따로 적으면
 * 폭에 따라 같은 칸이 다른 이름으로 불린다.
 *
 * `출고(장수)`에 단위가 붙어 있는 것이 F8의 답이다 — 요약 응답이 도매처 건이 아니라
 * **장수**(`receivedQty`·`totalQty`)를 주므로 열 이름이 그것을 말한다.
 */
export const LIST_HEADERS = {
  expand: "펼치기",
  ordered: "주문일 · 통합 주문번호",
  wholesaler: "도매처",
  sheets: "총 장수",
  amount: "금액",
  status: "상태",
  shipment: "출고(장수)",
} as const;

/** 주문 상품 표/카드의 열 이름. 위와 같은 이유로 한 곳에 있다 */
export const LINE_HEADERS = {
  product: "상품",
  option: "옵션",
  wholesaler: "도매처",
  qty: "수량",
  price: "단가",
  subtotal: "소계",
  status: "상태",
  favorite: "찜",
} as const;

/** 미송 장수 한 줄. 목록 출고 칸과 라인 둘째 줄이 같이 쓴다 */
export function backorderNote(sheets: number): string {
  return `미송 ${sheets}${QTY_UNIT}`;
}

/**
 * 필터 축이 안 걸린 상태. **`전체`는 값이 아니라 해제다** — 그래서 주소에서
 * 빠지고, `초기화`가 그냥 `/orders`가 된다.
 * (`features/catalog`에도 같은 상수가 있다. feature마다 중복 정의가 정답이다)
 */
export const FILTER_ALL = "all";
export const FILTER_ALL_LABEL = {
  wholesaler: "도매처 전체",
  status: "상태 전체",
} as const;

/**
 * 기간 축. **기본이 `최근 3개월`이고 해제 상태가 아니다** — 주문 내역은 오래된
 * 것까지 다 세우면 훑을 수 없는 목록이라 확정 와이어프레임도 3개월로 열린다.
 *
 * `months`가 서버 파라미터 `from`이 된다(`derive.periodFrom`) — 기간은 서버가
 * 거른다. null이면 `from`을 안 보낸다.
 */
export const DEFAULT_PERIOD = "3m";

export const PERIODS: readonly {
  value: string;
  label: string;
  months: number | null;
}[] = [
  { value: "1m", label: "최근 1개월", months: 1 },
  { value: DEFAULT_PERIOD, label: "최근 3개월", months: 3 },
  { value: "6m", label: "최근 6개월", months: 6 },
  { value: FILTER_ALL, label: "전체 기간", months: null },
];

/** 정렬 2종. 늘 하나가 골라져 있어서 해제 상태가 없다 */
export const ORDER_SORTS: readonly { value: OrderSort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
];

export const DEFAULT_ORDER_SORT: OrderSort = "latest";

/** 주문 상세 화면의 문장 전부 */
export const DETAIL_TEXT = {
  stats: {
    amount: "주문 금액",
    progress: "출고 진행",
    unpaid: "미수 잔액",
  },
  /**
   * 미수는 **출고 시점**에 생긴다(RT-64) — 주문 금액 전체가 미수가 아니다.
   *
   * 단위가 `건`이 아니라 `장`인 것이 F8의 답이다. 이 카드 한 장 안에서 `건`이
   * 도매처·라인·장끼 셋을 뜻하고 있었다 — 지금은 `건`이 도매처 건 하나만
   * 가리키고, 라인과 장끼는 자기 낱말로 센다.
   */
  unpaidFrom: (count: number) => `장끼 ${count}장에서 발생`,
  /** 장끼에 단가가 없어 금액을 못 낸 자리(`04-wire.md` §3) */
  unpaidUnknown: "장끼 금액을 알 수 없어요",
  backorderWaiting: (count: number) => `미송 라인 ${count}개 대기 중`,
  cancel: "주문 취소",
  /**
   * 누르기 전에 뜨는 말. 취소는 **도매처별**로 되고(스펙) 되돌리기 API가 없어
   * 확인 단계를 둔다(F9 — 되돌릴 수 없는 실행에는 확인 하나가 있어야 한다).
   */
  cancelOpen:
    "도매처가 확정하기 전까지는 주문을 취소할 수 있어요. 도매처별로 취소되고, 이미 확정된 도매처 건은 그대로 남아요. 취소하면 되돌릴 수 없어요.",
  /** 확인 단계. 실행 버튼과 그만두기 버튼이 같이 선다 */
  cancelConfirm: "정말 취소할까요? 되돌릴 수 없어요.",
  cancelConfirmAction: "취소 확정",
  cancelDismiss: "그만두기",
  cancelling: "취소하는 중…",
  /**
   * 잠긴 **이유마다 다른 말**을 한다(F3).
   *
   * 한 벌로 두던 때는 취소된 주문이 `이미 확정돼서 잠겼어요`라고 말해서, 머리
   * 배지(`취소됨`)와 반대되는 문장이 한 화면에 같이 섰다.
   */
  cancelLocked: {
    CANCELED: "이 주문은 이미 취소됐어요.",
    SHIPPED:
      "이미 출고된 건이 있어서 주문을 취소할 수 없어요. 반품은 도매처와 전화로 진행해요.",
    CONFIRMED:
      "도매처가 이 주문을 확정해서 취소 버튼이 잠겼어요. 취소가 필요하면 도매처에 전화해 주세요.",
    EMPTY: "이 주문에는 취소할 도매처 건이 없어요.",
  } as Record<CancelLock, string>,
  cancelDone: "주문을 취소했어요.",
  /** 일부만 취소됐을 때. 어느 도매처가 왜 안 됐는지는 서버 문구를 그대로 잇는다 */
  cancelPartial: (done: number, kept: number) =>
    `${done}곳은 취소했고 ${kept}곳은 취소하지 못했어요.`,
  cancelNone: "취소된 도매처 건이 없어요.",
  /** 취소 요청 자체가 안 갔을 때. 서버가 문구를 안 줬을 때만 쓴다 */
  cancelFailed: "취소 요청이 닿지 않았어요. 잠시 후 다시 눌러 주세요.",
  /** 취소된 도매처 건. `확정하면 표시돼요`는 영영 오지 않을 말이다(F3) */
  legCanceled: "취소된 건이에요",
  lineSection: "주문 상품",
  shipmentSection: "출고 기록",
  shipmentSub:
    "출고될 때마다 거래명세서(장끼)가 자동으로 발행돼요. 문서는 고칠 수 없고 다시 볼 수만 있어요.",
  shipmentEmpty: "아직 출고된 건이 없어요.",
  statement: "장끼 보기",
  paymentSection: "결제 · 수령",
  returnNotice: "반품은 도매처와 전화로 진행해요. 환불은 지원하지 않아요.",
  notFound: {
    title: "그 주문을 찾을 수 없어요",
    description: "주소가 바뀌었거나 지워진 주문이에요.",
    action: "주문 내역으로",
  },
  total: "합계",
  /** 도매처별 연번 앞에 붙는 말. 통합 번호와 나란히 선다(RT-40) */
  legNo: (no: number) => `도매처 연번 ${no}`,
} as const;

/** 거래명세서(장끼) 모달의 문장 전부 */
export const STATEMENT_TEXT = {
  title: "거래명세서",
  sub: "출고할 때 시스템이 자동으로 만든 문서예요. 고칠 수 없고 다시 볼 수만 있어요.",
  issuer: "발행",
  receiver: "수신",
  shippedAt: "출고 일시",
  receiverName: "수령인",
  origin: "원주문",
  print: "인쇄",
  save: "저장",
  /** 잠긴 두 버튼 옆에 글자로 선다. 눌러도 아무 일이 없는 버튼으로 두지 않는다 */
  disabledReason: "인쇄·저장은 아직 준비 중이에요.",
  toSettlement: "정산에서 보기",
  /** 단가를 못 찾은 줄의 금액 자리 */
  priceUnknown: "—",
} as const;

/**
 * 장끼의 미수 문구.
 *
 * **`FIFO`라는 낱말이 없다**(§3-0 D). 입금 배정은 도매 사장이 건별로 수기로
 * 정하는 일이라, 배정이 없으면 "배정된 입금 없음"이라고 사실만 적는다.
 */
export const STATEMENT_UNPAID_NONE = "배정된 입금 없음";

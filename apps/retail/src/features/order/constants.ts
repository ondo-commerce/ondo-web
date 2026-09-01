import { QTY_UNIT } from "@/shared/qty";
import type {
  AcceptStatus,
  CancelLock,
  OrderLineStatus,
  OrderStatus,
  OrderSort,
  PaymentMethod,
  PickupMethod,
  ReorderResult,
} from "./types";

/**
 * 주문 화면들의 고정 문구.
 *
 * **컴포넌트 안에 상태 문자열과 문장을 적지 않는다.** 같은 말이 화면 넷과
 * 모달 셋에 흩어지면 한쪽만 고쳐진다 — 원본의 §6-2·§6-3(배지 표기가 화면마다
 * 어긋남)이 정확히 그 사고였다.
 */

export const PICKUP_LABEL: Record<PickupMethod, string> = {
  DIRECT: "직접 수령",
  AGENT: "사입삼촌 방문",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: "계좌 이체",
  CASH: "현금",
};

/** 도매처 드롭다운의 첫 항목. 값이 아니라 상태다 — `types.ts`의 `PickupChoice` 참조 */
export const FOLLOW_BULK_LABEL = "일괄 설정 따름";

/**
 * 접수 결과 배지 표기.
 *
 * `실패`라는 낱말을 쓰지 않는다(RT-43). 안 된 건은 다시 시도하면 되는 일이고,
 * 실패라고 부르면 사장이 주문 전체가 날아갔다고 읽는다.
 */
export const ACCEPT_LABEL: Record<AcceptStatus, string> = {
  ACCEPTED: "접수됨",
  CHECKING: "접수 확인 중…",
  REJECTED: "접수 안 됨",
};

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
  agentSection: "사입삼촌 정보",
  agentNotice:
    "한 도매처라도 사입삼촌 방문이면 꼭 입력해야 해요. 출고 문서(장끼)에 수령인으로 적혀요.",
  paymentSection: "결제 요약",
  finalAmount: "최종 결제 금액",
  /** 되돌릴 수 없는 실행이라 **누르기 전에** 말한다(`retail-cart` F1) */
  irreversible: "접수한 뒤에는 주문서에서 고칠 수 없어요.",
  submit: "주문 접수하기",
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
  delayTitle: "접수가 늦어질 때",
  delaySub:
    "도매처 쪽 응답이 늦으면 그 도매처만 “접수 확인 중…”으로 두고 자동으로 다시 시도해요. 끝까지 접수되지 않으면 주문 내역에서 알려드려요.",
} as const;

/**
 * 접수 결과가 없을 때.
 *
 * 결과는 세션 스토어에 있어서 **새로고침하면 사라진다.** 그때 빈 화면이나
 * 0원짜리 주문서를 그리지 않고 사라졌다는 사실을 말한다 — 사장이 방금 넣은
 * 주문이 없어진 줄 알면 같은 주문을 한 번 더 넣는다.
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
 * 회차 F3).
 *
 * **"누른 버튼이 있으면 Radix 기본값으로 충분하다"고 적어 뒀던 것은 틀렸다**(F4).
 * 세 모달 다 `{열렸나 ? <Dialog/> : null}` 조건부 렌더라, 닫을 때 상태가 지워지면서
 * 컴포넌트가 먼저 사라져 Radix의 되돌리기가 돌 기회를 잃는다. 그래서 지금은
 * 세 모달 모두 `onCloseAutoFocus`로 **부르는 쪽이 정한 자리**로 보낸다.
 */
export const COMPLETE_ACTION_ID = "order-complete-view-orders";

/**
 * 취소 · 되돌리기 두 버튼에 박는 id.
 *
 * 되돌릴 수 없는 실행 뒤에 포커스를 옮길 자리를 찾는 데 쓴다 — `주문 취소`는
 * 누르면 `disabled`가 되고 `되돌리기`는 누르면 사라져서, 그냥 두면 두 번 다
 * 포커스가 `<body>`로 떨어진다(WCAG 2.4.3). `packages/ui`의 `Button`은 ref를
 * 받지 않으므로 장바구니의 `선택 삭제`와 같은 방식으로 id를 쓴다(`retail-cart`).
 */
export const CANCEL_ACTION_ID = {
  cancel: "order-detail-cancel",
  undo: "order-detail-cancel-undo",
} as const;

/**
 * `?scenario=`로 켠 화면임을 밝히는 줄.
 *
 * 주소 쿼리는 서버가 없어서 부분 접수·지연을 확인할 유일한 길이라 남겨 두지만,
 * **안내 없이 두면 주소만 바꾼 사장이 자기 주문이 진짜로 반려된 줄 안다**(F10 ·
 * `retail-account` F6과 같은 계열). 그래서 켠 화면에만, 켜져 있는 동안만 뜬다 —
 * 기본 주소(`/checkout`)에는 이 줄이 없다. 서버가 붙으면 `OrderScenario`와 함께
 * 이 상수도 같이 지운다.
 */
export const SCENARIO_NOTICE =
  "이 화면은 접수 결과를 확인해 보려고 주소로 켠 예시예요. 실제 도매처 응답이 아니고, 주소에서 scenario를 빼면 평소 화면으로 돌아가요.";

/** 부분 접수 모달. **제목·본문·버튼 어디에도 `실패`가 없다**(RT-43) */
export const PARTIAL_TEXT = {
  title: "일부 도매처에서 접수가 안 됐어요",
  sub: "접수된 건은 그대로 진행돼요. 안 된 건만 다시 시도하면 되고, 그 상품은 장바구니에 남아 있어요.",
  viewInCart: "장바구니에서 보기",
  toCart: "장바구니로",
  retry: "안 된 건만 다시 시도",
  noticeTail: "로 접수된 건은 주문 내역에서 확인할 수 있어요.",
  /** 다시 시도한 **뒤에** 뜨는 말. 일어난 일만 과거형으로 적는다 */
  retried: "안 된 건을 다시 보냈어요. 도매처 응답을 기다리는 중이에요.",
} as const;

/* ────────────────────────────────────────────────────────────────────────
   접수된 뒤 — 상태 어휘. **표기를 컴포넌트에 적지 않는다**
   ──────────────────────────────────────────────────────────────────────── */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "확정 대기",
  PARTIAL_SHIPPED: "부분 출고",
  READY: "수령 가능",
  SHIPPED: "출고 완료",
  CANCELED: "취소됨",
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
  BACKORDER: "재고 소진 · 미송",
  READY: "수령 가능",
  PENDING: "확정 대기",
  CANCELED: "취소됨",
};

/** 확정 전 라인이 지금 무엇을 기다리는지. 상태 배지만으론 알 수 없다 */
export const LINE_PENDING_NOTE = "도매처 재고 확인 중";

export const REORDER_RESULT_LABEL: Record<ReorderResult, string> = {
  ADDED: "담김",
  PRICE_UP: "단가 인상 · 담김",
  SEASON_ENDED: "시즌 종료 · 제외",
  DELISTED: "게시 내림 · 제외",
};

/** 주문 내역 화면의 문장 전부 */
export const ORDERS_TEXT = {
  title: "주문 내역",
  sub: "여러 도매처에 한 번에 넣은 주문은 한 줄로 묶여요. 펼치면 도매처별 상태를 볼 수 있어요.",
  reset: "초기화",
  reorder: "다시 주문",
  /* 좁은 폭 카드의 펼침 버튼. 표에서는 chevron이 하던 일이라 글자가 필요 없었다 */
  expand: "도매처별 상태 보기",
  collapse: "도매처별 상태 접기",
  /**
   * 통합 행 배지 규칙 안내.
   *
   * 원본의 `가장 앞선 단계를 한 줄에 보여주고`를 **고쳤다.** 그 문장은 부분 출고
   * 행을 설명하지 못한다 — 가장 앞선 단계는 라비앙의 `확정 대기`인데 배지는
   * `부분 출고`다. §6-2·§6-3이 "배지가 어긋난다 / 규칙이 없다"고 이미 지목한
   * 자리라 문구와 규칙을 같이 정한다(가정 A1-a).
   */
  rule: "도매처마다 상태가 다를 때는 묶음 전체의 진행 단계 하나를 보여줘요. 출고 칸은 도매처를 세요 — “3건 중 2건”은 도매처 3곳 중 2곳에서 물건이 나갔다는 뜻이에요. 자세한 건 펼쳐서 보세요.",
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
 * 폭에 따라 같은 칸이 다른 이름으로 불린다. `retail-backorder`가 `CARD_LABEL`을
 * 표 머리글의 별칭으로 둔 것과 같은 이유다.
 *
 * `출고(도매처)`에 단위가 붙어 있는 것이 F8의 답이다 — `3건 중 2건`의 `건`이
 * 무엇을 세는지 열 이름이 말한다. 라인은 `라인 N개`, 장끼는 `장끼 N장`으로
 * 따로 부른다.
 */
export const LIST_HEADERS = {
  expand: "펼치기",
  ordered: "주문일 · 통합 주문번호",
  wholesaler: "도매처",
  sheets: "총 장수",
  amount: "금액",
  status: "상태",
  shipment: "출고(도매처)",
  reorder: "다시 주문",
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

/**
 * 펼친 줄에서 미송 몫을 말하는 한 줄.
 *
 * 도매처 배지가 `부분 출고`로 바뀌는 것만으로는 **얼마가 안 나갔는지**를 알 수
 * 없다(F5). 금액은 주문 금액 그대로 두고 — 펼친 줄 셋의 합이 상세 합계와 같아야
 * 한다(가정 A5-c) — 안 나간 몫만 따로 말한다.
 */
export function legBackorderNote(sheets: number): string {
  return `미송 ${sheets}${QTY_UNIT}`;
}

/** 다시 주문 모달의 문장 전부 */
export const REORDER_TEXT = {
  title: "이 주문을 다시 담을게요",
  sub: "담기 전에 어떻게 되는지 먼저 보여드려요. 담을 수 없는 상품은 빼고 담아요.",
  notice:
    "단가가 오른 상품은 지금 가격으로 담겨요. 제외된 상품은 담기지 않아요.",
  addable: "담을 수 있는 것",
  cancel: "취소",
  submit: "담을 수 있는 것만 담기",
  /** 담을 것이 없을 때 버튼 옆에 서는 이유 */
  blocked: "담을 수 있는 상품이 없어요.",
  toCart: "장바구니로 가기",
} as const;

/** 담은 **뒤에** 뜨는 말. 예고가 아니라 결과라 과거형이다 */
export function reorderAddedNotice(count: number): string {
  return `장바구니에 ${count}개 조합을 담았어요.`;
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
 * `since`를 `new Date()`로 만들지 않는다. 더미 날짜는 고정인데 오늘을 기준으로
 * 세면 시간이 지날수록 목록이 저절로 비고, 화면이 비는 이유가 코드가 아니라
 * 달력에 있게 된다. API가 붙으면 서버가 기간을 계산한다.
 */
export const DEFAULT_PERIOD = "3m";

export const PERIODS: readonly {
  value: string;
  label: string;
  /** `YYYYMMDD`. null이면 기간을 안 건다 */
  since: string | null;
}[] = [
  { value: "1m", label: "최근 1개월", since: "20260801" },
  { value: DEFAULT_PERIOD, label: "최근 3개월", since: "20260601" },
  { value: "6m", label: "최근 6개월", since: "20260301" },
  { value: FILTER_ALL, label: "전체 기간", since: null },
];

/** 정렬 2종. 늘 하나가 골라져 있어서 해제 상태가 없다 */
export const ORDER_SORTS: readonly { value: OrderSort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
];

export const DEFAULT_ORDER_SORT: OrderSort = "latest";

/** 주문 상세 화면의 문장 전부 */
export const DETAIL_TEXT = {
  reorderAll: "이 주문 전체 다시 담기",
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
  backorderWaiting: (count: number) => `미송 라인 ${count}개 대기 중`,
  cancel: "주문 취소",
  /**
   * 누르기 전에 뜨는 말. **되돌릴 수 있다고 말한 만큼 실제로 되돌아간다** —
   * 장바구니 `선택 삭제`가 확인 모달 대신 되돌리기를 붙여 둔 것과 같은
   * 등급이라 같은 장치를 준다(게이트 Q3 ③ · `retail-cart` F1 · F9).
   */
  cancelOpen:
    "도매처가 확정하기 전까지는 주문을 취소할 수 있어요. 취소한 직후에는 되돌릴 수 있고, 다른 주문을 취소하거나 이 화면을 새로 열면 되돌릴 수 없어요.",
  /**
   * 잠긴 **이유마다 다른 말**을 한다(F3).
   *
   * 한 벌로 두던 때는 취소된 주문이 `이미 확정돼서 잠겼어요`라고 말해서, 머리
   * 배지(`취소됨`)와 반대되는 문장이 한 화면에 같이 섰다. 사장이 자기가 취소한
   * 것인지 도매처가 확정해서 막힌 것인지 알 수 없었다.
   */
  cancelLocked: {
    CANCELED:
      "이 주문은 이미 취소됐어요. 같은 상품이 필요하면 “이 주문 전체 다시 담기”로 새로 주문할 수 있어요.",
    SHIPPED:
      "이미 출고된 건이 있어서 주문을 취소할 수 없어요. 반품은 도매처와 전화로 진행해요.",
    CONFIRMED:
      "도매처가 이 주문을 확정해서 취소 버튼이 잠겼어요. 취소가 필요하면 도매처에 전화해 주세요.",
    EMPTY: "이 주문에는 취소할 도매처 건이 없어요.",
  } as Record<CancelLock, string>,
  cancelDone: "주문을 취소했어요.",
  cancelUndo: "되돌리기",
  cancelUndone: "취소를 되돌렸어요. 주문이 원래 상태로 돌아왔어요.",
  /** 취소된 도매처 건. `확정하면 표시돼요`는 영영 오지 않을 말이다(F3) */
  legCanceled: "취소된 건이에요",
  lineSection: "주문 상품",
  shipmentSection: "출고 기록",
  shipmentSub:
    "출고될 때마다 거래명세서(장끼)가 자동으로 발행돼요. 문서는 고칠 수 없고 다시 볼 수만 있어요.",
  shipmentEmpty: "아직 출고된 건이 없어요.",
  statement: "장끼 보기",
  paymentSection: "결제 · 수령",
  /** 확정 전 도매처가 조용히 빠지지 않게 (가정 A5-d) */
  notConfirmed: "도매처가 확정하면 여기에 표시돼요",
  returnNotice: "반품은 도매처와 전화로 진행해요. 환불은 지원하지 않아요.",
  notFound: {
    title: "그 주문을 찾을 수 없어요",
    description: "주소가 바뀌었거나 지워진 주문이에요.",
    action: "주문 내역으로",
  },
  total: "합계",
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
} as const;

/**
 * 장끼의 미수 문구.
 *
 * **`FIFO`라는 낱말이 없다**(§3-0 D). 입금 배정은 도매 사장이 건별로 수기로
 * 정하는 일이라, 배정이 없으면 "배정된 입금 없음"이라고 사실만 적는다.
 */
export const STATEMENT_UNPAID_NONE = "배정된 입금 없음";

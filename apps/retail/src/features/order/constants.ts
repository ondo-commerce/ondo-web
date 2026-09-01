import type { AcceptStatus, PaymentMethod, PickupMethod } from "./types";

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
 * 연락처 칸의 도움말.
 *
 * **친 글자를 조용히 고치지 않는다.** 하이픈·공백을 지우거나 숫자만 남기면
 * 사장이 자기가 무엇을 쳤는지 못 본다 — 수량 칸에서 다섯 회차 내리 재발한
 * 결함과 같은 종류라, 값은 그대로 두고 못 받는 형식이면 이유만 붙인다.
 */
export const AGENT_PHONE_HELP = "숫자와 하이픈(-)으로 적어 주세요.";
export const AGENT_PHONE_ISSUE =
  "숫자와 하이픈(-)만 받을 수 있어요. 친 글자는 그대로 두었어요.";

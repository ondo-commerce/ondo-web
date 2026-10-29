import type { WholesaleSchema } from "../../wholesale";

/**
 * 미수 자동 답의 원본 한 줄과 금액 변환(loop-07 `01-plan.md` §4-1 6, 7, 10). **목 규칙 = BE 규칙**이다.
 *
 * 순수 함수만 둔다. 원본(정산 요약)을 어디서 읽는지는 모른다 — 목은 `../wholesale/settlement.ts`의
 * `mockReceivableRows`, 골든셋은 `receivables` 표, BE는 gateway 요약과 선수금 op에서 같은 모양을 만든다.
 *
 * 지키는 것 하나: **틀린 금액을 말하느니 사람에게 넘긴다**(D34, D37). 부호와 이상값은 {@link toReceivableFacts}
 * 한 곳에서만 본다. 여기서 통과한 값만 소매에게 나간다.
 */

type ChatReceivableFacts = WholesaleSchema<"ChatReceivableFacts">;

/**
 * 판정 입력 한 줄 = (도매처, 소매처) 쌍 하나의 정산 요약. 금액은 원 단위 정수.
 *
 * `balance`는 gateway 부호(플러스 = 소매가 갚을 돈)다. 도매 원장 `ledgerBalance`(음수 = 채무)는 읽지 않는다 —
 * 부호를 뒤집는 지점을 하나로 두려고(Codex 5).
 */
export interface InquiryReceivable {
  wholesalerId: number;
  retailerId: number;
  /** 갚을 돈 − 선수금. 플러스 = 갚을 돈 */
  balance: number;
  /** 주문별 (출고액 − 배정액) 합 */
  unpaid: number;
  /** 입금 − 배정 합(남은 선수금) */
  prepaid: number;
  /** 연체. 출고 줄이 하나뿐인 주문만 센다(§4-1 11) */
  overdue: { amount: number; count: number; maxDays: number };
  /** 원본이 금액을 보장하는가. false면 넘김(나눠 출고, 입금 취소, 조정, 취소 주문 판매 줄, §4-1 8) */
  exact: boolean;
  /** 원본을 읽은 시각(ISO). 답의 `checkedAt`이 이 값이다 — 판정 시각이 아니다(S1-6) */
  asOf: string;
}

/** 원본 전체(거르지 않은 것). 고르는 건 판정이 한다. **던지면** 조회 실패(LOOKUP_FAILED)다 */
export type InquiryReceivableSource = () => readonly InquiryReceivable[];

/** 이 방의 도매처 + 이 방의 소매처 한 줄. 화면이 보낸 값이 아니라 방의 값으로 고른다(§4-1 5) */
export function receivableOf(
  rows: readonly InquiryReceivable[],
  wholesalerId: number,
  retailerId: number,
): InquiryReceivable | null {
  return (
    rows.find(
      (r) => r.wholesalerId === wholesalerId && r.retailerId === retailerId,
    ) ?? null
  );
}

/** 이상값이 어느 규칙에 걸렸는지. 테스트와 문서가 읽는다. 판정은 걸렸는지만 본다 */
export type ReceivableAnomaly =
  | "NOT_EXACT"
  | "NOT_INTEGER"
  | "NEGATIVE"
  | "SIGN_MISMATCH"
  | "MIXED_BALANCE"
  | "OVERDUE_COUNT_AMOUNT"
  | "OVERDUE_DAYS"
  | "OVERDUE_OVER_UNPAID";

export type ReceivableConversion =
  | { ok: true; facts: ChatReceivableFacts; checkedAt: string }
  | { ok: false; anomaly: ReceivableAnomaly };

const isWhole = (n: number) => Number.isInteger(n);

/**
 * 원본 한 줄 → 소매에게 나갈 facts. 아래 하나라도 맞으면 금액 답 없이 넘김(`AMOUNT_UNSURE`, §4-1 7):
 *  1. `exact` false
 *  2. 정수 아닌 값, NaN(`balance` 포함 전부) / 음수(`balance` 빼고 전부 — balance만 마이너스가 뜻이 있다)
 *  3. `unpaid − prepaid ≠ balance` — 부호가 뒤집혔거나 원본끼리 안 맞는다
 *  4. `unpaid > 0`이고 `prepaid > 0` — 배분 안 된 입금이 있다. 갚을 돈에서 뺄지 사람이 정한다(Codex 1)
 *  5. 연체 건수와 연체 금액 중 하나만 0이 아니다
 *  6. 연체 건수 > 0인데 최대 일수 < 1
 *  7. 연체 금액 > 갚을 돈
 */
export function toReceivableFacts(
  row: InquiryReceivable,
): ReceivableConversion {
  const { balance, unpaid, prepaid, overdue } = row;
  const nums = [
    balance,
    unpaid,
    prepaid,
    overdue.amount,
    overdue.count,
    overdue.maxDays,
  ];
  if (!row.exact) return { ok: false, anomaly: "NOT_EXACT" };
  if (!nums.every(isWhole)) return { ok: false, anomaly: "NOT_INTEGER" };
  if (nums.slice(1).some((n) => n < 0))
    return { ok: false, anomaly: "NEGATIVE" };
  if (unpaid - prepaid !== balance)
    return { ok: false, anomaly: "SIGN_MISMATCH" };
  if (unpaid > 0 && prepaid > 0) return { ok: false, anomaly: "MIXED_BALANCE" };
  if (overdue.count > 0 !== overdue.amount > 0)
    return { ok: false, anomaly: "OVERDUE_COUNT_AMOUNT" };
  if (overdue.count > 0 && overdue.maxDays < 1)
    return { ok: false, anomaly: "OVERDUE_DAYS" };
  if (overdue.amount > unpaid)
    return { ok: false, anomaly: "OVERDUE_OVER_UNPAID" };
  return {
    ok: true,
    facts: {
      outstandingAmount: unpaid,
      prepaidAmount: prepaid,
      overdue: {
        count: overdue.count,
        amount: overdue.amount,
        maxDaysOverdue: overdue.maxDays,
      },
    },
    checkedAt: row.asOf,
  };
}

/** 원 단위 정수에 세 자리 쉼표. 반올림, 줄임(만 원, k) 없음. 로캘에 기대지 않는다(서버 런타임마다 다르다) */
export function formatWon(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/**
 * 미수 답 본문(§4-1 10, 템플릿이 계약이다). 이 글이 소매에게 그대로 간다.
 *  A 갚을 돈 > 0, 연체 0 / B 갚을 돈 > 0, 연체 있음 / C 갚을 돈 0, 선수금 0 / D 갚을 돈 0, 선수금 > 0.
 * 갚을 돈과 선수금이 둘 다 0이 아닌 경우는 {@link toReceivableFacts}가 이미 넘겼다.
 */
export function receivableReplyBody(f: ChatReceivableFacts): string {
  if (f.outstandingAmount > 0)
    return f.overdue.count > 0
      ? `갚을 돈은 ${formatWon(f.outstandingAmount)}이에요. 그중 기한 지난 것 ${f.overdue.count}건, ${formatWon(f.overdue.amount)}이에요`
      : `갚을 돈은 ${formatWon(f.outstandingAmount)}이에요. 기한 지난 것은 없어요`;
  return f.prepaidAmount > 0
    ? `지금 갚을 돈은 없어요. 미리 낸 돈(선수금) ${formatWon(f.prepaidAmount)}이 남아 있어요`
    : "지금 갚을 돈은 없어요";
}

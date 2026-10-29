import type { InquiryReceivable } from "./receivable";

/**
 * 채팅 목 전용 미수 원본. 정산 목(`../wholesale/settlement.ts`)은 도매처 101 한 곳의 장부라 **다른 도매처 몫이 없다.**
 * 소매 "나"(봄봄상회 1)의 두 번째 방 33(라온 102)이 미수를 물으면 이 표에서 읽는다(loop-07 §5-4 2).
 *
 * 값은 방 33 시드 메시지("갚을 돈 52,000원이에요. 기한 지난 것은 없어요")와 같다. 소매 e2e 가짜 API의
 * 정산 화면(`e2e/side-02/retail/stub-api.ts`, 무드온 52,000원)과는 상관이 없다 — 그쪽은 손대지 않는다.
 * 골든셋 `receivables` 표의 `source: "extraReceivables.ts"` 행이 이 값과 같아야 한다(`inquiry.test.ts`가 본다).
 */
export function chatExtraReceivables(asOf: string): InquiryReceivable[] {
  return [
    {
      wholesalerId: 102,
      retailerId: 1,
      balance: 52_000,
      unpaid: 52_000,
      prepaid: 0,
      overdue: { amount: 0, count: 0, maxDays: 0 },
      exact: true,
      asOf,
    },
  ];
}

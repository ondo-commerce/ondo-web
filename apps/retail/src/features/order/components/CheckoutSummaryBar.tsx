"use client";

import { Button, KeyValue, Panel } from "@ondo/ui";
import { CHECKOUT_TEXT } from "../constants";
import { formatSheets, formatWon, type OrderTotals } from "../derive";

/**
 * 주문서 오른쪽 요약 카드 — 결제 금액 4줄과 `주문 접수하기`. 장바구니의
 * `CartSummaryBar`와 같은 구조다(디자인 규칙 4절 "오른쪽 요약 카드").
 *
 * 예전에는 본문 안 `결제 금액` 묶음과 패널 바닥 합계 바가 따로 있었다. 둘이 같은
 * `totals`를 읽어도 금액이 두 번 보였고, 도매처가 많으면 버튼이 화면 밖으로
 * 밀렸다. 이제 한 카드가 스크롤을 따라온다.
 *
 * `주문 접수하기`는 **되돌릴 수 없는 실행**이라 세 가지를 지킨다.
 * ① 누르기 전에 그 사실을 글자로 말한다(`접수한 뒤에는 …`).
 * ② 못 누를 때는 **진짜 `disabled` 버튼**이고 그 아래 이유가 있다.
 *    `asChild + Link`로 두면 `disabled`가 `<a>`에 아무 효력이 없어 잠긴 채로도
 *    넘어가고, `aria-disabled`만 걸면 눌리기까지 한다(직전 회차 F11).
 * ③ 요청이 나가 있는 동안도 잠긴다 — 멱등키가 두 번째를 막지만 눌리는 버튼을
 *    두면 사장은 "안 눌렸나" 하고 또 누른다.
 *
 * 접수 요청이 실패하면(`failure`) 버튼 바로 아래 빨간 글자다. 결과가 조용히
 * 사라지면 사장이 다시 눌러 두 번 접수한다 — 멱등키가 막지만 사실은 말해야 한다.
 */
export function CheckoutSummaryBar({
  totals,
  wholesalerCount,
  blockedReason,
  failure,
  busy,
  onSubmit,
}: {
  totals: OrderTotals;
  wholesalerCount: number;
  /** 못 누르는 이유. null이면 누를 수 있다 */
  blockedReason: string | null;
  /** 접수 요청이 서버에서 실패한 이유 */
  failure: string | null;
  /** 접수 요청이 나가 있는가 */
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <Panel>
      <Panel.Title>{CHECKOUT_TEXT.paymentSection}</Panel.Title>
      <KeyValue amounts>
        <KeyValue.Row term="상품 금액">{formatWon(totals.amount)}</KeyValue.Row>
        <KeyValue.Row term="총 장수">
          {formatSheets(totals.sheets)}
        </KeyValue.Row>
        <KeyValue.Row term="도매처">{wholesalerCount}곳</KeyValue.Row>
        <KeyValue.Row term={CHECKOUT_TEXT.finalAmount} total>
          {formatWon(totals.amount)}
        </KeyValue.Row>
      </KeyValue>

      <Button
        size="lg"
        disabled={blockedReason !== null || busy}
        onClick={onSubmit}
        className="mt-6 w-full"
      >
        {busy ? CHECKOUT_TEXT.submitting : CHECKOUT_TEXT.submit}
      </Button>

      {failure ? (
        <p role="alert" className="text-body text-destructive-strong mt-2">
          {failure}
        </p>
      ) : null}

      {/* 못 누르는 이유와 "되돌릴 수 없다"는 고지가 같은 자리에서 바뀐다 —
          눈이 한 곳만 보면 된다. role=status라 낭독기도 바뀐 것을 듣는다.
          좁은 칸이라 왼쪽 맞춤이다 */}
      <p role="status" className="text-muted-foreground text-body mt-2">
        {blockedReason ?? CHECKOUT_TEXT.irreversible}
      </p>
    </Panel>
  );
}

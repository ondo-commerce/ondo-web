import { KeyValue } from "@ondo/ui";
import { DETAIL_TEXT } from "../constants";
import {
  backorderCount,
  formatWon,
  orderTotals,
  shipmentProgress,
  shippedShipments,
  unpaidAmount,
} from "../derive";
import type { OrderRecord } from "../types";

/** 값 아래 붙는 한 줄(미송 대기, 미수가 어디서 났는지). 작은 글이다 */
function Hint({ children }: { children: string }) {
  return (
    <span className="text-muted-foreground mt-1 block text-xs">{children}</span>
  );
}

/**
 * 주문 상세 요약 카드의 숫자 3줄 — 주문 금액 · 출고 진행 · 미수 잔액.
 *
 * 예전에는 테두리 칸 3개에 큰 숫자로 나란히 있었다. 요약이 오른쪽 좁은 카드로
 * 가면서 이름과 값 줄(`KeyValue`)로 바꿨다 — 디자인 규칙 4절이 "카드 안의 금액,
 * 수량, 읽기만 하는 값은 이름과 값 줄, 금액 3개를 큰 숫자로 나란히 놓지 않는다"고
 * 정한 자리다. 합계 줄(`total`)은 쓰지 않는다 — 셋 중 무엇도 나머지의 합이 아니라서
 * 한 줄만 키우면 `미수 잔액 0원`이 카드에서 가장 큰 숫자가 된다.
 */
export function OrderStats({ order }: { order: OrderRecord }) {
  const totals = orderTotals(order);
  const progress = shipmentProgress(order);
  const backorders = backorderCount(order);
  const unpaid = unpaidAmount(order);
  const shippedCount = shippedShipments(order).length;

  return (
    <KeyValue amounts>
      <KeyValue.Row term={DETAIL_TEXT.stats.amount}>
        {formatWon(totals.amount)}
      </KeyValue.Row>
      <KeyValue.Row term={DETAIL_TEXT.stats.progress}>
        {progress.planned === 0
          ? "—"
          : `${progress.planned}건 중 ${progress.done}건`}
        {backorders > 0 ? (
          <Hint>{DETAIL_TEXT.backorderWaiting(backorders)}</Hint>
        ) : null}
      </KeyValue.Row>
      <KeyValue.Row term={DETAIL_TEXT.stats.unpaid}>
        {unpaid === null ? "—" : formatWon(unpaid)}
        {unpaid === null ? (
          <Hint>{DETAIL_TEXT.unpaidUnknown}</Hint>
        ) : shippedCount > 0 ? (
          <Hint>{DETAIL_TEXT.unpaidFrom(shippedCount)}</Hint>
        ) : null}
      </KeyValue.Row>
    </KeyValue>
  );
}

import { Table } from "@ondo/ui";
import { LedgerBadge } from "./StatusBadge";
import { formatDateTime, formatSignedAmount } from "../derive";
import type { LedgerRow } from "../types";

/**
 * 세그먼트 B — 거래처 하나의 미수원장.
 *
 * 부호는 **거래처 계정 잔액 관점**이다(게이트 Q3): 입금 `+`, 판매 `−`,
 * 미수가 남아 있으면 잔액이 음수. 아코디언 tail의 `미수 잔액`(양수)은 이 잔액을
 * 뒤집은 값이라 두 숫자는 부호만 반대고 절댓값이 같다.
 *
 * `rows`는 이미 `derive.ledgerRows`로 누적된 값이고, 필터는 그 뒤에 걸린다 —
 * 걸러진 줄만 누적하면 잔액이 거짓이 되기 때문이다.
 */
export function ReceivableLedgerTable({
  rows,
  currentBalance,
}: {
  rows: readonly LedgerRow[];
  /** 요약 줄의 현재 잔액. **필터와 무관하게 전체 원장의 잔액**이다 */
  currentBalance: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        조건에 맞는 원장 내역이 없습니다
      </p>
    );
  }

  return (
    <div>
      <Table>
        <Table.Head>
          <Table.Row>
            <Table.Th align="left">날짜</Table.Th>
            <Table.Th align="left">구분</Table.Th>
            <Table.Th>금액</Table.Th>
            <Table.Th>잔액</Table.Th>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Td align="left" tone="muted">
                {formatDateTime(row.date)}
              </Table.Td>
              <Table.Td align="left">
                <LedgerBadge entryType={row.entryType} />
              </Table.Td>
              <Table.Td>{formatSignedAmount(row.amount)}</Table.Td>
              <Table.Td tone="muted">
                {formatSignedAmount(row.balanceAfter)}
              </Table.Td>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {/* 표 아래 구분선 + 요약. 이 화면에서 제일 큰 숫자라 굵기와 크기로만 강조한다 */}
      <div className="border-border mt-3 flex items-baseline justify-between border-t pt-3">
        <span className="text-sm">현재 잔액</span>
        <span className="text-lg font-medium tabular-nums">
          {formatSignedAmount(currentBalance)}원
        </span>
      </div>
    </div>
  );
}

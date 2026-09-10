import { Table } from "@ondo/ui";
import { LedgerBadge } from "./StatusBadge";
import { LEDGER_PAGE_SIZE } from "../constants";
import type { LedgerView } from "../types";
import { formatNumber } from "@/shared/lib/format";

/**
 * 부호를 붙인 금액 표시(`+200,000` / `-350,000`).
 * 배지 색을 늘리지 않기로 했으므로(게이트 Q2) **이 부호가 입금과 판매를 가르는 두 번째 단서**다.
 */
function formatSignedAmount(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

/**
 * 세그먼트 B — 거래처 하나의 미수원장(`GET /receivables?retailerId`).
 *
 * 부호는 **거래처 계정 잔액 관점**이다(게이트 Q3 = 서버 `balanceChange`): 입금 `+`, 판매 `−`,
 * 미수가 남아 있으면 잔액이 음수. 거래처 행의 `미수 잔액`(양수)은 이 잔액을 뒤집은 값이라
 * 두 숫자는 부호만 반대고 절댓값이 같다.
 *
 * `잔액` 열과 `현재 잔액`은 서버값이다 — 화면에서 누적하지 않는다. 스펙: 현재 잔액은 `meta.ledgerBalance`,
 * `data[0].balanceAfter`는 페이지·필터에 따라 과거 시점 값이라 틀린다.
 *
 * 표는 **펼침 안에서 자기 높이(`max-h-96`)로 스크롤하고 머리글이 sticky**다(wire-settlement F6, #207).
 * 한 페이지가 100줄이라 거래가 잦은 소매처는 원장이 늘 뷰포트를 넘긴다. 바깥 목록 표가 스크롤을 받으면
 * 이 표의 `날짜·구분·금액·잔액`은 위로 사라지고 `현재 잔액`은 아래로 빠진다 — `Table`의 sticky는
 * 가장 가까운 스크롤 컨테이너 기준이라 바깥에 붙일 수 없다. 그래서 이 표가 직접 스크롤하게 하고
 * 잔액 줄은 그 밖 고정 자리에 둔다. `Table stickyHead`는 flex 자식이어야 하므로 세로 flex로 감싼다.
 */
export function ReceivableLedgerTable({
  ledger,
  hasFilter,
}: {
  ledger: LedgerView;
  /** 구분 필터가 걸려 있는가. 빈 이유를 가른다 */
  hasFilter: boolean;
}) {
  return (
    <div className="flex max-h-96 flex-col">
      {ledger.rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {hasFilter
            ? "조건에 맞는 원장 내역이 없습니다"
            : "원장 내역이 없습니다"}
        </p>
      ) : (
        <Table stickyHead>
          <Table.Head>
            <Table.Row>
              <Table.Th align="left">날짜</Table.Th>
              <Table.Th align="left">구분</Table.Th>
              <Table.Th>금액</Table.Th>
              <Table.Th>잔액</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {ledger.rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Td align="left" tone="muted">
                  {row.date}
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
      )}

      {/* 화면에 페이저가 없어 최신 한 페이지만 보인다. 넘치면 한 줄로 알린다 */}
      {ledger.totalPages > 1 ? (
        <p className="text-muted-foreground mt-2 shrink-0 text-right text-xs">
          최근 {LEDGER_PAGE_SIZE}건까지만 보입니다 (전체 {ledger.totalElements}
          건)
        </p>
      ) : null}

      {/* 표 아래 구분선 + 요약. 이 화면에서 제일 큰 숫자라 굵기와 크기로만 강조한다.
          필터·페이지와 무관한 전체 잔액이다 */}
      <div className="border-border mt-3 flex shrink-0 items-baseline justify-between border-t pt-3">
        <span className="text-sm">현재 잔액</span>
        <span className="text-lg font-medium tabular-nums">
          {formatSignedAmount(ledger.balance)}원
        </span>
      </div>
    </div>
  );
}

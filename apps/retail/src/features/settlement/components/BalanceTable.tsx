import { Button, Table } from "@ondo/ui";
import Link from "next/link";
import {
  formatBalance,
  formatDate,
  formatWon,
  totalOverdue,
  totalReceivable,
} from "../derive";
import type { PartnerSettlement } from "../types";

/**
 * 도매처별 미수 표(5열).
 *
 * `tfoot` 합계는 요약 카드와 **같은 함수**(`totalReceivable`·`totalOverdue`)에서
 * 나온다 — 카드와 표가 다른 값을 말하는 화면을 만들지 않는다.
 *
 * 입력 가능한 칸이 없다. 소매는 금액을 보기만 하고 입금을 등록할 수 없다(RT-63).
 */
export function BalanceTable({ rows }: { rows: readonly PartnerSettlement[] }) {
  return (
    <Table>
      <Table.Head>
        <tr>
          <Table.Th align="left">도매처</Table.Th>
          <Table.Th>미수 잔액</Table.Th>
          <Table.Th>연체</Table.Th>
          <Table.Th align="center">마지막 입금</Table.Th>
          {/* 버튼 열. 머리글 글자가 없어도 열 자체는 있어야 tfoot 칸 수가 맞는다 */}
          <Table.Th align="center" className="relative">
            {/* `sr-only`는 position:absolute라 위치 기준을 잡아 줄 조상이 없으면
                표 바깥(문서 기준)에 놓여 **페이지를 가로로 밀어낸다.** 이 칸을
                기준점으로 만들어 표 자기 스크롤 상자 안에 가둔다 */}
            <span className="sr-only">원장</span>
          </Table.Th>
        </tr>
      </Table.Head>

      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.wholesalerId}>
            <Table.Td align="left">{row.name}</Table.Td>
            {/* 선수금(음수)은 `선수금 30,000원`으로 나간다 — 부호가 아니라 말로 알린다 */}
            <Table.Td>{formatBalance(row.balance)}</Table.Td>
            <Table.Td tone={row.overdue.count === 0 ? "muted" : undefined}>
              {row.overdue.count === 0 ? (
                "—"
              ) : (
                /* 금액을 빨갛게만 칠하면 색을 못 보는 사장에게는 그냥 숫자다.
                   `D+10`이라는 **글자**가 같이 있어야 어느 줄이 연체인지 읽힌다 */
                <>
                  <span className="text-destructive-strong">
                    {formatWon(row.overdue.amount)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    D+{row.overdue.maxDays}
                  </span>
                </>
              )}
            </Table.Td>
            <Table.Td align="center">
              {row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}
            </Table.Td>
            <Table.Td align="center">
              <Button asChild variant="line" size="sm">
                {/* 어느 도매처 원장인지가 주소에 실린다 — 뒤로 가기·새 탭·공유가 산다 */}
                <Link href={`/settlements?wholesaler=${row.wholesalerId}`}>
                  원장 보기
                  <span className="sr-only"> ({row.name})</span>
                </Link>
              </Button>
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>

      <tfoot>
        <tr>
          <td className="border-border border-t px-2 pt-3 pb-2 text-left font-medium">
            합계
          </td>
          <td className="border-border border-t px-2 pt-3 pb-2 text-right font-medium tabular-nums">
            {formatWon(totalReceivable(rows))}
          </td>
          <td className="border-border text-destructive-strong border-t px-2 pt-3 pb-2 text-right font-medium tabular-nums">
            {formatWon(totalOverdue(rows).amount)}
          </td>
          <td className="border-border border-t" />
          <td className="border-border border-t" />
        </tr>
      </tfoot>
    </Table>
  );
}

import { Button, Table } from "@ondo/ui";
import { Phone } from "lucide-react";
import { ongoingCount } from "@/shared/tradeStats";
import { PREPAID_EXCLUDED, SHEET_UNIT, TOTAL_LABEL } from "../constants";
import {
  formatBalance,
  formatDate,
  formatWon,
  hasPrepaid,
  totalBackorderSheets,
  totalReceivable,
} from "../derive";
import type { PartnerListRow } from "../types";
import { BackorderBadge } from "./BackorderBadge";
import { CopyIconButton } from "./CopyButton";

/**
 * 거래처 관리 표(7열). 소매에서 가장 넓은 표다.
 *
 * 앞 회차 도매 `settlements`가 1280×720에서 `미수 잔액` 열이 잘리는 P1을 겪었다.
 * 여기서는 `Table`이 `min-w-max` + `overflow-x-auto`로 **자기 상자 안에서만**
 * 가로로 흐르므로 열이 눌리지도, 페이지 본문이 밀리지도 않는다.
 *
 * 승인·심사·거래 요청을 뜻하는 낱말이 한 곳도 없다 — §3-0 A로 승인 층이
 * 폐기됐고 이 화면은 「거래 이력 조회」다.
 *
 * TODO(#183): 와이어프레임의 8번째 열 `도매처 홈`이 없다. 이 표는 fixtures라 도매처
 * id가 `w-moodon`류인데 도매처 홈은 서버 숫자 id를 받아서 네 링크가 전부 404였다.
 * 없는 곳으로 보내는 링크보다 없는 편이 낫다 — 정산이 실서버로 붙어 숫자 id를
 * 갖게 되면 `PartnerCards`와 같이 되살린다.
 */
export function PartnerTable({ rows }: { rows: readonly PartnerListRow[] }) {
  return (
    <Table>
      <Table.Head>
        <tr>
          <Table.Th align="left">도매처</Table.Th>
          <Table.Th align="left">위치</Table.Th>
          <Table.Th align="center">마지막 주문</Table.Th>
          <Table.Th align="center">진행 중</Table.Th>
          <Table.Th align="center">미송</Table.Th>
          <Table.Th>미수 잔액</Table.Th>
          <Table.Th align="center">연락 · 계좌</Table.Th>
        </tr>
      </Table.Head>

      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.wholesalerId}>
            <Table.Td align="left">{row.name}</Table.Td>
            <Table.Td align="left" tone="muted">
              {row.location}
            </Table.Td>
            <Table.Td align="center">{formatDate(row.lastOrderedAt)}</Table.Td>
            {/* 확정 대기 + 미송을 여기서 더한다 — 합을 따로 적어 두면 도매처 홈과
                갈린다(F1) */}
            <Table.Td align="center">{ongoingCount(row)}건</Table.Td>
            <Table.Td
              align="center"
              tone={row.backorderSheets === 0 ? "muted" : undefined}
            >
              {row.backorderSheets === 0 ? "—" : <BackorderBadge row={row} />}
            </Table.Td>
            {/* 정산 화면의 `미수 잔액`과 **같은 함수**에서 나온 값이다 */}
            <Table.Td>{formatBalance(row.balance)}</Table.Td>
            <Table.Td align="center">
              <span className="inline-flex items-center gap-0.5">
                {/* 아이콘 버튼에는 글자가 없다. 같은 열에 4줄이 나란히 서므로
                    접근가능 이름에 상호를 넣어 어느 도매처 것인지 구분한다 */}
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="size-8 px-0 phone:size-11 [&_svg]:size-4.5"
                >
                  <a href={`tel:${row.phone}`} aria-label={`${row.name} 전화`}>
                    <Phone aria-hidden />
                  </a>
                </Button>
                <CopyIconButton
                  text={`${row.bank.bankName} ${row.bank.accountNo}`}
                  label={`${row.name} 계좌 복사`}
                />
              </span>
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>

      <tfoot>
        <tr>
          <td
            colSpan={4}
            className="border-border border-t px-2 pt-3 pb-2 text-left font-medium"
          >
            {TOTAL_LABEL}
            {/* 미수 합계가 선수금을 안 센다는 것을 표가 말한다 — 정산 화면
                `도매처별 미수` tfoot과 같은 규칙이다(F5) */}
            {hasPrepaid(rows) ? (
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                {PREPAID_EXCLUDED}
              </span>
            ) : null}
          </td>
          <td className="border-border border-t px-2 pt-3 pb-2 text-center font-medium tabular-nums">
            {totalBackorderSheets(rows)}
            {SHEET_UNIT}
          </td>
          <td className="border-border border-t px-2 pt-3 pb-2 text-right font-medium tabular-nums">
            {formatWon(totalReceivable(rows))}
          </td>
          <td className="border-border border-t" />
        </tr>
      </tfoot>
    </Table>
  );
}

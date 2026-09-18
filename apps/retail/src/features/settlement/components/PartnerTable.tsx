import { Button, Table } from "@ondo/ui";
import Link from "next/link";
import { BANK_MISSING, PREPAID_EXCLUDED, TOTAL_LABEL } from "../constants";
import {
  formatBalance,
  formatDate,
  formatWon,
  hasPrepaid,
  totalReceivable,
} from "../derive";
import type { PartnerSettlement } from "../types";
import { CopyIconButton } from "./CopyButton";

/**
 * 거래처 관리 표(5열). 값은 정산 화면과 같은 `GET /settlements` 한 줄이다.
 *
 * `도매처 홈` 링크가 **서버 숫자 id**(`wholesalerId`)로 간다. fixtures 시절엔
 * `w-moodon`류 문자열이라 네 링크가 전부 404였고(#183) 그래서 열을 감췄었다 —
 * 정산이 실서버로 붙어 도매처 홈이 받는 id와 같은 축이 됐다.
 *
 * 앞 회차 도매 `settlements`가 1280×720에서 `미수 잔액` 열이 잘리는 P1을 겪었다.
 * 여기서는 `Table`이 `min-w-max` + `overflow-x-auto`로 **자기 상자 안에서만**
 * 가로로 흐르므로 열이 눌리지도, 페이지 본문이 밀리지도 않는다.
 *
 * 승인·심사·거래 요청을 뜻하는 낱말이 한 곳도 없다 — §3-0 A로 승인 층이
 * 폐기됐고 이 화면은 「거래 이력 조회」다.
 *
 * **fixtures 시절의 7열 중 위치 · 마지막 주문 · 진행 중 · 미송 · 전화가 없다**(#240).
 * 거래처 목록 전용 API가 없고 정산 응답에 그 값이 없다. 없는 값을 더미로 세우면
 * 실서버 도매처 옆에 지어낸 위치·전화가 실데이터처럼 선다 — 서버가 주면 그때
 * 열을 되살린다. `연락 · 계좌`는 전화가 빠져 `입금 계좌` 하나가 됐다.
 */
export function PartnerTable({ rows }: { rows: readonly PartnerSettlement[] }) {
  return (
    <Table>
      <Table.Head>
        <tr>
          <Table.Th align="left">도매처</Table.Th>
          <Table.Th>미수 잔액</Table.Th>
          <Table.Th align="center">마지막 입금</Table.Th>
          <Table.Th align="center">입금 계좌</Table.Th>
          {/* 버튼 열. 머리글 글자가 없어도 열 자체는 있어야 tfoot 칸 수가 맞는다 */}
          <Table.Th align="center">
            <span className="sr-only">도매처 홈</span>
          </Table.Th>
        </tr>
      </Table.Head>

      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.wholesalerId}>
            <Table.Td align="left">{row.name}</Table.Td>
            {/* 정산 화면의 `미수 잔액`과 **같은 응답·같은 변환**에서 나온 값이다 */}
            <Table.Td>{formatBalance(row.balance)}</Table.Td>
            <Table.Td align="center">
              {row.lastPaidAt ? formatDate(row.lastPaidAt) : "—"}
            </Table.Td>
            <Table.Td align="center" tone={row.bank ? undefined : "muted"}>
              {row.bank ? (
                /* 아이콘 버튼에는 글자가 없다. 같은 열에 여러 줄이 나란히 서므로
                   접근가능 이름에 상호를 넣어 어느 도매처 것인지 구분한다 */
                <CopyIconButton
                  text={`${row.bank.bankName} ${row.bank.accountNo}`}
                  label={`${row.name} 계좌 복사`}
                />
              ) : (
                BANK_MISSING
              )}
            </Table.Td>
            <Table.Td align="center">
              <Button asChild variant="line" size="sm">
                <Link href={`/wholesalers/${row.wholesalerId}`}>
                  도매처 홈<span className="sr-only"> ({row.name})</span>
                </Link>
              </Button>
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>

      <tfoot>
        <tr>
          <td className="border-border border-t px-2 pt-3 pb-2 text-left font-medium">
            {TOTAL_LABEL}
            {/* 미수 합계가 선수금을 안 센다는 것을 표가 말한다 — 정산 화면
                `도매처별 미수` tfoot과 같은 규칙이다(F5) */}
            {hasPrepaid(rows) ? (
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                {PREPAID_EXCLUDED}
              </span>
            ) : null}
          </td>
          <td className="border-border border-t px-2 pt-3 pb-2 text-right font-medium tabular-nums">
            {formatWon(totalReceivable(rows))}
          </td>
          <td className="border-border border-t" />
          <td className="border-border border-t" />
          <td className="border-border border-t" />
        </tr>
      </tfoot>
    </Table>
  );
}

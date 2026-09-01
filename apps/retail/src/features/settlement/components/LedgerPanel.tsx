import { Notice, Panel, Table } from "@ondo/ui";
import { Info } from "lucide-react";
import { EMPTY_LEDGER, LEDGER_SUB, PAYMENT_NOTICE } from "../constants";
import {
  formatBalance,
  formatBasis,
  formatDate,
  formatDelta,
  methodLabel,
  runningBalance,
} from "../derive";
import type { LedgerEntry, PartnerSettlement } from "../types";
import { BankAccountRow } from "./BankAccountRow";
import { PartnerSwitch } from "./PartnerSwitch";

/**
 * 거래 원장(6열) + 도매처 전환 + 입금 계좌 안내.
 *
 * **지금 보고 있는 도매처 이름이 제목 옆에 늘 붙어 있다.** 표만 갈리고 대상이
 * 화면에서 사라지면 어느 도매처 원장을 보는지 모른 채 숫자를 읽게 된다 — 앞 회차
 * 도매 `orders`·`inventory`의 "가려진 대상에 조작이 걸린다"와 같은 축이다.
 * 제목과 전환 버튼이 표 위에 있어서 원장이 길어져도 둘 다 남는다.
 *
 * 잔액은 넘겨받은 원장만으로 다시 누적한다(`runningBalance`) — 도매처를 바꿔도
 * 이전 도매처 금액이 섞일 자리가 없다.
 */
export function LedgerPanel({
  partner,
  entries,
  partners,
}: {
  partner: PartnerSettlement;
  /** 이 도매처 원장만. 다른 도매처 줄이 섞이면 잔액이 통째로 틀린다 */
  entries: readonly LedgerEntry[];
  /** 전환 드롭다운이 보여줄 거래처 전부 */
  partners: readonly PartnerSettlement[];
}) {
  const rows = runningBalance(entries);

  return (
    <Panel>
      <Panel.Title
        sub={LEDGER_SUB}
        suffix={
          <span className="text-muted-foreground text-sm">{partner.name}</span>
        }
        action={
          <PartnerSwitch rows={partners} currentId={partner.wholesalerId} />
        }
      >
        거래 원장
      </Panel.Title>

      {rows.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-control border border-dashed px-4 py-8 text-center text-sm">
          {EMPTY_LEDGER}
        </p>
      ) : (
        <Table>
          <Table.Head>
            <tr>
              <Table.Th align="center">일자</Table.Th>
              <Table.Th align="left">구분</Table.Th>
              <Table.Th align="left">근거</Table.Th>
              <Table.Th align="left">결제 수단</Table.Th>
              <Table.Th>증감</Table.Th>
              <Table.Th>잔액</Table.Th>
            </tr>
          </Table.Head>
          <Table.Body>
            {rows.map(({ entry, balance }) => (
              <Table.Row key={entry.id}>
                <Table.Td align="center">{formatDate(entry.date)}</Table.Td>
                <Table.Td align="left">
                  {entry.kind === "SHIPMENT" ? "출고" : "입금"}
                </Table.Td>
                <Table.Td align="left" tone="muted">
                  {formatBasis(entry)}
                </Table.Td>
                <Table.Td
                  align="left"
                  tone={entry.method ? undefined : "muted"}
                >
                  {entry.method ? methodLabel(entry.method) : "—"}
                </Table.Td>
                <Table.Td>{formatDelta(entry.delta)}</Table.Td>
                {/* 맨 윗줄 잔액이 곧 이 도매처의 미수 잔액이다 —
                    끝까지 스크롤하지 않아도 최종 잔액을 읽을 수 있다 */}
                <Table.Td>{formatBalance(balance)}</Table.Td>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* 원장이 비어도 계좌 안내와 ℹ는 남는다 — 거래가 없다고 입금할 곳이 없어지지 않는다 */}
      <div className="mt-6">
        <BankAccountRow bank={partner.bank} />
        <Notice className="mt-2.5 items-start">
          <span className="flex gap-2">
            <Info
              aria-hidden
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <span>{PAYMENT_NOTICE}</span>
          </span>
        </Notice>
      </div>
    </Panel>
  );
}

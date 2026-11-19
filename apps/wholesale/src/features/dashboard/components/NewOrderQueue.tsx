"use client";

import { Panel, Table } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNewOrderQueueQuery } from "../api/queries";
import { QUEUE_TEXT, TAB_HREF } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/**
 * 확정 기다리는 주문 큐 — NEW 주문을 오래된 순으로.
 *
 * **시한·게이지·빨간 강조가 없다.** 확인 시한은 팀이 정한 약속이 아니고, 손님 응대 중인 사장이
 * 지킬 수 있다는 근거도 없다. 오래된 것이 위에 있다는 사실 하나가 우선순위다.
 * **확정 버튼도 없다** — 확정은 배분·미송 생성까지 일으키므로 라인을 보는 상세 화면에서만 한다.
 *
 * 수량 열이 없다. 목록 응답(`OrderSummaryResponse`)에 수량이 없고, 행마다 상세를 부르면
 * 30초 폴링에 요청이 N배로 는다. 서버가 목록에 `totalQty`를 실어 주면 열을 추가한다.
 *
 * `stickyHead` 표라 세로 스크롤을 직접 받는다 — `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓는다.
 * 부르는 쪽이 `QueryBoundary`로 감싸는데 경계는 DOM을 안 만들어 flex 사슬이 끊기지 않는다.
 */
export function NewOrderQueue({ now }: { now: string }) {
  const { data: rows } = useNewOrderQueueQuery(now);
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <Panel.Body>
        <p className="text-muted-foreground py-12 text-center text-sm">
          {QUEUE_TEXT.empty}
        </p>
      </Panel.Body>
    );
  }

  return (
    <Table stickyHead>
      <Table.Head>
        <Table.Row>
          <Table.Th align="left">{QUEUE_TEXT.columns.orderNumber}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.waiting}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.retailer}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.product}</Table.Th>
          <Table.Th>{QUEUE_TEXT.columns.itemCount}</Table.Th>
          <Table.Th>{QUEUE_TEXT.columns.amount}</Table.Th>
          <Table.Th>{QUEUE_TEXT.columns.receivedAt}</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((row) => (
          /* 펼치는 표가 아니라서 줄 전체가 이동이다(2026-11-18 사용자 지시). 버튼 열을 따로 두지 않는다.
             키보드와 낭독기는 소매처 이름의 링크 하나로 간다 */
          <Table.Row
            key={row.id}
            className="cursor-pointer"
            onClick={() => router.push(TAB_HREF.orders)}
          >
            <Table.Td align="left" tone="muted" className="tabular-nums">
              {row.orderNumber}
            </Table.Td>
            <Table.Td align="left" className="tabular-nums">
              {row.waitingLabel}
            </Table.Td>
            <Table.Td align="left">
              <Link
                href={TAB_HREF.orders}
                aria-label={`${row.retailerName} ${QUEUE_TEXT.view}`}
                onClick={(e) => e.stopPropagation()}
              >
                {row.retailerName}
              </Link>
            </Table.Td>
            <Table.Td align="left">{row.productSummary}</Table.Td>
            <Table.Td>{formatNumber(row.itemCount)}종</Table.Td>
            <Table.Td>{formatNumber(row.orderAmount)}원</Table.Td>
            <Table.Td tone="muted" className="tabular-nums">
              {row.receivedAtLabel}
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

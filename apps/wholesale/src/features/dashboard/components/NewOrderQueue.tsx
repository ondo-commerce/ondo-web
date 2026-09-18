"use client";

import { Button, Panel, Table } from "@ondo/ui";
import Link from "next/link";
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
          <Table.Th align="left">{QUEUE_TEXT.columns.waiting}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.retailer}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.product}</Table.Th>
          <Table.Th>{QUEUE_TEXT.columns.amount}</Table.Th>
          <Table.Th align="left">{QUEUE_TEXT.columns.receivedAt}</Table.Th>
          <Table.Th>
            <span className="sr-only">{QUEUE_TEXT.view}</span>
          </Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.id}>
            <Table.Td align="left" className="tabular-nums">
              {row.waitingLabel}
            </Table.Td>
            <Table.Td align="left">{row.retailerName}</Table.Td>
            <Table.Td align="left">{row.productSummary}</Table.Td>
            <Table.Td>{formatNumber(row.orderAmount)}</Table.Td>
            <Table.Td align="left" tone="muted" className="tabular-nums">
              {row.receivedAtLabel}
            </Table.Td>
            <Table.Td>
              {/* 주문 탭의 펼침은 화면 state라 특정 주문을 URL로 못 연다 — 탭 루트로 보낸다 */}
              <Button asChild variant="line" size="sm">
                <Link href={TAB_HREF.orders}>{QUEUE_TEXT.view}</Link>
              </Button>
            </Table.Td>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

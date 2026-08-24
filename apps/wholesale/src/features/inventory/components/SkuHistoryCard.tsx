"use client";

import { Panel, Table } from "@ondo/ui";
import { MOVEMENT_LABEL } from "../constants";
import type { StockMovement } from "../types";
import { formatNumber } from "@/shared/lib/format";

/** 수량 변동은 부호를 붙인다. **부호에 따른 색 구분은 넣지 않는다**(Figma 확대 확인) */
function signed(delta: number): string {
  return `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta))}`;
}

/**
 * 우측 모드 B 카드 2 — 재고 변동 이력.
 * 페이지네이션·기간 필터·유형 필터가 없다. Figma 확정본에 컨트롤이 없어서
 * 목록을 그대로 보여주고, 넘치면 Panel.Body 안에서만 흐른다.
 */
export function SkuHistoryCard({ movements }: { movements: StockMovement[] }) {
  return (
    <Panel className="min-h-0 flex-1">
      <Panel.Title>재고 변동 이력</Panel.Title>

      {movements.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          아직 재고가 움직인 적이 없습니다
        </p>
      ) : (
        <Panel.Body>
          <Table>
            <Table.Head>
              <Table.Row>
                <Table.Th align="left">날짜</Table.Th>
                <Table.Th align="left">유형</Table.Th>
                <Table.Th>기존 재고</Table.Th>
                <Table.Th>수량 변동</Table.Th>
                <Table.Th>변동 후 재고</Table.Th>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {movements.map((m) => (
                /* 줄무늬(zebra) — Table 기본에는 없는 표현이라 이 카드에서만 준다.
                   행이 5열 숫자라 가로로 눈이 미끄러지는 걸 막는 장치다 */
                <Table.Row key={m.id} className="even:[&>td]:before:bg-accent">
                  <Table.Td align="left">{m.date}</Table.Td>
                  <Table.Td align="left">{MOVEMENT_LABEL[m.type]}</Table.Td>
                  <Table.Td>{formatNumber(m.beforeQty)}</Table.Td>
                  <Table.Td>{signed(m.deltaQty)}</Table.Td>
                  <Table.Td>{formatNumber(m.afterQty)}</Table.Td>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Panel.Body>
      )}
    </Panel>
  );
}

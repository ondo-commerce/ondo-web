"use client";

import { Button, Panel, Table } from "@ondo/ui";
import { useStockMovementsQuery } from "../api/queries";
import { MOVEMENT_LABEL } from "../constants";
import { formatNumber } from "@/shared/lib/format";

/** 수량 변동은 부호를 붙인다. **부호에 따른 색 구분은 넣지 않는다**(Figma 확대 확인) */
function signed(delta: number): string {
  return `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta))}`;
}

/**
 * 우측 모드 B 카드 2 — 재고 변동 이력(`GET /variants/{id}/stock-movements`, 시간 역순).
 * 페이지네이션·기간 필터·유형 필터가 없다. Figma 확정본에 컨트롤이 없어서
 * 첫 페이지를 그대로 보여주고, 넘치면 Panel.Body 안에서만 흐른다.
 *
 * `Panel`·제목은 부르는 쪽이 그린다 — 경계가 패널 안에 있어야 기다리는 동안 폭이 유지된다.
 */
export function SkuHistoryCard({ variantId }: { variantId: number }) {
  /* 입고 뒤 이력 재조회만 실패하면 캐시의 옛 줄이 남는다 — 경계는 안 떨어지니 여기서 한 줄 알린다 */
  const { data, isRefetchError, refetch } = useStockMovementsQuery(variantId);

  const staleLine = isRefetchError ? (
    <div
      role="alert"
      className="mb-2 flex shrink-0 items-center justify-between gap-3"
    >
      <p className="text-destructive-strong text-sm">
        이력을 새로 못 불러왔어요
      </p>
      <Button
        type="button"
        variant="line"
        size="sm"
        onClick={() => void refetch()}
      >
        다시 불러오기
      </Button>
    </div>
  ) : null;

  if (data.rows.length === 0) {
    return (
      <>
        {staleLine}
        <p className="text-muted-foreground py-8 text-center text-sm">
          아직 재고가 움직인 적이 없습니다
        </p>
      </>
    );
  }

  return (
    <Panel.Body>
      {staleLine}
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
          {data.rows.map((m) => (
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
      {/* 첫 페이지 밖의 이력은 안 보인다 — 페이저가 사양에 없다. 있다는 사실만 알린다 */}
      {data.meta.totalPages > 1 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          최근 {data.rows.length}건만 보입니다 (전체{" "}
          {formatNumber(data.meta.totalElements)}건)
        </p>
      ) : null}
    </Panel.Body>
  );
}

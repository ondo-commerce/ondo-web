"use client";

import { Button, Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { InventoryStockTable } from "./InventoryStockTable";
import { sumQuantities } from "../derive";
import type {
  InventoryProductView,
  InventoryRowDetail,
  InventoryRowView,
} from "../types";
import { QuerySkeleton } from "@/shared/api/QueryBoundary";
import { formatNumber } from "@/shared/lib/format";

/**
 * 재고 목록의 상품 한 행 + 펼침 영역(SKU 표).
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 품번·품명·SKU 수는 목록 응답이라 늘 있다. 수량 두 칸은 **행마다 따로 받는 상세**의 SKU
 * 합계라 상태가 셋이다 — 기다리는 중·받음·실패. 실패는 이 행 안에서 끝난다: 합계 칸이 `-`가
 * 되고 `다시 시도`가 그 자리에 뜬다. 표 전체가 경계로 떨어지지 않는다(wire-inventory F1).
 * 404(다른 직원이 방금 지운 상품)는 다시 불러도 같아서 버튼 대신 문구만 남긴다.
 *
 * 합계는 색상 그룹 접힘 행이 쓰는 것과 **같은 파생 함수**를 쓴다 —
 * 상품 합계를 여기서 따로 세면 펼친 표의 합과 갈린다. 판매가능은 서버 값의 합이다.
 */
export function InventoryProductRow({
  row,
  open,
  onToggle,
  onRetryDetail,
  selectedSkuId,
  onSelectSku,
}: {
  row: InventoryRowView;
  open: boolean;
  onToggle: () => void;
  onRetryDetail: () => void;
  selectedSkuId: number | null;
  onSelectSku: (variantId: number) => void;
}) {
  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 6 = 펼침 열 + 목록 5열 */
      colSpan={6}
      label={row.name}
      detailId={`inventory-detail-${row.id}`}
      detail={
        <RowDetail detail={row.detail} onRetry={onRetryDetail}>
          {(product) => (
            <InventoryStockTable
              product={product}
              selectedSkuId={selectedSkuId}
              onSelectSku={onSelectSku}
            />
          )}
        </RowDetail>
      }
    >
      <Table.Td align="left" tone="muted">
        {row.code}
      </Table.Td>
      <Table.Td align="left">{row.name}</Table.Td>
      <Table.Td>{row.skuCount}</Table.Td>
      <TotalCells detail={row.detail} onRetry={onRetryDetail} />
    </Table.ExpandableRow>
  );
}

/** 현재고·판매가능 두 칸. 상세 상태에 따라 숫자·빈칸·실패로 갈린다 */
function TotalCells({
  detail,
  onRetry,
}: {
  detail: InventoryRowDetail;
  onRetry: () => void;
}) {
  if (detail.state === "ready") {
    const totals = sumQuantities(detail.product.skus);
    return (
      <>
        <Table.Td>{formatNumber(totals.stock)}</Table.Td>
        {/* 판매가능이 음수면 빨강이다. 0으로 감추지 않는다(§7 Q4) — 판 것보다 재고가 적다는 뜻이다 */}
        <Table.Td tone={totals.availableQty < 0 ? "danger" : "default"}>
          {formatNumber(totals.availableQty)}
        </Table.Td>
      </>
    );
  }

  if (detail.state === "loading") {
    return (
      <>
        <Table.Td tone="muted">-</Table.Td>
        <Table.Td tone="muted">-</Table.Td>
      </>
    );
  }

  return (
    <>
      <Table.Td tone="muted">-</Table.Td>
      {/* 실패 표면은 표 안 이 칸이다. 행 클릭(펼침)과 겹치는 자리라 버블링을 끊는다 */}
      <Table.Td tone="muted" className="whitespace-nowrap">
        {detail.retryable ? (
          <Button
            type="button"
            variant="line"
            size="sm"
            aria-label="재고 합계 다시 시도"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            다시 시도
          </Button>
        ) : (
          <span className="text-xs">{detail.title}</span>
        )}
      </Table.Td>
    </>
  );
}

/**
 * 펼침 영역. 상세가 없으면 SKU 표 대신 그 이유가 이 자리에 온다 — 우측 패널은 같은 키를
 * 자기 경계에서 따로 보므로 여기서 다시 부르지 않는다.
 */
function RowDetail({
  detail,
  onRetry,
  children,
}: {
  detail: InventoryRowDetail;
  onRetry: () => void;
  children: (product: InventoryProductView) => ReactNode;
}) {
  if (detail.state === "ready") return children(detail.product);
  if (detail.state === "loading") return <QuerySkeleton />;
  return (
    <div
      role={detail.retryable ? "alert" : undefined}
      className="flex items-center justify-center gap-3 py-6 text-center"
    >
      <p className="text-muted-foreground text-sm">{detail.title}</p>
      {detail.retryable ? (
        <Button type="button" variant="line" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}

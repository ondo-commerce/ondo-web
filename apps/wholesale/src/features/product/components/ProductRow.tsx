"use client";

import { Badge, Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { POST_STATUS_LABEL, POST_STATUS_TONE } from "../constants";
import type { ProductRowView } from "../types";

/**
 * 상품 목록 행 하나 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 *
 * 행이 받는 건 목록 응답(summary)에서 만든 뷰다 — 색·SKU는 개수만 있고, 실제 색상·SKU 표는
 * 펼칠 때 상세를 따로 불러 그린다(`ProductRowDetail`).
 */
export function ProductRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: ProductRowView;
  open: boolean;
  onToggle: () => void;
  /** 펼침 영역에 들어가는 내용 */
  children: ReactNode;
}) {
  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 6 = 펼침 열 + 목록 5열 */
      colSpan={6}
      label={row.name}
      detailId={`product-detail-${row.id}`}
      detail={children}
    >
      <Table.Td align="left" tone="muted">
        {row.code}
      </Table.Td>
      <Table.Td align="left">{row.name}</Table.Td>
      <Table.Td align="left" tone="muted">
        {row.categoryLabel}
      </Table.Td>

      {/* 숫자와 글자가 섞인 칸이라 Table.Td 기본값(우측 정렬 + tabular-nums)이 어울리지 않는다.
          머리글이 align="center"라 셀도 맞춰야 열이 어긋나지 않는다.
          이 형식이 여러 곳에 생기면 derive.ts로 뺀다 — 지금은 이 한 곳뿐이다 */}
      <Table.Td align="center" tone="muted">
        {row.colorCount}색 · {row.skuCount} SKU
      </Table.Td>

      {/* 펼쳐도 배지를 그대로 둔다. 예전에는 평문으로 내렸는데, `Badge`가 높이 고정
          (h-6.5)이라 글자로 바뀌는 순간 행이 6px 낮아져서 펼칠 때마다 표가 움찔했다 */}
      <Table.Td align="center">
        <Badge tone={POST_STATUS_TONE[row.postStatus]}>
          {POST_STATUS_LABEL[row.postStatus]}
        </Badge>
      </Table.Td>
    </Table.ExpandableRow>
  );
}

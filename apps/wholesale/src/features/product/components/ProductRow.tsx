"use client";

import { Badge, Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { POST_STATUS_LABEL, POST_STATUS_TONE } from "../constants";
import { postStatusKey } from "../derive";
import type { Product } from "../types";

/**
 * 상품 목록 행 하나 + 펼침 영역.
 *
 * 껍데기(chevron 열·확장행·열 폭 규칙)는 `Table.ExpandableRow`가 갖고 있다 —
 * 주문 탭과 같은 한 벌이다. 여기 남은 것은 이 탭의 열이 무엇인가뿐이다.
 */
export function ProductRow({
  product,
  open,
  onToggle,
  children,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
  /** 펼침 영역에 들어가는 내용 */
  children: ReactNode;
}) {
  /* 게시글이 없는 상품은 상태값 자체가 없다. `NONE`으로 좁혀 세 값을 한 표에서 읽는다.
     필터도 같은 함수로 가른다 — 기준이 갈리면 배지와 필터 결과가 어긋난다 */
  const postKey = postStatusKey(product);

  return (
    <Table.ExpandableRow
      open={open}
      onToggle={onToggle}
      /* 6 = 펼침 열 + 목록 5열 */
      colSpan={6}
      label={product.name}
      detailId={`product-detail-${product.id}`}
      detail={children}
    >
      <Table.Td align="left" tone="muted">
        {product.code}
      </Table.Td>
      <Table.Td align="left">{product.name}</Table.Td>
      <Table.Td align="left" tone="muted">
        {product.category.join(" > ")}
      </Table.Td>

      {/* 숫자와 글자가 섞인 칸이라 Table.Td 기본값(우측 정렬 + tabular-nums)이 어울리지 않는다.
          머리글이 align="center"라 셀도 맞춰야 열이 어긋나지 않는다.
          이 형식이 여러 곳에 생기면 derive.ts로 뺀다 — 지금은 이 한 곳뿐이다 */}
      <Table.Td align="center" tone="muted">
        {product.colors.length}색 · {product.skus.length} SKU
      </Table.Td>

      {/* 펼쳐진 행에서는 배지 대신 평문으로 내린다 — 주문 탭과 같은 처리다 */}
      <Table.Td align="center">
        {open ? (
          POST_STATUS_LABEL[postKey]
        ) : (
          <Badge tone={POST_STATUS_TONE[postKey]}>
            {POST_STATUS_LABEL[postKey]}
          </Badge>
        )}
      </Table.Td>
    </Table.ExpandableRow>
  );
}

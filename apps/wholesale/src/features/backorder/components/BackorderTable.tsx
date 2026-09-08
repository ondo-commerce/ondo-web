"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { BackorderSkuRow } from "./BackorderSkuRow";
import type { BackorderSkuView } from "../types";

/**
 * 미송 목록 표 6열 + 맨 앞의 펼침 열. 주문 탭(`OrderTable`)과 같은 구조다.
 *
 * `stickyHead`를 켠다 — 미송 SKU가 쌓이면 아래로 내렸을 때 지금 보는 숫자가 총 미송 수량인지
 * 예상 입고일인지 놓친다. 대신 **이 표는 세로 스크롤을 직접 받는다**: 부르는 쪽이
 * `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function BackorderTable({
  rows,
  openVariantId,
  onToggle,
  renderDetail,
}: {
  rows: readonly BackorderSkuView[];
  openVariantId: number | null;
  onToggle: (variantId: number) => void;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (variantId: number) => ReactNode;
}) {
  return (
    <Table stickyHead>
      <Table.Head>
        <Table.Row>
          {/* 첫 열은 chevron만 들어가는 자리라 붙일 이름이 없다 */}
          <Table.Th className="w-8" />
          <Table.Th align="left">SKU</Table.Th>
          <Table.Th align="left">상품명</Table.Th>
          <Table.Th align="left">색상</Table.Th>
          <Table.Th align="center">사이즈</Table.Th>
          <Table.Th>총 미송 수량</Table.Th>
          <Table.Th align="center">예상 입고일</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((sku) => {
          const open = openVariantId === sku.variantId;
          return (
            <BackorderSkuRow
              key={sku.variantId}
              sku={sku}
              open={open}
              onToggle={() => onToggle(sku.variantId)}
            >
              {open ? renderDetail(sku.variantId) : null}
            </BackorderSkuRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}

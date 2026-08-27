"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { BackorderSkuRow } from "./BackorderSkuRow";
import type { BackorderSku } from "../types";

/**
 * 미송 목록 표 6열 + 맨 앞의 펼침 열. 주문 탭(`OrderTable`)과 같은 구조다.
 *
 * **아코디언(div)에서 표로 바뀌었다.** 예전에는 행마다 `SKU_GRID` 상수로 열 폭을 손으로
 * 맞췄는데, 머리 행과 본문 행이 각자 같은 상수를 참조하는 구조라 한쪽만 건드리면 목록이
 * 통째로 어긋났다. 표는 열 폭을 브라우저가 맞추므로 그 상수가 필요 없다.
 *
 * `stickyHead`를 켠다 — 미송 SKU가 쌓이면 아래로 내렸을 때 지금 보는 숫자가 총 미송 수량인지
 * 예상 입고일인지 놓친다. 대신 **이 표는 세로 스크롤을 직접 받는다**: 부르는 쪽이
 * `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function BackorderTable({
  skus,
  openSkuId,
  onToggle,
  renderDetail,
}: {
  skus: readonly BackorderSku[];
  openSkuId: string | null;
  /** SKU 객체를 그대로 넘긴다 — 펼칠 때 배분 수량을 그 SKU 기준으로 다시 채워야 한다 */
  onToggle: (sku: BackorderSku) => void;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (sku: BackorderSku) => ReactNode;
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
        {skus.map((sku) => {
          const open = openSkuId === sku.id;
          return (
            <BackorderSkuRow
              key={sku.id}
              sku={sku}
              open={open}
              onToggle={() => onToggle(sku)}
            >
              {open ? renderDetail(sku) : null}
            </BackorderSkuRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}

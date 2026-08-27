"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { ShipmentRetailerRow } from "./ShipmentRetailerRow";
import type { Retailer } from "../types";

/** 표 한 줄이 필요로 하는 값. 단계별 그룹(`ReadyGroup`/`PackageGroup`)을 이 모양으로 좁혀 넘긴다 */
export interface ShipmentRetailerRowData {
  retailer: Retailer;
  count: number;
  qty: number;
}

/**
 * 출고 목록 표 4열 + 맨 앞의 펼침 열. 주문 탭(`OrderTable`)과 같은 구조다.
 *
 * **세 단계가 이 표 하나를 공유한다.** 단계가 바꾸는 것은 건수 열의 이름과 펼친 본문뿐이라,
 * 단계별 그룹을 `{retailer, count, qty}`로 좁혀 받는다 — 이 표는 `ShipmentStage`를 모른다.
 *
 * `stickyHead`를 켜므로 부르는 쪽이 `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function ShipmentRetailerTable({
  rows,
  countLabel,
  openRetailerId,
  onToggle,
  renderDetail,
}: {
  rows: readonly ShipmentRetailerRowData[];
  /** 건수 열의 머리글. 단계가 세는 단위를 그대로 적는다 (`SKU 건수` / `포장 건수`) */
  countLabel: string;
  openRetailerId: string | null;
  onToggle: (retailerId: string) => void;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (retailer: Retailer) => ReactNode;
}) {
  return (
    <Table stickyHead>
      <Table.Head>
        <Table.Row>
          {/* 첫 열은 chevron만 들어가는 자리라 붙일 이름이 없다 */}
          <Table.Th className="w-8" />
          <Table.Th align="left">거래처 코드</Table.Th>
          <Table.Th align="left">거래처</Table.Th>
          <Table.Th>{countLabel}</Table.Th>
          <Table.Th>총 수량</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map(({ retailer, count, qty }) => {
          const open = openRetailerId === retailer.id;
          return (
            <ShipmentRetailerRow
              key={retailer.id}
              retailer={retailer}
              count={count}
              qty={qty}
              open={open}
              onToggle={() => onToggle(retailer.id)}
            >
              {open ? renderDetail(retailer) : null}
            </ShipmentRetailerRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}

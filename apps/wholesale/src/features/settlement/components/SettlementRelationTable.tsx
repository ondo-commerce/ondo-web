"use client";

import { Table } from "@ondo/ui";
import type { ReactNode } from "react";
import { RetailerRow } from "./RetailerRow";
import type { TradeRelation } from "../types";

/**
 * 정산 목록 표 4열 + 맨 앞의 펼침 열. 주문 탭(`OrderTable`)과 같은 구조다.
 *
 * **아코디언에서 표로 바뀌었다.** 예전에는 `주문 3건 / 미수 잔액 120,000원`이 한 덩어리
 * 문장으로 행 끝에 붙어 있었다. 미수 잔액은 거래처끼리 크기를 비교하는 값인데, 문장 안에
 * 섞여 있으면 자리가 행마다 달라 세로로 훑을 수 없다 — 열로 세우는 이유가 그것이다.
 *
 * 정산의 단위는 주문이 아니라 **거래관계**다(`settlement_data_model.md` §1).
 * 그래서 행 하나가 거래처 하나고, 주문은 펼친 영역 안에 있다.
 *
 * `stickyHead`를 켜므로 부르는 쪽이 `Panel.Body` 안이 아니라 `Panel`의 flex 자식으로 놓아야 한다.
 */
export function SettlementRelationTable({
  relations,
  openRelationId,
  onToggle,
  orderCountOf,
  receivableOf,
  renderDetail,
}: {
  relations: readonly TradeRelation[];
  openRelationId: string | null;
  onToggle: (relationId: string) => void;
  /** 주문 건수. **파생값이다** — 상수로 적으면 입금 한 건에 화면의 다른 숫자와 갈린다 */
  orderCountOf: (relation: TradeRelation) => number;
  /** 미수 잔액(양수). 계정 잔액을 뒤집은 값이다 — `derive.outstandingReceivable` */
  receivableOf: (relation: TradeRelation) => number;
  /** 펼침 영역 내용. 펼쳐진 행에만 부른다 */
  renderDetail: (relation: TradeRelation) => ReactNode;
}) {
  return (
    <Table stickyHead>
      <Table.Head>
        <Table.Row>
          {/* 첫 열은 chevron만 들어가는 자리라 붙일 이름이 없다 */}
          <Table.Th className="w-8" />
          <Table.Th align="left">거래처 코드</Table.Th>
          <Table.Th align="left">거래처</Table.Th>
          <Table.Th>주문</Table.Th>
          <Table.Th>미수 잔액</Table.Th>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {relations.map((relation) => {
          const open = openRelationId === relation.id;
          return (
            <RetailerRow
              key={relation.id}
              relation={relation}
              orderCount={orderCountOf(relation)}
              receivable={receivableOf(relation)}
              open={open}
              onToggle={() => onToggle(relation.id)}
            >
              {open ? renderDetail(relation) : null}
            </RetailerRow>
          );
        })}
      </Table.Body>
    </Table>
  );
}

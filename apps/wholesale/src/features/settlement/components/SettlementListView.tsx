"use client";

import { AccordionRows, Button, Panel, SearchInput } from "@ondo/ui";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import { RetailerRow } from "./RetailerRow";
import { SettlementSegmentView } from "./SettlementSegmentView";
import {
  outstandingReceivable,
  relationLedger,
  relationOrders,
} from "../derive";
import {
  LEDGER_ENTRIES,
  SETTLEMENT_ORDERS,
  TRADE_RELATIONS,
} from "../fixtures";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 정산 관리 — 좌 거래처 목록(아코디언) + 우 입금 등록 패널.
 *
 * 화면은 하나다. 좌측의 펼친 영역이 세그먼트로 두 얼굴(정산 상태 / 미수원장)을 갖고,
 * 우측은 펼친 거래처에 대한 입금 등록 패널이 된다 — 다른 페이지로 넘어가지 않는다.
 *
 * **한 번에 한 거래처만 펼친다.** 펼친 거래처가 곧 우측 입금의 대상이라,
 * 두 개가 열려 있으면 지금 어느 거래처에 돈을 붙이는지 화면에서 읽을 수 없다.
 *
 * 데이터는 전부 더미라 로딩·에러 상태가 없다. 서버가 붙으면 목록을 받는 자리에서
 * 세 상태를 갈라야 한다.
 */
export function SettlementListView() {
  const [query, setQuery] = useState("");
  const [openRelationId, setOpenRelationId] = useState<string | null>(null);

  const keyword = query.trim().toLowerCase();
  /* 품명 검색은 이 화면에 품목 데이터가 없어 걸리지 않는다 — placeholder만 §9.4 문구를 따른다 */
  const visibleRelations = keyword
    ? TRADE_RELATIONS.filter(
        (r) =>
          r.retailerName.toLowerCase().includes(keyword) ||
          r.retailerCode.toLowerCase().includes(keyword),
      )
    : TRADE_RELATIONS;

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          <Panel.Title
            action={
              <Button variant="ghost" size="iconSm" aria-label="더보기">
                <EllipsisVertical aria-hidden className="size-4" />
              </Button>
            }
          >
            정산 관리
          </Panel.Title>
          <div className="mb-4 shrink-0">
            <SearchInput
              placeholder="거래처·품명 검색"
              aria-label="거래처·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다 */}
          <Panel.Body>
            {visibleRelations.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            ) : (
              <AccordionRows>
                {visibleRelations.map((relation) => {
                  const orders = relationOrders(SETTLEMENT_ORDERS, relation.id);
                  return (
                    <RetailerRow
                      key={relation.id}
                      relation={relation}
                      orderCount={orders.length}
                      receivable={outstandingReceivable(
                        relationLedger(LEDGER_ENTRIES, relation.id),
                      )}
                      open={openRelationId === relation.id}
                      onOpenChange={(open) =>
                        setOpenRelationId(open ? relation.id : null)
                      }
                    >
                      {/* key: 거래처가 바뀌면 세그먼트·필터 상태를 새로 만든다 */}
                      <SettlementSegmentView
                        key={relation.id}
                        orders={orders}
                      />
                    </RetailerRow>
                  );
                })}
              </AccordionRows>
            )}
          </Panel.Body>
        </Panel>
      }
      emptyDetail="좌측 목록에서 거래처를 펼쳐 주세요"
    />
  );
}

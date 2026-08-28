"use client";

import { IconButton, Panel, SearchInput } from "@ondo/ui";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import { DepositFormPanel } from "./DepositFormPanel";
import { SettlementRelationTable } from "./SettlementRelationTable";
import { SettlementSegmentView } from "./SettlementSegmentView";
import {
  applyAllocations,
  nowIsoMinute,
  outstandingReceivable,
  paymentLedgerEntry,
  relationLedger,
  relationOrders,
} from "../derive";
import {
  LEDGER_ENTRIES,
  SETTLEMENT_ORDERS,
  TRADE_RELATIONS,
} from "../fixtures";
import type { AllocationEntry, DepositDraft, DepositMode } from "../types";
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
  /*
   * 입금 실행은 서버가 없어 로컬 상태로 반영한다. 그래서 주문·원장을 상수로 그리지 않고
   * state로 들고 있는다 — 배정액이 바뀌면 정산 상태·미수 잔액·tail이 함께 움직여야 한다.
   */
  const [orders, setOrders] = useState(SETTLEMENT_ORDERS);
  const [ledger, setLedger] = useState(LEDGER_ENTRIES);
  /** 실행 후 폼을 비우는 장치. 값을 하나씩 지우는 대신 패널을 새로 만든다 */
  const [formSeq, setFormSeq] = useState(0);

  /** 펼친 거래처가 곧 우측 입금의 대상이다. 안 펼쳤으면 우측은 빈 상태로 남는다 */
  const openRelation =
    TRADE_RELATIONS.find((r) => r.id === openRelationId) ?? null;

  const keyword = query.trim().toLowerCase();
  /* 품명 검색은 이 화면에 품목 데이터가 없어 걸리지 않는다 — placeholder만 §9.4 문구를 따른다 */
  const visibleRelations = keyword
    ? TRADE_RELATIONS.filter(
        (r) =>
          r.retailerName.toLowerCase().includes(keyword) ||
          r.retailerCode.toLowerCase().includes(keyword),
      )
    : TRADE_RELATIONS;

  /**
   * 두 버튼의 차이는 **배정을 하느냐 하나뿐**이다(`settlement_data_model.md` §2.5).
   * 원장의 `↓입금` 한 줄은 둘 다 똑같이 생긴다 — 돈이 들어온 사실은 같기 때문이다.
   * `입금만 진행`은 배분 입력값을 쓰지 않으므로 주문의 정산 상태가 하나도 안 바뀌고,
   * 그만큼이 미배정으로 남는다(그 표시는 이번 범위 밖 — 01-pm.md §5 Q7).
   */
  const submitDeposit = (
    mode: DepositMode,
    draft: DepositDraft,
    allocations: AllocationEntry[],
  ) => {
    if (!openRelation || draft.amount === null || draft.amount <= 0) return;
    // 실행 시각은 렌더가 아니라 버튼을 누른 이 순간에만 읽는다
    const date = nowIsoMinute(new Date());
    const amount = draft.amount;

    setLedger((prev) => [
      ...prev,
      paymentLedgerEntry(openRelation.id, date, amount, prev.length),
    ]);
    if (mode === "settle") {
      setOrders((prev) => applyAllocations(prev, allocations));
    }
    setFormSeq((seq) => seq + 1);
  };

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 한 줄 — 좌: 검색 / 우: 필터와 주 액션.
              검색창의 `mr-auto`가 나머지를 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(필터·버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-4 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="거래처·품명 검색"
              aria-label="거래처·품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <IconButton variant="ghost" size="sm" aria-label="더보기">
              <EllipsisVertical aria-hidden />
            </IconButton>
          </div>

          {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
              stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
              빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
          {visibleRelations.length === 0 ? (
            <Panel.Body>
              <p className="text-muted-foreground py-12 text-center text-sm">
                검색 결과가 없습니다
              </p>
            </Panel.Body>
          ) : (
            <SettlementRelationTable
              relations={visibleRelations}
              openRelationId={openRelationId}
              onToggle={(relationId) =>
                setOpenRelationId((prev) =>
                  prev === relationId ? null : relationId,
                )
              }
              orderCountOf={(relation) =>
                relationOrders(orders, relation.id).length
              }
              receivableOf={(relation) =>
                outstandingReceivable(relationLedger(ledger, relation.id))
              }
              renderDetail={(relation) => (
                /* key: 거래처가 바뀌면 세그먼트·필터 상태를 새로 만든다 */
                <SettlementSegmentView
                  key={relation.id}
                  orders={relationOrders(orders, relation.id)}
                  ledger={relationLedger(ledger, relation.id)}
                />
              )}
            />
          )}
        </Panel>
      }
      detail={
        openRelation ? (
          /* key: 거래처가 바뀌거나 한 건을 실행하면 입력값이 남지 않게 상태째 새로 만든다 */
          <DepositFormPanel
            key={`${openRelation.id}-${formSeq}`}
            relation={openRelation}
            orders={relationOrders(orders, openRelation.id)}
            onSubmit={submitDeposit}
          />
        ) : undefined
      }
      emptyDetail="좌측 목록에서 거래처를 펼쳐 주세요"
    />
  );
}

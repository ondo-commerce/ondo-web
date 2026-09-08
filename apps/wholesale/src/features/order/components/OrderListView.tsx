"use client";

import { Button, Notice, Panel, SearchInput } from "@ondo/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { OrderRowDetail } from "./OrderRowDetail";
import { OrderSettlementFilter } from "./OrderSettlementFilter";
import {
  OrderStatusFilter,
  OrderStatusFilterWithCounts,
} from "./OrderStatusFilter";
import { OrderSummaryCard } from "./OrderSummaryCard";
import { OrderTable } from "./OrderTable";
import { PackingQueueCard } from "./PackingQueueCard";
import { orderKeys } from "../api/keys";
import { useOrderListQuery } from "../api/queries";
import {
  STATUS_FILTER_ALL,
  type OrderFilterValue,
  type SettlementFilterValue,
} from "../constants";
import { toListQuery, type OrderListParams } from "../derive";
import type { ShipInputs, ShipInputsByOrder } from "../types";
import { QueryBoundary, QueryBoundaryGroup } from "@/shared/api/QueryBoundary";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 검색어를 서버에 보내기까지 기다리는 시간. 글자마다 부르지 않기 위해서다 */
const SEARCH_DEBOUNCE_MS = 300;

/** 아직 아무것도 안 적은 주문의 입력. 렌더마다 `{}`를 새로 만들면 펼침이 매번 다시 그려진다 */
const NO_INPUTS: ShipInputs = {};

/**
 * 주문 관리 — 좌 목록 + 우 주문 카드.
 *
 * 다른 탭과 같은 2단 배치다(ListDetailLayout). 다른 점은 하나뿐 —
 * **아무 행도 펼치지 않았을 때 우측에 안내 패널을 그리지 않는다**(`emptyDetail={null}`).
 *
 * 상태 필터·정산 필터·검색은 전부 서버가 건다(`GET /orders`). 칩의 건수만은 검색어 기준
 * 전체(`GET /orders/filters`)라 칩을 눌러 좁혀도 다른 칩 숫자는 안 줄어든다 —
 * 지금 안 보이는 게 몇 건인지 읽혀야 하기 때문이다.
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 경계는 셋 — 칩 줄·표·우측 카드들. 실패한 자리만 그 자리에서 실패한다.
 * 재시도는 뷰 하나가 나눠 쓴다(`QueryBoundaryGroup`) — 펼친 행과 우측 주문 카드가 같은
 * 상세 키를 봐서, 따로 두면 `다시 시도`가 두 개 뜨고 두 번 눌러야 했다(F6).
 */
export function OrderListView() {
  /* 다른 탭(출고·미송)에서 바꾼 상태를 들고 오려면 탭 진입 때 자기 키를 한 번 비운다(F1). 같은 탭 안 왕복은 캐시 */
  useInvalidateOnMount(orderKeys.all);
  const [draft, setDraft] = useState("");
  /** 서버에 보낸 검색어. `draft`를 잠깐 뒤에 옮긴 값 */
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<OrderFilterValue>(STATUS_FILTER_ALL);
  /** 정산 상태 필터. 이행 축(statusFilter)과 독립이라 둘이 함께 걸린다 */
  const [settlementFilter, setSettlementFilter] =
    useState<SettlementFilterValue>(STATUS_FILTER_ALL);
  /** 1-base. 서버는 0-base라 보낼 때 1 뺀다(derive.toListQuery) */
  const [page, setPage] = useState(1);
  /** 펼친 주문. 한 번에 하나만 펼친다 — 우측 카드가 한 장뿐이기 때문이다 */
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  /**
   * `이번 출고` 입력값. **주문별로 든다**(주문 id → 라인 id → 문자열).
   *
   * 펼침 안(`OrderRowDetail`)이 아니라 여기 두는 이유: 검색어가 바뀌면 목록 경계가 다시
   * 그려지는데 그 아래 있던 입력이 같이 사라지면 안 된다(F-03). 주문별인 이유: 행을 접었다 펴거나
   * 다른 주문을 갔다 와도 적어 둔 값이 남아야 한다(F8, #199). 다른 주문의 입력은 요청에 못 섞인다 —
   * 확정·포장 요청은 펼친 주문의 맵만 읽는다. 버리는 건 서버가 받아 줬을 때뿐이다.
   */
  const [shipInputs, setShipInputs] = useState<ShipInputsByOrder>({});
  /** 지금 표에 있는 주문 id. 표가 알려 준다. 못 받았으면 null */
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<number> | null>(
    null,
  );

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => {
      setQ(trimmed);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, q]);

  const params: OrderListParams = {
    q,
    status: statusFilter,
    settlement: settlementFilter,
    page,
  };

  /* 접어도 입력은 남는다(F8). 주문별 맵이라 다른 주문을 펼쳐도 섞이지 않는다 */
  const toggleOrder = (orderId: number) =>
    setOpenOrderId((prev) => (prev === orderId ? null : orderId));

  /* 필터를 바꾸면 펼침을 푼다. 안 그러면 목록에서 사라진 주문의 카드가 우측에 남는다.
     검색은 풀지 않는다 — 한 글자 칠 때마다 입력이 날아가는 게 더 큰 손해다(F-03).
     입력은 안 버린다 — 같은 주문을 다시 펼치면 그대로 있어야 한다 */
  const changeStatusFilter = (next: OrderFilterValue) => {
    setStatusFilter(next);
    setPage(1);
    setOpenOrderId(null);
  };

  const changeSettlementFilter = (next: SettlementFilterValue) => {
    setSettlementFilter(next);
    setPage(1);
    setOpenOrderId(null);
  };

  /*
   * 표가 받은 주문 id를 알려 줄 때. **참조가 안정돼야 한다**(useCallback) — 매 렌더 새 함수면
   * 표의 effect가 매번 다시 돌아 상태 갱신이 꼬리를 문다. 같은 집합이면 같은 참조를 돌려줘 렌더를 아낀다.
   */
  const handleVisibleChange = useCallback((ids: readonly number[] | null) => {
    setVisibleIds((prev) => {
      if (ids === null) return null;
      if (
        prev !== null &&
        prev.size === ids.length &&
        ids.every((id) => prev.has(id))
      ) {
        return prev;
      }
      return new Set(ids);
    });
  }, []);

  /* 검색으로 목록에서 빠진 주문. 카드는 남긴다 — 지우면 확정 직후 검색 중엔 포장 대기를
     못 본다(F-06). 표를 아직 못 받았으면(null) 목록 안으로 본다 — 기다리는 동안 안내가 깜빡이지 않게 */
  const openInList =
    openOrderId === null || (visibleIds?.has(openOrderId) ?? true);

  const changeShipInput = (orderId: number, lineId: number, value: string) =>
    setShipInputs((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] ?? NO_INPUTS), [lineId]: value },
    }));

  /** 서버가 받아 준 뒤. 그 주문의 입력만 비운다 */
  const resetShipInputs = (orderId: number) =>
    setShipInputs((prev) => ({ ...prev, [orderId]: undefined }));

  return (
    <QueryBoundaryGroup>
      <ListDetailLayout
        list={
          <Panel className="flex-1">
            {/* 툴바 두 줄 — 첫 줄은 검색(과 주 액션), 둘째 줄은 필터.
              한 줄로 두면 검색창 340px + 세그먼트들이 좌측 패널 폭을 넘겨서 제멋대로 접힌다.
              검색은 폭이 고정이고 필터는 칸 수·글자 길이에 따라 변하니, 변하는 쪽만 아래 줄에
              모아 두면 검색창 자리가 탭을 옮겨도 흔들리지 않는다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
            <div className="mb-3 flex shrink-0 items-center gap-3">
              <SearchInput
                className="mr-auto"
                placeholder="주문번호·거래처·품명 검색"
                aria-label="주문번호·거래처·품명 검색"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>

            <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
              {/* 칩 건수만 서버를 기다린다. 기다리는 동안·실패했을 때도 칸은 누를 수 있어야
                해서 fallback도 errorFallback도 스켈레톤·에러 블록이 아니라 건수 없는 같은
                세그먼트다. 실패에는 작은 `건수 다시 시도`만 옆에 붙는다(F4) */}
              <QueryBoundary
                fallback={
                  <OrderStatusFilter
                    value={statusFilter}
                    onChange={changeStatusFilter}
                  />
                }
                errorFallback={({ retry }) => (
                  <>
                    <OrderStatusFilter
                      value={statusFilter}
                      onChange={changeStatusFilter}
                    />
                    <Button
                      type="button"
                      variant="line"
                      size="sm"
                      onClick={retry}
                    >
                      건수 다시 시도
                    </Button>
                  </>
                )}
              >
                <OrderStatusFilterWithCounts
                  q={params.q === "" ? undefined : params.q}
                  value={statusFilter}
                  onChange={changeStatusFilter}
                />
              </QueryBoundary>
              <OrderSettlementFilter
                value={settlementFilter}
                onChange={changeSettlementFilter}
              />
            </div>

            {/* 경계는 표 자리에만. 검색줄·필터는 서버와 무관하게 늘 있어야 한다 */}
            <QueryBoundary>
              <OrderListBody
                params={params}
                openOrderId={openOrderId}
                onToggle={toggleOrder}
                onPage={setPage}
                onVisibleChange={handleVisibleChange}
                renderDetail={(orderId) => (
                  <OrderRowDetail
                    orderId={orderId}
                    inputs={shipInputs[orderId] ?? NO_INPUTS}
                    onInputChange={(lineId, value) =>
                      changeShipInput(orderId, lineId, value)
                    }
                    onInputsReset={() => resetShipInputs(orderId)}
                  />
                )}
              />
            </QueryBoundary>
          </Panel>
        }
        detail={
          openOrderId !== null ? (
            <>
              <Panel className="shrink-0">
                {/* 목록 조건 밖의 주문임을 카드 머리에서 말한다(F1, #198). 경계 밖이라 기다리는 동안·실패해도 보인다 */}
                {!openInList ? (
                  <Notice className="mb-4">
                    현재 목록 조건에 없는 주문이에요. 확정·포장은 이 주문에
                    붙어요.
                  </Notice>
                ) : null}
                <QueryBoundary>
                  <OrderSummaryCard orderId={openOrderId} />
                </QueryBoundary>
              </Panel>
              {/* 회차가 하나도 없으면 카드째 사라진다 — 패널이 경계 안에 있다 */}
              <PackingQueueCard orderId={openOrderId} />
            </>
          ) : undefined
        }
        /* 아무것도 안 펼쳤을 때 우측은 빈 자리로 둔다 — 흰 패널을 그리지 않는다 */
        emptyDetail={null}
      />
    </QueryBoundaryGroup>
  );
}

/**
 * 표 + 페이지 이동. 안에서만 `useSuspenseQuery`를 부른다.
 * 표에 있는 주문 id를 부모에게 알린다(우측 카드의 "목록 조건 밖" 안내). 0건이어도 이 컴포넌트는
 * 남아 빈 집합을 알린다 — 그래야 검색 0건일 때도 안내가 뜬다.
 */
function OrderListBody({
  params,
  openOrderId,
  onToggle,
  onPage,
  onVisibleChange,
  renderDetail,
}: {
  params: OrderListParams;
  openOrderId: number | null;
  onToggle: (orderId: number) => void;
  onPage: (page: number) => void;
  /** 표에 있는 주문 id. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onVisibleChange: (ids: readonly number[] | null) => void;
  renderDetail: (orderId: number) => ReactNode;
}) {
  const { data } = useOrderListQuery(toListQuery(params));
  const totalPages = Math.max(data.meta.totalPages, 1);

  useEffect(() => {
    onVisibleChange(data.rows.map((row) => row.id));
    return () => onVisibleChange(null);
  }, [data.rows, onVisibleChange]);

  return (
    <>
      {/* 검색줄·칩 줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
          stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
          빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 */}
      {data.rows.length === 0 ? (
        <Panel.Body>
          <p className="text-muted-foreground py-12 text-center text-sm">
            {/* 검색어 없이 칩만으로 0건이면 "검색 결과"가 아니다(F-10) */}
            {params.q === ""
              ? "조건에 맞는 주문이 없습니다"
              : "검색 결과가 없습니다"}
          </p>
        </Panel.Body>
      ) : (
        <OrderTable
          rows={data.rows}
          openOrderId={openOrderId}
          onToggle={onToggle}
          renderDetail={(row) => renderDetail(row.id)}
        />
      )}

      {/* 서버가 100행씩 자른다. 한 페이지에 다 들어오면(대부분) 이 줄은 없다 */}
      {totalPages > 1 ? (
        <nav
          aria-label="페이지 이동"
          className="mt-3 flex shrink-0 items-center justify-end gap-2 text-sm"
        >
          <span className="text-muted-foreground mr-2">
            {params.page} / {totalPages}
          </span>
          <Button
            variant="line"
            size="sm"
            disabled={params.page <= 1}
            onClick={() => onPage(params.page - 1)}
          >
            이전
          </Button>
          <Button
            variant="line"
            size="sm"
            disabled={params.page >= totalPages}
            onClick={() => onPage(params.page + 1)}
          >
            다음
          </Button>
        </nav>
      ) : null}
    </>
  );
}

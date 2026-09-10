"use client";

import { Button, Panel, SearchInput } from "@ondo/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { OutboundRowDetail } from "./OutboundRowDetail";
import { PackageDetailPanel } from "./PackageDetailPanel";
import { PackingRowDetail } from "./PackingRowDetail";
import { PackingWorkPanel } from "./PackingWorkPanel";
import { ShipmentRetailerTable } from "./ShipmentRetailerTable";
import { ShipmentStageChipsWithCounts } from "./ShipmentStageChips";
import { TradeStatementCard } from "./TradeStatementCard";
import { shipmentKeys } from "../api/keys";
import { useShipmentRefresh } from "../api/mutations";
import {
  toQ,
  useOutboundRetailersQuery,
  usePackingRetailersQuery,
} from "../api/queries";
import {
  EMPTY_DETAIL_TEXT,
  EMPTY_LIST_TEXT,
  RETAILER_PAGE_SIZE,
  STAGE_STATUS,
} from "../constants";
import { noticeText, outboundLabel, selectedRows } from "../derive";
import type {
  OutboundStatus,
  PackingRowView,
  PackingSelection,
  RetailerView,
  ShipmentNotice,
  ShipmentStage,
} from "../types";
import { QueryBoundary, QueryBoundaryGroup } from "@/shared/api/QueryBoundary";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 검색어를 서버에 보내기까지 기다리는 시간. 글자마다 부르지 않기 위해서다 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 출고 관리 — 좌 목록(소매처 아코디언) + 우 작업 패널.
 *
 * **세 단계는 다른 페이지가 아니라 한 화면의 상태다**(판정 D1). 좌측 셸은 그대로 두고
 * 칩으로 아래 셋만 바꾼다:
 *
 *   포장 대기 → 대기 줄 표(체크박스) + 포장 작업 패널       (`GET /packing-items/*` · `POST /outbounds`)
 *   출고 대기 → 봉투 표                + 포장 상세 패널       (`GET /outbounds*` status=NOT_SHIPPED · `POST …/ship`)
 *   출고 완료 → 출고된 봉투 표         + 장끼 카드            (`GET /outbounds*` status=SHIPPED · `GET …/statement`)
 *
 * 검색은 서버가 건다(`q`). 칩 건수도 같은 `q` 기준이라 검색하면 칩이 같이 준다.
 * 단계와 선택 상태는 URL에 두지 않는다(재고 탭과 같은 규칙).
 *
 * 경계는 셋 — 소매처 표 · 펼침 영역 · 우측 패널. 실패한 자리만 그 자리에서 실패한다.
 * 칩 건수는 경계 밖(`useQueries`)이라 못 받아도 칩은 눌린다.
 * 재시도는 뷰 하나가 나눠 쓴다(`QueryBoundaryGroup`) — 칩 건수와 소매처 표가 같은 키를 봐서,
 * 칩의 `건수 다시 시도`가 표 경계까지 살려야 한 번에 둘 다 찬다(wire-shipment F4, #197).
 */
export function ShipmentListView() {
  /* 다른 탭(주문·재고)에서 바꾼 상태를 들고 오려면 탭 진입 때 자기 키를 한 번 비운다(F1). 같은 탭 안 왕복은 캐시 */
  useInvalidateOnMount(shipmentKeys.all);
  const [draft, setDraft] = useState("");
  /** 서버에 보낸 검색어. `draft`를 잠깐 뒤에 옮긴 값 */
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<ShipmentStage>("ready");
  /** 동시에 하나만 펼친다 — 좌우가 같은 소매처를 가리키게 하려면 기준이 하나여야 한다 */
  const [openRetailerId, setOpenRetailerId] = useState<number | null>(null);
  /**
   * 포장 대기 표에서 체크한 줄의 **스냅샷**. 우측 `포장 작업` 패널이 이 값을 읽는다.
   * 검색으로 줄이 목록에서 빠져도 선택은 남는다 — 대신 패널이 그 사실을 말한다(shipments F3 · #198).
   */
  const [selection, setSelection] = useState<PackingSelection>({});
  /** 펼친 소매처의 표에 지금 있는 줄 id. 펼침 본문이 알려 준다. 못 받았으면 null */
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<number> | null>(
    null,
  );
  /** 지금 소매처 표에 있는 소매처 id. 표가 알려 준다. 못 받았으면 null */
  const [visibleRetailerIds, setVisibleRetailerIds] =
    useState<ReadonlySet<number> | null>(null);
  /** 출고 대기·출고 완료 단계에서 고른 봉투. 두 단계 모두 한 행만 고른다 */
  const [selectedOutboundId, setSelectedOutboundId] = useState<number | null>(
    null,
  );
  /** 직전 포장·출고의 결과. 패널이 내려간 뒤 빈 자리에서 보여 준다(shipments F9) */
  const [notice, setNotice] = useState<ShipmentNotice | null>(null);
  const refresh = useShipmentRefresh();

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => setQ(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, q]);

  const serverQ = toQ(q);
  /** 직전 처리는 됐는데 목록 재조회가 실패한 상태 — 새 처리를 잠그고 `다시 불러오기`를 먼저 */
  const stale = notice !== null && !notice.refreshed;

  /** 단계를 바꾸면 펼침과 선택이 같이 풀린다. 대기 줄 선택이 출고 대기 화면까지 따라오면 안 된다 */
  const handleStageChange = (next: ShipmentStage) => {
    setStage(next);
    setOpenRetailerId(null);
    setSelection({});
    setVisibleIds(null);
    setSelectedOutboundId(null);
    setNotice(null);
  };

  /**
   * **다른** 소매처를 펼칠 때만 선택을 비운다 — 한 포장은 한 소매처 것이다.
   * 같은 소매처를 접었다 펴면 골라 둔 줄이 남는다(wire-shipment F3, #205 · 주문 F8과 같은 규칙).
   * 접혀 있는 동안 우측 패널은 안 그린다(`detail`) — 선택은 살아 있되 펼쳐야 보인다.
   */
  const toggleRetailer = (retailerId: number) => {
    if (openRetailerId !== null && openRetailerId !== retailerId) {
      setSelection({});
    }
    setOpenRetailerId((prev) => (prev === retailerId ? null : retailerId));
    setVisibleIds(null);
    setSelectedOutboundId(null);
  };

  const toggleRow = (row: PackingRowView) => {
    // 새로 고르기 시작하면 직전 결과 문구는 할 일을 다 했다 — 재조회 실패 문구는 남긴다
    if (notice?.refreshed) setNotice(null);
    setSelection((prev) => {
      if (row.id in prev) {
        const next = { ...prev };
        delete next[row.id];
        return next;
      }
      return { ...prev, [row.id]: row };
    });
  };

  const toggleVisible = (rows: PackingRowView[], checked: boolean) => {
    if (notice?.refreshed) setNotice(null);
    setSelection((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (checked) next[row.id] = row;
        else delete next[row.id];
      }
      return next;
    });
  };

  const restrictTo = (ids: number[]) =>
    setSelection((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([id]) => ids.includes(Number(id))),
      ),
    );

  /*
   * 펼침 본문이 받은 줄 id를 알려 줄 때. **참조가 안정돼야 한다**(useCallback) — 매 렌더 새 함수면
   * 본문의 effect가 매번 다시 돌아 상태 갱신이 꼬리를 문다. 같은 집합이면 같은 참조를 돌려줘 렌더를 아낀다.
   */
  const handleVisibleChange = useCallback((ids: readonly number[] | null) => {
    setVisibleIds((prev) => sameOrNext(prev, ids));
  }, []);

  /* 소매처 표가 받은 id. 소매처가 검색으로 통째로 빠지면 펼침 본문이 내려가 `visibleIds`가 null이 되는데,
     그때도 우측 패널이 "목록 조건 밖"을 말해야 한다(wire-shipment F2, #205) — 그래서 소매처 단위로 하나 더 */
  const handleVisibleRetailersChange = useCallback(
    (ids: readonly number[] | null) => {
      setVisibleRetailerIds((prev) => sameOrNext(prev, ids));
    },
    [],
  );
  /* 표를 아직 못 받았으면(null) 목록 안으로 본다 — 기다리는 동안 안내가 깜빡이지 않게 */
  const retailerInList =
    openRetailerId === null ||
    (visibleRetailerIds?.has(openRetailerId) ?? true);

  const selectOutbound = (outboundId: number) => {
    if (notice?.refreshed) setNotice(null);
    setSelectedOutboundId(outboundId);
  };

  /** 포장이 서버에서 받아들여지고 목록 재조회까지 끝난 뒤. 선택이 풀리며 패널이 내려간다 */
  const finishPack = (outboundNumber: number, refreshed: boolean) => {
    setSelection({});
    setNotice({
      kind: "packed",
      outboundLabel: outboundLabel(outboundNumber),
      refreshed,
    });
  };

  /** 출고 확정 뒤. 방금 발번된 장끼번호를 그 자리에서 보여 준다 */
  const finishShip = (statementCode: string, refreshed: boolean) => {
    setSelectedOutboundId(null);
    setNotice({ kind: "shipped", statementCode, refreshed });
  };

  /** 재조회가 실패했을 때 `다시 불러오기`. 성공하면 문구가 완료로 바뀌고 잠금이 풀린다 */
  const retryRefresh = () => {
    void refresh().then((ok) =>
      setNotice((prev) => (prev ? { ...prev, refreshed: ok } : prev)),
    );
  };

  const rows = selectedRows(selection);
  const selectedIds = new Set(rows.map((row) => row.id));

  const detail = (): ReactNode => {
    if (stage === "ready" && openRetailerId !== null && rows.length > 0) {
      return (
        <Panel className="flex-1">
          <PackingWorkPanel
            rows={rows}
            visibleIds={visibleIds}
            retailerInList={retailerInList}
            stale={stale}
            onRefresh={retryRefresh}
            onDone={(created, refreshed) =>
              finishPack(created.outboundNumber, refreshed)
            }
          />
        </Panel>
      );
    }
    if (stage === "packed" && selectedOutboundId !== null) {
      return (
        /* 패널은 경계 밖 — 기다리는 동안에도 우측 폭이 유지돼야 한다 */
        <Panel className="flex-1">
          <QueryBoundary>
            <PackageDetailPanel
              key={selectedOutboundId}
              outboundId={selectedOutboundId}
              stale={stale}
              onRefresh={retryRefresh}
              onShipped={finishShip}
            />
          </QueryBoundary>
        </Panel>
      );
    }
    if (stage === "shipped" && selectedOutboundId !== null) {
      return (
        <Panel className="flex-1">
          <Panel.Title className="border-border mb-4 border-b pb-3">
            장끼
          </Panel.Title>
          {/* 출고 확정 전 봉투는 404다(스펙). 에러가 아니라 "아직 없다"로 그린다 */}
          <QueryBoundary
            notFound={
              <p className="text-muted-foreground text-sm">
                출고 확정 전에는 장끼가 없습니다
              </p>
            }
          >
            <TradeStatementCard outboundId={selectedOutboundId} />
          </QueryBoundary>
        </Panel>
      );
    }
    return undefined;
  };

  return (
    <QueryBoundaryGroup>
      <ListDetailLayout
        list={
          <Panel className="flex-1">
            {/* 툴바 두 줄 — 첫 줄은 검색(과 주 액션), 둘째 줄은 필터.
              한 줄로 두면 검색창 340px + 세그먼트들이 좌측 패널 폭을 넘겨서 제멋대로 접힌다.
              검색은 폭이 고정이고 필터는 칸 수·글자 길이에 따라 변하니, 변하는 쪽만 아래 줄에
              모아 두면 검색창 자리가 탭을 옮겨도 흔들리지 않는다.
              첫 줄의 `mr-auto`는 오른쪽에 주 액션이 붙는 탭(상품·정산)과 규칙을 맞추려는 것이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
            <div className="mb-3 flex shrink-0 items-center gap-3">
              <SearchInput
                className="mr-auto"
                placeholder="거래처·품명 검색"
                aria-label="거래처·품명 검색"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>

            <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
              {/* 칩 건수는 경계 밖에서 받는다 — 기다리는 동안·실패했을 때도 칸은 눌려야 한다 */}
              <ShipmentStageChipsWithCounts
                q={serverQ}
                value={stage}
                onChange={handleStageChange}
              />
            </div>

            {/* 경계는 표 자리에만. 검색줄·칩 줄은 서버와 무관하게 늘 있어야 한다 */}
            <QueryBoundary>
              {stage === "ready" ? (
                <PackingRetailerList
                  q={serverQ}
                  hasKeyword={q !== ""}
                  openRetailerId={openRetailerId}
                  onToggle={toggleRetailer}
                  onVisibleChange={handleVisibleRetailersChange}
                  renderDetail={(retailer) => (
                    <QueryBoundary>
                      <PackingRowDetail
                        retailerId={retailer.id}
                        q={serverQ}
                        selectedIds={selectedIds}
                        onToggle={toggleRow}
                        onToggleVisible={toggleVisible}
                        onRestrictTo={restrictTo}
                        onVisibleChange={handleVisibleChange}
                      />
                    </QueryBoundary>
                  )}
                />
              ) : (
                <OutboundRetailerList
                  stage={stage}
                  status={STAGE_STATUS[stage]}
                  q={serverQ}
                  hasKeyword={q !== ""}
                  openRetailerId={openRetailerId}
                  onToggle={toggleRetailer}
                  renderDetail={(retailer) => (
                    <QueryBoundary>
                      <OutboundRowDetail
                        retailerId={retailer.id}
                        status={STAGE_STATUS[stage]}
                        q={serverQ}
                        selectedId={selectedOutboundId}
                        onSelect={selectOutbound}
                      />
                    </QueryBoundary>
                  )}
                />
              )}
            </QueryBoundary>
          </Panel>
        }
        detail={detail()}
        emptyDetail={
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span>{EMPTY_DETAIL_TEXT[stage]}</span>
            {notice ? (
              <p
                role={notice.refreshed ? "status" : "alert"}
                className={
                  notice.refreshed
                    ? "text-foreground text-sm"
                    : "text-destructive-strong text-sm"
                }
              >
                {/* 검색어가 걸린 채면 `출고 대기` 칩이 (0)일 수 있어 갈 길을 바꿔 말한다(F5, #205) */}
                {noticeText(notice, q !== "")}
              </p>
            ) : null}
            {stale ? (
              <Button
                type="button"
                variant="line"
                size="sm"
                onClick={retryRefresh}
              >
                다시 불러오기
              </Button>
            ) : null}
          </div>
        }
      />
    </QueryBoundaryGroup>
  );
}

/**
 * 포장 대기 소매처 표(`GET /packing-items/retailers`). 안에서만 `useSuspenseQuery`를 부른다.
 * 표에 있는 소매처 id를 부모에게 알린다. 0건이어도 이 컴포넌트는 남아 빈 집합을 알린다.
 */
function PackingRetailerList({
  q,
  hasKeyword,
  openRetailerId,
  onToggle,
  onVisibleChange,
  renderDetail,
}: {
  q: string | undefined;
  hasKeyword: boolean;
  openRetailerId: number | null;
  onToggle: (retailerId: number) => void;
  /** 표에 있는 소매처 id. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onVisibleChange: (ids: readonly number[] | null) => void;
  renderDetail: (retailer: RetailerView) => ReactNode;
}) {
  const { data: rows } = usePackingRetailersQuery(q);

  useEffect(() => {
    onVisibleChange(rows.map((row) => row.retailer.id));
    return () => onVisibleChange(null);
  }, [rows, onVisibleChange]);

  if (rows.length === 0) {
    return <EmptyList text={EMPTY_LIST_TEXT.ready} hasKeyword={hasKeyword} />;
  }
  return (
    <ShipmentRetailerTable
      countLabel="SKU 건수"
      rows={rows}
      openRetailerId={openRetailerId}
      onToggle={onToggle}
      renderDetail={renderDetail}
    />
  );
}

/**
 * 출고 대기·출고 완료 소매처 표(`GET /outbounds/retailers`). 두 단계는 `status`만 다르다.
 * 첫 페이지(100곳)만 — 화면에 페이저가 없어 넘치면 한 줄로 알린다.
 */
function OutboundRetailerList({
  stage,
  status,
  q,
  hasKeyword,
  openRetailerId,
  onToggle,
  renderDetail,
}: {
  stage: Exclude<ShipmentStage, "ready">;
  status: OutboundStatus;
  q: string | undefined;
  hasKeyword: boolean;
  openRetailerId: number | null;
  onToggle: (retailerId: number) => void;
  renderDetail: (retailer: RetailerView) => ReactNode;
}) {
  const { data } = useOutboundRetailersQuery({ status, q });

  if (data.rows.length === 0) {
    return <EmptyList text={EMPTY_LIST_TEXT[stage]} hasKeyword={hasKeyword} />;
  }
  return (
    <>
      <ShipmentRetailerTable
        countLabel="포장 건수"
        rows={data.rows}
        openRetailerId={openRetailerId}
        onToggle={onToggle}
        renderDetail={renderDetail}
      />
      {data.meta.totalPages > 1 ? (
        <p className="text-muted-foreground mt-2 shrink-0 text-right text-xs">
          소매처 {RETAILER_PAGE_SIZE}곳까지만 보입니다 (전체{" "}
          {data.meta.totalElements}곳)
        </p>
      ) : null}
    </>
  );
}

/** 같은 id 집합이면 같은 참조를 돌려준다 — 렌더마다 새 Set을 만들면 이걸 보는 effect가 꼬리를 문다 */
function sameOrNext(
  prev: ReadonlySet<number> | null,
  ids: readonly number[] | null,
): ReadonlySet<number> | null {
  if (ids === null) return null;
  if (
    prev !== null &&
    prev.size === ids.length &&
    ids.every((id) => prev.has(id))
  ) {
    return prev;
  }
  return new Set(ids);
}

/** 목록이 비었을 때의 문구. 검색 때문인지 원래 없는 건지를 갈라 준다 */
function EmptyList({
  text,
  hasKeyword,
}: {
  text: string;
  hasKeyword: boolean;
}) {
  return (
    /* 빈 목록에는 흐를 것이 없어서 stickyHead 표 대신 Panel.Body를 쓴다 */
    <Panel.Body>
      <p className="text-muted-foreground py-12 text-center text-sm">
        {hasKeyword ? "검색 결과가 없습니다" : text}
      </p>
    </Panel.Body>
  );
}

"use client";

import { Button, IconButton, Panel, Popover, SearchInput } from "@ondo/ui";
import { EllipsisVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BankAccountPanel } from "./BankAccountPanel";
import { DepositFormPanel } from "./DepositFormPanel";
import { SettlementRelationTable } from "./SettlementRelationTable";
import { SettlementSegmentView } from "./SettlementSegmentView";
import { settlementKeys } from "../api/keys";
import { useSettlementRefresh } from "../api/mutations";
import { useReceivableRetailersQuery } from "../api/queries";
import {
  EMPTY_DETAIL_TEXT,
  EMPTY_LIST_TEXT,
  RETAILER_PAGE_SIZE,
} from "../constants";
import { emptyDepositDraft, filterRetailers, noticeText } from "../derive";
import type {
  DepositDraft,
  OrderRowView,
  PaymentCreated,
  RetailerView,
  SettlementNotice,
} from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/**
 * 정산 관리 — 좌 거래처 목록(아코디언) + 우 입금 등록 패널.
 *
 * 화면은 하나다. 좌측의 펼친 영역이 세그먼트로 두 얼굴(정산 상태 / 미수원장)을 갖고,
 * 우측은 펼친 거래처에 대한 입금 등록 패널이 된다 — 다른 페이지로 넘어가지 않는다.
 * 툴바 `더보기`에서 `정산 계좌 관리`를 고르면 우측이 계좌 패널로 바뀐다.
 *
 * **한 번에 한 거래처만 펼친다.** 펼친 거래처가 곧 우측 입금의 대상이라,
 * 두 개가 열려 있으면 지금 어느 거래처에 돈을 붙이는지 화면에서 읽을 수 없다.
 *
 * 경계는 셋 — 거래처 표 · 펼침 영역(원장은 그 안에 하나 더) · 우측 계좌 패널. 실패한 자리만 그 자리에서 실패한다.
 * 검색은 서버에 없어(스펙) 받은 페이지 안에서 화면이 거른다.
 */
export function SettlementListView() {
  /* 출고 탭에서 확정한 판매 줄을 들고 오려면 탭 진입 때 자기 키를 한 번 비운다(⑪). 같은 탭 안 왕복은 캐시 */
  useInvalidateOnMount(settlementKeys.all);
  const [query, setQuery] = useState("");
  /** 펼친 거래처의 스냅샷. id만 들면 검색으로 목록에서 빠졌을 때 이름을 못 그린다 */
  const [openRetailer, setOpenRetailer] = useState<RetailerView | null>(null);
  /** 지금 표에 있는 거래처 id. 표가 알려 준다. 못 받았으면 null */
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<number> | null>(
    null,
  );
  /** 펼침 본문이 받은 확정 주문. 우측 배분 표가 쓴다. 본문이 내려가면 null */
  const [orders, setOrders] = useState<readonly OrderRowView[] | null>(null);
  /**
   * 입금 폼 입력, **소매처별.** 행을 접었다 펴도, 다른 거래처를 봤다 와도 적던 값이 남는다(⑥).
   * 입금이 등록되면 그 거래처 것만 지운다.
   */
  const [drafts, setDrafts] = useState<Record<number, DepositDraft>>({});
  /** 직전 입금의 결과. 재조회 실패면 새 입금을 잠근다 */
  const [notice, setNotice] = useState<SettlementNotice | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const refresh = useSettlementRefresh();

  /** 직전 처리는 됐는데 재조회가 실패한 상태 — 새 입금을 잠그고 `다시 불러오기`를 먼저 */
  const stale = notice !== null && !notice.refreshed;

  const toggleRetailer = (retailer: RetailerView) => {
    setOpenRetailer((prev) => (prev?.id === retailer.id ? null : retailer));
    setOrders(null);
    // 처음 펼치는 거래처면 빈 폼을 만든다 — 렌더가 아니라 클릭 순간에 `crypto.randomUUID()`를 읽는다
    setDrafts((prev) =>
      retailer.id in prev
        ? prev
        : { ...prev, [retailer.id]: emptyDepositDraft(crypto.randomUUID()) },
    );
    // 새 거래처를 보기 시작하면 직전 결과 문구는 할 일을 다 했다 — 재조회 실패 문구는 남긴다
    if (notice?.refreshed) setNotice(null);
  };

  /*
   * 표·펼침 본문이 받은 것을 알려 줄 때. **참조가 안정돼야 한다**(useCallback) — 매 렌더 새 함수면
   * 자식의 effect가 매번 다시 돌아 상태 갱신이 꼬리를 문다. 같은 집합이면 같은 참조를 돌려줘 렌더를 아낀다.
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

  const handleOrdersChange = useCallback(
    (rows: readonly OrderRowView[] | null) => setOrders(rows),
    [],
  );

  /** 폼 입력 병합 + 새 멱등키. `keepKey`는 제출 시각을 칸에 굳힐 때만(같은 본문의 재전송이어야 하니 키를 지킨다) */
  const updateDraft = (
    retailerId: number,
    patch: Partial<DepositDraft>,
    options?: { keepKey?: boolean },
  ) => {
    setDrafts((prev) => {
      const current =
        prev[retailerId] ?? emptyDepositDraft(crypto.randomUUID());
      return {
        ...prev,
        [retailerId]: {
          ...current,
          ...patch,
          idempotencyKey: options?.keepKey
            ? current.idempotencyKey
            : crypto.randomUUID(),
        },
      };
    });
  };

  /** 입금이 서버에서 받아들여지고 재조회까지 끝난 뒤. 그 거래처의 폼만 **빈 폼으로** 갈아 끼운다(패널은 남는다) */
  const finishPayment = (created: PaymentCreated, refreshed: boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [created.retailerId]: emptyDepositDraft(crypto.randomUUID()),
    }));
    setNotice({
      retailerName: created.retailerName,
      amount: created.amount,
      unallocated: created.unallocatedAmount,
      refreshed,
    });
  };

  /**
   * 재조회가 실패했을 때 `다시 불러오기`. 성공하면 문구가 완료로 바뀌고 잠금이 풀린다.
   * 표·펼침·우측 패널의 버튼이 **전부 이것**이다 — 어느 것을 눌러도 같은 무효화 + 같은 잠금 해제(②)
   */
  const retryRefresh = () => {
    void refresh().then((ok) =>
      setNotice((prev) => (prev ? { ...prev, refreshed: ok } : prev)),
    );
  };

  const draft = openRetailer ? drafts[openRetailer.id] : undefined;

  const detail = accountsOpen ? (
    /* 패널은 경계 밖 — 기다리는 동안에도 우측 폭이 유지돼야 한다 */
    <Panel className="flex-1">
      <QueryBoundary>
        <BankAccountPanel onClose={() => setAccountsOpen(false)} />
      </QueryBoundary>
    </Panel>
  ) : openRetailer && draft ? (
    <DepositFormPanel
      key={openRetailer.id}
      retailer={openRetailer}
      orders={orders}
      draft={draft}
      onDraftChange={(patch, options) =>
        updateDraft(openRetailer.id, patch, options)
      }
      inList={visibleIds?.has(openRetailer.id) ?? true}
      stale={stale}
      notice={notice}
      onRefresh={retryRefresh}
      onDone={finishPayment}
    />
  ) : undefined;

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 한 줄 — 좌: 검색 / 우: 더보기.
              검색창의 `mr-auto`가 나머지를 오른쪽으로 민다.
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
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger asChild>
                <IconButton variant="ghost" size="sm" aria-label="더보기">
                  <EllipsisVertical aria-hidden />
                </IconButton>
              </Popover.Trigger>
              <Popover.Content align="end" className="w-44 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false);
                    setAccountsOpen(true);
                  }}
                >
                  정산 계좌 관리
                </Button>
              </Popover.Content>
            </Popover>
          </div>

          {/* 경계는 표 자리에만. 검색줄은 서버와 무관하게 늘 있어야 한다 */}
          <QueryBoundary>
            <RetailerList
              keyword={query}
              openRetailerId={openRetailer?.id ?? null}
              onToggle={toggleRetailer}
              onVisibleChange={handleVisibleChange}
              onRefresh={retryRefresh}
              renderDetail={(retailer) => (
                /* key: 거래처가 바뀌면 세그먼트·필터 상태를 새로 만든다 */
                <QueryBoundary>
                  <SettlementSegmentView
                    key={retailer.id}
                    retailerId={retailer.id}
                    onOrdersChange={handleOrdersChange}
                    onRefresh={retryRefresh}
                  />
                </QueryBoundary>
              )}
            />
          </QueryBoundary>
        </Panel>
      }
      detail={detail}
      emptyDetail={
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span>{EMPTY_DETAIL_TEXT}</span>
          {notice ? (
            <p
              role={notice.refreshed ? "status" : "alert"}
              className={
                notice.refreshed
                  ? "text-foreground text-sm"
                  : "text-destructive-strong text-sm"
              }
            >
              {noticeText(notice)}
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
  );
}

/**
 * 거래처 표(`GET /receivables/retailers`). 안에서만 `useSuspenseQuery`를 부른다.
 * 검색은 받은 페이지 안에서 건다. 표에 있는 거래처 id를 부모에게 알린다(우측 패널의 "목록 조건 밖" 안내).
 */
function RetailerList({
  keyword,
  openRetailerId,
  onToggle,
  onVisibleChange,
  onRefresh,
  renderDetail,
}: {
  keyword: string;
  openRetailerId: number | null;
  onToggle: (retailer: RetailerView) => void;
  onVisibleChange: (ids: readonly number[] | null) => void;
  /** 재조회 실패 시 `다시 불러오기`. 부모의 것 하나를 쓴다 — 우측 패널의 잠금도 같이 풀려야 한다 */
  onRefresh: () => void;
  renderDetail: (retailer: RetailerView) => ReactNode;
}) {
  const { data, isRefetchError } = useReceivableRetailersQuery();
  /* 원본·검색어가 그대로면 같은 배열 — 아래 effect가 렌더마다 돌지 않게 */
  const rows = useMemo(
    () => filterRetailers(data.rows, keyword),
    [data.rows, keyword],
  );
  const hasKeyword = keyword.trim() !== "";

  useEffect(() => {
    onVisibleChange(rows.map((row) => row.retailer.id));
    return () => onVisibleChange(null);
  }, [rows, onVisibleChange]);

  if (rows.length === 0) {
    return (
      /* 빈 목록에는 흐를 것이 없어서 stickyHead 표 대신 Panel.Body를 쓴다 */
      <Panel.Body>
        <p className="text-muted-foreground py-12 text-center text-sm">
          {hasKeyword ? "검색 결과가 없습니다" : EMPTY_LIST_TEXT}
        </p>
      </Panel.Body>
    );
  }

  return (
    <>
      {/* 캐시엔 행이 있는데 재조회만 실패한 상태 — 경계가 못 잡는 유일한 실패라 여기서 한 줄 */}
      {isRefetchError ? (
        <p
          role="alert"
          className="text-destructive-strong mb-2 flex shrink-0 items-center justify-between gap-3 text-sm"
        >
          최신 목록을 못 불러왔어요
          <Button type="button" variant="line" size="sm" onClick={onRefresh}>
            다시 불러오기
          </Button>
        </p>
      ) : null}
      <SettlementRelationTable
        rows={rows}
        openRetailerId={openRetailerId}
        onToggle={onToggle}
        renderDetail={renderDetail}
      />
      {data.meta.totalPages > 1 ? (
        <p className="text-muted-foreground mt-2 shrink-0 text-right text-xs">
          거래처 {RETAILER_PAGE_SIZE}곳까지만 보입니다 (전체{" "}
          {data.meta.totalElements}곳)
        </p>
      ) : null}
    </>
  );
}

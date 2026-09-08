"use client";

import { Button, Notice, Panel, SearchInput } from "@ondo/ui";
import { useCallback, useEffect, useState } from "react";
import { InventoryInboundPanel } from "./InventoryInboundPanel";
import { InventoryTable } from "./InventoryTable";
import { SkuHistoryCard } from "./SkuHistoryCard";
import { SkuInboundCard } from "./SkuInboundCard";
import { inventoryKeys } from "../api/keys";
import { useInventoryListQuery } from "../api/queries";
import { clearDrafts, toListQuery, type InventoryListParams } from "../derive";
import type { InboundDrafts, InboundEntry, InboundInput } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";
import { productKeys } from "@/shared/api/product";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 검색어를 서버에 보내기까지 기다리는 시간. 글자마다 부르지 않기 위해서다 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 재고 관리 — 좌 목록(상품 표 + 펼친 SKU 표) + 우 작업 패널.
 *
 * 우측은 한 화면 안에서 두 모드로 바뀐다. 다른 페이지가 아니다.
 *
 *   아무 상품도 안 펼침 → 빈 상태 문구
 *   상품 행 펼침        → 모드 A (상품 단위 일괄 입고 표)
 *     └ SKU 행 클릭     → 모드 B (입고 카드 + 변동 이력 카드)
 *
 * **다른 상품을 펼치면 SKU 선택이 반드시 풀린다.** 안 풀면 A상품 목록 옆에
 * B상품 SKU 카드가 남는다.
 *
 * 검색은 서버가 건다(`GET /products?q=`). 목록·SKU 재고는 상품 응답이고, 입고하면
 * 그 상품의 상세를 다시 받아 좌측 표·우측 카드가 같이 움직인다(뮤테이션이 무효화).
 *
 * 선택 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 경계는 셋 — 목록 패널·우측 입고 카드·변동 이력 카드. 실패한 자리만 그 자리에서 실패한다.
 * 목록 패널 안에서도 행마다 받는 상세는 **행 단위**로 실패한다(합계 칸만 `-`·`다시 시도`).
 * 우측 입고 카드는 목록과 같은 키(상품 상세)를 봐서, 목록이 받아 둔 캐시를 그대로 쓴다.
 */
export function InventoryListView() {
  /* 다른 탭(출고·미송)에서 바꾼 상태를 들고 오려면 탭 진입 때 자기 키를 한 번 비운다(F1). 같은 탭 안 왕복은 캐시 */
  /* 목록·SKU 재고는 상품 응답이라 상품 키도 같이 — 출고가 재고를 줄인다 */
  useInvalidateOnMount(productKeys.all);
  useInvalidateOnMount(inventoryKeys.all);
  const [draft, setDraft] = useState("");
  /** 서버에 보낸 검색어. `draft`를 잠깐 뒤에 옮긴 값 */
  const [q, setQ] = useState("");
  /** 1-base. 서버는 0-base라 보낼 때 1 뺀다(derive.toListQuery) */
  const [page, setPage] = useState(1);
  const [openProductId, setOpenProductId] = useState<number | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null);
  /**
   * 입고 입력. **SKU별로 여기서 든다** — 우측 카드 안에 두면 SKU 행을 눌러 모드 B로 갔다가
   * 돌아올 때 카드가 내려가며 적은 값이 사라진다(Q-01). 상품을 접었다 펴도 남는다.
   * 버리는 건 입고가 받아들여졌을 때, 그것도 처리된 줄만이다(Q-02).
   */
  const [drafts, setDrafts] = useState<InboundDrafts>({});
  /** 지금 표에 있는 상품 id. 표가 알려 준다. 못 받았으면 null */
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

  const params: InventoryListParams = { q, page };

  /** 다른 상품을 펼치면 SKU 선택이 반드시 풀린다 — 안 풀면 A상품 옆에 B상품 카드가 남는다 */
  const toggleProduct = (productId: number) => {
    setOpenProductId((prev) => (prev === productId ? null : productId));
    setSelectedSkuId(null);
  };

  /** 같은 행을 다시 누르면 모드 A로 돌아간다 */
  const selectSku = (variantId: number) =>
    setSelectedSkuId((prev) => (prev === variantId ? null : variantId));

  /*
   * 표가 받은 상품 id를 알려 줄 때. **참조가 안정돼야 한다**(useCallback) — 매 렌더 새 함수면
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

  /* 검색으로 목록에서 빠진 상품. 우측 표·카드는 남긴다 — 지우면 검색 중엔 입고를 못 한다(F8, #198).
     표를 아직 못 받았으면(null) 목록 안으로 본다 — 기다리는 동안 안내가 깜빡이지 않게 */
  const openInList =
    openProductId === null || (visibleIds?.has(openProductId) ?? true);
  /** 목록 조건 밖의 상품임을 카드 머리에서 말한다. 경계 밖이라 기다리는 동안·실패해도 보인다 */
  const outOfListNotice = !openInList ? (
    <Notice className="mb-4">
      현재 목록 조건에 없는 상품이에요. 입고는 이 상품에 붙어요.
    </Notice>
  ) : null;

  const changeDraft = (variantId: number, next: InboundInput) =>
    setDrafts((prev) => ({ ...prev, [variantId]: next }));

  /** 서버가 받아 준 뒤. 보낸 줄의 입력만 비운다 — 안 보낸 줄(단가만 적은 줄)은 그대로다 */
  const finishInbound = (entries: InboundEntry[]) =>
    setDrafts((prev) => clearDrafts(prev, entries));

  const detail = () => {
    if (openProductId === null) return undefined;

    if (selectedSkuId !== null) {
      return (
        <>
          {/* 패널은 경계 밖 — 기다리는 동안에도 우측 폭이 유지돼야 한다 */}
          <Panel className="shrink-0">
            {outOfListNotice}
            <QueryBoundary>
              <SkuInboundCard
                productId={openProductId}
                variantId={selectedSkuId}
                drafts={drafts}
                onDraftChange={changeDraft}
                onReceived={finishInbound}
              />
            </QueryBoundary>
          </Panel>
          <Panel className="min-h-0 flex-1">
            <Panel.Title>재고 변동 이력</Panel.Title>
            <QueryBoundary>
              <SkuHistoryCard variantId={selectedSkuId} />
            </QueryBoundary>
          </Panel>
        </>
      );
    }

    return (
      <Panel className="flex-1">
        {outOfListNotice}
        <QueryBoundary>
          <InventoryInboundPanel
            productId={openProductId}
            drafts={drafts}
            onDraftChange={changeDraft}
            onReceived={finishInbound}
          />
        </QueryBoundary>
      </Panel>
    );
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
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>

          {/* 경계는 표 자리에만. 검색줄은 서버와 무관하게 늘 있어야 한다 */}
          <QueryBoundary>
            <InventoryListBody
              params={params}
              openProductId={openProductId}
              onToggle={toggleProduct}
              selectedSkuId={selectedSkuId}
              onSelectSku={selectSku}
              onPage={setPage}
              onVisibleChange={handleVisibleChange}
            />
          </QueryBoundary>
        </Panel>
      }
      detail={detail()}
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}

/**
 * 표 + 페이지 이동. 안에서만 목록 쿼리를 부른다.
 * 표에 있는 상품 id를 부모에게 알린다(우측 카드의 "목록 조건 밖" 안내). 0건이어도 이 컴포넌트는
 * 남아 빈 집합을 알린다 — 그래야 검색 0건일 때도 안내가 뜬다.
 */
function InventoryListBody({
  params,
  openProductId,
  onToggle,
  selectedSkuId,
  onSelectSku,
  onPage,
  onVisibleChange,
}: {
  params: InventoryListParams;
  openProductId: number | null;
  onToggle: (productId: number) => void;
  selectedSkuId: number | null;
  onSelectSku: (variantId: number) => void;
  onPage: (page: number) => void;
  /** 표에 있는 상품 id. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onVisibleChange: (ids: readonly number[] | null) => void;
}) {
  const { rows, meta, retryDetail } = useInventoryListQuery(
    toListQuery(params),
  );
  const totalPages = Math.max(meta.totalPages, 1);

  /* 상세 N개(useQueries)가 도착할 때마다 rows 배열이 새로 만들어진다 — id 목록이 같으면 부모가
     같은 참조를 돌려주니(handleVisibleChange) 여기서 따로 막지 않는다 */
  useEffect(() => {
    onVisibleChange(rows.map((row) => row.id));
    return () => onVisibleChange(null);
  }, [rows, onVisibleChange]);

  return (
    <>
      {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
          stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
          빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
      {rows.length === 0 ? (
        <Panel.Body>
          <p className="text-muted-foreground py-12 text-center text-sm">
            {/* 검색어 없이 0건이면 "검색 결과"가 아니라 상품이 없는 것이다 */}
            {params.q === ""
              ? "등록된 상품이 없습니다"
              : "검색 결과가 없습니다"}
          </p>
        </Panel.Body>
      ) : (
        <InventoryTable
          rows={rows}
          openProductId={openProductId}
          onToggle={onToggle}
          onRetryDetail={retryDetail}
          selectedSkuId={selectedSkuId}
          onSelectSku={onSelectSku}
        />
      )}

      {/* 서버가 20행씩 자른다(행마다 상세를 같이 받아서 페이지를 작게 둔다) */}
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

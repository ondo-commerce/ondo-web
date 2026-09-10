"use client";

import { Button, Notice, Panel, SearchInput } from "@ondo/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BackorderRowDetail } from "./BackorderRowDetail";
import { BackorderSummaryCard } from "./BackorderSummaryCard";
import { BackorderTable } from "./BackorderTable";
import { EtaFormCard } from "./EtaFormCard";
import { backorderKeys } from "../api/keys";
import { useBackorderSkusQuery } from "../api/queries";
import { toListQuery, type BackorderListParams } from "../derive";
import type { AllocationDraft, AllocationDrafts } from "../types";
import {
  QueryBoundary,
  QueryBoundaryGroup,
  QueryErrorView,
} from "@/shared/api/QueryBoundary";
import { useInvalidateOnMount } from "@/shared/api/useInvalidateOnMount";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 검색어를 서버에 보내기까지 기다리는 시간. 글자마다 부르지 않기 위해서다 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 미송 관리 — 좌 목록(미송이 걸린 SKU) + 우 작업 패널.
 *
 * 검색은 서버가 건다(`GET /backorders/variants?q=`). 목록 정렬도 서버 기본(많이 밀린 SKU 먼저)이다.
 * 펼친 SKU의 미송 건·요약은 펼치는 순간 따로 부른다(`GET /variants/{id}/backorders`) —
 * 펼친 행·우측 요약·예상 입고일 폼이 같은 queryKey라 한 번만 받는다.
 *
 * 선택(펼침) 상태는 URL에 두지 않는다 (docs/12-routing 규칙 3-A).
 *
 * 경계는 셋 — 표·우측 요약·예상 입고일 폼. 실패한 자리만 그 자리에서 실패한다.
 * 펼친 행의 경계는 행 안(`BackorderRowDetail`)에 있다.
 * 재시도는 뷰 하나가 나눠 쓴다(`QueryBoundaryGroup`) — 펼친 행·요약·폼 셋이 같은 펼침 키를
 * 봐서, 따로 두면 `다시 시도`가 셋 뜨고 세 번 눌러야 했다(wire-backorder F3, #197).
 */
export function BackorderListView() {
  /* 다른 탭(주문·재고)에서 바꾼 상태를 들고 오려면 탭 진입 때 자기 키를 한 번 비운다(F1). 같은 탭 안 왕복은 캐시 */
  useInvalidateOnMount(backorderKeys.all);
  const [draft, setDraft] = useState("");
  /** 서버에 보낸 검색어. `draft`를 잠깐 뒤에 옮긴 값 */
  const [q, setQ] = useState("");
  /** 1-base. 서버는 0-base라 보낼 때 1 뺀다(derive.toListQuery) */
  const [page, setPage] = useState(1);
  /**
   * **한 번에 하나만 펼친다.** 우측 요약이 "펼친 SKU 1개"에 종속돼 있어서
   * 둘이 열리면 어느 쪽 요약인지 알 수 없다.
   */
  const [openVariantId, setOpenVariantId] = useState<number | null>(null);
  /**
   * 배분 수량 입력. **SKU별로 든다** — 다른 SKU를 갔다 오거나 접었다 펴도 손으로 고친 값이
   * 선착순으로 되돌아가면 안 된다(F2: 전화로 한 약속이 화면에서 지워진다).
   * 행 안(`BackorderRowDetail`)에 두지 않는 이유도 같다 — 접으면 그 컴포넌트가 내려간다.
   */
  const [drafts, setDrafts] = useState<AllocationDrafts>({});
  /** 지금 표에 있는 SKU(variant) id. 표가 알려 준다. 못 받았으면 null */
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

  const params: BackorderListParams = { q, page };

  /* 접어도 입력은 남는다(F2). 버리는 건 배분 확정이 받아들여졌을 때뿐이다 */
  const toggleSku = (variantId: number) =>
    setOpenVariantId((prev) => (prev === variantId ? null : variantId));

  /*
   * 표가 받은 SKU id를 알려 줄 때. **참조가 안정돼야 한다**(useCallback) — 매 렌더 새 함수면
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

  /* 검색으로 목록에서 빠진 SKU. 요약·폼은 남긴다 — 지우면 검색 중엔 예상 입고일을 못 적는다(F4, #198).
     표를 아직 못 받았으면(null) 목록 안으로 본다 — 기다리는 동안 안내가 깜빡이지 않게 */
  const openInList =
    openVariantId === null || (visibleIds?.has(openVariantId) ?? true);

  const changeDraft = (variantId: number, next: AllocationDraft) =>
    setDrafts((prev) => ({ ...prev, [variantId]: next }));

  /**
   * 배분 확정이 받아들여진 뒤. 입력은 **전부 0**으로 둔다 — 선착순으로 다시 채우면 한 번 더
   * 눌렀을 때 사장이 정하지 않은 배분이 나간다(F1).
   * 그 SKU의 미송이 다 해소됐으면(`resolvedBackorderIds`) 아코디언도 닫는다 — 목록에서
   * 사라질 행이라 우측 요약이 남아 있을 이유가 없다. 입력도 지운다(다시 나타나면 선착순부터).
   */
  const finishAllocation = (variantId: number, cleared: boolean) => {
    setDrafts((prev) => ({ ...prev, [variantId]: cleared ? undefined : {} }));
    if (cleared) setOpenVariantId((prev) => (prev === variantId ? null : prev));
  };

  return (
    <QueryBoundaryGroup>
      <ListDetailLayout
        list={
          <Panel className="flex-1">
            {/* 툴바 한 줄 — 좌: 검색 / 우: 필터와 주 액션.
              검색창의 `mr-auto`가 나머지를 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(필터·버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
            <div className="mb-4 flex shrink-0 items-center gap-3">
              {/* 서버 `q`는 품명만 건다 — 품번·색상은 0건이다(dev-verify-bis F3, #196).
                  칸이 약속한 걸 쳤는데 0건이 나오면 안 되므로 문구를 거는 범위로 맞춘다 */}
              <SearchInput
                className="mr-auto"
                placeholder="품명 검색"
                aria-label="품명 검색"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>

            {/* 경계는 표 자리에만. 검색줄은 서버와 무관하게 늘 있어야 한다 */}
            <QueryBoundary>
              <BackorderListBody
                params={params}
                openVariantId={openVariantId}
                onToggle={toggleSku}
                onPage={setPage}
                onVisibleChange={handleVisibleChange}
                renderDetail={(variantId) => (
                  <BackorderRowDetail
                    variantId={variantId}
                    draft={drafts[variantId]}
                    onDraftChange={(next) => changeDraft(variantId, next)}
                    onAllocated={(cleared) =>
                      finishAllocation(variantId, cleared)
                    }
                  />
                )}
              />
            </QueryBoundary>
          </Panel>
        }
        detail={
          openVariantId !== null ? (
            <>
              {/* 패널은 경계 밖 — 기다리는 동안에도 우측 폭이 유지돼야 한다.
                제목은 실패해도 남는다 — 카드 제목까지 사라지면 무엇이 실패했는지 안 읽힌다(F3) */}
              <Panel className="shrink-0">
                {/* 목록 조건 밖의 SKU임을 카드 머리에서 말한다. 경계 밖이라 기다리는 동안·실패해도 보인다 */}
                {!openInList ? (
                  <Notice className="mb-4">
                    현재 목록 조건에 없는 SKU예요. 배분·예상 입고일은 이 SKU에
                    붙어요.
                  </Notice>
                ) : null}
                <QueryBoundary
                  errorFallback={({ described, retry }) => (
                    <>
                      <Panel.Title>미송 요약</Panel.Title>
                      <QueryErrorView described={described} onRetry={retry} />
                    </>
                  )}
                >
                  <BackorderSummaryCard variantId={openVariantId} />
                </QueryBoundary>
              </Panel>
              <Panel className="shrink-0">
                <Panel.Title>예상 입고일 등록</Panel.Title>
                <QueryBoundary>
                  {/* key: 다른 SKU로 바뀌면 입력 중이던 날짜·사유가 남지 않게 상태째 새로 만든다 */}
                  <EtaFormCard key={openVariantId} variantId={openVariantId} />
                </QueryBoundary>
              </Panel>
            </>
          ) : undefined
        }
        emptyDetail="좌측에서 미송 SKU를 펼치세요"
      />
    </QueryBoundaryGroup>
  );
}

/**
 * 표 + 페이지 이동. 안에서만 `useSuspenseQuery`를 부른다.
 * 표에 있는 SKU id를 부모에게 알린다(우측 카드의 "목록 조건 밖" 안내). 0건이어도 이 컴포넌트는
 * 남아 빈 집합을 알린다 — 그래야 검색 0건일 때도 안내가 뜬다.
 */
function BackorderListBody({
  params,
  openVariantId,
  onToggle,
  onPage,
  onVisibleChange,
  renderDetail,
}: {
  params: BackorderListParams;
  openVariantId: number | null;
  onToggle: (variantId: number) => void;
  onPage: (page: number) => void;
  /** 표에 있는 SKU id. 내려갈 때는 `null` — 부모가 안정된 참조(useCallback)로 넘긴다 */
  onVisibleChange: (ids: readonly number[] | null) => void;
  renderDetail: (variantId: number) => ReactNode;
}) {
  const { data } = useBackorderSkusQuery(toListQuery(params));
  const totalPages = Math.max(data.meta.totalPages, 1);

  useEffect(() => {
    onVisibleChange(data.rows.map((row) => row.variantId));
    return () => onVisibleChange(null);
  }, [data.rows, onVisibleChange]);

  return (
    <>
      {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
          stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
          빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
      {data.rows.length === 0 ? (
        <Panel.Body>
          <p className="text-muted-foreground py-12 text-center text-sm">
            {/* 검색어 없이 0건이면 "검색 결과"가 아니라 밀린 게 없는 것이다 */}
            {params.q === ""
              ? "미송이 남은 SKU가 없습니다"
              : "검색 결과가 없습니다"}
          </p>
        </Panel.Body>
      ) : (
        <BackorderTable
          rows={data.rows}
          openVariantId={openVariantId}
          onToggle={onToggle}
          renderDetail={renderDetail}
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

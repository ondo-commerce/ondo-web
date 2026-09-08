"use client";

import { Button, Panel, SearchInput } from "@ondo/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { ProductPostFilter } from "./ProductPostFilter";
import { ProductRowDetail } from "./ProductRowDetail";
import { ProductTable } from "./ProductTable";
import { useProductListQuery } from "../api/queries";
import {
  filterByPostStatus,
  parseListParams,
  toListQuery,
  withListParams,
  type ProductListParams,
} from "../derive";
import { QueryBoundary } from "@/shared/api/QueryBoundary";
import { ListDetailLayout } from "@/shared/components/ListDetailLayout";

/** 검색어를 URL에 반영하기까지 기다리는 시간. 글자마다 서버를 부르지 않기 위해서다 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 상품 관리 — 좌 목록(확장형 표) + 우 상세.
 *
 * 행을 펼치는 것과 우측 상세를 고르는 것은 같은 동작이다. 한 번에 한 행만 펼친다
 * — 우측 상세 패널이 한 장뿐이기 때문이다.
 *
 * 목록은 주문 탭과 같은 확장형 표다(`ProductTable`). 아코디언(div)이 아니라 표인 이유는
 * 품번·구성이 열로 서서 세로로 훑히기 때문이다.
 *
 * **검색·필터·페이지·선택은 전부 URL이 원본이다**(ADR-0003). 새로고침·뒤로가기가 그대로
 * 동작하고, 등록 화면이 끝난 뒤 `?productId=`로 새 상품을 우측에 열어 준다.
 * 검색창의 글자만 로컬 상태다 — 치는 동안은 URL을 건드리지 않고 잠깐 뒤에 한 번 옮긴다.
 */
export function ProductListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = parseListParams(searchParams);

  const replaceParams = useCallback(
    (patch: Parameters<typeof withListParams>[1]) => {
      const query = withListParams(searchParams, patch);
      router.replace(query === "" ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  /* 검색창 글자. URL의 `q`와 두 방향으로 맞춘다:
     - 치면 → 잠깐 뒤 URL로(디바운스)
     - URL이 밖에서 바뀌면(뒤로가기) → 칸 글자로.
     `pushedQ`는 마지막으로 우리가 URL에 올린 값이다. URL이 그것과 다르면 밖에서 바뀐 것.
     렌더 중에 state를 맞추는 건 React가 권하는 "props에서 state 파생" 형태다 — 효과로
     하면 한 프레임 늦고, ref로 하면 렌더 중 ref 접근이 된다 */
  const [draft, setDraft] = useState(params.q);
  const [pushedQ, setPushedQ] = useState(params.q);
  const [seenQ, setSeenQ] = useState(params.q);
  if (params.q !== seenQ) {
    setSeenQ(params.q);
    if (params.q !== pushedQ) {
      setPushedQ(params.q);
      setDraft(params.q);
    }
  }

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === pushedQ) return;
    const timer = setTimeout(() => {
      setPushedQ(trimmed);
      /* 검색을 바꾸면 펼침을 푼다. 안 그러면 목록에서 사라진 상품의 상세가 우측에 남는다 */
      replaceParams({
        query: trimmed === "" ? null : trimmed,
        page: null,
        productId: null,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, pushedQ, replaceParams]);

  const toggleProduct = (productId: number) =>
    replaceParams({
      productId: params.productId === productId ? null : String(productId),
    });

  return (
    <ListDetailLayout
      list={
        <Panel className="flex-1">
          {/* 툴바 두 줄 — 첫 줄은 검색과 주 액션, 둘째 줄은 필터.
              **세그먼트는 검색줄 아래로 내린다.** 주문 탭과 같은 규칙이다 — 검색창은 폭이
              고정(340px)인데 필터는 칸 수·글자 길이에 따라 변해서, 한 줄에 두면 탭마다
              검색창 자리가 흔들리고 칸이 늘어날 때 제멋대로 접힌다. 변하는 쪽만 아래 줄에
              모아 두면 위쪽 줄의 모양이 탭을 옮겨도 같다.
              첫 줄의 `mr-auto`가 주 액션을 오른쪽으로 민다. 오른쪽 묶음에 ml-auto를 주는 것보다
              이쪽이 낫다 — 오른쪽에 무엇이 오든(버튼·둘 다·없음) 규칙이 같기 때문이다.
              패널 제목을 두지 않는다. 상단 네비게이션이 이미 어느 탭인지 보여주고 있어서,
              탭 이름을 패널에 한 번 더 쓰면 같은 말이 두 번 나오고 세로만 먹는다 */}
          <div className="mb-3 flex shrink-0 items-center gap-3">
            <SearchInput
              className="mr-auto"
              placeholder="품번·품명 검색"
              aria-label="품번·품명 검색"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button asChild variant="line">
              <Link href="/products/new">상품 등록</Link>
            </Button>
          </div>

          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <ProductPostFilter
              value={params.status}
              onChange={(next) =>
                replaceParams({
                  status: next === "ALL" ? null : next,
                  page: null,
                  productId: null,
                })
              }
            />
          </div>

          {/* 경계는 표 자리에만. 검색줄·필터는 서버와 무관하게 늘 있어야 한다 */}
          <QueryBoundary>
            <ProductListBody
              params={params}
              onToggle={toggleProduct}
              onPage={(page) =>
                replaceParams({
                  page: page === 1 ? null : String(page),
                  productId: null,
                })
              }
            />
          </QueryBoundary>
        </Panel>
      }
      detail={
        params.productId !== null ? (
          <Panel className="flex-1">
            <QueryBoundary>
              <ProductDetailPanel productId={params.productId} />
            </QueryBoundary>
          </Panel>
        ) : undefined
      }
      emptyDetail="좌측 목록에서 상품을 선택하세요"
    />
  );
}

/**
 * 표 + 페이지 이동. 안에서만 `useSuspenseQuery`를 부른다.
 *
 * 게시 상태 필터는 **받은 페이지 안에서** 거른다 — 목록 API에 그 파라미터가 없다
 * (`derive.filterByPostStatus` 주석). 서버가 받게 되면 `toListQuery`로 옮긴다.
 */
function ProductListBody({
  params,
  onToggle,
  onPage,
}: {
  params: ProductListParams;
  onToggle: (productId: number) => void;
  onPage: (page: number) => void;
}) {
  const { data } = useProductListQuery(toListQuery(params));
  const rows = filterByPostStatus(data.rows, params.status);
  const totalPages = Math.max(data.meta.totalPages, 1);

  return (
    <>
      {/* 검색줄은 남고 행만 흐른다 — 화면 전체 스크롤이 없다.
          stickyHead 표는 세로 스크롤을 직접 받으므로 `Panel.Body` 밖에 놓는다.
          빈 목록일 때는 흐를 것이 없어서 그대로 Panel.Body를 쓴다 (주문 탭과 같은 규칙) */}
      {rows.length === 0 ? (
        <Panel.Body>
          <p className="text-muted-foreground py-12 text-center text-sm">
            검색 결과가 없습니다
          </p>
        </Panel.Body>
      ) : (
        <ProductTable
          rows={rows}
          openProductId={params.productId}
          onToggle={onToggle}
          renderDetail={(row) => <ProductRowDetail productId={row.id} />}
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

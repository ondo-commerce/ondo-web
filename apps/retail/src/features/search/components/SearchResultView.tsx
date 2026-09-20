import { Notice, Panel } from "@ondo/ui";
import { Info, Search } from "lucide-react";
import { ProductResultRow, RowGroup, WholesalerResultRow } from "./ResultRows";
import { SearchTabs } from "./SearchTabs";
import {
  EMPTY_SECTION_TEXT,
  SEARCH_LEAD,
  SEARCH_TAB_LABEL,
} from "../constants";
import { tabCounts, visibleSections } from "../derive";
import type { SearchResult, SearchTab } from "../types";

/**
 * 검색 결과. **읽는 화면이라 1180px 중앙 정렬**이다(`_base.css` `.wrap`) —
 * 훑는 화면(홈·도매처 홈·찜 목록)은 폭을 꽉 쓴다.
 *
 * 서버 컴포넌트다. 이 화면에는 입력도 상태도 없다 — 검색어는 셸의 통합 검색이
 * 소유하고, 탭은 주소가 소유한다. 결과는 `page.tsx`가 `GET /listings?q=`로 받아
 * 넘긴다. 그래서 첫 HTML이 곧 완성된 결과다.
 */
export function SearchResultView({
  query,
  tab,
  result,
}: {
  /** 사장이 실제로 친 문자열. 화면에 그대로 되돌려 준다(정규화한 값이 아니다) */
  query: string;
  tab: SearchTab;
  result: SearchResult;
}) {
  const counts = tabCounts(result);

  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={SEARCH_LEAD}>“{query}” 검색 결과</Panel.Title>

        <SearchTabs query={query} tab={tab} counts={counts} />

        {counts.all === 0 ? (
          <EmptyResult query={query} />
        ) : (
          visibleSections(tab).map((section) => (
            <section key={section} className="mt-6">
              <h3 className="text-muted-foreground text-body mb-2.5">
                {SEARCH_TAB_LABEL[section]}{" "}
                <span className="tabular-nums">{counts[section]}건</span>
                {/* 서버가 상한(100)보다 더 갖고 있으면 그 사실만 따로 말한다 —
                    줄 수와 탭 숫자는 실제로 그린 것과 같아야 한다 */}
                {section === "products" &&
                result.productTotal > counts.products ? (
                  <span className="tabular-nums">
                    {" "}
                    · 전체 {result.productTotal}건 중 앞 {counts.products}건
                  </span>
                ) : null}
              </h3>

              {counts[section] === 0 ? (
                /* 0건이어도 섹션을 감추지 않는다 — 찾아봤는데 없었다는 사실이
                   남아야 사장이 다른 축으로 다시 치지 않는다 */
                <Notice>
                  <span className="flex items-start gap-2">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {EMPTY_SECTION_TEXT[section](query)}
                  </span>
                </Notice>
              ) : (
                <RowGroup>
                  {section === "products"
                    ? result.products.map((p) => (
                        <ProductResultRow key={p.id} product={p} />
                      ))
                    : null}
                  {section === "wholesalers"
                    ? result.wholesalers.map((w) => (
                        <WholesalerResultRow key={w.id} wholesaler={w} />
                      ))
                    : null}
                </RowGroup>
              )}
            </section>
          ))
        )}
      </Panel>
    </div>
  );
}

/** 두 축이 모두 0건. 탭별 안내를 두 번 반복하지 않고 화면 하나로 말한다 */
function EmptyResult({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
      <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
        <Search aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-medium">“{query}” 결과가 없어요.</h3>
      <p className="text-muted-foreground text-body">
        상품명은 한두 글자만 쳐 보세요. 도매처가 올린 상품이 아직 없을 수도
        있어요.
      </p>
    </div>
  );
}

/**
 * `?q=`가 비었거나 공백뿐일 때. 셸의 검색창은 빈 제출을 막지만
 * **주소로 직접 들어오는 경로가 열려 있다**(`/search`를 북마크한 경우).
 * 결과 0건 화면을 보여 주면 사장은 자기가 뭔가 검색했다고 착각한다.
 */
export function SearchGuide() {
  return (
    <div className="mx-auto max-w-wrap">
      <Panel>
        <Panel.Title sub={SEARCH_LEAD}>검색</Panel.Title>
        <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
          <span className="bg-secondary text-border-strong mb-1.5 grid size-11 place-items-center rounded-full">
            <Search aria-hidden className="size-5" />
          </span>
          <h3 className="text-base font-medium">검색어를 입력해 주세요.</h3>
          <p className="text-muted-foreground text-body">
            위 검색창에 상품명을 넣으면 결과가 여기에 나와요.
          </p>
        </div>
      </Panel>
    </div>
  );
}

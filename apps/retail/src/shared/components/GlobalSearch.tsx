"use client";

import { SearchInput } from "@ondo/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent } from "react";

/** 헤더 통합 검색. 셸은 `/search?q=`로 넘기기까지만 하고 결과는 그 화면이 만든다 */
function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const raw = new FormData(event.currentTarget).get("q");
    const q = typeof raw === "string" ? raw.trim() : "";
    // 빈 검색은 이동하지 않는다 — 결과 0건 화면을 보여줄 이유가 없다
    if (!q) return;

    router.push(`/search?${new URLSearchParams({ q }).toString()}`);
  }

  return (
    /* action/method를 실제로 적어 둔다 — 하이드레이션 전에 Enter를 치면 브라우저가
       스스로 제출하는데, action이 없으면 지금 있는 주소로 보내 버린다
       (상품 상세에서 검색하면 /products/abc?q=... 로 간다). 값은 같은 곳을 가리킨다 */
    <form role="search" action="/search" method="get" onSubmit={handleSubmit}>
      <SearchInput
        name="q"
        aria-label="통합 검색"
        placeholder="상품명, 품번, 도매처 검색"
        defaultValue={initialQuery}
        /* 빈 값 차단을 JS 밖에도 둔다 — 위 onSubmit은 하이드레이션 전에는 없어서
           빈 Enter가 그대로 /search?q= 로 나갔다. required는 브라우저가 제출 자체를
           막고, pattern은 공백만 친 경우까지 막는다(JS 경로의 trim과 같은 기준) */
        required
        pattern=".*\S.*"
        title="검색어를 입력하세요"
        /* packages/ui의 focus 링이 주석 처리돼 있어 키보드로 들어와도 표시가 없다.
           헤더의 주 조작 요소라 여기서 덮는다(WCAG 2.4.7) */
        className="focus-within:ring-ring focus-within:ring-2"
      />
    </form>
  );
}

function SearchFormWithQuery() {
  const query = useSearchParams().get("q") ?? "";

  /* key: 주소의 q가 바뀌면 입력을 새로 마운트해 그 값으로 되돌린다.
     /search?q=셔츠 로 직접 들어오거나 뒤로 가기를 해도 검색창이 주소와 같아야 한다.
     제어 컴포넌트로 만들면 글자마다 리렌더가 헤더 전체로 번진다 */
  return <SearchForm key={query} initialQuery={query} />;
}

export function GlobalSearch() {
  /* useSearchParams는 정적 프리렌더를 막는다 — 경계가 없으면 이 헤더를 쓰는
     14화면이 전부 빌드에서 걸린다. 경계를 컴포넌트가 스스로 갖는다.
     정적으로 굳는 화면에서는 프리렌더 결과가 빈 검색창이고 하이드레이션 뒤 채워지지만,
     `?q=`가 실제로 실리는 /search는 그 화면이 force-dynamic이라 첫 HTML부터 값이 있다 */
  return (
    <Suspense fallback={<SearchForm initialQuery="" />}>
      <SearchFormWithQuery />
    </Suspense>
  );
}

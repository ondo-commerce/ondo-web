import { Button } from "@ondo/ui";
import Link from "next/link";
import { FIRST_PAGE, PAGER_LABEL } from "../constants";
import { backorderHref } from "../derive";
import type { BackorderPage, BackorderSort } from "../types";

/**
 * `이전 · 다음` 한 줄. **2장 이상일 때만 그린다** — 대부분의 사장은 미송이 100건을
 * 안 넘고, 그때 페이저는 "더 있나?"라는 없는 질문을 만든다.
 *
 * 링크다(버튼 아님). 장 번호가 `?page=`로 주소에 실려야 새로고침·뒤로 가기에 살아남는다
 * (retail-market F6). 첫 장·끝 장에서는 갈 곳이 없는 쪽을 **아예 안 그린다** — 눌러도
 * 아무 일 없는 컨트롤을 두지 않는다(retail-market F2).
 *
 * 도매처·정렬을 같이 실어 보낸다. 장을 넘길 때 걸어 둔 필터가 풀리면 사장은 다시 골라야 한다.
 */
export function BackorderPager({
  paging,
  wholesalerId,
  sort,
}: {
  paging: BackorderPage;
  wholesalerId: string;
  sort: BackorderSort;
}) {
  if (paging.totalPages <= 1) return null;

  const hasPrev = paging.page > FIRST_PAGE;
  const hasNext = paging.page < paging.totalPages;

  return (
    <nav
      aria-label="미송 목록 페이지"
      className="text-body mt-3 flex items-center justify-center gap-3"
    >
      {hasPrev ? (
        <Button asChild variant="line" size="sm">
          <Link href={backorderHref(wholesalerId, sort, paging.page - 1)}>
            {PAGER_LABEL.prev}
          </Link>
        </Button>
      ) : null}
      <span className="text-muted-foreground tabular-nums" aria-current="page">
        {PAGER_LABEL.position(paging.page, paging.totalPages)}
      </span>
      {hasNext ? (
        <Button asChild variant="line" size="sm">
          <Link href={backorderHref(wholesalerId, sort, paging.page + 1)}>
            {PAGER_LABEL.next}
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}

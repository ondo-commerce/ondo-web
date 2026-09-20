import type { Metadata } from "next";
import {
  BACKORDER_API_PATH,
  BACKORDER_PAGE_SIZE,
  BackorderView,
  droppedWholesalerId,
  resolvePage,
  resolveSort,
  resolveWholesalerId,
  toBackorderLine,
  toBackorderPage,
  todayKst,
  wholesalerChips,
  type BackorderWire,
} from "@/features/backorder";
import { serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "미송 대기 현황" };

/**
 * 요청마다 서버에서 그린다.
 *
 * 세션 쿠키로 `GET /api/retail/backorders`를 부르는 화면이라 정적으로 굳힐 수 없고,
 * 주소(`?wholesaler=`·`?sort=`·`?page=`)가 곧 상태라 첫 HTML부터 그 상태여야 한다 —
 * 하이드레이션 뒤에 3줄이 1줄로 바뀌는 걸 보이지 않는다(retail-shell F4).
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = resolvePage(params);

  /* 서버가 아는 파라미터는 `page`·`size` 둘뿐이다. 도매처·정렬은 받은 장 안에서 건다.
     401은 `(shop)` 레이아웃의 `requireSession`이 먼저 걸러 여기까지 안 온다.
     그 밖의 실패는 그대로 던져 `(shop)/error.tsx`가 받는다 */
  const api = await serverApi();
  const result = await api.fetchPage<BackorderWire>(BACKORDER_API_PATH, {
    searchParams: { page: page - 1, size: BACKORDER_PAGE_SIZE },
  });

  const lines = result.items.map(toBackorderLine);
  const allowed = wholesalerChips(lines).map((chip) => chip.id);

  /* 떨어뜨린 값이 있으면 화면이 그 사실을 말한다(F2). 상호는 늘 `null`이다 —
     소매 스펙에 도매처를 id로 찾는 path가 없고, `features/catalog`의 더미 id(`w-lavien`)는
     서버 id와 다른 축이라 거기서 찾아도 맞지 않는다 */
  const droppedId = droppedWholesalerId(params, allowed);

  return (
    <BackorderView
      lines={lines}
      today={todayKst(new Date())}
      /* 미송이 없는 도매처·오타·옛 링크는 여기서 `전체`로 떨어진다 — 칩 4개 중
         아무것도 안 켜진 채 0건이 뜨는 화면을 만들지 않는다 */
      wholesalerId={resolveWholesalerId(params, allowed)}
      sort={resolveSort(params)}
      dropped={droppedId === null ? null : { id: droppedId, name: null }}
      paging={toBackorderPage(result.meta)}
    />
  );
}

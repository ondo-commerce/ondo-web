import type { Metadata } from "next";
import {
  BACKORDER_LINES,
  BACKORDER_TODAY,
  BackorderView,
  droppedWholesalerId,
  resolveSort,
  resolveWholesalerId,
  wholesalerChips,
} from "@/features/backorder";
/* 상호는 거래처 목록(catalog)만 안다. **feature끼리 직접 잇지 않고 page에서 합친다** —
   backorder가 catalog를 import하면 미송 목록이 거래처 더미에 묶인다. 여기(조립 지점)에서
   id 하나를 상호로 바꿔 넘기는 것으로 끝낸다 */
import { findWholesaler } from "@/features/catalog";

export const metadata: Metadata = { title: "미송 대기 현황" };

/**
 * 요청마다 서버에서 그린다.
 *
 * 이 화면을 정적으로 굳히면 빌드가 만든 첫 HTML이 늘 `전체`다 — 거래처 관리의 미송
 * 배지(RT-66)를 눌러 `?wholesaler=w-lavien`으로 들어온 사장이 하이드레이션이 끝날
 * 때까지 3줄짜리 전체 목록을 보다가 갑자기 1줄로 바뀌는 걸 본다(retail-shell F4).
 * 주소가 곧 상태인 화면이라 정적 생성과 맞바꾼다. 검색 결과 화면과 같은 처방이다.
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const allowed = wholesalerChips(BACKORDER_LINES).map((chip) => chip.id);

  /* 떨어뜨린 값이 있으면 화면이 그 사실을 말한다(F2). 상호를 못 찾으면 `null`로 넘겨
     `w-basic 미송은 지금 없어요` 같은 id 노출을 막는다 */
  const droppedId = droppedWholesalerId(params, allowed);

  return (
    <BackorderView
      lines={BACKORDER_LINES}
      today={BACKORDER_TODAY}
      /* 미송이 없는 도매처·오타·옛 링크는 여기서 `전체`로 떨어진다 — 칩 4개 중
         아무것도 안 켜진 채 0건이 뜨는 화면을 만들지 않는다 */
      wholesalerId={resolveWholesalerId(params, allowed)}
      sort={resolveSort(params)}
      dropped={
        droppedId === null
          ? null
          : { id: droppedId, name: findWholesaler(droppedId)?.name ?? null }
      }
    />
  );
}

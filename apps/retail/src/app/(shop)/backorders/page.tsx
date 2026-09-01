import type { Metadata } from "next";
import {
  BACKORDER_LINES,
  BACKORDER_TODAY,
  BackorderView,
  resolveSort,
  resolveWholesalerId,
  wholesalerChips,
} from "@/features/backorder";

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

  return (
    <BackorderView
      lines={BACKORDER_LINES}
      today={BACKORDER_TODAY}
      /* 미송이 없는 도매처·오타·옛 링크는 여기서 `전체`로 떨어진다 — 칩 4개 중
         아무것도 안 켜진 채 0건이 뜨는 화면을 만들지 않는다 */
      wholesalerId={resolveWholesalerId(
        params,
        wholesalerChips(BACKORDER_LINES).map((chip) => chip.id),
      )}
      sort={resolveSort(params)}
    />
  );
}

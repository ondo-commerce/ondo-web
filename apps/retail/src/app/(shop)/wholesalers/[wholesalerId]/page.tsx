import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LIST_SORTS,
  NEW_ARRIVAL_SINCE,
  WholesalerHomeView,
  findWholesaler,
  productsOfWholesaler,
  resolveFilter,
  resolveSort,
} from "@/features/catalog";
import { partnerStatsOf } from "@/features/settlement";
import { CATEGORIES, DEFAULT_CATEGORY_SLUG } from "@/shared/config/nav";

/* 셸 카테고리 바의 `all`(= 전체)은 좁히는 값이 아니라 해제 상태다.
   허용 목록에서 빼 두면 `?category=all`로 들어와도 필터의 `전체`로 떨어진다 */
const NARROWING_SLUGS = CATEGORIES.filter(
  (c) => c.slug !== DEFAULT_CATEGORY_SLUG,
).map((c) => c.slug);

type PageProps = {
  params: Promise<{ wholesalerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 탭 제목에 상호를 넣는다 — 도매처를 여럿 벌려 놓고 비교하는 화면이다 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const wholesaler = findWholesaler((await params).wholesalerId);

  return { title: wholesaler ? wholesaler.name : "도매처 판매 페이지" };
}

export default async function Page({ params, searchParams }: PageProps) {
  const wholesaler = findWholesaler((await params).wholesalerId);
  if (!wholesaler) notFound();

  const query = await searchParams;

  /* 진행 중·미송·미결제 잔액은 거래 원장에서 나온다. 마켓(`catalog`)과
     정산(`settlement`)은 서로를 import하지 않으므로 **여기서 합친다** —
     저쪽에 같은 숫자를 한 벌 더 적어 두었다가 무드온이 두 화면에서 다른 말을
     했다(F1 · #128). `retail-backorder` 회차가 상호를 같은 방식으로 이었다.
     거래한 적 없는 도매처면 null이고, 화면이 그걸 0과 구분해서 그린다 */
  const tradeStats = partnerStatsOf(wholesaler.id);

  return (
    <WholesalerHomeView
      wholesaler={wholesaler}
      tradeStats={tradeStats}
      products={productsOfWholesaler(wholesaler.id)}
      newArrivalSince={NEW_ARRIVAL_SINCE}
      filter={resolveFilter(query, NARROWING_SLUGS)}
      sort={resolveSort(query, LIST_SORTS)}
    />
  );
}

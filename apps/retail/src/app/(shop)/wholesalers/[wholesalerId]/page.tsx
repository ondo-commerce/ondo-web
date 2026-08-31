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

  return (
    <WholesalerHomeView
      wholesaler={wholesaler}
      products={productsOfWholesaler(wholesaler.id)}
      newArrivalSince={NEW_ARRIVAL_SINCE}
      filter={resolveFilter(query, NARROWING_SLUGS)}
      sort={resolveSort(query, LIST_SORTS)}
    />
  );
}

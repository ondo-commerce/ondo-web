import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CheckoutView,
  ORDER_API_PATH,
  resolveCheckoutIds,
  toCheckoutGroups,
  type CheckoutWire,
} from "@/features/order";
import { APPROVAL_PATH, isNotApproved, serverApi } from "@/shared/api/server";

export const metadata: Metadata = { title: "주문서 작성" };

/**
 * 주문서. 장바구니에서 고른 `cartItemId`가 주소(`?ids=771,772`)로 오고, 그것만
 * `GET /checkout?cartItemIds=`로 넘겨 **단가를 다시 받는다**(스펙) — 담아둔 사이에
 * 도매가 가격을 올렸으면 여기 반영된다.
 *
 * 고른 것이 없으면 서버를 부르지 않는다 — 빈 `cartItemIds`는 400이다.
 * 403(`ACCOUNT_NOT_APPROVED`)만 승인 대기 화면으로 보낸다. 나머지는 그대로 던져
 * `error.tsx`가 받는다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ids = resolveCheckoutIds(await searchParams);
  if (ids.length === 0) return <CheckoutView groups={[]} />;

  const api = await serverApi();
  let checkout: CheckoutWire;
  try {
    checkout = await api.fetch<CheckoutWire>(ORDER_API_PATH.checkout, {
      /* 스펙은 배열 파라미터다. Spring `@RequestParam List<Long>`은 쉼표 구분도
         받는다 — `apiFetch`의 `searchParams`가 배열을 안 받아 이 꼴로 보낸다 */
      searchParams: { cartItemIds: ids.join(",") },
    });
  } catch (error) {
    if (isNotApproved(error)) redirect(APPROVAL_PATH);
    throw error;
  }

  return <CheckoutView groups={toCheckoutGroups(checkout)} />;
}

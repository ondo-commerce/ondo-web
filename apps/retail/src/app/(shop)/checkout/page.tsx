import type { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";
import { resolveScenario } from "@/features/order";

export const metadata: Metadata = { title: "주문서 작성" };

/**
 * 주문서. 담긴 목록을 서버가 모른다 — 세션 스토어(`features/cart/store`)가
 * 들고 있어서 화면이 통째로 클라이언트다. 첫 HTML은 여전히 서버에서 완성된다.
 *
 * `?scenario=`는 **접수 결과를 무엇으로 그릴지**만 정한다(가정 A3). 서버가
 * 없어서 부분 접수·지연을 확인할 길이 주소뿐이고, 화면에 시나리오 안내 문구를
 * 두지 않는다 — 확인용 안내가 프로덕션 화면에 그대로 남은 적이 있다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  return <CheckoutClient scenario={resolveScenario(query.scenario)} />;
}

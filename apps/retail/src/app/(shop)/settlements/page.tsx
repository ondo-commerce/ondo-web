import type { Metadata } from "next";
import { SettlementView } from "@/features/settlement";

export const metadata: Metadata = { title: "정산 · 미수" };

/**
 * 어느 도매처 원장을 보는지가 **주소에 있다**(`?wholesaler=w-denim`).
 *
 * 화면 안 상태로 두면 브라우저 뒤로 가기가 직전 도매처로 돌아오지 않고, 새 탭·
 * 공유 링크도 늘 첫 도매처로 열린다 — `retail-market` 회차가 "펼친 상태가 뒤로
 * 가기에서 사라진다"로 같은 종류를 겪었다.
 *
 * 값이 없거나 목록에 없는 값이면 표 첫 줄로 떨어진다(`resolvePartnerId`).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.wholesaler;

  return (
    <SettlementView
      wholesalerParam={Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null)}
    />
  );
}

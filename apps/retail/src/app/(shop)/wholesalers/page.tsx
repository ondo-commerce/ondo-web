import type { Metadata } from "next";
import { PartnersView } from "@/features/settlement";

export const metadata: Metadata = { title: "거래처 관리" };

/* 좁힐 축이 없는 화면이라 주소에 실을 상태도 없다 — `?wholesaler=`를 읽는 쪽은
   정산(`/settlements`)과 미송(`/backorders`)이고, 여기는 그 두 곳으로 보내기만 한다 */
export default function Page() {
  return <PartnersView />;
}

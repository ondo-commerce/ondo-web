import { redirect } from "next/navigation";

/**
 * 옛 계좌 온보딩 주소. 화면은 지웠다 — 브라우저 세션에만 계좌를 적고 "등록했어요"를
 * 띄웠지만 서버엔 아무것도 가지 않았다(`side-02` N3). 북마크나 예전 링크로 들어온
 * 사장이 404를 보지 않도록 실제로 계좌를 다루는 정산 탭으로 보낸다.
 */
export default function Page() {
  redirect("/settlements");
}

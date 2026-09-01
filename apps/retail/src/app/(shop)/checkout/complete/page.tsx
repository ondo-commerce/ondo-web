import type { Metadata } from "next";
import { CompleteClient } from "./CompleteClient";

export const metadata: Metadata = { title: "주문 완료" };

/**
 * 주문 완료. 접수 결과는 세션 스토어에 있어서 서버가 모른다 — 화면이 통째로
 * 클라이언트다. **새로고침하면 결과가 사라지고**, 그때 빈 화면 대신
 * `방금 접수한 주문이 없어요`가 뜬다.
 *
 * `?scenario=`는 주문서에서 접수할 때 이미 결과에 반영됐다. 주소에 남겨 두는
 * 것은 어떤 결과를 보고 있는지 링크만으로 알 수 있게 하려는 것이고, 이 화면이
 * 다시 읽지는 않는다 — 읽으면 접수한 결과와 주소가 서로 다른 말을 할 수 있다.
 */
export default function Page() {
  return <CompleteClient />;
}

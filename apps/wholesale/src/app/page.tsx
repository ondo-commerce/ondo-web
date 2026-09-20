import { redirect } from "next/navigation";

/** 첫 화면은 대시보드다 — 확정을 기다리는 주문을 다른 무엇보다 먼저 보게 한다 */
export default function RootPage() {
  redirect("/dashboard");
}

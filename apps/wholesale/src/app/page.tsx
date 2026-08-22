import { redirect } from "next/navigation";

/** 대시보드는 아직 화면이 없으므로 실제로 쓸 수 있는 첫 화면으로 보낸다 */
export default function RootPage() {
  redirect("/products");
}

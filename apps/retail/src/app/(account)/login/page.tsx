import type { Metadata } from "next";
import { LoginView } from "@/features/account";

export const metadata: Metadata = { title: "로그인" };

export default function Page() {
  return <LoginView />;
}

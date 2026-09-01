import type { Metadata } from "next";
import { SignupView } from "@/features/account";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  return <SignupView />;
}

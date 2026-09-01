import type { Metadata } from "next";
import { SettingsView } from "@/features/account";

export const metadata: Metadata = { title: "설정" };

export default function Page() {
  return <SettingsView />;
}

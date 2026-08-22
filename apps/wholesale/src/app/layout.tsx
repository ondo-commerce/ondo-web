import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// Figma 원본 한글 폰트가 Noto Sans KR이다 (figma-map.md §4-7).
// 한글은 named subset이 없어 unicode-range로 잘게 쪼개져 온다 — 쓰는 글자 범위만 받는다.
// subsets는 라틴만 preload 대상으로 잡고, 한글 청크는 필요할 때 받게 둔다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "온도 ERP",
  description: "온도 도매 주문·재고·정산 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      {/* 문서 스크롤은 여기서 끊는다. 스크롤은 각 패널의 Panel.Body가 받는다 */}
      <body className="bg-background text-foreground flex h-full flex-col overflow-hidden font-sans text-sm">
        {children}
      </body>
    </html>
  );
}

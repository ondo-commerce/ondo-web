import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// Figma 원본 한글 폰트가 Noto Sans KR이다 (figma-map.md §4-7).
// 한글은 named subset이 없어 unicode-range로 잘게 쪼개져 온다 — 쓰는 글자 범위만 받는다.
// 모바일 커머스라 첫 화면에 필요한 청크만 받는 이 방식이 단일 대용량 파일보다 낫다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "온도 마켓",
  description: "온도 마켓 — 동대문 도매 상품을 소매처로",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans text-sm">
        {children}
      </body>
    </html>
  );
}

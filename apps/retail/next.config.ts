import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ondo/ui", "@ondo/api"],
  /*
   * 목 스위치를 빌드 때 상수로 못 박는다(loop-05a 리뷰 F1). 미설정이면 Next가 `process.env.NEXT_PUBLIC_API_MOCK`을
   * 치환하지 않아 런타임 비교로 남고, 채팅 목(msw + 양쪽 앱 핸들러)의 동적 import가 production 청크에 실린다.
   * "0"이 박히면 `features/chat/api/mockWorker.ts`의 import 가지가 죽은 코드로 빠진다.
   */
  env: {
    NEXT_PUBLIC_API_MOCK: process.env.NEXT_PUBLIC_API_MOCK ?? "0",
  },
};

export default nextConfig;

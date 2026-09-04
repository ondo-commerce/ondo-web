import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ondo/ui", "@ondo/api"],

  /**
   * 소매 API를 이 앱 오리진으로 끌어온다. **브라우저 호출용이다** — 서버 컴포넌트는
   * `shared/api/server.ts`가 `API_ORIGIN`으로 직접 간다(프록시는 자기 자신이라 못 탄다).
   *
   * 브라우저가 직접 부르지 않는 이유는 도매와 같다. 세션 쿠키가 퍼스트파티가 되고,
   * CORS가 사라지고, API 주소를 클라이언트에 내보낼 일이 없다.
   *
   * `API_ORIGIN`이 없으면 아무것도 넘기지 않는다 — 주소를 짐작해서 엉뚱한 곳으로 보내지 않는다.
   */
  async rewrites() {
    const origin = process.env.API_ORIGIN;
    if (!origin) {
      return [];
    }
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
};

export default nextConfig;

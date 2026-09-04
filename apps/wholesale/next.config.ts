import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ondo/ui", "@ondo/api"],

  /**
   * 도매 API(:8081)를 이 앱 오리진으로 끌어온다.
   *
   * 직접 부르지 않는 이유는 세 가지다.
   * 1. 세션 쿠키가 **퍼스트파티**가 된다 — 미들웨어가 읽을 수 있고, 배포에서 API 도메인이
   *    갈려도 Safari가 서드파티 쿠키라고 막지 않는다.
   * 2. CORS가 사라진다. 서버가 허용하는 요청 헤더가 좁아서(`Content-Type`·`Idempotency-Key`)
   *    직접 호출은 헤더 하나만 늘어도 막힌다.
   * 3. 호출부가 상대경로만 쓰면 되어 API 주소를 클라이언트에 내보낼 이유가 없다.
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

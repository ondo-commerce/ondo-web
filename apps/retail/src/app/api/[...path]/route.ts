import { proxyRequest } from "@ondo/api";

/**
 * `/api/*` 를 API 서버로 넘기는 유일한 자리. 이유와 규칙은 `proxyRequest`에.
 *
 * rewrites가 아니라 Route Handler인 이유: rewrites는 브라우저의 `Origin`을 넘겨
 * dev 서버가 403 CORS로 끊는다(#153). 여기서는 넘길 헤더를 우리가 고른다.
 *
 * 세션 쿠키가 실리므로 요청마다 실행돼야 한다. 캐시하면 사장 A의 응답을 사장 B가 본다.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  return proxyRequest(request, {
    origin: process.env.API_ORIGIN,
    upstreamPath: `/api/${path.join("/")}`,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};

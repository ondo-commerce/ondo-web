/**
 * 브라우저 요청을 API 서버로 넘기는 프록시. Next Route Handler(`app/api/[...path]/route.ts`)가
 * 이 함수를 그대로 부른다 — 여기엔 Next가 없다. 표준 `Request`/`Response`만 쓴다.
 *
 * `next.config.ts`의 rewrites 대신 이걸 쓰는 이유 하나: **rewrites는 브라우저의 `Origin`
 * 헤더를 그대로 넘긴다.** 서버 CORS 허용 목록에 그 오리진이 없으면 Spring이 403
 * `Invalid CORS request`로 끊는다. 이 프록시는 아래 허용 목록의 헤더만 넘기므로
 * Origin이 없고, 서버 입장에선 같은 출처 요청이다. 어느 preview 도메인에서도 된다.
 *
 * 넘기는 요청 헤더는 셋뿐이다. 서버가 받기로 한 것도 그 셋(`Content-Type` ·
 * `Idempotency-Key`)에 세션 쿠키를 더한 것이다. 되돌리는 응답 헤더도 본문 타입과
 * `Set-Cookie`뿐 — 서버의 CORS·보안 헤더를 그대로 내보내면 이 앱의 것과 충돌한다.
 */
const FORWARDED_REQUEST_HEADERS = ["content-type", "cookie", "idempotency-key"];

export interface ProxyOptions {
  /** API 서버 절대 주소. 없으면 502로 답한다 — 주소를 짐작하지 않는다 */
  origin: string | undefined;
  /** 서버 쪽 경로. `/api/wholesale/products` 처럼 슬래시로 시작 */
  upstreamPath: string;
}

export async function proxyRequest(
  request: Request,
  { origin, upstreamPath }: ProxyOptions,
): Promise<Response> {
  if (!origin) {
    // 우리 에러 규약과 같은 모양으로 낸다. apiFetch가 그대로 ApiError로 바꿔 화면이 안 죽는다
    return Response.json(
      {
        code: "PROXY_NOT_CONFIGURED",
        message: "API_ORIGIN이 없어 API 서버로 넘기지 못했습니다.",
        errors: [],
        traceId: null,
      },
      { status: 502 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(upstreamPath, origin);
  target.search = incoming.search;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      // 스트림을 그대로 넘기려면 duplex 옵션이 필요한데 타입이 아직 없다. 본문은 작아서 한 번에 읽는다
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      {
        code: "UPSTREAM_UNREACHABLE",
        message: "API 서버에 연결하지 못했습니다.",
        errors: [],
        traceId: null,
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType !== null) responseHeaders.set("content-type", contentType);
  // Set-Cookie는 여러 개일 수 있고 합치면 깨진다. 하나씩 붙인다
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

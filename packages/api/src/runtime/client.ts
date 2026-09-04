import type { PageMeta } from "./envelope";
import type { FieldError } from "./error";
import { ApiError, TRANSPORT_ERROR_CODE } from "./error";

/**
 * 쿼리스트링 값. 배열·객체를 받지 않는 이유는 서버가 반복 키(`?a=1&a=2`)를 쓰지
 * 않아서다. 필요해지면 그때 넓힌다.
 */
export type SearchParams = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/**
 * 호출부가 줄 수 있는 것 전부. `RequestInit`을 그대로 열지 않는다 —
 * **서버 CORS가 허용하는 요청 헤더가 `Content-Type`과 `Idempotency-Key` 둘뿐**이라,
 * 임의 헤더를 넣을 수 있게 두면 프록시를 우회하는 경로에서 조용히 막힌다.
 */
export interface ApiFetchInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** `FormData`면 그대로, 그 외에는 JSON으로 직렬화한다. */
  body?: unknown;
  searchParams?: SearchParams;
  /** 입고·입금처럼 중복 실행이 위험한 요청에만 넘긴다. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** 페이징 있는 목록 응답. `data`와 `meta`를 같이 준다 */
export interface Page<T> {
  items: readonly T[];
  meta: PageMeta;
}

/** 서버 에러 본문. 성공과 달리 `data` 봉투를 쓰지 않는다. */
interface ErrorPayload {
  code: string;
  message: string;
  errors?: readonly FieldError[];
  traceId?: string;
}

/**
 * 어디서 부르느냐에 따라 달라지는 것 **전부**. 봉투·에러 정규화는 같고 이것만 다르다.
 *
 * - 브라우저: 상대경로 + 브라우저가 쿠키를 붙인다
 * - 서버(RSC): 절대경로 + 요청에서 받은 쿠키를 우리가 헤더로 옮긴다
 */
interface Transport {
  baseUrl: string;
  cookie: string | null;
}

const CONTENT_TYPE_JSON = "application/json";

/**
 * 단건·비페이징 응답. `{ data }` 봉투를 벗겨 알맹이만 준다.
 *
 * 204는 본문이 없으므로 `undefined`를 준다 — 로그아웃처럼 결과가 없는 호출용이다.
 *
 * **브라우저 전용이다.** 상대경로로만 부르고 next.config.ts의 rewrites가 API 서버로
 * 넘긴다 — 그래야 세션 쿠키가 이 앱 오리진의 퍼스트파티 쿠키가 되고 CORS가 사라진다.
 * 서버 컴포넌트에서는 {@link createServerApi}를 쓴다.
 */
export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {},
): Promise<T> {
  return fetchData<T>(browserTransport(), path, init);
}

/**
 * 페이징 있는 목록. `data`와 `meta`가 둘 다 필요해서 함수를 따로 뒀다 —
 * {@link apiFetch}로 받으면 `meta`가 버려진다.
 */
export async function apiFetchPage<T>(
  path: string,
  init: ApiFetchInit = {},
): Promise<Page<T>> {
  return fetchPage<T>(browserTransport(), path, init);
}

export interface ServerApi {
  fetch: <T>(path: string, init?: ApiFetchInit) => Promise<T>;
  fetchPage: <T>(path: string, init?: ApiFetchInit) => Promise<Page<T>>;
}

/**
 * 서버 컴포넌트·route handler에서 쓰는 호출기. 소매처럼 첫 HTML에 데이터가
 * 실려야 하는 앱이 쓴다.
 *
 * 브라우저와 다른 점은 둘뿐이다. 프록시를 못 타니 **절대 주소**로 가고, 브라우저가
 * 없으니 요청에 실려 온 **쿠키를 우리가 옮긴다** — 이 둘을 앱이 `cookies()`로 읽어
 * 넘긴다. 이 패키지는 Next를 모른다.
 *
 * 요청마다 새로 만든다. 쿠키가 요청마다 다르므로 모듈 단위로 두면 사장 A의 세션으로
 * 사장 B의 화면을 그린다.
 */
export function createServerApi(options: {
  /** API 서버 절대 주소. `https://api-dev...` 처럼 끝에 슬래시 없이 */
  origin: string;
  /** 들어온 요청의 `Cookie` 헤더 그대로. 없으면 null — 그러면 서버가 401을 준다 */
  cookie: string | null;
}): ServerApi {
  const transport: Transport = {
    baseUrl: options.origin.replace(/\/$/, ""),
    cookie: options.cookie,
  };
  return {
    fetch: (path, init = {}) => fetchData(transport, path, init),
    fetchPage: (path, init = {}) => fetchPage(transport, path, init),
  };
}

function browserTransport(): Transport {
  if (typeof window === "undefined") {
    throw new Error(
      "apiFetch는 브라우저에서만 부른다. 서버 컴포넌트에서는 createServerApi를 쓴다 — " +
        "쿠키를 요청에서 꺼내 넘겨야 세션이 이어진다.",
    );
  }
  return { baseUrl: "", cookie: null };
}

async function fetchData<T>(
  transport: Transport,
  path: string,
  init: ApiFetchInit,
): Promise<T> {
  const response = await request(transport, path, init);
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = await readJson<{ data: T }>(response);
  return payload.data;
}

async function fetchPage<T>(
  transport: Transport,
  path: string,
  init: ApiFetchInit,
): Promise<Page<T>> {
  const response = await request(transport, path, init);
  const payload = await readJson<{ data: readonly T[]; meta: PageMeta }>(
    response,
  );
  return { items: payload.data, meta: payload.meta };
}

async function request(
  transport: Transport,
  path: string,
  init: ApiFetchInit,
): Promise<Response> {
  const { body, contentType } = toRequestBody(init.body);
  const headers = new Headers();
  if (contentType !== undefined) {
    headers.set("Content-Type", contentType);
  }
  if (init.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  if (transport.cookie !== null) {
    headers.set("Cookie", transport.cookie);
  }

  let response: Response;
  try {
    response = await fetch(
      transport.baseUrl + buildPath(path, init.searchParams),
      {
        method: init.method ?? "GET",
        headers,
        body,
        signal: init.signal,
        // 브라우저가 세션 쿠키를 싣는 유일한 이유. 빼면 전부 401이 된다.
        // 서버(Node fetch)에서는 무시된다 — 거기선 위의 Cookie 헤더가 그 일을 한다
        credentials: "include",
        // 세션 붙은 응답을 Next가 요청 사이에 나눠 쓰면 안 된다. 사장마다 다른 값이다
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError({
      status: 0,
      code: TRANSPORT_ERROR_CODE.NETWORK,
      message: "서버에 연결하지 못했습니다.",
      traceId: null,
    });
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

/**
 * 문자열을 이어 붙이지 않고 `URLSearchParams`에 맡긴다 — 검색어에 `&`·`%`·`|`가
 * 들어와도 안전하다.
 */
function buildPath(
  path: string,
  searchParams: SearchParams | undefined,
): string {
  if (searchParams === undefined) {
    return path;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) {
      continue;
    }
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString === "" ? path : `${path}?${queryString}`;
}

function toRequestBody(body: unknown): {
  body: BodyInit | undefined;
  contentType?: string;
} {
  if (body === undefined) {
    return { body: undefined };
  }
  // multipart는 boundary를 브라우저가 붙여야 한다. 우리가 Content-Type을 정하면 깨진다.
  if (body instanceof FormData) {
    return { body };
  }
  return { body: JSON.stringify(body), contentType: CONTENT_TYPE_JSON };
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError({
      status: response.status,
      code: TRANSPORT_ERROR_CODE.PARSE,
      message: "서버 응답을 읽지 못했습니다.",
      traceId: null,
    });
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError({
      status: response.status,
      code: TRANSPORT_ERROR_CODE.PARSE,
      message: "서버 응답을 읽지 못했습니다.",
      traceId: null,
    });
  }

  if (!isErrorPayload(payload)) {
    return new ApiError({
      status: response.status,
      code: TRANSPORT_ERROR_CODE.PARSE,
      message: "약속과 다른 형태의 에러 응답입니다.",
      traceId: null,
    });
  }

  return new ApiError({
    status: response.status,
    code: payload.code,
    message: payload.message,
    fieldErrors: payload.errors ?? [],
    traceId: payload.traceId ?? null,
  });
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" && typeof candidate.message === "string"
  );
}

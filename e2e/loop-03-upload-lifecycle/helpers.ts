import { expect, type Page } from "@playwright/test";

/**
 * loop-03-upload-lifecycle (#252) 공통.
 *
 * abort 를 `requestfailed` 로 보지 않는 이유: 목은 서비스 워커(MSW)가 받는데, worker 는 요청을
 * 직렬화할 때 signal 을 넘기지 않는다. 페이지 쪽 fetch 가 취소돼도 목 핸들러는 끝까지 돌 수 있고,
 * Playwright 가 그 요청을 항상 `ERR_ABORTED` 로 본다는 보장도 없다(Codex r1-6).
 * 그래서 **페이지의 `fetch` 를 감싸** 업로드 요청의 signal `abort` 이벤트와 promise reject 를 직접 센다.
 */

/** 감시가 남기는 요청 한 건 */
export interface WatchedRequest {
  url: string;
  method: string;
  /** 응답이 왔으면 상태 코드. reject 면 null */
  status: number | null;
  aborted: boolean;
  rejected: boolean;
  /** `season-end`·`reopen` 응답 본문의 `data.status`. 최종 상태 확인용 */
  listingStatus?: string;
}

interface Watch {
  requests: WatchedRequest[];
  revoked: string[];
}

/**
 * `page.goto` 전에 부른다. `window.fetch` 와 `URL.revokeObjectURL` 을 감싼다 —
 * `apiFetch` 는 호출 때마다 전역 `fetch` 를 찾으므로 init script 로 바꿔 두면 잡힌다.
 * 문서가 새로 뜨면(전체 이동) 기록이 비워진다. 클라이언트 이동은 같은 문서라 남는다.
 */
export async function watchRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const watch: Watch = { requests: [], revoked: [] };
    (window as unknown as { __watch: Watch }).__watch = watch;

    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const record: WatchedRequest = {
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        status: null,
        aborted: false,
        rejected: false,
      };
      watch.requests.push(record);
      init?.signal?.addEventListener("abort", () => {
        record.aborted = true;
      });
      return original(input, init).then(
        (response) => {
          record.status = response.status;
          if (/\/(season-end|reopen)$/.test(url))
            void response
              .clone()
              .json()
              .then((body: { data?: { status?: string } }) => {
                record.listingStatus = body.data?.status;
              })
              .catch(() => undefined);
          return response;
        },
        (error: unknown) => {
          record.rejected = true;
          throw error;
        },
      );
    };

    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      watch.revoked.push(url);
      revoke(url);
    };
  });
}

function readWatch(page: Page): Promise<Watch> {
  return page.evaluate(
    () => (window as unknown as { __watch: Watch }).__watch,
  );
}

/** 지금까지 나간 요청. `filter` 는 `url` 일부 + 메서드 */
export async function requests(
  page: Page,
  filter: { path: RegExp; method?: string },
): Promise<WatchedRequest[]> {
  const { requests: all } = await readWatch(page);
  return all.filter(
    (r) =>
      filter.path.test(r.url) &&
      (filter.method === undefined || r.method === filter.method),
  );
}

export const UPLOAD = { path: /\/listing-images$/, method: "POST" } as const;

/** 업로드 요청이 n건 **실제로 나갈 때까지** 기다린다(S4-1 "시작된 것을 확인한 뒤") */
export async function waitUploadsStarted(page: Page, n: number): Promise<void> {
  await expect
    .poll(async () => (await requests(page, UPLOAD)).length)
    .toBe(n);
}

/** 업로드 요청의 abort 수와 reject 수 */
export async function uploadAbortStats(
  page: Page,
): Promise<{ aborted: number; rejected: number }> {
  const list = await requests(page, UPLOAD);
  return {
    aborted: list.filter((r) => r.aborted).length,
    rejected: list.filter((r) => r.rejected).length,
  };
}

export async function revokedUrls(page: Page): Promise<string[]> {
  return (await readWatch(page)).revoked;
}

/** 콘솔 error 와 처리 안 된 예외를 모은다. 테스트 끝에 길이 0 을 본다 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** 브라우저 대화상자(beforeunload 등)를 센다. 뜨면 닫고 센다 */
export function countDialogs(page: Page): { count: number } {
  const counter = { count: 0 };
  page.on("dialog", (dialog) => {
    counter.count += 1;
    void dialog.dismiss();
  });
  return counter;
}

/** 업로드 실패 칸 문구들. 의도한 취소엔 하나도 없어야 한다 */
export const FAILURE_TEXT = /올리지 못했어요|다시 골라 주세요/;

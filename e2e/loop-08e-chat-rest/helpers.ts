import { expect, type Page } from "@playwright/test";
import { chatNav } from "../loop-07-receivable-reply/helpers";
import { RETAILERS, type RetailerKey } from "../side-02/retail/stub-api";

export * from "../loop-07-receivable-reply/helpers";

/**
 * loop-08e 채팅 나머지. 소매 spec은 `pnpm e2e:stub`(`playwright.stub.config.ts`)으로 돈다.
 * 07 미수 helpers(시계 T0 = 2026-10-29 14:20, 미수 카드 locator, "보낸 질문 뒤 새 줄") 위에 응답 본문을 돌려주는
 * 손잡이 호출을 더한다 — 정산 손잡이는 응답의 배분 줄 `id`를 다음 손잡이에 넘겨야 해서 상태 코드만으로는 모자라다.
 */

/** 손잡이 응답. 상태와 본문 그대로 */
export interface KnobResponse<T> {
  status: number;
  body: { data: T };
}

/** 손잡이를 부르고 응답 본문까지 돌려준다. 목(MSW)은 탭마다 따로라 그 탭에서 부른다 */
export async function knob<T>(
  page: Page,
  path: string,
  body: Record<string, unknown> = {},
): Promise<KnobResponse<T>> {
  const res = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/__mock/chat/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    { path, body },
  );
  return res as KnobResponse<T>;
}

/** 입금 손잡이 응답에서 이 시험이 쓰는 칸(`PaymentCreatedResponse` 일부) */
export interface PaymentCreated {
  id: number;
  prepaidRemaining: number;
  allocations: { id: number; amount: number; paymentId: number }[];
}

/** 배분 취소 손잡이 응답에서 이 시험이 쓰는 칸(`AllocationCancelledResponse` 일부) */
export interface AllocationCancelled {
  allocationId: number;
  prepaidRemaining: number;
}

/** 입금 + 배분. 201을 단언하고 본문을 돌려준다 */
export async function payAndAllocate(
  page: Page,
  amount: number,
  allocations: { orderId: number; amount: number }[],
): Promise<PaymentCreated> {
  const res = await knob<PaymentCreated>(page, "payment", {
    amount,
    allocations,
  });
  expect(res.status, "손잡이 payment").toBe(201);
  return res.body.data;
}

/**
 * 로그인 화면에서 그 계정으로 로그인 → 홈. 전체 이동(`location.assign`)으로 온 로그인 화면은 주소가 먼저 바뀌고
 * hydration이 뒤에 온다 — 그 사이 채운 칸은 hydration이 비운다(08e-N1 N2, "이메일을 입력해 주세요"로 남는 걸 봤다).
 * 그래서 채우고 누르고 홈을 확인하는 한 묶음을 통과할 때까지 다시 한다. 이미 홈이면 끝(앞 묶음의 이동이 늦게 끝난 경우)
 */
export async function loginAs(page: Page, key: RetailerKey): Promise<void> {
  await expect(async () => {
    if (new URL(page.url()).pathname === "/") return;
    await page.getByLabel("이메일").fill(RETAILERS[key].email);
    await page.getByLabel("비밀번호").fill("ondo1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 3_000 });
  }).toPass();
  await expect(chatNav(page)).toBeVisible();
}

/**
 * 이 탭의 TanStack `QueryClient`를 `window.__ondoQueryClient`에 건다(시험 전용 — 앱 코드는 그대로다). 아무 DOM
 * 노드의 React fiber에서 위로 올라가 `QueryClientProvider`의 `client` prop을 찾는다. 찾을 때까지 기다리므로
 * hydration 확인도 겸한다. 캐시를 직접 단언할 때 쓴다(화면 DOM만 보면 안 그려진 방의 캐시 쓰기를 못 본다)
 */
export async function exposeQueryClient(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        interface Fiber {
          memoizedProps?: { client?: unknown } | null;
          return: Fiber | null;
        }
        const isClient = (c: unknown) =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as { getQueryCache?: unknown }).getQueryCache ===
            "function";
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const fiberKey = Object.keys(el).find((k) =>
            k.startsWith("__reactFiber$"),
          );
          if (fiberKey === undefined) continue;
          let fiber = (el as unknown as Record<string, Fiber | null>)[fiberKey];
          while (fiber) {
            const client = fiber.memoizedProps?.client;
            if (isClient(client)) {
              (window as unknown as Record<string, unknown>).__ondoQueryClient =
                client;
              return true;
            }
            fiber = fiber.return;
          }
        }
        return false;
      }),
    )
    .toBe(true);
}

/** 배분 취소. 200을 단언하고 본문을 돌려준다 */
export async function cancelAllocation(
  page: Page,
  allocationId: number,
): Promise<AllocationCancelled> {
  const res = await knob<AllocationCancelled>(page, "allocation-cancel", {
    allocationId,
  });
  expect(res.status, "손잡이 allocation-cancel").toBe(200);
  return res.body.data;
}

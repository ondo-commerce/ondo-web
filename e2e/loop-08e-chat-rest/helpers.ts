import { expect, type Page } from "@playwright/test";

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

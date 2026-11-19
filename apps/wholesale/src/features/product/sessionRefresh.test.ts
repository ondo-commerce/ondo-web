import { describe, expect, it } from "vitest";
import {
  productSessionEpoch,
  refreshProductSession,
  subscribeProductSession,
} from "./sessionRefresh";

describe("refreshProductSession — S2-1: 같은 계정 재로그인 신호", () => {
  it("부를 때마다 세대 +1, 구독자는 한 번씩 불리고 구독을 끊으면 안 불린다", () => {
    let calls = 0;
    const unsubscribe = subscribeProductSession(() => {
      calls += 1;
    });
    const before = productSessionEpoch();

    refreshProductSession();
    expect(productSessionEpoch()).toBe(before + 1);
    expect(calls).toBe(1);

    refreshProductSession();
    expect(productSessionEpoch()).toBe(before + 2);
    expect(calls).toBe(2);

    unsubscribe();
    refreshProductSession();
    expect(calls).toBe(2);
  });
});

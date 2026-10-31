import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeSharedInterval } from "./sharedInterval";

/**
 * 메타 리뷰 M5 — 같은 QueryClient에서 `/chats` 목록 훅이 둘 마운트돼도 15초 갱신은 한 번. 열쇠는 QueryClient 대신
 * 빈 객체(열쇠는 같은지만 본다). 시계는 vitest 가짜 타이머.
 */

const MS = 15_000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("M5 열쇠 하나에 타이머 하나", () => {
  it("두 구독자 → 15초당 1회, 하나 해제 → 그대로 1회, 다시 구독 → 1회, 둘 다 해제 → 0회", () => {
    const owner = {};
    const tick = vi.fn();
    const a = subscribeSharedInterval(owner, MS, tick);
    const b = subscribeSharedInterval(owner, MS, tick);

    vi.advanceTimersByTime(MS);
    expect(tick, "두 구독자, 15초").toHaveBeenCalledTimes(1);

    a();
    vi.advanceTimersByTime(MS);
    expect(tick, "하나 해제 뒤에도 남은 하나가 돈다").toHaveBeenCalledTimes(2);

    const c = subscribeSharedInterval(owner, MS, tick);
    vi.advanceTimersByTime(MS);
    expect(tick, "다시 구독해도 15초당 1회").toHaveBeenCalledTimes(3);

    b();
    c();
    vi.advanceTimersByTime(MS * 2);
    expect(tick, "마지막 구독자가 떠나면 멈춘다").toHaveBeenCalledTimes(3);
  });

  it("뒤에 붙은 구독자는 도는 주기를 따른다 — 10초에 붙어도 다음 회차는 15초", () => {
    const owner = {};
    const tick = vi.fn();
    const a = subscribeSharedInterval(owner, MS, tick);
    vi.advanceTimersByTime(10_000);
    const b = subscribeSharedInterval(owner, MS, tick);
    vi.advanceTimersByTime(5_000);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(tick, "25초엔 아직 1회").toHaveBeenCalledTimes(1);
    a();
    b();
  });

  it("해제를 두 번 불러도 한 번만 센다 — 다른 구독자의 타이머를 지우지 않는다", () => {
    const owner = {};
    const tick = vi.fn();
    const a = subscribeSharedInterval(owner, MS, tick);
    const b = subscribeSharedInterval(owner, MS, tick);
    a();
    a();
    vi.advanceTimersByTime(MS);
    expect(tick).toHaveBeenCalledTimes(1);
    b();
  });

  it("열쇠가 다르면(다른 QueryClient) 타이머도 따로", () => {
    const tick = vi.fn();
    const a = subscribeSharedInterval({}, MS, tick);
    const b = subscribeSharedInterval({}, MS, tick);
    vi.advanceTimersByTime(MS);
    expect(tick).toHaveBeenCalledTimes(2);
    a();
    b();
  });
});

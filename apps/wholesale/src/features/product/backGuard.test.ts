import { describe, expect, it } from "vitest";
import {
  attachBackGuard,
  BACK_GUARD_FALLBACK_MS,
  type BackGuardSnapshot,
  type BackGuardWindow,
} from "./backGuard";

/**
 * #255 S1-16 — 컨트롤러를 가짜 window로 돌린다. 렌더 테스트가 아니다(jsdom, testing-library
 * 없음, docs/08 규칙 7). 다만 "derive 옆 순수 함수만"에서 한 걸음 벗어나 window 흉내를 쓴다 —
 * Strict Mode 재실행(setup → cleanup → setup)과 `go(-2)` 대체 이동 타이머는 순수 함수로는
 * 순서를 못 본다.
 */

type Listener = () => void;

function fakeWindow(initialState: unknown = { __NA: true }) {
  const entries: unknown[] = [initialState];
  let index = 0;
  const listeners = {
    popstate: new Set<Listener>(),
    pagehide: new Set<Listener>(),
  };
  const timers = new Map<number, { at: number; run: () => void }>();
  let now = 0;
  let nextId = 1;
  const calls = { pushState: 0, back: 0, go: [] as number[] };

  const win: BackGuardWindow = {
    history: {
      get state() {
        return entries[index];
      },
      pushState(data) {
        // Next 패치처럼 지금 항목의 `__NA`를 옆에 붙인다
        entries.splice(index + 1);
        entries.push({ ...(data as object), __NA: true });
        index += 1;
        calls.pushState += 1;
      },
      back() {
        calls.back += 1;
      },
      go(delta) {
        calls.go.push(delta);
      },
    },
    location: { pathname: "/products/new", search: "" },
    addEventListener(type, listener) {
      listeners[type].add(listener);
    },
    removeEventListener(type, listener) {
      listeners[type].delete(listener);
    },
    setTimeout(handler, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, run: handler });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  return {
    win,
    calls,
    listenerCount: (type: "popstate" | "pagehide") => listeners[type].size,
    /** 뒤로가기 한 칸 + popstate */
    back() {
      index = Math.max(0, index - 1);
      for (const l of [...listeners.popstate]) l();
    },
    fire(type: "popstate" | "pagehide") {
      for (const l of [...listeners[type]]) l();
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at > now) continue;
        timers.delete(id);
        t.run();
      }
    },
  };
}

function handlersFor(snap: Partial<BackGuardSnapshot> = {}) {
  const counts = { open: 0, fallback: 0 };
  return {
    counts,
    handlers: {
      read: (): BackGuardSnapshot => ({
        dirty: true,
        leaving: false,
        saving: false,
        dialogOpen: false,
        ...snap,
      }),
      onOpen: () => {
        counts.open += 1;
      },
      onFallback: () => {
        counts.fallback += 1;
      },
    },
  };
}

describe("attachBackGuard — S1-16: 가짜 window 컨트롤러", () => {
  it("① 가드 켜진 채 setup → cleanup → setup(Strict Mode): pushState 1, 리스너 1", () => {
    const fake = fakeWindow();
    const { handlers } = handlersFor();

    const first = attachBackGuard(fake.win, handlers);
    first.sync();
    first.detach();
    const second = attachBackGuard(fake.win, handlers);
    second.sync();

    expect(fake.calls.pushState).toBe(1);
    expect(fake.listenerCount("popstate")).toBe(1);
  });

  it("② cleanup 뒤 popstate는 처리 0", () => {
    const fake = fakeWindow();
    const { handlers, counts } = handlersFor();
    const guard = attachBackGuard(fake.win, handlers);
    guard.sync();
    guard.detach();

    fake.back();

    expect(counts.open).toBe(0);
    expect(fake.calls.pushState).toBe(1);
    expect(fake.calls.back).toBe(0);
  });

  it("③ 나가기 → go(-2) 뒤 400ms 동안 popstate, pagehide 없음 → 대체 이동 1", () => {
    const fake = fakeWindow();
    const { handlers, counts } = handlersFor();
    const guard = attachBackGuard(fake.win, handlers);

    guard.leave();
    fake.advance(BACK_GUARD_FALLBACK_MS - 1);
    expect(counts.fallback).toBe(0);
    fake.advance(1);

    expect(fake.calls.go).toEqual([-2]);
    expect(counts.fallback).toBe(1);
  });

  it("④ 400ms 안에 popstate → 대체 이동 0", () => {
    const fake = fakeWindow();
    const { handlers, counts } = handlersFor();
    const guard = attachBackGuard(fake.win, handlers);

    guard.leave();
    fake.advance(BACK_GUARD_FALLBACK_MS / 2);
    fake.fire("popstate");
    fake.advance(BACK_GUARD_FALLBACK_MS);

    expect(counts.fallback).toBe(0);
  });

  it("⑥ 변경 없이 저장 중: sync가 보초 1, 뒤로가기는 hold(보초 다시, 모달 0, back 0) (09-R1)", () => {
    const fake = fakeWindow();
    const { handlers, counts } = handlersFor({ dirty: false, saving: true });
    const guard = attachBackGuard(fake.win, handlers);

    guard.sync();
    expect(fake.calls.pushState).toBe(1);
    fake.back();

    expect(fake.calls.pushState).toBe(2);
    expect(counts.open).toBe(0);
    expect(fake.calls.back).toBe(0);
  });

  it("⑤ 400ms 안에 pagehide → 대체 이동 0", () => {
    const fake = fakeWindow();
    const { handlers, counts } = handlersFor();
    const guard = attachBackGuard(fake.win, handlers);

    guard.leave();
    fake.fire("pagehide");
    fake.advance(BACK_GUARD_FALLBACK_MS);

    expect(counts.fallback).toBe(0);
  });
});

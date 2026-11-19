import { describe, expect, it } from "vitest";
import {
  bottomCheckHeight,
  historySlotOf,
  isAtBottom,
  isTouchScrollUp,
  isUserScrollActive,
  mergeMessages,
  mergeOlder,
  newMessageCount,
  newMessageLabel,
  newMessageText,
  nextUserScrollUntil,
  shouldAutoLoadOlder,
  type AutoLoadInput,
} from "./derive";
import { USER_SCROLL_WINDOW_MS } from "./constants";
import type { ChatMessage, ChatThread } from "./types";

/**
 * loop-08d S3-1 — 소매 이전 메시지 합치기, 자동 불러오기 판정, 사장 스크롤 창, 터치 방향, 맨 위 자리.
 * 도매 `derive.history.test.ts`(08c S2-1)와 같은 사례다 — 복제한 함수가 같게 움직이는지 본다.
 * 화면이 이 함수들 결과만 그린다(스크롤, 요청은 e2e `e2e/loop-08d-chat-rest/retail-chat-history*.spec.ts`).
 */

function message(
  sequence: number,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 1000 + sequence,
    roomId: 1,
    sequence,
    clientMessageId: null,
    sender: sequence % 2 === 1 ? "RETAILER" : "WHOLESALER",
    kind: "TEXT",
    body: `메시지 ${sequence}`,
    sentAt: "2026-10-31T10:00:00+09:00",
    inquiry: null,
    autoReply: null,
    ...patch,
  };
}

function range(from: number, to: number): ChatMessage[] {
  return Array.from({ length: to - from + 1 }, (_, i) => message(from + i));
}

/** 시드 `retail-history` 방 1을 연 직후 + 이전 장 요청 중 */
function thread(patch: Partial<ChatThread> = {}): ChatThread {
  return {
    messages: range(71, 120),
    cursor: 120,
    failures: 0,
    nextPollMs: 3000,
    counterpartRead: 100,
    historyHasMore: true,
    historyFetched: false,
    historyStatus: "loading",
    ...patch,
  };
}

const meta = (
  hasMore: boolean,
  counterpartLastReadSequence: number | null,
) => ({
  hasMore,
  maxSequence: 120,
  counterpartLastReadSequence,
});

describe("mergeOlder (S3-1)", () => {
  it("겹치는 sequence 1개 포함 page → 중복 0, cursor 그대로, historyHasMore = page.meta.hasMore", () => {
    const next = mergeOlder(thread(), {
      data: range(21, 71),
      meta: meta(true, 90),
    });
    const seqs = next.messages.map((m) => m.sequence);
    expect(seqs).toHaveLength(100);
    expect(new Set(seqs).size).toBe(100);
    expect(seqs[0]).toBe(21);
    expect(seqs.at(-1)).toBe(120);
    expect(next.cursor).toBe(120);
    expect(next.historyHasMore).toBe(true);
    expect(next.historyFetched).toBe(true);
    expect(next.historyStatus).toBe("idle");
    // 늦게 온 meta의 작은 상대 읽음 값이 내리지 못한다
    expect(next.counterpartRead).toBe(100);

    const end = mergeOlder(next, {
      data: range(1, 20),
      meta: meta(false, 120),
    });
    expect(end.messages).toHaveLength(120);
    expect(end.historyHasMore).toBe(false);
    expect(end.counterpartRead).toBe(120);
  });

  it("polling 합치기(`...latest` + mergeMessages)는 historyHasMore 를 그대로 둔다 — after 의 hasMore 는 뜻이 다르다", () => {
    const before = thread({ historyHasMore: true, historyStatus: "idle" });
    // fetchThread 의 끝 합치기와 같은 모양: 캐시를 펼치고 messages, cursor 만 바꾼다
    const polled: ChatThread = {
      ...before,
      messages: mergeMessages(before.messages, range(121, 122)),
      cursor: 122,
    };
    expect(polled.historyHasMore).toBe(true);
    expect(polled.historyStatus).toBe("idle");
  });
});

describe("isAtBottom — 이전 장을 합칠 때 바닥이었나(48px)", () => {
  it("(1000, 452, 500) 바닥, (1000, 451, 500) 아님", () => {
    expect(isAtBottom(1000, 452, 500)).toBe(true);
    expect(isAtBottom(1000, 451, 500)).toBe(false);
    expect(isAtBottom(400, 0, 500)).toBe(true);
  });
});

/* loop-08e S3-4(#363). 02-dev-363 값 기록 표의 실측: scrollHeight 3500, 입력창 세 줄 뒤 보정한 scrollTop 2948,
   ResizeObserver가 본 높이 552, 창이 줄어든 뒤 308 */
describe("bottomCheckHeight — scroll이 바닥을 잴 높이(S3-4)", () => {
  it("크기 같음 × 사용자 스크롤 창 밖 → 그 높이", () => {
    expect(
      bottomCheckHeight({
        observedHeight: 552,
        clientHeight: 552,
        userScrolled: false,
      }),
    ).toBe(552);
  });
  it("크기 같음 × 창 안 → 그 높이", () => {
    expect(
      bottomCheckHeight({
        observedHeight: 552,
        clientHeight: 552,
        userScrolled: true,
      }),
    ).toBe(552);
  });
  it("크기 다름 × 창 밖 → ResizeObserver가 본 552. 보정 scroll(2948)은 바닥으로 남는다", () => {
    const height = bottomCheckHeight({
      observedHeight: 552,
      clientHeight: 308,
      userScrolled: false,
    });
    expect(height).toBe(552);
    expect(isAtBottom(3500, 2948, height)).toBe(true);
    /* 고치기 전: 지금 높이로 재서 244px 떨어진 "바닥 아님" */
    expect(isAtBottom(3500, 2948, 308)).toBe(false);
  });
  it("크기 다름 × 창 안 → 지금 높이 308(사장 휠 40px 위는 바닥 아님 — 끌려가지 않게)", () => {
    const height = bottomCheckHeight({
      observedHeight: 552,
      clientHeight: 308,
      userScrolled: true,
    });
    expect(height).toBe(308);
    expect(isAtBottom(3500, 2948 - 40, height)).toBe(false);
    /* 옛 높이로 재면 40px은 바닥 여유(48px) 안이라 "바닥" — ResizeObserver가 바닥으로 끌어내린다 */
    expect(isAtBottom(3500, 2948 - 40, 552)).toBe(true);
  });
  it("ResizeObserver 없음(null) → 지금 높이", () => {
    expect(
      bottomCheckHeight({
        observedHeight: null,
        clientHeight: 308,
        userScrolled: false,
      }),
    ).toBe(308);
  });
});

describe("newMessageCount, newMessageLabel (S4-1, D45 Q3 ①)", () => {
  const unknownKind = "ORDER_LINK" as unknown as ChatMessage["kind"];

  it("WHOLESALER TEXT 1 + AUTO_REPLY 1 + CLARIFY 1 + SYSTEM 1 + RETAILER 1 → 3, 모르는 kind WHOLESALER 1 더하면 4", () => {
    const messages = [
      message(100),
      message(121, { sender: "WHOLESALER", kind: "TEXT" }),
      message(122, { sender: "WHOLESALER", kind: "AUTO_REPLY" }),
      message(123, { sender: "WHOLESALER", kind: "CLARIFY" }),
      message(124, { sender: "SYSTEM", kind: "HANDOFF" }),
      message(125, { sender: "RETAILER", kind: "TEXT" }),
    ];
    expect(newMessageCount(messages, 120, "WHOLESALER")).toBe(3);
    expect(
      newMessageCount(
        [
          ...messages,
          message(126, { sender: "WHOLESALER", kind: unknownKind }),
        ],
        120,
        "WHOLESALER",
      ),
    ).toBe(4);
  });

  it("바닥을 떠나기 전(since 이하) 줄과 내 다른 기기 글은 안 센다", () => {
    const messages = [
      message(120, { sender: "WHOLESALER" }),
      message(121, { sender: "RETAILER" }),
    ];
    expect(newMessageCount(messages, 120, "WHOLESALER")).toBe(0);
  });

  it("버튼 글과 이름", () => {
    expect(newMessageLabel(2)).toBe("새 메시지 2개, 아래로 이동");
    expect(newMessageLabel(0)).toBe("아래로 이동");
    expect(newMessageText(1)).toBe("새 메시지 1개");
    expect(newMessageText(0)).toBe("아래로 이동");
  });
});

describe("shouldAutoLoadOlder (S3-1)", () => {
  const ok: AutoLoadInput = {
    scrollTop: 200,
    scrollHeight: 2400,
    clientHeight: 500,
    userScrolled: true,
    historyHasMore: true,
    historyStatus: "idle",
    sessionLost: false,
  };

  it("나머지가 다 참일 때 scrollTop 200 → true, 201 → false", () => {
    expect(shouldAutoLoadOlder(ok)).toBe(true);
    expect(shouldAutoLoadOlder({ ...ok, scrollTop: 0 })).toBe(true);
    expect(shouldAutoLoadOlder({ ...ok, scrollTop: 201 })).toBe(false);
  });

  it.each<[string, Partial<AutoLoadInput>]>([
    [
      "내용이 log 를 못 넘침(scrollHeight ≤ clientHeight)",
      { scrollHeight: 500 },
    ],
    ["사장이 직접 위로 스크롤한 적 없음", { userScrolled: false }],
    ["날아가는 중", { historyStatus: "loading" }],
    ["실패 상태", { historyStatus: "failed" }],
    ["historyHasMore false", { historyHasMore: false }],
    ["세션 끊김", { sessionLost: true }],
  ])("%s → false", (_, patch) => {
    expect(shouldAutoLoadOlder({ ...ok, ...patch })).toBe(false);
  });

  it("온라인 여부는 입력에 없다 — 오프라인은 fetchOlder 가 요청 없이 실패 줄로 받는다(§4-3 2-1)", () => {
    expect(Object.keys(ok).sort()).toEqual(
      [
        "clientHeight",
        "historyHasMore",
        "historyStatus",
        "scrollHeight",
        "scrollTop",
        "sessionLost",
        "userScrolled",
      ].sort(),
    );
  });
});

describe("nextUserScrollUntil — 사장 스크롤 창(S3-1, §4-3 2-1)", () => {
  const W = USER_SCROLL_WINDOW_MS;

  it("창은 400ms", () => {
    expect(W).toBe(400);
  });

  it('nextUserScrollUntil(0, "input", 1000) → 1400, isUserScrollActive(1400, 1400) true, (1400, 1401) false', () => {
    expect(nextUserScrollUntil(0, "input", 1000)).toBe(1400);
    expect(isUserScrollActive(1400, 1400)).toBe(true);
    expect(isUserScrollActive(1400, 1401)).toBe(false);
  });

  it('"scroll" 창 안(1300) → 1700으로 민다, 창 밖(1500) → 그대로', () => {
    expect(nextUserScrollUntil(1400, "scroll", 1300)).toBe(1700);
    expect(nextUserScrollUntil(1400, "scroll", 1500)).toBe(1400);
  });

  it('"focus", "merged" → 0(창 닫힘)', () => {
    expect(nextUserScrollUntil(1400, "focus", 1300)).toBe(0);
    expect(nextUserScrollUntil(1400, "merged", 1300)).toBe(0);
    expect(isUserScrollActive(0, 1300)).toBe(false);
  });

  it("창 안의 scroll 이 이어지면(관성) 입력이 한 번이어도 계속 사장 스크롤", () => {
    let until = nextUserScrollUntil(0, "input", 0);
    for (let t = 100; t <= 2000; t += 100)
      until = nextUserScrollUntil(until, "scroll", t);
    expect(isUserScrollActive(until, 2000)).toBe(true);
  });
});

describe("isTouchScrollUp — 손가락 화면 y(S3-1)", () => {
  it("(300, 320) true, (320, 300) false, (null, 320) false, 제자리 false", () => {
    expect(isTouchScrollUp(300, 320)).toBe(true);
    expect(isTouchScrollUp(320, 300)).toBe(false);
    expect(isTouchScrollUp(null, 320)).toBe(false);
    expect(isTouchScrollUp(300, 300)).toBe(false);
  });
});

describe("historySlotOf — 맨 위 자리 6가지(S3-1, 디자인 결정 67 70)", () => {
  const t = (patch: Partial<ChatThread>) =>
    thread({ historyStatus: "idle", ...patch });

  it("더 있음 → more / loading / failed, 세션 끊김이면 무엇보다 locked", () => {
    expect(historySlotOf(t({}), false)).toBe("more");
    expect(historySlotOf(t({ historyStatus: "loading" }), false)).toBe(
      "loading",
    );
    expect(historySlotOf(t({ historyStatus: "failed" }), false)).toBe("failed");
    expect(historySlotOf(t({ historyStatus: "failed" }), true)).toBe("locked");
    expect(historySlotOf(t({}), true)).toBe("locked");
  });

  it("끝 — 이전 장을 받은 방만 end, 처음부터 50개 이하 방은 none(끊겨도 none)", () => {
    expect(
      historySlotOf(t({ historyHasMore: false, historyFetched: true }), false),
    ).toBe("end");
    expect(historySlotOf(t({ historyHasMore: false }), false)).toBe("none");
    expect(historySlotOf(t({ historyHasMore: false }), true)).toBe("none");
  });
});

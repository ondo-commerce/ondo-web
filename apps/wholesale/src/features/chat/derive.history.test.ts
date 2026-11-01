import { describe, expect, it } from "vitest";
import {
  historySlotOf,
  isAtBottom,
  mergeMessages,
  mergeOlder,
  newMessageCount,
  newMessageLabel,
  newMessageText,
  shouldAutoLoadOlder,
  type AutoLoadInput,
} from "./derive";
import type { ChatMessage, ChatThread } from "./types";

/**
 * loop-08c S2-1 — 이전 메시지 합치기, 바닥 판정, 자동 불러오기 판정, `새 메시지 N개`.
 * 화면이 이 함수들 결과만 그린다(스크롤, 요청은 e2e `e2e/loop-08c-chat-history/`).
 */

function message(
  sequence: number,
  patch: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 1000 + sequence,
    roomId: 3,
    sequence,
    clientMessageId: null,
    sender: "RETAILER",
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

describe("mergeOlder (S2-1)", () => {
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

describe("isAtBottom (S2-1)", () => {
  it("(1000, 452, 500) 바닥, (1000, 451, 500) 아님 — 48px 경계", () => {
    expect(isAtBottom(1000, 452, 500)).toBe(true);
    expect(isAtBottom(1000, 451, 500)).toBe(false);
    expect(isAtBottom(400, 0, 500)).toBe(true);
  });
});

describe("newMessageCount, newMessageLabel (S2-1, Q3 ①)", () => {
  it("RETAILER TEXT 2 + AUTO_REPLY 1 + SYSTEM 1 → 2. 바닥 떠나기 전(since 이하) 줄은 안 센다", () => {
    const messages = [
      message(99),
      message(101),
      message(102, { sender: "WHOLESALER", kind: "AUTO_REPLY" }),
      message(103, { sender: "SYSTEM", kind: "HANDOFF" }),
      message(104),
    ];
    expect(newMessageCount(messages, 100, "RETAILER")).toBe(2);
    expect(newMessageCount(messages, 104, "RETAILER")).toBe(0);
  });

  it("다른 기기에서 내가 보낸 글만 → 0", () => {
    expect(
      newMessageCount(
        [message(121, { sender: "WHOLESALER" })],
        120,
        "RETAILER",
      ),
    ).toBe(0);
  });

  it('newMessageLabel(2) "새 메시지 2개, 아래로 이동", newMessageLabel(0) "아래로 이동". 보이는 글은 이름의 앞부분', () => {
    expect(newMessageLabel(2)).toBe("새 메시지 2개, 아래로 이동");
    expect(newMessageLabel(0)).toBe("아래로 이동");
    expect(newMessageText(2)).toBe("새 메시지 2개");
    expect(newMessageText(0)).toBe("아래로 이동");
    expect(newMessageLabel(2).startsWith(newMessageText(2))).toBe(true);
  });
});

describe("shouldAutoLoadOlder (S2-1, D45)", () => {
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
});

describe("historySlotOf — 맨 위 자리(디자인 결정 81~84)", () => {
  const t = (patch: Partial<ChatThread>) =>
    thread({ historyStatus: "idle", ...patch });

  it("더 있음 → more / loading / failed, 세션 끊김이면 무엇보다 locked", () => {
    expect(historySlotOf(t({}), false)).toBe("more");
    expect(historySlotOf(t({ historyStatus: "loading" }), false)).toBe(
      "loading",
    );
    expect(historySlotOf(t({ historyStatus: "failed" }), false)).toBe("failed");
    expect(historySlotOf(t({ historyStatus: "failed" }), true)).toBe("locked");
  });

  it("끝 — 이전 장을 받은 방만 end, 처음부터 50개 이하 방은 none", () => {
    expect(
      historySlotOf(t({ historyHasMore: false, historyFetched: true }), false),
    ).toBe("end");
    expect(historySlotOf(t({ historyHasMore: false }), false)).toBe("none");
    expect(historySlotOf(t({ historyHasMore: false }), true)).toBe("none");
  });
});

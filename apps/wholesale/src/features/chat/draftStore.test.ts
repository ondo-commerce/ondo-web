import { describe, expect, it } from "vitest";
import {
  createDraftStore,
  DRAFT_META_KEY,
  type DraftStorage,
} from "./draftStore";
import { draftKey, pendingOfRoom, withRoomPending } from "./derive";
import type { PendingMessage } from "./types";

/**
 * loop-08b S3-1 방별 입력 기억의 순수한 부분 — 키 만들기와 저장소 감싸개(실패 시 메모리).
 * 저장소는 가짜다(Map 하나). `fail`에 넣은 동작만 던진다.
 */

type Op = "getItem" | "setItem" | "removeItem" | "key";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const fail = new Set<Op>();
  const calls: { op: Op; key: string; value?: string }[] = [];
  const guard = (op: Op) => {
    if (fail.has(op)) throw new Error(`${op} 막힘`);
  };
  const storage: DraftStorage = {
    getItem: (key) => {
      guard("getItem");
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      calls.push({ op: "setItem", key, value });
      guard("setItem");
      map.set(key, value);
    },
    removeItem: (key) => {
      calls.push({ op: "removeItem", key });
      guard("removeItem");
      map.delete(key);
    },
    key: (i) => {
      guard("key");
      return [...map.keys()][i] ?? null;
    },
    get length() {
      return map.size;
    },
  };
  return { storage, map, fail, calls };
}

const KEY_1 = "ondo.chat.draft.v1:approved@ondo.test:1";
const KEY_2 = "ondo.chat.draft.v1:approved@ondo.test:2";

describe("S3-1 draftKey", () => {
  it('draftKey(" Approved@ondo.test ", 3) → "ondo.chat.draft.v1:approved@ondo.test:3"', () => {
    expect(draftKey(" Approved@ondo.test ", 3)).toBe(
      "ondo.chat.draft.v1:approved@ondo.test:3",
    );
  });

  it("이메일 null, 빈 글자, 공백만 → null(저장 안 함)", () => {
    expect(draftKey(null, 3)).toBeNull();
    expect(draftKey("", 3)).toBeNull();
    expect(draftKey("   ", 3)).toBeNull();
  });

  it("계정이 다르면 같은 방도 다른 키", () => {
    expect(draftKey("first@ondo.test", 1)).not.toBe(
      draftKey("approved@ondo.test", 1),
    );
  });
});

describe("S3-1 저장소 감싸개", () => {
  it("쓰면 저장소에 들어가고 그대로 읽힌다. 빈 글은 키를 지운다", () => {
    const { storage, map } = fakeStorage();
    const store = createDraftStore(() => storage);
    const gen = store.generation();
    store.write(KEY_1, "레드 M 내일 들어와요", gen);
    expect(map.get(KEY_1)).toBe("레드 M 내일 들어와요");
    expect(store.read(KEY_1)).toBe("레드 M 내일 들어와요");
    store.write(KEY_1, "", gen);
    expect(map.has(KEY_1)).toBe(false);
    expect(store.read(KEY_1)).toBeNull();
  });

  it("setItem이 던지면 메모리로 같은 값을 돌려준다", () => {
    const { storage, fail, map } = fakeStorage();
    const store = createDraftStore(() => storage);
    fail.add("setItem");
    store.write(KEY_1, "새 글", store.generation());
    expect(map.has(KEY_1)).toBe(false);
    expect(store.read(KEY_1)).toBe("새 글");
  });

  it("메모리 값이 저장소 옛 값보다 먼저다 (S3-13 ①)", () => {
    const { storage, fail } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    expect(store.read(KEY_1)).toBe("옛 글");
    fail.add("setItem");
    store.write(KEY_1, "새 글", store.generation());
    expect(store.read(KEY_1)).toBe("새 글");
  });

  it("removeItem이 던져도 지운 것으로 읽힌다 — 저장소 옛 글이 되살아나지 않는다", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    fail.add("removeItem");
    store.write(KEY_1, "", store.generation());
    expect(map.get(KEY_1)).toBe("옛 글");
    expect(store.read(KEY_1)).toBeNull();
  });

  it("쓰기가 다시 성공하면 메모리 칸을 비우고 저장소를 믿는다", () => {
    const { storage, fail, map } = fakeStorage();
    const store = createDraftStore(() => storage);
    fail.add("setItem");
    store.write(KEY_1, "막힌 동안", store.generation());
    fail.delete("setItem");
    store.write(KEY_1, "풀린 뒤", store.generation());
    map.set(KEY_1, "다른 탭이 아니라 저장소 값");
    expect(store.read(KEY_1)).toBe("다른 탭이 아니라 저장소 값");
  });

  it("getItem이 던지거나 저장소가 없으면 null — 던지지 않는다", () => {
    const { storage, fail } = fakeStorage({ [KEY_1]: "글" });
    fail.add("getItem");
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
    const none = createDraftStore(() => null);
    none.write(KEY_1, "메모리만", none.generation());
    expect(none.read(KEY_1)).toBe("메모리만");
    const throwing = createDraftStore(() => {
      throw new Error("저장소 접근 거부");
    });
    expect(throwing.read(KEY_1)).toBeNull();
  });
});

describe("S3-6 S3-13 로그아웃 지우기(clear)", () => {
  it("draft 머리 키만 전부 지우고 다른 키는 둔다", () => {
    const { storage, map } = fakeStorage({
      [KEY_1]: "1번 글",
      [KEY_2]: "2번 글",
      "ondo.chat.draft.v1:first@ondo.test:1": "다른 계정 글",
      "ondo.wholesale.session": "{}",
    });
    const store = createDraftStore(() => storage);
    store.clear();
    expect([...map.keys()].sort()).toEqual(
      [DRAFT_META_KEY, "ondo.wholesale.session"].sort(),
    );
  });

  it("메모리 대체 값도 지운다", () => {
    const { storage, fail } = fakeStorage();
    const store = createDraftStore(() => storage);
    fail.add("setItem");
    store.write(KEY_1, "메모리 글", store.generation());
    store.clear();
    expect(store.read(KEY_1)).toBeNull();
  });

  it("removeItem이 던져도 지운 것으로 읽고 던지지 않는다 (S3-13 ②)", () => {
    const { storage, fail } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    fail.add("removeItem");
    expect(() => store.clear()).not.toThrow();
    expect(store.read(KEY_1)).toBeNull();
  });

  it("지운 뒤 지난 세대의 쓰기(언마운트 저장)는 버린다", () => {
    const { storage, map } = fakeStorage();
    const store = createDraftStore(() => storage);
    const before = store.generation();
    store.clear();
    store.write(KEY_1, "로그아웃 순간의 글", before);
    expect(map.has(KEY_1)).toBe(false);
    expect(store.read(KEY_1)).toBeNull();
    store.write(KEY_1, "다시 로그인 뒤 글", store.generation());
    expect(store.read(KEY_1)).toBe("다시 로그인 뒤 글");
  });
});

/*
 * 메타 리뷰 M3, M4. "새 문서"는 같은 가짜 저장소에 store를 새로 만든 것이다 — 새로고침하면 메모리 Map은 없고
 * sessionStorage만 남는다.
 */
describe("M3 M4 로그아웃 정리가 실패해도 다음 문서가 옛 글을 안 읽는다", () => {
  it("M3 key() 열거가 던진 로그아웃 → 저장소 복구 → 같은 문서도 새 문서도 옛 글 null", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    fail.add("key");
    store.clear();
    fail.delete("key");
    expect(map.get(KEY_1)).toBe("옛 글");
    expect(store.read(KEY_1)).toBeNull();
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
  });

  it("M4 removeItem이 던진 로그아웃 → 새로고침(새 문서) → 옛 글 null", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    fail.add("removeItem");
    createDraftStore(() => storage).clear();
    fail.delete("removeItem");
    expect(map.get(KEY_1)).toBe("옛 글");
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
  });

  it("M4 재로그인 뒤 새로 쓴 글은 새 문서에서도 읽힌다. 다음 로그아웃이면 다시 null", () => {
    const { storage, fail } = fakeStorage({ [KEY_1]: "옛 글" });
    fail.add("removeItem");
    const first = createDraftStore(() => storage);
    first.clear();
    first.write(KEY_2, "새 계정 글", first.generation());
    const reloaded = createDraftStore(() => storage);
    expect(reloaded.read(KEY_1)).toBeNull();
    expect(reloaded.read(KEY_2)).toBe("새 계정 글");
    reloaded.clear();
    expect(createDraftStore(() => storage).read(KEY_2)).toBeNull();
  });

  it("세대 칸 쓰기마저 던지면 이 문서 동안 저장소를 안 읽고, 쓰기는 메모리로 받는다", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    fail.add("setItem");
    fail.add("removeItem");
    store.clear();
    fail.delete("setItem");
    fail.delete("removeItem");
    expect(store.read(KEY_1)).toBeNull();
    store.write(KEY_2, "메모리 글", store.generation());
    expect(map.has(KEY_2)).toBe(false);
    expect(store.read(KEY_2)).toBe("메모리 글");
  });

  it("로그아웃한 적 없는 탭(세대 칸 없음)은 저장소 값을 그대로 믿는다", () => {
    const { storage } = fakeStorage({ [KEY_1]: "남은 글" });
    expect(createDraftStore(() => storage).read(KEY_1)).toBe("남은 글");
  });

  it("깨진 세대 칸은 아무것도 못 믿는다", () => {
    const { storage } = fakeStorage({
      [KEY_1]: "글",
      [DRAFT_META_KEY]: "{깨짐",
    });
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
  });
});

describe("S3-10 방별 보류 말풍선", () => {
  const failed: PendingMessage = {
    clientMessageId: "a",
    body: "30장이면 장당 500원 빼 드릴게요",
    status: "failed",
    failure: "server",
  };

  it("한 방만 바꾸고 다른 방은 그대로. 없는 방은 같은 빈 배열", () => {
    const one = withRoomPending({}, 1, (list) => [...list, failed]);
    expect(pendingOfRoom(one, 1)).toEqual([failed]);
    expect(pendingOfRoom(one, 2)).toEqual([]);
    expect(pendingOfRoom(one, 2)).toBe(pendingOfRoom({}, 3));
    const both = withRoomPending(one, 2, (list) => [
      ...list,
      { ...failed, clientMessageId: "b" },
    ]);
    expect(pendingOfRoom(both, 1)).toBe(pendingOfRoom(one, 1));
  });

  it("비면 그 방 칸을 지운다. 이미 없으면 같은 객체", () => {
    const one = withRoomPending({}, 1, () => [failed]);
    expect(withRoomPending(one, 1, () => [])).toEqual({});
    expect(withRoomPending(one, 2, () => [])).toBe(one);
  });
});

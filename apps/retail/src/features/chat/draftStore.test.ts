import { describe, expect, it } from "vitest";
import {
  createDraftStore,
  DRAFT_META_KEY,
  type DraftStorage,
} from "./draftStore";
import { draftKey } from "./derive";

/**
 * loop-08e S2-1 방별 입력 기억의 순수한 부분 — 키 만들기와 저장소 감싸개(실패 시 메모리), 로그아웃과 로그인 정리.
 * 도매 `draftStore.test.ts`(loop-08b S3-1, S3-6, S3-13, M3, M4) 사례를 키만 소매처 id로 바꿔 옮겼다. 도매 파일 끝의
 * "S3-10 방별 보류 말풍선"은 보류 말풍선 몫이라 #362(`pendingOfRoom`)가 옮긴다.
 * 저장소는 가짜다(Map 하나). `fail`에 넣은 동작만 던진다. "새 문서"는 같은 가짜 저장소에 store를 새로 만든 것이다 —
 * 새로고침하면 메모리 Map은 없고 sessionStorage만 남는다.
 */

type Op = "getItem" | "setItem" | "removeItem" | "key";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const fail = new Set<Op>();
  const guard = (op: Op) => {
    if (fail.has(op)) throw new Error(`${op} 막힘`);
  };
  const storage: DraftStorage = {
    getItem: (key) => {
      guard("getItem");
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      guard("setItem");
      map.set(key, value);
    },
    removeItem: (key) => {
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
  return { storage, map, fail };
}

/** 소매처 1 방 1, 방 2. 소매처 1 방 33, 소매처 2 방 5 */
const KEY_1 = "ondo.chat.draft.v1:1:1";
const KEY_2 = "ondo.chat.draft.v1:1:2";
const MINE_33 = "ondo.chat.draft.v1:1:33";
const OTHER_5 = "ondo.chat.draft.v1:2:5";

describe("S2-1 draftKey", () => {
  it("draftKey(1, 33) → 접두어 + 1:33", () => {
    expect(draftKey(1, 33)).toBe("ondo.chat.draft.v1:1:33");
  });

  it("소매처 id null → null(저장 안 함). 정수가 아닌 값도 모르는 것으로", () => {
    expect(draftKey(null, 33)).toBeNull();
    expect(draftKey(1.5, 33)).toBeNull();
    expect(draftKey(Number.NaN, 33)).toBeNull();
  });

  it("소매처가 다르면 같은 방도 다른 키. 1과 10이 머리로 섞이지 않는다", () => {
    expect(draftKey(2, 1)).not.toBe(draftKey(1, 1));
    expect(draftKey(10, 1)?.startsWith(draftKey(1, 1) ?? "")).toBe(false);
  });
});

describe("S2-1 저장소 감싸개(도매 S3-1)", () => {
  it("쓰면 저장소에 들어가고 그대로 읽힌다. 빈 글은 키를 지운다", () => {
    const { storage, map } = fakeStorage();
    const store = createDraftStore(() => storage);
    const gen = store.generation();
    store.write(KEY_1, "레드 L 몇 장 돼요", gen);
    expect(map.get(KEY_1)).toBe("레드 L 몇 장 돼요");
    expect(store.read(KEY_1)).toBe("레드 L 몇 장 돼요");
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

  it("메모리 값이 저장소 옛 값보다 먼저다 (쓰기 실패 뒤 메모리 우선)", () => {
    const { storage, fail } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    expect(store.read(KEY_1)).toBe("옛 글");
    fail.add("setItem");
    store.write(KEY_1, "새 글", store.generation());
    expect(store.read(KEY_1)).toBe("새 글");
  });

  it("removeItem이 던져도 지운 것으로 읽힌다 — 저장소 옛 글이 되살아나지 않는다 (지우기 실패 표시)", () => {
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

describe("S2-1 로그아웃 지우기 clear(도매 S3-6 S3-13)", () => {
  it("draft 머리 키만 전부 지우고 다른 키는 둔다", () => {
    const { storage, map } = fakeStorage({
      [KEY_1]: "1번 글",
      [KEY_2]: "2번 글",
      [OTHER_5]: "다른 소매처 글",
      "ondo.retail.other": "{}",
    });
    const store = createDraftStore(() => storage);
    store.clear();
    expect([...map.keys()].sort()).toEqual(
      [DRAFT_META_KEY, "ondo.retail.other"].sort(),
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

  it("removeItem이 던져도 지운 것으로 읽고 던지지 않는다", () => {
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

describe("S2-1 정리가 실패해도 다음 문서가 옛 글을 안 읽는다(도매 M3 M4 세대 칸)", () => {
  it("key() 열거가 던진 로그아웃 → 저장소 복구 → 같은 문서도 새 문서도 옛 글 null", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    const store = createDraftStore(() => storage);
    fail.add("key");
    store.clear();
    fail.delete("key");
    expect(map.get(KEY_1)).toBe("옛 글");
    expect(store.read(KEY_1)).toBeNull();
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
  });

  it("removeItem이 던진 로그아웃 → 새로고침(새 문서) → 옛 글 null", () => {
    const { storage, fail, map } = fakeStorage({ [KEY_1]: "옛 글" });
    fail.add("removeItem");
    createDraftStore(() => storage).clear();
    fail.delete("removeItem");
    expect(map.get(KEY_1)).toBe("옛 글");
    expect(createDraftStore(() => storage).read(KEY_1)).toBeNull();
  });

  it("재로그인 뒤 새로 쓴 글은 새 문서에서도 읽힌다. 다음 로그아웃이면 다시 null", () => {
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

  it("정리한 적 없는 탭(세대 칸 없음)은 저장소 값을 그대로 믿는다", () => {
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

describe("S2-1 로그인 정리 keepOnly(Q1 ①)", () => {
  const seed = () => ({
    [MINE_33]: "레드 L 몇 장 돼요",
    [OTHER_5]: "앞 소매처 글",
  });

  it("keepOnly(1) 정상 저장소 → 2:5 물리 삭제, 1:33 읽힘. 새 문서도 1:33 읽힘", () => {
    const { storage, map } = fakeStorage({
      ...seed(),
      "ondo.retail.other": "x",
    });
    const store = createDraftStore(() => storage);
    store.keepOnly(1);
    expect(map.has(OTHER_5)).toBe(false);
    expect(map.get("ondo.retail.other")).toBe("x");
    expect(store.read(MINE_33)).toBe("레드 L 몇 장 돼요");
    expect(createDraftStore(() => storage).read(MINE_33)).toBe(
      "레드 L 몇 장 돼요",
    );
  });

  it("keepOnly(null) 정상 저장소 → 둘 다 물리 삭제", () => {
    const { storage, map } = fakeStorage(seed());
    const store = createDraftStore(() => storage);
    store.keepOnly(null);
    expect(map.has(MINE_33)).toBe(false);
    expect(map.has(OTHER_5)).toBe(false);
    expect(store.read(MINE_33)).toBeNull();
  });

  it("① removeItem이 던짐 → 새 인스턴스 read(2:5) null, read(1:33) 원래 글", () => {
    const { storage, fail, map } = fakeStorage(seed());
    fail.add("removeItem");
    const store = createDraftStore(() => storage);
    store.keepOnly(1);
    fail.delete("removeItem");
    expect(map.get(OTHER_5)).toBe("앞 소매처 글");
    expect(store.read(OTHER_5)).toBeNull();
    const reloaded = createDraftStore(() => storage);
    expect(reloaded.read(OTHER_5)).toBeNull();
    expect(reloaded.read(MINE_33)).toBe("레드 L 몇 장 돼요");
  });

  it("② key()가 던짐 → 새 인스턴스 read(2:5) null (남길 키를 몰라 1:33도 잃는 쪽)", () => {
    const { storage, fail, map } = fakeStorage(seed());
    fail.add("key");
    const store = createDraftStore(() => storage);
    store.keepOnly(1);
    fail.delete("key");
    expect(map.get(OTHER_5)).toBe("앞 소매처 글");
    expect(store.read(OTHER_5)).toBeNull();
    const reloaded = createDraftStore(() => storage);
    expect(reloaded.read(OTHER_5)).toBeNull();
    expect(reloaded.read(MINE_33)).toBeNull();
  });

  it("③ 메타 쓰기가 던짐 → 이 인스턴스 read 전부 null(저장소 안 믿음)", () => {
    const { storage, fail } = fakeStorage(seed());
    fail.add("setItem");
    fail.add("removeItem");
    const store = createDraftStore(() => storage);
    store.keepOnly(1);
    fail.delete("setItem");
    fail.delete("removeItem");
    expect(store.read(OTHER_5)).toBeNull();
    expect(store.read(MINE_33)).toBeNull();
  });

  it("정리 뒤 지난 세대 쓰기(언마운트 저장) → 2:5 안 살아남", () => {
    const { storage, map } = fakeStorage(seed());
    const store = createDraftStore(() => storage);
    const before = store.generation();
    store.keepOnly(1);
    store.write(OTHER_5, "로그인 순간 앞 소매처 입력창의 글", before);
    expect(map.has(OTHER_5)).toBe(false);
    expect(store.read(OTHER_5)).toBeNull();
    expect(createDraftStore(() => storage).read(OTHER_5)).toBeNull();
  });

  it("앞 로그아웃에서 못 지운 같은 소매처 글은 되살리지 않는다", () => {
    const { storage, fail } = fakeStorage({ [MINE_33]: "로그아웃 전 글" });
    fail.add("removeItem");
    createDraftStore(() => storage).clear();
    fail.delete("removeItem");
    const next = createDraftStore(() => storage);
    next.keepOnly(1);
    expect(next.read(MINE_33)).toBeNull();
    expect(createDraftStore(() => storage).read(MINE_33)).toBeNull();
  });

  it("메모리 대체 값: 남길 소매처 것은 남고 다른 소매처 것은 지운다", () => {
    const { storage, fail } = fakeStorage();
    const store = createDraftStore(() => storage);
    fail.add("setItem");
    store.write(MINE_33, "내 메모리 글", store.generation());
    store.write(OTHER_5, "남 메모리 글", store.generation());
    fail.delete("setItem");
    store.keepOnly(1);
    expect(store.read(MINE_33)).toBe("내 메모리 글");
    expect(store.read(OTHER_5)).toBeNull();
  });

  it("정리 뒤 새로 쓴 같은 소매처 글은 새 문서에서 읽힌다", () => {
    const { storage } = fakeStorage(seed());
    const store = createDraftStore(() => storage);
    store.keepOnly(1);
    store.write(KEY_1, "방 1 새 글", store.generation());
    const reloaded = createDraftStore(() => storage);
    expect(reloaded.read(KEY_1)).toBe("방 1 새 글");
    expect(reloaded.read(MINE_33)).toBe("레드 L 몇 장 돼요");
  });
});

import { DRAFT_KEY_PREFIX } from "./constants";
import { draftPrefixOf } from "./derive";

/**
 * 방별 쓰던 글의 저장소(loop-08e §4-2, 도매 `features/chat/draftStore.ts` 복제 — 앱 사이 import 금지).
 * React를 모른다 — 훅(`useRoomDraft`)이 이걸 부른다.
 *
 * 저장소가 던지면(용량, 사생활 모드, 막힌 저장소) **그 탭 메모리 Map**으로 받는다. 보장은 같은 화면 수명
 * 안의 방 왕복까지다 — 새로고침하면 메모리는 없다. 규칙 셋(도매 그대로):
 * 1. 메모리에 값이 있으면 저장소보다 먼저 읽는다. 쓰기가 실패한 뒤 저장소엔 **옛 글**이 남아 있어서, 저장소를
 *    먼저 보면 고친 글이 옛 글로 돌아간다
 * 2. 지우기가 실패하면 메모리에 "지움" 표시(null)를 남긴다. 안 남기면 저장소의 옛 글이 다시 읽힌다
 * 3. 저장소 쓰기가 성공하면 메모리 칸을 비운다 — 이제 저장소가 맞다
 *
 * 정리(`clear` 로그아웃, `keepOnly` 로그인)는 세대 번호를 올린다. 정리 순간 열려 있던 입력창이 언마운트되며 마지막
 * 글을 바로 저장하는데(`useRoomDraft`의 떠날 때 저장), 그게 방금 지운 키를 되살리면 안 된다. 그래서 쓰기마다
 * 마운트 때 받은 세대를 같이 내고, 지난 세대의 쓰기는 버린다.
 *
 * **저장소에도 세대를 둔다**(`DRAFT_META_KEY`). 정리 때 키를 못 세거나(`key()` 실패) 못 지우면(`removeItem` 실패)
 * 앞 글이 저장소에 남는다. 메모리 표시는 새로고침하면 없어서 다음 문서가 그 글을 읽는다. 그래서 정리마다
 * `{새 세대, live: 남길 키}`를 **먼저** 적고 그다음 지운다. 한 번이라도 정리한 탭에서는 live 키만 읽는다 — 지우기는
 * 그다음 청소일 뿐 안 돼도 된다(§4-2 6). 세대 칸 쓰기마저 실패하면 이 문서 동안은 저장소를 아예 안 읽는다 —
 * 새로고침까지 넘기는 보장은 그때 없다(저장소가 통째로 막힌 경우).
 * 정리한 적 없는 탭(세대 칸 없음)은 저장소 값을 그대로 믿는다.
 */

/** 세대 칸. `DRAFT_KEY_PREFIX`로 시작하지 않아 지우기 대상이 아니다 */
export const DRAFT_META_KEY = "ondo.chat.draft-meta.v1";

interface DraftMeta {
  epoch: number;
  /** 이 세대에 저장소에서 믿는 키. 이 밖의 draft 키는 지난 세대 값이다 */
  live: string[];
}

function parseMeta(raw: string | null): DraftMeta | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "epoch" in value &&
      "live" in value &&
      typeof value.epoch === "number" &&
      Array.isArray(value.live)
    )
      return {
        epoch: value.epoch,
        live: value.live.filter((k): k is string => typeof k === "string"),
      };
  } catch {
    /* 깨진 값은 아래에서 "아무것도 못 믿음"으로 */
  }
  /* 칸은 있는데 못 읽으면 정리는 있었다는 뜻이다 — 옛 글을 믿지 않는다 */
  return { epoch: Number.MAX_SAFE_INTEGER, live: [] };
}

/** `Storage`에서 쓰는 것만. 테스트가 가짜를 넣는다 */
export type DraftStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export interface DraftStore {
  /** 지금 세대. 입력창이 마운트 때 한 번 받아 쓰기마다 낸다 */
  generation: () => number;
  /** 저장된 글. 없거나 지웠으면 null */
  read: (key: string) => string | null;
  /** 빈 글이면 지운다. `generation`이 지금 세대가 아니면 아무것도 안 한다 */
  write: (key: string, text: string, generation: number) => void;
  /** `DRAFT_KEY_PREFIX` 키 전부와 메모리(로그아웃). 세대를 올린다 */
  clear: () => void;
  /**
   * 그 소매처 키만 남기고 지운다(로그인 성공, Q1 ①). null이면(어느 소매처인지 모름) 전부 — `clear`와 같다.
   * 남기는 키는 지금 읽히는 것만이다. 앞 정리에서 못 지워 live 밖에 있던 같은 소매처 키는 되살리지 않는다
   */
  keepOnly: (retailerId: number | null) => void;
}

/**
 * `storage`는 부를 때마다 묻는다 — 서버 렌더엔 `window`가 없고, 저장소 접근 자체가 던지는 브라우저도 있다.
 * null이면 메모리만 쓴다.
 */
export function createDraftStore(
  storage: () => DraftStorage | null,
): DraftStore {
  /** 키 → 글. null은 "지웠다"(저장소 지우기가 실패했을 때) */
  const memory = new Map<string, string | null>();
  let generation = 0;
  /** 세대 칸을 못 적은 정리가 있었다 — 이 문서 동안 저장소 값을 믿지 않는다 */
  let storageUntrusted = false;

  const safeStorage = (): DraftStorage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };

  /** 저장소의 세대 칸. 없으면(정리한 적 없음) null. 못 읽으면 못 믿는 칸으로 */
  const readMeta = (target: DraftStorage): DraftMeta | null => {
    try {
      return parseMeta(target.getItem(DRAFT_META_KEY));
    } catch {
      return { epoch: Number.MAX_SAFE_INTEGER, live: [] };
    }
  };

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    if (storageUntrusted) return null;
    const target = safeStorage();
    if (target === null) return null;
    const meta = readMeta(target);
    if (meta !== null && !meta.live.includes(key)) return null;
    try {
      return target.getItem(key);
    } catch {
      return null;
    }
  };

  /** 이 세대에 쓴 키로 적는다. 세대 칸이 없으면(정리한 적 없음) 적을 것이 없다 */
  const markLive = (target: DraftStorage, key: string): void => {
    const meta = readMeta(target);
    if (meta === null || meta.live.includes(key)) return;
    target.setItem(
      DRAFT_META_KEY,
      JSON.stringify({ epoch: meta.epoch, live: [...meta.live, key] }),
    );
  };

  const write = (key: string, text: string, gen: number): void => {
    if (gen !== generation) return;
    const target = safeStorage();
    try {
      if (target === null || storageUntrusted) throw new Error("저장소 못 씀");
      if (text === "") target.removeItem(key);
      else {
        target.setItem(key, text);
        markLive(target, key);
      }
      memory.delete(key);
    } catch {
      memory.set(key, text === "" ? null : text);
    }
  };

  /**
   * `keep`(키 머리)으로 시작하는 키만 남기고 지운다. null이면 전부.
   * 순서가 보장의 전부다: 세대를 올림 → 키를 셈 → 세대 칸 `{새 세대, live: 남길 키}`를 적음 → 지움.
   * 세는 게 실패하면 남길 키를 모른다 — live를 비워 적는다(남길 글도 잃는 쪽, 앞 소매처 글을 보이는 것보다 낫다)
   */
  const prune = (keep: string | null): void => {
    generation += 1;
    const kept = (key: string) => keep !== null && key.startsWith(keep);
    for (const key of [...memory.keys()]) if (!kept(key)) memory.delete(key);
    const target = safeStorage();
    if (target === null) return;

    let keys: string[] | null = [];
    try {
      for (let i = 0; i < target.length; i += 1) {
        const key = target.key(i);
        if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key);
      }
    } catch {
      keys = null;
    }

    const meta = readMeta(target);
    /* 지금 읽히는 것만 남긴다 — 앞 세대 live 밖 키나 메모리에 "지움"이 찍힌 키는 이미 없는 글이다 */
    const live = (keys ?? []).filter(
      (key) =>
        kept(key) &&
        memory.get(key) !== null &&
        (meta === null || meta.live.includes(key)),
    );
    /* 세대 칸이 먼저다. 이게 적히면 아래 지우기가 다 실패해도 다음 문서는 live 밖 글을 안 읽는다 */
    try {
      const before = meta?.epoch ?? 0;
      const epoch = before >= Number.MAX_SAFE_INTEGER - 1 ? 1 : before + 1;
      target.setItem(DRAFT_META_KEY, JSON.stringify({ epoch, live }));
    } catch {
      storageUntrusted = true;
    }
    if (keys === null) return;
    for (const key of keys) {
      if (live.includes(key)) continue;
      try {
        target.removeItem(key);
      } catch {
        memory.set(key, null);
      }
    }
  };

  return {
    generation: () => generation,
    read,
    write,
    clear: () => prune(null),
    keepOnly: (retailerId) => prune(draftPrefixOf(retailerId)),
  };
}

/** 이 탭의 저장소 하나. 방 화면은 방마다 다시 마운트되지만 이건 문서 수명 내내 같다 */
export const chatDrafts: DraftStore = createDraftStore(() =>
  typeof window === "undefined" ? null : window.sessionStorage,
);

/**
 * 로그아웃 때 쓰던 글을 전부 지운다(D43 Q2). 공용 단말에서 다음 사람이 보는 쪽이 더 나쁘다.
 * 401 세션 끊김은 로그아웃이 아니라 부르지 않는다(D28). 부르는 곳은 `app/SessionChangeCleanup.tsx`다
 * (feature끼리 import 금지) — 이 탭의 로그아웃 버튼과 다른 탭 알림으로 이 탭이 정리될 때만
 */
export function clearChatDrafts(): void {
  chatDrafts.clear();
}

/**
 * 로그인 성공 때 그 소매처 글만 남긴다(Q1 ①). 401로 `/login`에 왔다가 같은 소매처로 들어오면 쓰던 글이 남고,
 * 다른 소매처면 앞 글이 하나도 안 남는다. id를 모르면 전부 지운다. 로그인 화면이 이동보다 먼저 부른다(§4-2 5)
 */
export function keepChatDraftsOf(retailerId: number | null): void {
  chatDrafts.keepOnly(retailerId);
}

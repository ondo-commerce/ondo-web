import { DRAFT_KEY_PREFIX } from "./constants";

/**
 * 방별 쓰던 글의 저장소(loop-08b §4-1, Q1 ① sessionStorage). React를 모른다 — 훅(`useRoomDraft`)이 이걸 부른다.
 *
 * 저장소가 던지면(용량, 사생활 모드, 막힌 저장소) **그 탭 메모리 Map**으로 받는다(§4-1 7). 보장은 같은 화면 수명
 * 안의 방 왕복까지다 — 새로고침하면 메모리는 없다. 규칙 셋:
 * 1. 메모리에 값이 있으면 저장소보다 먼저 읽는다. 쓰기가 실패한 뒤 저장소엔 **옛 글**이 남아 있어서, 저장소를
 *    먼저 보면 고친 글이 옛 글로 돌아간다(S3-13 ①)
 * 2. 지우기가 실패하면 메모리에 "지움" 표시(null)를 남긴다. 안 남기면 저장소의 옛 글이 다시 읽힌다(S3-13 ②)
 * 3. 저장소 쓰기가 성공하면 메모리 칸을 비운다 — 이제 저장소가 맞다
 *
 * `clear`(로그아웃, Q2)는 세대 번호를 올린다. 로그아웃 순간 열려 있던 입력창이 언마운트되며 마지막 글을
 * 바로 저장하는데(`useRoomDraft`의 떠날 때 저장), 그게 방금 지운 키를 되살리면 안 된다. 그래서 쓰기마다
 * 마운트 때 받은 세대를 같이 내고, 지난 세대의 쓰기는 버린다.
 */

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
  /** `DRAFT_KEY_PREFIX` 키 전부와 메모리. 세대를 올린다 */
  clear: () => void;
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

  const safeStorage = (): DraftStorage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return safeStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const write = (key: string, text: string, gen: number): void => {
    if (gen !== generation) return;
    const target = safeStorage();
    try {
      if (target === null) throw new Error("저장소 없음");
      if (text === "") target.removeItem(key);
      else target.setItem(key, text);
      memory.delete(key);
    } catch {
      memory.set(key, text === "" ? null : text);
    }
  };

  const clear = (): void => {
    generation += 1;
    memory.clear();
    const target = safeStorage();
    if (target === null) return;
    const keys: string[] = [];
    try {
      for (let i = 0; i < target.length; i += 1) {
        const key = target.key(i);
        if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key);
      }
    } catch {
      return;
    }
    for (const key of keys) {
      try {
        target.removeItem(key);
      } catch {
        memory.set(key, null);
      }
    }
  };

  return { generation: () => generation, read, write, clear };
}

/** 이 탭의 저장소 하나. 방 패널은 방마다 다시 마운트되지만 이건 화면 수명 내내 같다 */
export const chatDrafts: DraftStore = createDraftStore(() =>
  typeof window === "undefined" ? null : window.sessionStorage,
);

/**
 * 로그아웃 때 쓰던 글을 전부 지운다(Q2 ①). 공용 단말에서 다음 사람이 보는 쪽이 더 나쁘다.
 * 401 세션 끊김은 로그아웃이 아니라 부르지 않는다(D28). 보류 말풍선은 `ChatView` state라 로그아웃이
 * 화면을 내릴 때 같이 사라진다. 부르는 곳은 `app/(erp)`의 연결부다(feature끼리 import 금지)
 */
export function clearChatDrafts(): void {
  chatDrafts.clear();
}

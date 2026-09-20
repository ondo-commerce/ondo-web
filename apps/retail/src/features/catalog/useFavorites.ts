"use client";

import { useSyncExternalStore } from "react";

/**
 * 찜 상태. **서버에 찜 API가 없어서 브라우저 세션이 들고 있다** — 스냅샷의 path
 * 17개에 찜이 없다(`04-wire.md` §4). API가 생기면 이 파일만 갈아 끼운다.
 *
 * 화면 하나가 `useState`로 들고 있으면 안 되는 이유가 셋이다.
 * ① 도매처 홈은 같은 상품이 두 격자에 나올 수 있다 — 격자마다 상태를 두면 한쪽
 *    하트만 켜진다.
 * ② 홈에서 켠 하트가 상품 상세에서 꺼진 채로 시작하면, 같은 상품을 두고 두 화면이
 *    반대되는 말을 한다.
 * ③ 찜 목록에서 하트를 끄고 나갔다 오면 해제가 통째로 버려진다 — 게이트 Q7의
 *    후반("화면을 떠났다 돌아오면 그때 빠진다")이 영영 오지 않는다.
 * 그래서 화면 밖 모듈 하나가 들고 `useSyncExternalStore`로 나눠 준다.
 *
 * **새로고침하면 빈 집합으로 돌아간다.** 세션 저장소지 서버 저장이 아니다 —
 * 화면 사이 이동에서만 살아남는다. fixtures 시절엔 더미가 초기값을 줬지만 이제
 * 서버가 찜을 모르므로 초기값은 비어 있다.
 *
 * `Set`이 넣은 순서를 지키는 것이 곧 `최근 찜한 순`이다 — 찜한 시각을 따로
 * 들지 않는다(`derive.ts` `sortWishlist`).
 */

const EMPTY: ReadonlySet<string> = new Set();

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 EMPTY에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let snapshot: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlySet<string> {
  return snapshot;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

/**
 * 하트 하나를 뒤집는다. **목록에서 카드를 빼지 않는다**(게이트 Q7) — 즉시 제거는
 * 되돌릴 수 없고, 잘못 눌렀을 때 무엇이 사라졌는지조차 남지 않는다.
 * 목록에서 빠지는 시점은 화면을 떠났다 다시 들어올 때다(`WishlistView`).
 */
export function toggleFavorite(productId: string): void {
  const next = new Set(snapshot);
  if (!next.delete(productId)) next.add(productId);

  /* 집합을 새로 만들어 넣는다 — 같은 객체를 고치면 스냅샷이 안 바뀐 것으로 보여
     화면이 다시 그려지지 않는다 */
  snapshot = next;
  for (const listener of listeners) listener();
}

/** 목록 화면용. 격자 전체가 같은 집합 하나를 본다 */
export function useFavorites(): {
  favorites: ReadonlySet<string>;
  toggleFavorite: (productId: string) => void;
} {
  const favorites = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return { favorites, toggleFavorite };
}

/** 상품 하나만 보는 화면용(상품 상세·검색 결과 줄) */
export function useProductFavorite(productId: string): {
  favorited: boolean;
  toggleFavorite: () => void;
} {
  const favorites = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    favorited: favorites.has(productId),
    toggleFavorite: () => toggleFavorite(productId),
  };
}

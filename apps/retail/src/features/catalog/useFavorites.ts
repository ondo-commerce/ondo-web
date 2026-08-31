"use client";

import { useSyncExternalStore } from "react";
import { CATALOG_PRODUCTS } from "./fixtures";

/**
 * 찜 상태. **서버가 없어서 브라우저 세션이 들고 있다** — API가 붙으면 이 파일만
 * 갈아 끼운다.
 *
 * 화면 하나가 `useState`로 들고 있으면 안 되는 이유가 셋이다.
 * ① 도매처 홈은 같은 상품이 `신상`과 `전체 상품` 양쪽에 나온다 — 격자마다 상태를
 *    두면 한쪽 하트만 켜진다.
 * ② 홈에서 켠 하트가 상품 상세에서 꺼진 채로 시작하면, 같은 상품을 두고 두 화면이
 *    반대되는 말을 한다.
 * ③ 찜 목록에서 하트를 끄고 나갔다 오면 해제가 통째로 버려진다 — 게이트 Q7의
 *    후반("화면을 떠났다 돌아오면 그때 빠진다")이 영영 오지 않는다.
 * 그래서 화면 밖 모듈 하나가 들고 `useSyncExternalStore`로 나눠 준다.
 *
 * **새로고침하면 초기값으로 돌아간다.** 세션 저장소지 서버 저장이 아니다 —
 * 화면 사이 이동에서만 살아남는다.
 */

/** 초기값은 더미가 정한다. 서버 렌더와 첫 하이드레이션이 같은 집합을 봐야 한다 */
const SEED: ReadonlySet<string> = new Set(
  CATALOG_PRODUCTS.filter((p) => p.favorited).map((p) => p.id),
);

/* 모듈 값이라 서버에서도 한 벌 산다. 다만 바꾸는 곳이 이벤트 핸들러뿐이라
   서버 쪽 값은 SEED에서 움직이지 않는다 — 요청끼리 섞이지 않는다 */
let snapshot: ReadonlySet<string> = SEED;
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
  return SEED;
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

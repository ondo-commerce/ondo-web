/**
 * 소매 셸의 이동 지점 원본. **URL은 여기 한 파일에만 적는다** — 화면·Figma·문서에
 * 다시 적지 않는다(도매 `shared/config/nav.ts`와 같은 규약).
 */

export interface AccountMenuItem {
  href: string;
  label: string;
  /** 앞에 구분선을 둔다. 성격이 다른 마지막 항목(로그아웃)에만 붙는다 */
  separated?: boolean;
}

/**
 * 계정 드롭다운 7항목. **항목·순서가 고정**이고 화면별 분기가 없다.
 *
 * Figma 원본은 정산·미수(`2489:7136`)와 설정(`2489:7738`)에서만 `설정`이 빠져
 * 있었다(`retail_screen_spec.md` §6-5). 화면마다 메뉴를 그리면 그 결함이 그대로
 * 옮겨오므로, 목록을 여기 한 곳에 두고 셸이 전 화면에 같은 것을 그린다.
 */
export const ACCOUNT_MENU_ITEMS: readonly AccountMenuItem[] = [
  { href: "/orders", label: "주문 내역" },
  { href: "/backorders", label: "미송 대기 현황" },
  { href: "/wholesalers", label: "거래처 관리" },
  { href: "/wishlist", label: "찜 목록" },
  { href: "/settlements", label: "정산 · 미수" },
  { href: "/settings", label: "설정" },
  /* 로그아웃은 여기 없다 — 이동이 아니라 세션을 끊는 조작이라 `AccountMenu`가
     버튼으로 따로 그린다 */
];

/**
 * 카테고리 바가 그리는 항목 하나. **값은 서버(`GET /categories`)에서 온다** —
 * fixtures 시절의 8종 고정 목록(`tops`·`bottoms`…)은 지웠다. 셸(`shared`)은
 * feature를 못 읽으므로 모양만 여기 두고, 목록은 `(browse)` 레이아웃이 넘긴다.
 */
export interface CategoryChip {
  /** `?category=`에 실리는 값이자 목록 API의 `categoryId` */
  id: number;
  name: string;
}

/** 주소에 실리는 이름. 카테고리 바와 목록 필터가 같은 축을 켜야 한다 */
export const CATEGORY_PARAM = "category";

/** `전체`(= 아무것도 안 고름)의 표시명. 값이 아니라 주소에서 빠지는 것으로 표현한다 */
export const ALL_CATEGORY_LABEL = "전체";

/** 카테고리 하나로 좁힌 홈 주소. null이면 `전체`라 그냥 홈이다 */
export function categoryHref(id: number | null): string {
  return id === null ? "/" : `/?${CATEGORY_PARAM}=${id}`;
}

/**
 * 주소의 `?category=` 값을 화면이 쓸 id로 정리한다.
 *
 * 목록에 없는 값(옛 북마크·공유 링크·오타·지워진 카테고리)이 오면 `전체`(null)로
 * 떨어뜨린다. 그대로 두면 항목 중 아무것도 켜지지 않아 **어느 축으로 좁혀진
 * 화면인지 화면이 말하지 않는다** — 와이어프레임은 늘 하나가 켜져 있다.
 */
export function resolveCategoryId(
  value: string | null | undefined,
  categories: readonly CategoryChip[],
): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return categories.some((c) => c.id === id) ? id : null;
}

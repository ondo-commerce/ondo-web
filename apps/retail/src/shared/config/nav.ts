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
  /* 세션이 아직 없다. 로그인 화면으로 보내기만 한다 */
  { href: "/login", label: "로그아웃", separated: true },
];

export interface Category {
  /** `?category=` 에 실리는 값 */
  slug: string;
  label: string;
}

/**
 * 카테고리 바 8종. 항목·순서가 고정이고 홈과 상품 상세가 같은 것을 쓴다.
 *
 * slug가 라틴 문자인 건 임시다 — glossary에 소매 카테고리 코드 축이 아직 없고,
 * 사양 §4는 카테고리 단수가 화면마다 1단/3단/4단으로 갈려 있다고만 적어 뒀다.
 * 축이 확정되면 이 파일 한 곳만 고치면 된다(화면 라벨은 한글 그대로다).
 */
export const CATEGORIES: readonly Category[] = [
  { slug: "all", label: "전체" },
  { slug: "tops", label: "상의" },
  { slug: "bottoms", label: "하의" },
  { slug: "outer", label: "아우터" },
  { slug: "dress-set", label: "원피스·세트" },
  { slug: "shoes", label: "신발" },
  { slug: "bags", label: "가방" },
  { slug: "accessories", label: "액세서리" },
];

/** 아무것도 고르지 않은 상태. `?category=`가 없으면 이것이 선택 표시다 */
export const DEFAULT_CATEGORY_SLUG = "all";

/**
 * 주소의 `?category=` 값을 화면이 쓸 slug로 정리한다.
 *
 * 목록에 없는 값(옛 북마크·공유 링크·오타)이 오면 `전체`로 떨어뜨린다.
 * 그대로 두면 8항목 중 아무것도 켜지지 않아 **어느 축으로 좁혀진 화면인지 화면이
 * 말하지 않는다** — 와이어프레임은 늘 하나가 켜져 있다.
 * Q4(카테고리 코드 축)가 정해지면 옛 slug가 전부 이 경로로 들어온다.
 */
export function resolveCategorySlug(value: string | null | undefined): string {
  return CATEGORIES.some(({ slug }) => slug === value)
    ? (value ?? DEFAULT_CATEGORY_SLUG)
    : DEFAULT_CATEGORY_SLUG;
}

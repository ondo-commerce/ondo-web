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

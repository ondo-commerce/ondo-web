import type { BadgeProps } from "@ondo/ui";
import type { PostStatus, SizeName } from "./types";

/** `Badge`가 가진 색은 이 둘뿐이다 — 늘리지 않는다(게이트 G-2) */
type BadgeTone = NonNullable<BadgeProps["tone"]>;

export const SIZES: readonly SizeName[] = [
  "Free",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
];

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface PaletteGroup {
  group: string;
  colors: PaletteColor[];
}

/**
 * 색상 마스터 — 고정 팔레트 26종 6그룹. 자유 입력이 아니다.
 * 색상 = 시스템 값(필터·집계용), 색상 표기 = 노출용 이름(자유 텍스트).
 * 여기에 값을 추가하려면 색상 마스터를 먼저 고쳐야 한다.
 */
export const COLOR_PALETTE: readonly PaletteGroup[] = [
  {
    group: "무채색",
    colors: [
      { name: "블랙", hex: "#191f28" },
      { name: "차콜", hex: "#4e5968" },
      { name: "그레이", hex: "#b0b8c1" },
      { name: "화이트", hex: "#ffffff" },
      { name: "아이보리", hex: "#f3efe3" },
      { name: "크림", hex: "#f7ecd7" },
    ],
  },
  {
    group: "베이지·브라운",
    colors: [
      { name: "베이지", hex: "#d8c3a5" },
      { name: "카멜", hex: "#b5813f" },
      { name: "브라운", hex: "#6b4a2f" },
      { name: "카키", hex: "#6b6b45" },
    ],
  },
  {
    group: "블루",
    colors: [
      { name: "네이비", hex: "#1f2a44" },
      { name: "블루", hex: "#3182f6" },
      { name: "소라", hex: "#a5c9e8" },
    ],
  },
  {
    group: "데님 워싱",
    colors: [
      { name: "연청", hex: "#a9c3dc" },
      { name: "중청", hex: "#5b7fa6" },
      { name: "진청", hex: "#2b4160" },
    ],
  },
  {
    group: "컬러",
    colors: [
      { name: "레드", hex: "#d63b3b" },
      { name: "버건디", hex: "#6e2233" },
      { name: "핑크", hex: "#f0a3bb" },
      { name: "오렌지", hex: "#f08030" },
      { name: "옐로우", hex: "#f2c94c" },
      { name: "그린", hex: "#3f7d4f" },
      { name: "민트", hex: "#8fd6c4" },
      { name: "퍼플", hex: "#7b5ea7" },
    ],
  },
  {
    group: "특수",
    colors: [
      { name: "골드", hex: "#c9a227" },
      { name: "실버", hex: "#c0c4c9" },
    ],
  },
];

/** 팔레트 색 이름 → hex. 목록·표에서 색 점을 그릴 때 쓴다 */
const COLOR_HEX: Record<string, string> = Object.fromEntries(
  COLOR_PALETTE.flatMap((g) => g.colors.map((c) => [c.name, c.hex])),
);

/** 팔레트에 없는 이름(옛 데이터 등)이 와도 화면이 깨지지 않게 흰색으로 떨어뜨린다 */
export function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#ffffff";
}

/** 카테고리 3단 — 실제 마스터가 붙기 전까지 쓰는 최소 목록 */
export const CATEGORY_TREE: Record<string, Record<string, string[]>> = {
  여성: {
    의류: ["상의", "하의", "아우터", "원피스"],
    잡화: ["가방", "신발", "액세서리"],
  },
  남성: {
    의류: ["상의", "하의", "아우터"],
    잡화: ["가방", "신발", "액세서리"],
  },
};

/**
 * 게시 상태 라벨. **`null`(미게시)까지 포함해 세 값이다** — 상품은 게시글 없이도 존재하고
 * (`Product.post === null`), 목록에서는 그 상태도 한 칸에 같이 그려야 한다.
 * 상세 패널·수정 화면이 같은 문구를 쓰도록 여기 둔다(주문 탭 `ORDER_STATUS_LABEL`과 같은 자리).
 */
export const POST_STATUS_LABEL: Record<PostStatus | "NONE", string> = {
  NONE: "미등록",
  ON_SALE: "판매중",
  SEASON_ENDED: "시즌종료",
};

/**
 * 배지 색은 둘뿐이다 — **진행 중인 것만 파랑**(게이트 G-2).
 * `미등록`과 `시즌종료`가 같은 회색이 되는 건 의도된 결과다. 둘의 구분은 배지 글자가 맡는다.
 */
export const POST_STATUS_TONE: Record<PostStatus | "NONE", BadgeTone> = {
  NONE: "done",
  ON_SALE: "active",
  SEASON_ENDED: "done",
};

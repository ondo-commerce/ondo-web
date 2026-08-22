import { COLOR_PALETTE, colorHex } from "./constants";
import type { Product, Sku, SizeName } from "./types";

/*
 * 화면을 그리기 위한 목업. API가 붙으면 이 파일만 지운다.
 *
 * ⚠️ 파생값(marginRate)도 여기에 값으로 박혀 있다. 화면에서 계산하지 않는다 —
 *    원가 계산은 서버 몫이고, 여기서 계산식을 만들면 나중에 서버와 어긋난다.
 */

function sku(
  code: string,
  color: string,
  size: SizeName,
  stock: number,
  avgCost: number,
  price: number,
  marginRate: number,
  orderLimit = 0,
): Sku {
  return {
    id: `${code}-${color}-${size}`,
    code,
    color,
    size,
    stock,
    orderLimit,
    avgCost,
    price,
    marginRate,
  };
}

const HANDWRITTEN: Product[] = [
  {
    id: "1",
    name: "루즈 오버핏 셔츠",
    code: "SU-18",
    category: ["여성", "의류", "상의"],
    colors: [
      { name: "블랙", hex: colorHex("블랙"), displayName: "뉴욕 블랙" },
      { name: "오렌지", hex: colorHex("오렌지") },
      { name: "블루", hex: colorHex("블루") },
    ],
    skus: [
      sku("SU-18", "블랙", "XS", 33, 15200, 24000, 36.6),
      sku("SU-18", "블랙", "S", 23, 15200, 24000, 36.6),
      sku("SU-18", "블랙", "M", 0, 13800, 24000, 42.5),
      sku("SU-18", "블랙", "L", 10, 13800, 24000, 42.5),
      sku("SU-18", "오렌지", "S", 23, 16100, 24000, 32.9),
      sku("SU-18", "오렌지", "L", 0, 13800, 24000, 42.5),
      sku("SU-18", "오렌지", "2XL", 0, 13800, 24000, 42.5),
      sku("SU-18", "블루", "L", 16, 14900, 24000, 37.9),
    ],
    post: {
      id: "p1",
      name: "[신상] 루즈 오버핏 셔츠 데일리 남방",
      description:
        "넉넉한 오버핏 실루엣의 데일리 셔츠예요.\n도톰하지 않은 사계절 원단이라 이너로도 아우터로도 활용 가능합니다.\n블랙/오렌지 2가지 옵션으로 준비했어요.",
      images: ["IMG", "IMG", "IMG", "IMG", "IMG", "IMG", "IMG"],
      allowSinglePiece: true,
      status: "ON_SALE",
    },
  },
  {
    id: "2",
    name: "워싱 데님 트러커 자켓",
    code: "OU-04",
    category: ["여성", "의류", "아우터"],
    colors: [
      { name: "중청", hex: colorHex("중청") },
      { name: "진청", hex: colorHex("진청"), displayName: "인디고" },
    ],
    skus: [
      sku("OU-04", "중청", "S", 12, 28400, 46000, 38.3),
      sku("OU-04", "중청", "M", 8, 28400, 46000, 38.3),
      sku("OU-04", "진청", "M", 0, 29100, 46000, 36.7),
      sku("OU-04", "진청", "L", 21, 29100, 46000, 36.7),
    ],
    post: {
      id: "p2",
      name: "워싱 데님 트러커 자켓",
      description: "빈티지한 워싱감이 살아있는 트러커 자켓입니다.",
      images: ["IMG", "IMG", "IMG"],
      allowSinglePiece: false,
      status: "SEASON_ENDED",
    },
  },
  {
    id: "3",
    name: "캐시미어 블렌드 니트 카디건",
    code: "KN-11",
    category: ["여성", "의류", "상의"],
    colors: [
      { name: "베이지", hex: colorHex("베이지") },
      { name: "차콜", hex: colorHex("차콜") },
      { name: "크림", hex: colorHex("크림") },
    ],
    skus: [
      sku("KN-11", "베이지", "Free", 40, 19800, 33000, 40.0),
      sku("KN-11", "차콜", "Free", 27, 19800, 33000, 40.0),
      sku("KN-11", "크림", "Free", 0, 20400, 33000, 38.2),
    ],
    post: {
      id: "p3",
      name: "[겨울신상] 캐시미어 블렌드 니트 카디건",
      description: "캐시미어 15% 혼방으로 가볍고 따뜻합니다.",
      images: ["IMG", "IMG", "IMG", "IMG"],
      allowSinglePiece: true,
      status: "ON_SALE",
    },
  },
  /* --- 아래부터는 게시글 미등록 상품 --- */
  {
    id: "4",
    name: "슬림핏 스트레치 치노 팬츠",
    code: "PT-27",
    category: ["남성", "의류", "하의"],
    colors: [
      { name: "그레이", hex: colorHex("그레이") },
      { name: "카키", hex: colorHex("카키") },
    ],
    skus: [
      sku("PT-27", "그레이", "S", 18, 12300, 0, 0),
      sku("PT-27", "그레이", "M", 25, 12300, 0, 0),
      sku("PT-27", "그레이", "L", 14, 12300, 0, 0),
      sku("PT-27", "카키", "M", 9, 12800, 0, 0),
      sku("PT-27", "카키", "L", 0, 12800, 0, 0),
    ],
    post: null,
  },
  {
    id: "5",
    name: "헤비웨이트 오버핏 후드 집업",
    code: "HD-09",
    category: ["남성", "의류", "아우터"],
    colors: [
      { name: "화이트", hex: colorHex("화이트") },
      { name: "블랙", hex: colorHex("블랙") },
    ],
    skus: [
      sku("HD-09", "화이트", "L", 11, 21500, 0, 0),
      sku("HD-09", "화이트", "XL", 7, 21500, 0, 0),
      sku("HD-09", "블랙", "L", 0, 21500, 0, 0),
      sku("HD-09", "블랙", "XL", 19, 21500, 0, 0),
    ],
    post: null,
  },
  {
    id: "6",
    name: "레더 크로스 미니백",
    code: "BG-02",
    category: ["여성", "잡화", "가방"],
    colors: [
      { name: "브라운", hex: colorHex("브라운") },
      { name: "블랙", hex: colorHex("블랙") },
      { name: "버건디", hex: colorHex("버건디") },
    ],
    skus: [
      sku("BG-02", "브라운", "Free", 22, 17600, 0, 0),
      sku("BG-02", "블랙", "Free", 31, 17600, 0, 0),
      sku("BG-02", "버건디", "Free", 0, 18200, 0, 0),
    ],
    post: null,
  },
];

/* ------------------------------------------------------------------------
 * 목록 밀도 확인용 자동 생성분 (id 7~100).
 *
 * 위의 손으로 쓴 6개는 상세·게시글 케이스를 보기 위한 것이고, 아래는
 * "행이 100개일 때 목록이 어떻게 보이는가"만 확인하기 위한 채움용이다.
 *
 * ⚠️ Math.random / Date 를 쓰지 않는다. 서버 렌더와 클라이언트 렌더가
 *    다른 값을 만들면 하이드레이션이 깨진다. 시드가 같으면 항상 같은 값이 나오는
 *    해시만 쓴다.
 * ------------------------------------------------------------------------ */

/** 정수 시드 → 32비트 해시. 같은 시드는 항상 같은 값 (murmur finalizer) */
function hash(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return x >>> 0;
}

/** 시드로 목록에서 하나 고른다 */
function pick<T>(list: readonly T[], seed: number): T {
  return list[hash(seed) % list.length] as T;
}

/** 시드로 min~max(포함) 정수를 고른다 */
function between(min: number, max: number, seed: number): number {
  return min + (hash(seed) % (max - min + 1));
}

interface FillerKind {
  category: [string, string, string];
  /** 품번 접두어. 뒤에 붙는 번호(101~)가 손으로 쓴 2자리 품번과 겹치지 않게 한다 */
  prefix: string;
  /** 이 분류가 실제로 쓰는 사이즈 축 */
  sizes: readonly SizeName[];
  nouns: readonly string[];
}

/*
 * 신발은 원래 230/240 같은 별도 축이 필요하지만 SizeName에 그 축이 없다.
 * 목업 단계에서는 Free로 눕혀 둔다 — 사이즈 축 확장은 별도 결정 사항이다.
 */
const FILLER_KINDS: readonly FillerKind[] = [
  {
    category: ["여성", "의류", "상의"],
    prefix: "TP",
    sizes: ["XS", "S", "M", "L", "XL"],
    nouns: ["블라우스", "셔츠", "니트 풀오버", "슬리브리스 탑", "맨투맨"],
  },
  {
    category: ["여성", "의류", "하의"],
    prefix: "PT",
    sizes: ["XS", "S", "M", "L"],
    nouns: ["와이드 슬랙스", "데님 팬츠", "플리츠 스커트", "쇼트 팬츠"],
  },
  {
    category: ["여성", "의류", "아우터"],
    prefix: "OU",
    sizes: ["S", "M", "L", "XL"],
    nouns: ["트렌치 코트", "숏 패딩", "블레이저", "가디건"],
  },
  {
    category: ["여성", "의류", "원피스"],
    prefix: "OP",
    sizes: ["S", "M", "L"],
    nouns: ["원피스", "점프수트", "셔츠 원피스"],
  },
  {
    category: ["여성", "잡화", "가방"],
    prefix: "BG",
    sizes: ["Free"],
    nouns: ["숄더백", "토트백", "버킷백"],
  },
  {
    category: ["여성", "잡화", "신발"],
    prefix: "SH",
    sizes: ["Free"],
    nouns: ["로퍼", "앵클부츠", "플랫 슈즈"],
  },
  {
    category: ["여성", "잡화", "액세서리"],
    prefix: "AC",
    sizes: ["Free"],
    nouns: ["머플러", "벨트", "볼캡"],
  },
  {
    category: ["남성", "의류", "상의"],
    prefix: "MT",
    sizes: ["S", "M", "L", "XL", "2XL"],
    nouns: ["반팔 티셔츠", "셔츠", "맨투맨", "니트"],
  },
  {
    category: ["남성", "의류", "하의"],
    prefix: "MP",
    sizes: ["S", "M", "L", "XL"],
    nouns: ["치노 팬츠", "데님 팬츠", "트레이닝 팬츠"],
  },
  {
    category: ["남성", "의류", "아우터"],
    prefix: "MO",
    sizes: ["M", "L", "XL", "2XL"],
    nouns: ["후드 집업", "블루종", "코치 자켓", "패딩 베스트"],
  },
  {
    category: ["남성", "잡화", "가방"],
    prefix: "MB",
    sizes: ["Free"],
    nouns: ["백팩", "크로스백"],
  },
  {
    category: ["남성", "잡화", "신발"],
    prefix: "MS",
    sizes: ["Free"],
    nouns: ["스니커즈", "더비 슈즈"],
  },
  {
    category: ["남성", "잡화", "액세서리"],
    prefix: "MA",
    sizes: ["Free"],
    nouns: ["볼캡", "벨트", "머플러"],
  },
];

const MATERIALS = [
  "코튼",
  "린넨",
  "울",
  "캐시미어 블렌드",
  "리오셀",
  "스판",
  "데님",
  "코듀로이",
];

const FITS = [
  "루즈핏",
  "슬림",
  "오버핏",
  "크롭",
  "베이직",
  "워시드",
  "하이웨이스트",
  "릴렉스",
  "셋업",
  "빈티지",
];

/** 팔레트 26종 이름. 색상은 자유 입력이 아니라 여기서만 고른다 */
const PALETTE_NAMES = COLOR_PALETTE.flatMap((g) => g.colors.map((c) => c.name));

function fillerProduct(index: number): Product {
  const kind = pick(FILLER_KINDS, index * 3 + 1);
  const seq = 100 + index; // 101~ 이라서 손으로 쓴 2자리 품번과 절대 겹치지 않는다
  const code = `${kind.prefix}-${seq}`;
  const name = `${pick(MATERIALS, index * 5 + 2)} ${pick(FITS, index * 7 + 3)} ${pick(kind.nouns, index * 11 + 4)}`;

  // 사이즈 축이 Free 하나뿐이면 색으로 폭을 낸다 (SKU 3~5개 유지)
  const singleSize = kind.sizes.length === 1;
  const colorCount = singleSize
    ? between(3, 5, index * 13 + 5)
    : between(1, 3, index * 13 + 5);
  const sizeCount = singleSize
    ? 1
    : Math.max(1, Math.min(kind.sizes.length, 5 - colorCount));

  // 팔레트를 26과 서로소인 7칸씩 건너뛰며 골라 색이 겹치지 않게 한다
  const colorStart = hash(index * 17 + 6) % PALETTE_NAMES.length;
  const colorNames = Array.from(
    { length: colorCount },
    (_, i) =>
      PALETTE_NAMES[(colorStart + i * 7) % PALETTE_NAMES.length] as string,
  );

  // 사이즈는 축 순서를 지켜야 하므로 연속 구간으로 자른다
  const sizeStart = hash(index * 19 + 7) % (kind.sizes.length - sizeCount + 1);
  const sizes = kind.sizes.slice(sizeStart, sizeStart + sizeCount);

  // 게시글은 5개 중 2개 꼴로만 있다 — 미등록 상품 화면도 목록에 섞여야 한다
  const hasPost = hash(index * 23 + 8) % 5 < 2;
  const avgCost = between(90, 340, index * 29 + 9) * 100;
  const price = hasPost
    ? Math.round(
        (avgCost * (1.5 + between(0, 9, index * 31 + 10) / 10)) / 1000,
      ) * 1000
    : 0;
  /*
   * 마진율은 원래 서버가 내려주는 파생값이다. 목업이라 여기서 만들지만,
   * 화면 쪽에서는 절대 계산하지 않는다 (이 파일 맨 위 주석 참고).
   */
  const marginRate = price
    ? Math.round(((price - avgCost) / price) * 1000) / 10
    : 0;

  const skus = colorNames.flatMap((color, ci) =>
    sizes.map((size, si) => {
      const seed = index * 101 + ci * 13 + si;
      // 7개 중 1개 꼴로 품절 — 재고 0 빨강 표시를 목록에서 보기 위한 것
      const stock = hash(seed) % 7 === 0 ? 0 : between(3, 48, seed + 1);
      return sku(code, color, size, stock, avgCost, price, marginRate);
    }),
  );

  return {
    id: String(index),
    name,
    code,
    category: kind.category,
    colors: colorNames.map((n) => ({ name: n, hex: colorHex(n) })),
    skus,
    post: hasPost
      ? {
          id: `p${index}`,
          name: `[${pick(["신상", "재입고", "베스트", "리오더"], index * 37 + 11)}] ${name}`,
          description: `${name} 목업 설명입니다.\n색상 ${colorNames.length}종, 사이즈 ${sizes.length}종으로 준비했어요.`,
          images: Array.from(
            { length: between(2, 5, index * 41 + 12) },
            () => "IMG",
          ),
          allowSinglePiece: hash(index * 43 + 13) % 2 === 0,
          status: hash(index * 47 + 14) % 4 === 0 ? "SEASON_ENDED" : "ON_SALE",
        }
      : null,
  };
}

/** 손으로 쓴 6개 + 생성분 94개 = 목록 행 100개 */
export const PRODUCTS: Product[] = [
  ...HANDWRITTEN,
  ...Array.from({ length: 94 }, (_, i) => fillerProduct(i + 7)),
];

export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}

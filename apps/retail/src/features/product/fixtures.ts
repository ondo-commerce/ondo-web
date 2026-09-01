import type {
  ColorGroup,
  DetailWholesaler,
  ListingStatus,
  ProductDetail,
  SizeName,
} from "./types";

/**
 * 상품 상세 더미. API가 붙으면 이 파일만 지운다.
 *
 * **`features/catalog`의 목록 더미와 id·품번·도매처·가격 범위가 같아야 한다.**
 * 카드에서 눌러 들어오는 화면이라 어긋나면 목록에서 본 값과 다른 값이 뜬다.
 * feature 간 import는 막혀 있어(ESLint) 값을 다시 적는 대신, 아래 명세를 목록과
 * 같은 순서로 늘어놓아 눈으로 대조할 수 있게 했다.
 *
 * 게시 조합(`rows`)은 **도매처가 마켓에 올린 것만**이다. 색상 × 사이즈로 만들 수
 * 있는 조합(`totalSkuCount`)이 그보다 많은 것이 정상이다 — 부분 게시를 만드는
 * 도매 쪽 컨트롤은 §3-F 미결정이라 소매는 결과만 받는다.
 */

const WHOLESALERS: Record<string, DetailWholesaler> = {
  "w-moodon": {
    id: "w-moodon",
    name: "무드온",
    initial: "무",
    location: "청평화패션몰 2층 24호",
  },
  "w-basic": {
    id: "w-basic",
    name: "더베이직",
    initial: "더",
    location: "APM 3층 12호",
  },
  "w-urban": {
    id: "w-urban",
    name: "어반무드",
    initial: "어",
    location: "디오트 4층 41호",
  },
  "w-lavien": {
    id: "w-lavien",
    name: "라비앙",
    initial: "라",
    /* `3층 7호`가 아니다 — 확정 와이어프레임 `12_partners.html` 기준.
       사입하러 갈 자리를 말하는 화면이 서로 다른 주소를 대면 사장이 없는 자리를
       찾아 헤맨다(F2). 값은 feature마다 두되 **같은 값**이어야 한다 */
    location: "청평화패션몰 3층 8호",
  },
  "w-cotton": {
    id: "w-cotton",
    name: "코튼클럽",
    initial: "코",
    location: "디오트 3층 51호",
  },
  "w-denim": {
    id: "w-denim",
    name: "데님하우스",
    initial: "데",
    /* `디오트 2층 18호`가 아니다 — 확정 와이어프레임 2장(`12_partners`·
       `09_order_detail`)이 `디오트 지하 1층 12호`로 일치한다(F2) */
    location: "디오트 지하 1층 12호",
  },
};

/** 게시된 조합 한 줄: [팔레트 색, 사이즈, 판매가, 재고 소진 여부] */
type RowSpec = [string, SizeName, number, boolean?];

interface DetailSpec {
  id: string;
  code: string;
  name: string;
  wholesalerId: string;
  category: [string, string, string];
  /** [팔레트 색, 색상 표기]. 표기가 도매 현장에서 부르는 이름이다 */
  colors: [string, string][];
  sizes: SizeName[];
  rows: RowSpec[];
  imageCount: number;
  status?: ListingStatus;
}

const SPECS: readonly DetailSpec[] = [
  {
    id: "p-flower-shirt",
    code: "SU-18",
    name: "빈티지 플라워 셔츠",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "상의"],
    colors: [
      ["레드", "체리레드"],
      ["네이비", "딥네이비"],
      ["카키", "올리브"],
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      ["레드", "S", 12500],
      ["레드", "M", 13000],
      ["네이비", "M", 13000],
      ["네이비", "L", 13500, true],
      ["카키", "M", 12500],
    ],
    imageCount: 10,
  },
  {
    id: "p-wide-slacks",
    code: "SU-24",
    name: "링클프리 와이드 슬랙스",
    wholesalerId: "w-basic",
    category: ["여성", "의류", "하의"],
    colors: [
      ["블랙", "진블랙"],
      ["차콜", "차콜그레이"],
      ["베이지", "모래베이지"],
      ["카키", "올리브카키"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["블랙", "S", 14000],
      ["블랙", "M", 14000],
      ["블랙", "L", 14600],
      ["차콜", "M", 14600],
      ["베이지", "M", 15200],
    ],
    imageCount: 6,
  },
  {
    id: "p-linen-jacket",
    code: "SU-31",
    name: "오버핏 린넨 자켓",
    wholesalerId: "w-urban",
    category: ["여성", "의류", "아우터"],
    colors: [
      ["아이보리", "오트아이보리"],
      ["베이지", "샌드베이지"],
    ],
    sizes: ["Free"],
    rows: [
      ["아이보리", "Free", 24500],
      ["베이지", "Free", 24500],
    ],
    imageCount: 4,
  },
  {
    id: "p-check-shirt",
    code: "SU-07",
    name: "체크무늬 셔츠",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "상의"],
    colors: [
      ["블랙", "잉크블랙"],
      ["네이비", "딥네이비"],
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      ["블랙", "M", 30000],
      ["블랙", "L", 30800],
      ["네이비", "M", 30800],
      ["네이비", "L", 31500, true],
    ],
    imageCount: 5,
  },
  {
    id: "p-shirring-dress",
    code: "SU-42",
    name: "셔링 미니 원피스",
    wholesalerId: "w-lavien",
    category: ["여성", "의류", "원피스"],
    colors: [
      ["크림", "버터크림"],
      ["핑크", "로즈핑크"],
    ],
    sizes: ["S", "M"],
    rows: [
      ["크림", "S", 16500],
      ["크림", "M", 16500],
      ["핑크", "S", 17500],
      ["핑크", "M", 17500],
    ],
    imageCount: 7,
  },
  {
    id: "p-cotton-tee",
    code: "SU-03",
    name: "데일리 코튼 티셔츠",
    wholesalerId: "w-cotton",
    category: ["여성", "의류", "상의"],
    colors: [
      ["화이트", "화이트"],
      ["블랙", "잉크블랙"],
      ["그레이", "멜란지그레이"],
      ["소라", "스카이"],
      ["핑크", "인디핑크"],
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      ["화이트", "M", 4500],
      ["화이트", "L", 4500],
      ["블랙", "M", 4500],
      ["블랙", "L", 4800],
      ["그레이", "M", 4800],
      ["소라", "M", 5200],
      ["핑크", "M", 5200, true],
    ],
    imageCount: 8,
  },
  {
    id: "p-highwaist-denim",
    code: "SU-15",
    name: "하이웨스트 데님 팬츠",
    wholesalerId: "w-denim",
    category: ["여성", "의류", "하의"],
    colors: [
      ["연청", "라이트블루"],
      ["진청", "인디고"],
    ],
    sizes: ["S", "M", "L"],
    rows: [
      ["연청", "S", 18000],
      ["연청", "M", 18000],
      ["연청", "L", 18500],
      ["진청", "M", 19000],
    ],
    imageCount: 5,
  },
  {
    id: "p-pleats-skirt",
    code: "SU-11",
    name: "플리츠 스커트",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "하의"],
    colors: [
      ["블랙", "잉크블랙"],
      ["베이지", "모래베이지"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["블랙", "S", 7500],
      ["블랙", "M", 7500],
      ["베이지", "M", 8200],
      ["베이지", "L", 8200],
    ],
    imageCount: 4,
  },
  {
    id: "p-linen-blouse",
    code: "SU-51",
    name: "여름 린넨 블라우스",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "상의"],
    colors: [
      ["화이트", "화이트"],
      ["소라", "스카이"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["화이트", "M", 16000],
      ["화이트", "L", 16500],
      ["소라", "M", 17000],
    ],
    imageCount: 5,
  },
  {
    id: "p-basic-tee",
    code: "SU-52",
    name: "기본 반팔 티셔츠",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "상의"],
    colors: [
      ["화이트", "화이트"],
      ["블랙", "잉크블랙"],
      ["그레이", "멜란지그레이"],
      ["민트", "민트"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["화이트", "M", 8500],
      ["블랙", "M", 8500],
      ["그레이", "M", 8800],
      ["민트", "M", 9000],
    ],
    imageCount: 6,
  },
  {
    id: "p-hood-zipup",
    code: "SU-53",
    name: "스트릿 후드 집업",
    wholesalerId: "w-moodon",
    category: ["남성", "의류", "아우터"],
    colors: [
      ["블랙", "잉크블랙"],
      ["차콜", "차콜그레이"],
      ["그레이", "멜란지그레이"],
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      ["블랙", "M", 28000],
      ["블랙", "L", 28700],
      ["차콜", "L", 29500],
      ["그레이", "M", 28700],
    ],
    imageCount: 9,
  },
  {
    id: "p-daily-slacks",
    code: "SU-54",
    name: "데일리 슬랙스",
    wholesalerId: "w-moodon",
    category: ["남성", "의류", "하의"],
    colors: [
      ["블랙", "잉크블랙"],
      ["차콜", "차콜그레이"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["블랙", "M", 19000],
      ["블랙", "L", 19500],
      ["차콜", "M", 20000],
    ],
    imageCount: 4,
  },
  {
    id: "p-fleece-wide",
    code: "SU-62",
    name: "기모 와이드 팬츠",
    wholesalerId: "w-moodon",
    category: ["여성", "의류", "하의"],
    colors: [
      ["블랙", "잉크블랙"],
      ["차콜", "차콜그레이"],
    ],
    sizes: ["S", "M", "L"],
    rows: [
      ["블랙", "M", 21000],
      ["차콜", "M", 22000],
    ],
    imageCount: 3,
    status: "SEASON_ENDED",
  },
  {
    id: "p-kids-sweat",
    code: "SU-58",
    name: "키즈 맨투맨",
    wholesalerId: "w-moodon",
    /* 대 축에 `키즈`가 없다 — 도매 카테고리 마스터가 여성/남성 둘뿐이다.
       축이 늘기 전까지 여성>의류>상의로 둔다(`02-fe.md` §6 부채) */
    category: ["여성", "의류", "상의"],
    colors: [
      ["아이보리", "오트아이보리"],
      ["민트", "민트"],
      ["핑크", "인디핑크"],
    ],
    sizes: ["S", "M", "L"],
    rows: [
      ["아이보리", "M", 11000],
      ["민트", "M", 11400],
      ["핑크", "M", 11800],
    ],
    imageCount: 4,
  },
  {
    id: "p-fleece-knit-dress",
    code: "SU-64",
    name: "기모 니트 원피스",
    wholesalerId: "w-lavien",
    category: ["여성", "의류", "원피스"],
    colors: [
      ["차콜", "차콜그레이"],
      ["버건디", "와인"],
    ],
    sizes: ["S", "M"],
    rows: [
      ["차콜", "M", 23000],
      ["버건디", "M", 24000],
    ],
    imageCount: 3,
    status: "SEASON_ENDED",
  },
  {
    id: "p-canvas-tote",
    code: "SU-71",
    name: "캔버스 토트백",
    wholesalerId: "w-urban",
    category: ["여성", "잡화", "가방"],
    colors: [
      ["아이보리", "오트아이보리"],
      ["블랙", "잉크블랙"],
      ["카키", "올리브"],
    ],
    sizes: ["Free"],
    rows: [
      ["아이보리", "Free", 9000],
      ["블랙", "Free", 9000],
      ["카키", "Free", 9000],
    ],
    imageCount: 3,
  },
  {
    id: "p-strap-sandal",
    code: "SU-73",
    name: "스트랩 샌들",
    wholesalerId: "w-lavien",
    category: ["여성", "잡화", "신발"],
    colors: [
      ["블랙", "잉크블랙"],
      ["베이지", "샌드베이지"],
    ],
    sizes: ["S", "M", "L"],
    rows: [
      ["블랙", "M", 21000],
      ["블랙", "L", 21500],
      ["베이지", "M", 22000],
    ],
    imageCount: 5,
  },
  {
    id: "p-leather-belt",
    code: "SU-77",
    name: "레더 벨트",
    wholesalerId: "w-urban",
    category: ["여성", "잡화", "액세서리"],
    colors: [
      ["블랙", "잉크블랙"],
      ["브라운", "다크브라운"],
      ["골드", "골드"],
    ],
    sizes: ["Free"],
    rows: [
      ["블랙", "Free", 6500],
      ["브라운", "Free", 6500],
      ["골드", "Free", 6500],
    ],
    imageCount: 2,
  },
  {
    id: "p-washed-denim-jacket",
    code: "SU-81",
    name: "워시드 데님 자켓",
    wholesalerId: "w-denim",
    category: ["여성", "의류", "아우터"],
    colors: [
      ["연청", "라이트블루"],
      ["중청", "미디엄블루"],
    ],
    sizes: ["S", "M", "L", "XL"],
    rows: [
      ["연청", "M", 32000],
      ["연청", "L", 33000],
      ["중청", "M", 34000],
    ],
    imageCount: 6,
  },
  {
    id: "p-crop-cardigan",
    code: "SU-84",
    name: "크롭 니트 가디건",
    wholesalerId: "w-cotton",
    category: ["여성", "의류", "아우터"],
    colors: [
      ["아이보리", "오트아이보리"],
      ["차콜", "차콜그레이"],
      ["핑크", "인디핑크"],
      ["민트", "민트"],
    ],
    sizes: ["S", "M", "L"],
    rows: [
      ["아이보리", "M", 13500],
      ["차콜", "M", 14000],
      ["핑크", "M", 14500],
    ],
    imageCount: 4,
    /* 게시 내림 상태를 볼 수 있는 유일한 상품이다. **목록에는 나오지 않는다** —
       게시가 내려갔다는 것이 곧 목록에서 빠졌다는 뜻이라, 찜해 두었거나 주소를
       기억하는 사장만 이 화면에 닿는다 */
    status: "UNPUBLISHED",
  },
];

function buildGroups(spec: DetailSpec): ColorGroup[] {
  return (
    spec.colors
      .map(([color, displayName]) => ({
        color,
        displayName,
        rows: spec.rows
          .filter(([rowColor]) => rowColor === color)
          .map(([, size, price, soldOut]) => ({
            skuId: `${spec.id}-${color}-${size}`,
            size,
            price,
            soldOut: soldOut ?? false,
          })),
      }))
      /* 한 조합도 안 올린 색은 그룹 자체를 만들지 않는다 — 머리만 있고 표가 빈
       그룹이 생기면 "여기도 살 수 있나" 하고 한 번 더 보게 된다 */
      .filter((group) => group.rows.length > 0)
  );
}

export const PRODUCT_DETAILS: readonly ProductDetail[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  code: spec.code,
  category: spec.category,
  wholesaler: WHOLESALERS[spec.wholesalerId] ?? {
    id: spec.wholesalerId,
    name: "알 수 없는 도매처",
    initial: "?",
    location: "",
  },
  imageCount: spec.imageCount,
  status: spec.status ?? "ON_SALE",
  colorGroups: buildGroups(spec),
  totalSkuCount: spec.colors.length * spec.sizes.length,
}));

/** 없는 id면 화면이 `notFound()`로 간다 — 빈 상세를 그리지 않는다 */
export function findProductDetail(id: string): ProductDetail | undefined {
  return PRODUCT_DETAILS.find((p) => p.id === id);
}

import type { PackingItem, Package, PickupMethod, Retailer } from "./types";

/*
 * 출고 탭 목업. API가 붙으면 이 파일만 지운다.
 *
 * 칩 건수를 판정 D5(= 그 단계에 있는 행의 총 개수)에 맞춰 **포장 대기 20 · 출고 대기 20 ·
 * 출고 완료 30**으로 정합하게 만든다. 포장 대기 20줄과 Figma에 실제로 그려져 있는
 * 부산상사(RT-007)의 포장 3건은 손으로 적고, 나머지 47건은 시드 생성기가 만든다 —
 * 50건을 다 적으면 파일이 500줄을 넘고, 손으로 적은 줄과 생성된 줄의 구분도 사라진다.
 *
 * ⚠️ Math.random / Date.now 를 쓰지 않는다. 서버 렌더와 클라이언트 렌더가 다른 값을
 *    만들면 하이드레이션이 깨진다. 날짜도 UTC 기준으로만 만든다 — 로컬 시간대로
 *    포맷하면 서버(UTC)와 브라우저(KST)의 날짜가 하루 어긋난다.
 */

/** 소매처 12곳. 관리 화면이 없어서 주소까지 여기 박아 둔다(장끼 `배송지`가 이 값을 쓴다) */
export const RETAILERS: readonly Retailer[] = [
  {
    id: "RT-001",
    name: "서울유통",
    code: "RT-001",
    address: "서울 중구 을지로 100 3층",
  },
  {
    id: "RT-002",
    name: "대구패션",
    code: "RT-002",
    address: "대구 중구 국채보상로 550",
  },
  {
    id: "RT-003",
    name: "광주의류",
    code: "RT-003",
    address: "광주 동구 충장로 45 2층",
  },
  {
    id: "RT-004",
    name: "인천상회",
    code: "RT-004",
    address: "인천 중구 개항로 21",
  },
  {
    id: "RT-005",
    name: "수원마켓",
    code: "RT-005",
    address: "경기 수원시 팔달구 정조로 780",
  },
  {
    id: "RT-006",
    name: "울산유통",
    code: "RT-006",
    address: "울산 남구 삼산로 200 5층",
  },
  {
    id: "RT-007",
    name: "부산상사",
    code: "RT-007",
    address: "부산 부산진구 서전로 8 1801호",
  },
  {
    id: "RT-008",
    name: "대전상사",
    code: "RT-008",
    address: "대전 중구 중앙로 120",
  },
  {
    id: "RT-009",
    name: "청주유통",
    code: "RT-009",
    address: "충북 청주시 상당구 상당로 55",
  },
  {
    id: "RT-010",
    name: "전주패션",
    code: "RT-010",
    address: "전북 전주시 완산구 팔달로 210",
  },
  {
    id: "RT-011",
    name: "창원마켓",
    code: "RT-011",
    address: "경남 창원시 성산구 중앙대로 90",
  },
  {
    id: "RT-012",
    name: "제주물류",
    code: "RT-012",
    address: "제주 제주시 중앙로 300",
  },
];

/** SKU 풀. SKU = 색상 × 사이즈라 옵션 축이 둘이다(glossary §3) */
const SKUS: readonly {
  code: string;
  name: string;
  color: string;
  size: string;
}[] = [
  { code: "SKU-001", name: "오버핏 코튼 티셔츠", color: "네이비", size: "M" },
  { code: "SKU-002", name: "캐시미어 니트", color: "아이보리", size: "L" },
  { code: "SKU-003", name: "와이드 데님 팬츠", color: "인디고", size: "M" },
  { code: "SKU-004", name: "린넨 셔츠", color: "화이트", size: "S" },
  { code: "SKU-005", name: "크롭 후드집업", color: "블랙", size: "L" },
  { code: "SKU-006", name: "플리츠 미디 스커트", color: "베이지", size: "M" },
  { code: "SKU-007", name: "워시드 데님 자켓", color: "블루", size: "L" },
  { code: "SKU-008", name: "슬림 슬랙스", color: "차콜", size: "M" },
  { code: "SKU-009", name: "라운드넥 가디건", color: "핑크", size: "S" },
  { code: "SKU-010", name: "트임 롱 원피스", color: "카키", size: "M" },
  { code: "SKU-011", name: "배기 조거 팬츠", color: "그레이", size: "L" },
  {
    code: "SKU-012",
    name: "스트라이프 블라우스",
    color: "스카이블루",
    size: "S",
  },
];

/**
 * SKU 풀 조회. 배열이 비어 있지 않는 한 도달하지 않는 분기지만
 * `noUncheckedIndexedAccess`가 undefined를 붙여 주므로 여기서 좁힌다 —
 * 조용한 기본값으로 때우면 목업이 어긋난 것을 화면에서 못 알아챈다.
 */
function skuAt(index: number) {
  const sku = SKUS[index % SKUS.length];
  if (!sku) throw new Error(`SKU 인덱스 ${index}가 목업 범위를 벗어났습니다`);
  return sku;
}

/** 대기 줄 한 개. 위치 인자가 8개까지 늘어나지 않게 SKU는 번호로 받는다 */
function item(
  id: string,
  retailerId: string,
  skuIndex: number,
  qty: number,
  pickupMethod: PickupMethod,
  orderedAt: string,
  orderCode: string,
): PackingItem {
  const sku = skuAt(skuIndex);
  return {
    id,
    retailerId,
    skuCode: sku.code,
    productName: sku.name,
    color: sku.color,
    size: sku.size,
    pickupMethod,
    orderedAt,
    orderCode,
    qty,
  };
}

/*
 * 포장 대기 20줄. 부산상사(RT-007) 6줄은 Figma 실측 그대로다 —
 * 수령방식 3+3, 주문 일시·수량까지 맞춰 뒀고 합계가 55개(= 아코디언 꼬리 `SKU 6건 · 55개`)다.
 * 직접 수령 3줄만 고르면 30개가 되어 실측 우측 패널의 `선택 상품 합계 30개`도 재현된다.
 */
export const PACKING_ITEMS: readonly PackingItem[] = [
  item(
    "PI-001",
    "RT-007",
    0,
    12,
    "SELF_PICKUP",
    "2026-08-12T09:14",
    "ORD-1001",
  ),
  item("PI-002", "RT-007", 1, 8, "SELF_PICKUP", "2026-08-11T17:02", "ORD-1002"),
  item(
    "PI-003",
    "RT-007",
    2,
    10,
    "SELF_PICKUP",
    "2026-08-10T09:20",
    "ORD-1003",
  ),
  item("PI-004", "RT-007", 3, 9, "AGENT_VISIT", "2026-08-11T10:38", "ORD-1004"),
  item("PI-005", "RT-007", 4, 8, "AGENT_VISIT", "2026-08-10T14:55", "ORD-1005"),
  item("PI-006", "RT-007", 5, 8, "AGENT_VISIT", "2026-08-09T16:44", "ORD-1006"),

  item(
    "PI-007",
    "RT-001",
    6,
    10,
    "SELF_PICKUP",
    "2026-08-12T11:05",
    "ORD-1007",
  ),
  item(
    "PI-008",
    "RT-001",
    10,
    6,
    "AGENT_VISIT",
    "2026-08-10T13:12",
    "ORD-1008",
  ),
  item(
    "PI-009",
    "RT-002",
    7,
    14,
    "AGENT_VISIT",
    "2026-08-11T15:40",
    "ORD-1009",
  ),
  item("PI-010", "RT-003", 1, 9, "SELF_PICKUP", "2026-08-12T08:30", "ORD-1010"),
  item("PI-011", "RT-003", 8, 7, "SELF_PICKUP", "2026-08-09T18:22", "ORD-1011"),
  item(
    "PI-012",
    "RT-004",
    9,
    12,
    "AGENT_VISIT",
    "2026-08-11T09:05",
    "ORD-1012",
  ),
  item(
    "PI-013",
    "RT-005",
    2,
    15,
    "SELF_PICKUP",
    "2026-08-10T11:50",
    "ORD-1013",
  ),
  item(
    "PI-014",
    "RT-006",
    11,
    8,
    "AGENT_VISIT",
    "2026-08-12T10:10",
    "ORD-1014",
  ),
  item(
    "PI-015",
    "RT-006",
    3,
    11,
    "AGENT_VISIT",
    "2026-08-09T14:33",
    "ORD-1015",
  ),
  item("PI-016", "RT-008", 4, 9, "SELF_PICKUP", "2026-08-11T13:27", "ORD-1016"),
  item(
    "PI-017",
    "RT-009",
    0,
    13,
    "AGENT_VISIT",
    "2026-08-10T17:41",
    "ORD-1017",
  ),
  item("PI-018", "RT-010", 6, 6, "SELF_PICKUP", "2026-08-12T12:36", "ORD-1018"),
  item(
    "PI-019",
    "RT-011",
    5,
    10,
    "AGENT_VISIT",
    "2026-08-11T16:18",
    "ORD-1019",
  ),
  item("PI-020", "RT-012", 7, 7, "SELF_PICKUP", "2026-08-09T09:58", "ORD-1020"),
];

/* ─────────────────────────── 포장 묶음 ─────────────────────────── */

/** 정수 시드 → 32비트 해시(murmur finalizer). 재고 탭 목업과 같은 함수지만
 *  feature 경계를 넘어 import 하지 않는다 — 목업끼리 의존을 만들지 않기 위해서다 */
function hash(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  x ^= x >>> 13;
  return x >>> 0;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** 목업 기준 시각. Figma 실측의 최신 출고 일시(8/14 10:30)를 그대로 쓴다 */
const SHIPPED_BASE = Date.UTC(2026, 7, 14, 10, 30);
/** 실측의 최신 포장 일시(8/12 14:20) */
const PACKED_BASE = Date.UTC(2026, 7, 12, 14, 20);

/** ms → `YYYY-MM-DDTHH:mm`. UTC 게터만 쓴다(시간대에 따라 날짜가 밀리지 않게) */
function stamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * 아직 번호를 못 받은 포장. 포장번호는 전체를 포장 일시 순으로,
 * 장끼번호는 출고된 것만 출고 일시 순으로 세운 뒤에 붙인다 —
 * 둘 다 순서가 정해져야 나오는 값이라 여기서는 뺀다.
 */
type DraftPackage = Omit<Package, "packageNo" | "statementNo">;

/**
 * 소매처별 출고 대기 건수. 합 17 + 아래 손으로 적은 부산상사 3건 = 20(= `출고 대기` 칩).
 * RT-007이 0인 이유가 그것이다.
 */
const PACKED_PER_RETAILER: readonly number[] = [
  2, 1, 2, 1, 2, 1, 0, 2, 1, 2, 2, 1,
];

/** 소매처별 출고 완료 건수. 합 30(= `출고 완료` 칩) */
const SHIPPED_PER_RETAILER: readonly number[] = [
  3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2,
];

/** 시드로 담긴 품목 줄을 만든다. 1~3줄이라 `외 N건` 요약과 단일 품명이 둘 다 나온다 */
function draftLines(
  seed: number,
  retailerId: string,
  keyPrefix: string,
  pickupMethod: PickupMethod,
  packedMs: number,
): PackingItem[] {
  const count = 1 + (seed % 3);
  return Array.from({ length: count }, (_, j) => {
    const noise = hash(seed + j * 17);
    const orderedMs = packedMs - (12 + (noise % 60)) * HOUR;
    return item(
      `${keyPrefix}-${j + 1}`,
      retailerId,
      (seed + j * 5) % SKUS.length,
      6 + (noise % 15),
      pickupMethod,
      stamp(orderedMs),
      `ORD-${2000 + (noise % 800)}`,
    );
  });
}

function draftPackage(
  retailer: Retailer,
  retailerIndex: number,
  k: number,
  salt: number,
  status: "PACKED" | "SHIPPED",
  sequence: number,
): DraftPackage {
  const seed = hash(retailerIndex * 131 + k * 17 + salt);
  const pickupMethod: PickupMethod =
    (seed >>> 3) % 2 === 0 ? "SELF_PICKUP" : "AGENT_VISIT";

  if (status === "PACKED") {
    const packedMs = PACKED_BASE - sequence * 4 * HOUR - (seed % 59) * MINUTE;
    return {
      retailerId: retailer.id,
      pickupMethod,
      status,
      packedAt: stamp(packedMs),
      shippedAt: null,
      lines: draftLines(
        seed,
        retailer.id,
        `PL-P${retailerIndex}${k}`,
        pickupMethod,
        packedMs,
      ),
    };
  }

  /* 출고된 묶음은 출고보다 하루쯤 앞서 포장돼 있어야 앞뒤가 맞는다 */
  const shippedMs = SHIPPED_BASE - sequence * 3 * HOUR - (seed % 59) * MINUTE;
  const packedMs = shippedMs - (18 + (seed % 12)) * HOUR;
  return {
    retailerId: retailer.id,
    pickupMethod,
    status,
    packedAt: stamp(packedMs),
    shippedAt: stamp(shippedMs),
    lines: draftLines(
      seed,
      retailer.id,
      `PL-S${retailerIndex}${k}`,
      pickupMethod,
      packedMs,
    ),
  };
}

/*
 * 부산상사 포장 3건 — Figma 실측(`PKG 3건 · 66개`)을 그대로 재현한다.
 * 첫 건은 3줄 30개라 실측 우측 패널의 `포함 상품(3개)` · `총 수량 30개`와 맞고,
 * 마지막 건은 1줄이라 상품 요약이 `외 N건` 없이 품명만 나오는 경우를 덮는다.
 */
const HANDWRITTEN_PACKED: readonly DraftPackage[] = [
  {
    retailerId: "RT-007",
    pickupMethod: "SELF_PICKUP",
    status: "PACKED",
    packedAt: "2026-08-12T14:20",
    shippedAt: null,
    lines: [
      item(
        "PL-B1-1",
        "RT-007",
        0,
        12,
        "SELF_PICKUP",
        "2026-08-11T09:12",
        "ORD-1801",
      ),
      item(
        "PL-B1-2",
        "RT-007",
        2,
        10,
        "SELF_PICKUP",
        "2026-08-11T14:05",
        "ORD-1802",
      ),
      item(
        "PL-B1-3",
        "RT-007",
        4,
        8,
        "SELF_PICKUP",
        "2026-08-10T18:40",
        "ORD-1803",
      ),
    ],
  },
  {
    retailerId: "RT-007",
    pickupMethod: "AGENT_VISIT",
    status: "PACKED",
    packedAt: "2026-08-11T09:45",
    shippedAt: null,
    lines: [
      item(
        "PL-B2-1",
        "RT-007",
        1,
        12,
        "AGENT_VISIT",
        "2026-08-10T10:20",
        "ORD-1804",
      ),
      item(
        "PL-B2-2",
        "RT-007",
        3,
        8,
        "AGENT_VISIT",
        "2026-08-09T15:33",
        "ORD-1805",
      ),
    ],
  },
  {
    retailerId: "RT-007",
    pickupMethod: "SELF_PICKUP",
    status: "PACKED",
    packedAt: "2026-08-10T16:30",
    shippedAt: null,
    lines: [
      item(
        "PL-B3-1",
        "RT-007",
        5,
        16,
        "SELF_PICKUP",
        "2026-08-09T11:47",
        "ORD-1806",
      ),
    ],
  },
];

function buildPackages(): Package[] {
  const drafts: DraftPackage[] = [...HANDWRITTEN_PACKED];

  let packedSeq = 1;
  let shippedSeq = 0;
  RETAILERS.forEach((retailer, retailerIndex) => {
    for (let k = 0; k < (PACKED_PER_RETAILER[retailerIndex] ?? 0); k += 1) {
      drafts.push(
        draftPackage(retailer, retailerIndex, k, 11, "PACKED", packedSeq),
      );
      packedSeq += 1;
    }
    for (let k = 0; k < (SHIPPED_PER_RETAILER[retailerIndex] ?? 0); k += 1) {
      drafts.push(
        draftPackage(retailer, retailerIndex, k, 97, "SHIPPED", shippedSeq),
      );
      shippedSeq += 1;
    }
  });

  /*
   * 포장번호는 **포장한 순서대로** 붙인다. 이미 나간 묶음이 아직 안 나간 묶음보다
   * 늦은 번호를 갖고 있으면 번호를 시간 순서로 읽을 수 없다.
   * (Figma는 포장 상세와 장끼에 똑같이 PKG-001을 적어 뒀는데 그건 목업의 중복이다.)
   */
  const numbered: Package[] = drafts
    .sort((a, b) => a.packedAt.localeCompare(b.packedAt))
    .map((draft, index) => ({
      ...draft,
      packageNo: `PKG-${String(index + 1).padStart(3, "0")}`,
      statementNo: null,
    }));

  /*
   * 장끼번호는 출고 완료 시점에 붙는다(§2.8). 날짜부는 출고일과 같고 `NNN`은
   * 그날 발행 순번이라, 출고 일시 순으로 훑으면서 날짜별 카운터를 올린다.
   * (Figma는 장끼번호 날짜부와 출고일이 어긋나 있는데 그건 목업 오류다 — 판정 D6)
   */
  const issuedPerDay = new Map<string, number>();
  for (const pkg of numbered
    .filter((p) => p.shippedAt !== null)
    .sort((a, b) => (a.shippedAt ?? "").localeCompare(b.shippedAt ?? ""))) {
    const datePart = (pkg.shippedAt ?? "").slice(0, 10).replace(/-/g, "");
    const seq = (issuedPerDay.get(datePart) ?? 0) + 1;
    issuedPerDay.set(datePart, seq);
    pkg.statementNo = `JG-${datePart}-${String(seq).padStart(3, "0")}`;
  }

  return numbered;
}

/** 출고 대기 20건 + 출고 완료 30건 */
export const PACKAGES: readonly Package[] = buildPackages();

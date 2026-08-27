import { PICKUP_METHODS } from "./constants";
import type {
  PackingItem,
  Package,
  PickupMethod,
  Retailer,
  ShipmentStage,
  TradeStatement,
} from "./types";

/*
 * 출고 탭의 파생값은 전부 여기 있다. JSX 안에서 계산하지 않는다 —
 * 같은 수량 합이 아코디언 꼬리(`SKU 6건 · 55개`) · 표의 수량 열 · 우측 패널의
 * `선택 상품 합계` · 장끼의 `총 수량` 네 곳에서 쓰이는데, 흩어 놓으면 한 곳만
 * 고쳐도 화면끼리 숫자가 갈린다.
 *
 * ⚠️ 날짜 문자열은 Date로 되살리지 않는다. 목록 정렬은 `YYYY-MM-DDTHH:mm`의
 *    사전순이면 충분하고, Date로 만들면 서버(UTC)와 브라우저(KST)의 렌더 결과가
 *    갈려 하이드레이션이 깨진다. `new Date()`를 읽는 함수는 아래 stamp() 하나뿐이고
 *    그것도 렌더가 아니라 버튼을 누른 순간에만 부른다.
 */

/** 수량 합. 대기 줄이든 포장에 담긴 줄이든 같은 함수를 쓴다 */
export function sumQty(items: readonly PackingItem[]): number {
  return items.reduce((total, item) => total + item.qty, 0);
}

/** 포장 하나의 총 수량. 표의 `수량` 열과 상세 패널의 `총 수량`이 같은 값이어야 한다 */
export function packageQty(pkg: Package): number {
  return sumQty(pkg.lines);
}

/** 소매처 하나에 묶인 포장 대기 줄과 합계. 접힌 아코디언 행이 이 모양을 그린다 */
export interface ReadyGroup {
  retailer: Retailer;
  items: PackingItem[];
}

/** 소매처 하나에 묶인 포장 묶음들. `출고 대기` · `출고 완료` 단계가 함께 쓴다 */
export interface PackageGroup {
  retailer: Retailer;
  packages: Package[];
}

/**
 * 소매처별로 접는다. **줄이 하나도 없는 소매처는 목록에서 빠진다** —
 * 마지막 대기 줄까지 포장하면 그 소매처 행 자체가 사라져야 하기 때문이다.
 * 순서는 소매처 배열 순서를 그대로 따른다(코드 순).
 */
export function groupReadyItems(
  retailers: readonly Retailer[],
  items: readonly PackingItem[],
): ReadyGroup[] {
  return retailers
    .map((retailer) => ({
      retailer,
      items: items.filter((item) => item.retailerId === retailer.id),
    }))
    .filter((group) => group.items.length > 0);
}

/** 포장 묶음판. 단계(PACKED/SHIPPED)로 먼저 거른 배열을 받는다 */
export function groupPackages(
  retailers: readonly Retailer[],
  packages: readonly Package[],
): PackageGroup[] {
  return retailers
    .map((retailer) => ({
      retailer,
      packages: packages.filter((pkg) => pkg.retailerId === retailer.id),
    }))
    .filter((group) => group.packages.length > 0);
}

/**
 * 표의 줄 순서: **수령 방식으로 먼저 묶고**(직접 수령 → 사입삼촌) 묶음 안에서 주문 일시 최신순.
 * 수령 방식이 포장 단위를 가르는 축이라(판정 D7) 같은 방식끼리 붙어 있어야 한 번에 고른다.
 */
export function sortReadyItems(items: readonly PackingItem[]): PackingItem[] {
  return [...items].sort((a, b) => {
    const order =
      PICKUP_METHODS.indexOf(a.pickupMethod) -
      PICKUP_METHODS.indexOf(b.pickupMethod);
    if (order !== 0) return order;
    return b.orderedAt.localeCompare(a.orderedAt);
  });
}

/** 일시 최신순. 출고 대기는 포장 일시, 출고 완료는 출고 일시로 정렬한다(판정 D8) */
export function sortPackagesByDesc(
  packages: readonly Package[],
  key: (pkg: Package) => string,
): Package[] {
  return [...packages].sort((a, b) => key(b).localeCompare(key(a)));
}

/** 수령방식 단일 선택 필터. `전체`(FILTER_ALL)는 여기까지 오지 않고 호출부가 거른다 */
export function filterByPickupMethod(
  items: readonly PackingItem[],
  method: PickupMethod,
): PackingItem[] {
  return items.filter((item) => item.pickupMethod === method);
}

/**
 * 검색 대상은 **소매처명 · 소매처코드 · 그 소매처가 가진 상품명** 세 축이다(판정 D9).
 * placeholder가 `거래처·품명 검색`이라 품명까지 걸러야 말과 동작이 맞는다.
 */
export function matchesKeyword(
  retailer: Retailer,
  productNames: readonly string[],
  keyword: string,
): boolean {
  if (keyword === "") return true;
  const needle = keyword.toLowerCase();
  return (
    retailer.name.toLowerCase().includes(needle) ||
    retailer.code.toLowerCase().includes(needle) ||
    productNames.some((name) => name.toLowerCase().includes(needle))
  );
}

/** 칩에 붙는 건수 = 그 단계에 있는 **행의 개수**다(판정 D5). 소매처 수도 수량 합도 아니다 */
export function stageCounts(
  items: readonly PackingItem[],
  packages: readonly Package[],
): Record<ShipmentStage, number> {
  return {
    ready: items.length,
    packed: packages.filter((pkg) => pkg.status === "PACKED").length,
    shipped: packages.filter((pkg) => pkg.status === "SHIPPED").length,
  };
}

/** `YYYY-MM-DDTHH:mm` → [월, 일, 시각]. 문자열을 자르기만 한다 — Date를 만들지 않는다 */
function parseStamp(stamp: string): [string, string, string] {
  const [date = "", time = ""] = stamp.split("T");
  const [, month = "", day = ""] = date.split("-");
  return [String(Number(month)), String(Number(day)), time];
}

/** 표의 일시 열 `8/12 09:14` */
export function formatDateTime(stamp: string): string {
  const [month, day, time] = parseStamp(stamp);
  return `${month}/${day} ${time}`;
}

/** 패널·장끼의 일시 `8월 12일 14:20` — 표보다 자리가 넉넉해 말로 적는다 */
export function formatDateLabel(stamp: string): string {
  const [month, day, time] = parseStamp(stamp);
  return `${month}월 ${day}일 ${time}`;
}

/**
 * 지금 시각 → 목업이 쓰는 `YYYY-MM-DDTHH:mm`.
 *
 * **버튼을 누른 순간에만 부른다.** 렌더 중에 오늘을 읽으면 서버(UTC)와
 * 브라우저(KST)의 값이 달라 하이드레이션이 깨진다(재고 탭 formatMovementDate와 같은 이유).
 */
export function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 선택한 줄의 수령 방식이 섞였는가.
 * `package.pickup_method`가 단일 ENUM이라(§2.7) 섞인 선택은 한 묶음이 될 수 없다(판정 D7).
 */
export function hasMixedPickup(items: readonly PackingItem[]): boolean {
  return new Set(items.map((item) => item.pickupMethod)).size > 1;
}

/**
 * 포장할 수 있는 선택인가. 고른 게 없거나 수령 방식이 섞였으면 못 한다.
 *
 * 고르는 것 자체는 막지 않는다(게이트 Q3) — 체크박스를 회색으로 만들면 왜 회색인지
 * 설명할 자리가 없어서, 고르게 두고 버튼 옆에서 이유를 말한다.
 */
export function canPack(items: readonly PackingItem[]): boolean {
  return items.length > 0 && !hasMixedPickup(items);
}

/**
 * 다음 포장번호 `PKG-051`. 지금 있는 번호의 최댓값 + 1이다 —
 * 개수 + 1로 만들면 앞 번호가 지워졌을 때 이미 쓴 번호를 다시 발급한다.
 */
export function nextPackageNo(packages: readonly Package[]): string {
  const max = packages.reduce((highest, pkg) => {
    const n = Number(pkg.packageNo.replace("PKG-", ""));
    return Number.isNaN(n) ? highest : Math.max(highest, n);
  }, 0);
  return `PKG-${String(max + 1).padStart(3, "0")}`;
}

/**
 * 고른 줄들을 포장 묶음 하나로 만든다.
 * 수령 방식은 첫 줄에서 가져온다 — 여기 오는 선택은 이미 `canPack`을 통과해
 * 전부 같은 값이다.
 */
export function packageFromItems(
  packageNo: string,
  retailerId: string,
  items: readonly PackingItem[],
  packedAt: string,
): Package {
  const [first] = items;
  return {
    packageNo,
    retailerId,
    pickupMethod: first ? first.pickupMethod : "SELF_PICKUP",
    status: "PACKED",
    packedAt,
    shippedAt: null,
    statementNo: null,
    lines: [...items],
  };
}

/**
 * 표의 `상품 요약`. 품목이 하나면 품명만, 둘 이상이면 `오버핏 코튼 티셔츠 외 2건`.
 * 열 하나에 품명을 다 적으면 표가 가로로 늘어나 수량을 세로로 훑을 수 없다.
 */
export function lineSummaryLabel(lines: readonly PackingItem[]): string {
  const [first] = lines;
  if (!first) return "-";
  return lines.length === 1
    ? first.productName
    : `${first.productName} 외 ${lines.length - 1}건`;
}

/**
 * 다음 장끼번호 `JG-YYYYMMDD-NNN`. 날짜부는 **출고 처리 시각의 날짜**이고
 * `NNN`은 그날 발행 순번이다(판정 D6 · §2.8).
 *
 * 오늘 날짜는 인자로 받는다 — 이 함수가 직접 `new Date()`를 읽으면 렌더 중에
 * 불릴 여지가 생기고, 그러면 서버와 브라우저의 값이 갈린다.
 */
export function nextStatementNo(
  shippedAt: string,
  packages: readonly Package[],
): string {
  const datePart = shippedAt.slice(0, 10).replace(/-/g, "");
  const prefix = `JG-${datePart}-`;
  const issuedToday = packages.filter((pkg) =>
    pkg.statementNo?.startsWith(prefix),
  ).length;
  return `${prefix}${String(issuedToday + 1).padStart(3, "0")}`;
}

/**
 * 출고 완료로 넘어간 묶음. 상태·출고 일시·장끼번호 세 값이 **한 번에** 바뀐다 —
 * 나눠서 넣으면 장끼번호 없는 SHIPPED가 잠깐 존재해서 장끼 카드가 빈칸을 그린다.
 *
 * 미수 발생·재고 차감은 서버 트리거라 여기서 반영하지 않는다(판정 D10).
 */
export function shipPackage(
  pkg: Package,
  shippedAt: string,
  statementNo: string,
): Package {
  return { ...pkg, status: "SHIPPED", shippedAt, statementNo };
}

/** 장끼 품목표의 `옵션` 열. SKU = 색상 × 사이즈라 두 축을 합쳐 적는다(glossary §3) */
export function optionLabel(line: PackingItem): string {
  return `${line.color} / ${line.size}`;
}

/**
 * 출고된 묶음에서 장끼를 뽑는다. **출고 전에는 만들 수 없다** —
 * 장끼번호가 출고 완료 시점에 발번되기 때문이다(§2.8). 그래서 null을 돌려주고,
 * 부르는 쪽이 안내 문구로 갈라 준다.
 */
export function statementFromPackage(
  pkg: Package,
  retailer: Retailer,
  wholesalerName: string,
): TradeStatement | null {
  if (pkg.statementNo === null || pkg.shippedAt === null) return null;
  return {
    statementNo: pkg.statementNo,
    packageNo: pkg.packageNo,
    shippedAt: pkg.shippedAt,
    wholesalerName,
    retailer,
    pickupMethod: pkg.pickupMethod,
    lines: pkg.lines,
  };
}

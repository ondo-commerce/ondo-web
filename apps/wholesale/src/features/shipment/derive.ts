import { PICKUP_METHODS } from "./constants";
import type {
  PackingItem,
  Package,
  PickupMethod,
  Retailer,
  ShipmentStage,
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

/** 소매처 하나에 묶인 포장 묶음들. `포장 완료` · `출고 완료` 단계가 함께 쓴다 */
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

/** 아코디언 꼬리 `SKU 6건 · 55개` — 포장 대기 단계의 요약 단위는 대기 줄이다 */
export function readySummaryLabel(items: readonly PackingItem[]): string {
  return `SKU ${items.length}건 · ${sumQty(items)}개`;
}

/** 아코디언 꼬리 `PKG 3건 · 66개` — 포장 완료·출고 완료 단계는 묶음이 단위다 */
export function packageSummaryLabel(packages: readonly Package[]): string {
  return `PKG ${packages.length}건 · ${packages.reduce((total, pkg) => total + packageQty(pkg), 0)}개`;
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

/** 일시 최신순. 포장 완료는 포장 일시, 출고 완료는 출고 일시로 정렬한다(판정 D8) */
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

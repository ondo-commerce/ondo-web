import { QTY_UNIT } from "@/shared/qty";
import {
  BACKORDER_PATH,
  BACKORDER_SORTS,
  DEFAULT_BACKORDER_SORT,
  DROPPED_NOTICE,
  FILTER_ALL,
} from "./constants";
import type {
  BackorderLine,
  BackorderSort,
  BackorderSummary,
  DroppedWholesaler,
  EtaState,
  WholesalerChip,
} from "./types";

/**
 * 이 화면의 모든 수치가 여기서 나온다. **JSX 안에서 더하지 않는다.**
 *
 * 이 화면이 지켜야 하는 약속은 하나다 — **요약 3카드 · 툴바 카운터 · 표 · 합계가
 * 같은 집합에서 나온다.** 도매처 칩으로 좁혔는데 카드만 전체 값으로 남으면
 * "목록은 1줄인데 카드는 3건"이 된다(shipments F8 · settlements F7이 이미 두 번 겪었다).
 * 그래서 화면은 `filterByWholesaler` → `sortByOrderedAt`으로 **보이는 목록을 먼저 만들고**,
 * 그 하나를 `summarize`와 표에 같이 넘긴다.
 */

/* ────────────────────────────────────────────────────────────────────────
   주소 → 상태
   ──────────────────────────────────────────────────────────────────────── */

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * 주소의 `?wholesaler=`를 정리한다. **지금 미송이 있는 도매처가 아니면 `전체`로 떨어뜨린다.**
 *
 * 그대로 두면 칩 4개 중 아무것도 켜지지 않은 채 0건 화면이 뜬다 — 어느 축으로 좁혀진
 * 것인지 화면이 말하지 않고, "검색 결과가 없습니다"만 남는다(retail-shell · orders).
 * `shared/config/nav.ts`의 `resolveCategorySlug`와 같은 규약이다.
 */
export function resolveWholesalerId(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly string[],
): string {
  const value = one(params, "wholesaler");
  return value && allowed.includes(value) ? value : FILTER_ALL;
}

/**
 * `resolveWholesalerId`가 **무엇을 떨어뜨렸는지**. 떨어뜨린 게 없으면 `null`이다.
 *
 * 떨어뜨리는 동작(위)과 짝이다. 저쪽만 있으면 `?wholesaler=w-basic`이 조용히 전체
 * 41장이 되고, 거래처 관리 미송 배지(RT-66)를 타고 온 사장에게는 그게 `더베이직 41장`으로
 * 읽힌다. 뷰가 안내 한 줄을 띄우려면 **떨어뜨린 값 자체**가 필요하다.
 *
 * `all`은 떨어뜨린 게 아니라 고른 것이므로 여기서 빠진다.
 */
export function droppedWholesalerId(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly string[],
): string | null {
  const value = one(params, "wholesaler");
  if (!value || value === FILTER_ALL || allowed.includes(value)) return null;
  return value;
}

/**
 * 그 사실을 사장의 말로 옮긴다. 걸러진 게 없으면 `null`이고, 뷰는 안내를 안 그린다.
 *
 * 상호를 아는 값과 모르는 값이 갈린다 — 모르는 값에 상호 자리를 비워 두면
 * ` 미송은 지금 없어요`가 되고, id를 그대로 넣으면 `w-basic 미송은 지금 없어요`가 된다.
 */
export function droppedNoticeText(
  dropped: DroppedWholesaler | null,
): string | null {
  if (dropped === null) return null;

  return dropped.name === null
    ? DROPPED_NOTICE.unknown
    : `${dropped.name} ${DROPPED_NOTICE.knownSuffix}`;
}

/** 주소의 `?sort=`를 정리한다. 모르는 값(옛 링크·오타)은 기본 `오래된 순`으로 떨어뜨린다 */
export function resolveSort(
  params: Record<string, string | string[] | undefined>,
): BackorderSort {
  const value = one(params, "sort");

  return BACKORDER_SORTS.includes(value as BackorderSort)
    ? (value as BackorderSort)
    : DEFAULT_BACKORDER_SORT;
}

/**
 * 칩·정렬 링크의 주소. **기본값인 축은 주소에서 뺀다** — 아무것도 안 고른 화면의
 * 주소가 그냥 `/backorders`여서 공유했을 때 짧고, 무엇이 걸려 있는지가 주소에서 읽힌다.
 */
export function backorderHref(
  wholesalerId: string,
  sort: BackorderSort,
): string {
  const params = new URLSearchParams();
  if (wholesalerId !== FILTER_ALL) params.set("wholesaler", wholesalerId);
  if (sort !== DEFAULT_BACKORDER_SORT) params.set("sort", sort);

  const query = params.toString();
  return query ? `${BACKORDER_PATH}?${query}` : BACKORDER_PATH;
}

/** 정렬 토글이 갈 곳. 2값뿐이라 지금의 반대쪽이다 */
export function toggledSort(sort: BackorderSort): BackorderSort {
  return sort === "oldest" ? "latest" : "oldest";
}

/* ────────────────────────────────────────────────────────────────────────
   목록 만들기
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 필터 칩에 세울 도매처. **미송이 실제로 있는 곳만** 세운다 —
 * 고정 목록으로 두면 눌러도 0건인 칩이 생기고, 상호를 더미에 두 번 적게 된다.
 */
export function wholesalerChips(
  lines: readonly BackorderLine[],
): WholesalerChip[] {
  const seen = new Map<string, string>();
  for (const line of lines) seen.set(line.wholesalerId, line.wholesalerName);

  return [...seen].map(([id, name]) => ({ id, name }));
}

export function filterByWholesaler(
  lines: readonly BackorderLine[],
  wholesalerId: string,
): BackorderLine[] {
  return wholesalerId === FILTER_ALL
    ? [...lines]
    : lines.filter((line) => line.wholesalerId === wholesalerId);
}

/**
 * 주문일 오름/내림. 원본 배열을 건드리지 않는다 — `fixtures`의 모듈 하나를
 * 모든 요청이 같이 읽는다.
 */
export function sortByOrderedAt(
  lines: readonly BackorderLine[],
  sort: BackorderSort,
): BackorderLine[] {
  const list = [...lines];

  /* ISO 날짜라 문자열 비교가 곧 날짜 비교다. Date 객체를 만들면 타임존이 끼어든다 */
  return list.sort((a, b) =>
    sort === "latest"
      ? b.orderedAt.localeCompare(a.orderedAt)
      : a.orderedAt.localeCompare(b.orderedAt),
  );
}

/* ────────────────────────────────────────────────────────────────────────
   파생 수치
   ──────────────────────────────────────────────────────────────────────── */

/**
 * 예상 입고일 3상태(RT-58). 판정이 여기 한 곳에만 있어야 배지와 요약 카드가
 * 같은 말을 한다 — 두 벌이면 카드는 `지연 1건`인데 표에는 배지가 없는 화면이 된다.
 */
export function etaStateOf(line: BackorderLine, today: string): EtaState {
  if (line.etaDate === null) return "CHECKING";
  return line.etaDate < today ? "DELAYED" : "SCHEDULED";
}

/** 표 합계 행과 요약 카드가 같이 읽는 장수 합 */
export function sumBackorderQty(lines: readonly BackorderLine[]): number {
  return lines.reduce((total, line) => total + line.qty, 0);
}

/**
 * 요약 3카드 · 툴바 카운터 · 합계 행이 읽는 값 한 덩어리.
 *
 * **표에 실제로 서는 목록을 그대로 받는다.** 전체 목록을 따로 받아 세면 필터가
 * 카드에 안 걸리고, 그게 이 화면에서 가장 잘 나는 결함이다.
 */
export function summarize(
  visible: readonly BackorderLine[],
  today: string,
): BackorderSummary {
  const scheduled = visible.filter(
    (line) => etaStateOf(line, today) === "SCHEDULED",
  );
  const delayed = visible.filter(
    (line) => etaStateOf(line, today) === "DELAYED",
  );

  /* 확정된 것 중 **가장 이른 날짜** — 사장이 다음에 받을 물건이 언제인지다.
     0건이면 null이고, 화면은 날짜 대신 `아직 예정일이 없어요`를 쓴다 */
  const earliestEta = scheduled.reduce<string | null>(
    (earliest, line) =>
      line.etaDate !== null && (earliest === null || line.etaDate < earliest)
        ? line.etaDate
        : earliest,
    null,
  );

  return {
    waitingCount: visible.length,
    totalQty: sumBackorderQty(visible),
    scheduledCount: scheduled.length,
    earliestEta,
    delayedCount: delayed.length,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   표시 문자열
   ──────────────────────────────────────────────────────────────────────── */

/** `2026-08-16` → `2026.08.16`. 날짜 표기가 화면마다 갈리지 않게 여기 한 곳을 쓴다 */
export function formatDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

/** `16장`. 단위는 `shared/qty.ts` 하나를 읽는다 — 도매의 `개`와 섞이지 않게 */
export function qtyLabel(qty: number): string {
  return `${qty.toLocaleString("ko-KR")}${QTY_UNIT}`;
}

/** `아이보리 · Free`. 옵션 축은 색상 × 사이즈뿐이다 */
export function optionLabel(line: BackorderLine): string {
  return `${line.colorName} · ${line.sizeName}`;
}

/**
 * `주문 보기` 링크의 접근 가능한 이름.
 *
 * 이름이 전부 `주문 보기`면 보조기술에서 같은 링크 3개가 되어 어느 줄의 것인지
 * 고를 수 없다(orders F9). 줄을 특정하는 값(상품명 + 옵션)을 앞에 붙인다.
 */
export function orderLinkLabel(line: BackorderLine): string {
  return `${line.productName} ${optionLabel(line)} 주문 보기`;
}

/** 미송 행이 나온 통합 주문. 소매 주문 상세는 통합 주문 1건 단위다(§3-0 B) */
export function orderHref(line: BackorderLine): string {
  return `/orders/${line.orderNo}`;
}

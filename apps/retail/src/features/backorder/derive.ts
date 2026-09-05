import type { PageMeta } from "@ondo/api";
import { QTY_UNIT } from "@/shared/qty";
import {
  BACKORDER_PATH,
  BACKORDER_SORTS,
  DEFAULT_BACKORDER_SORT,
  DROPPED_NOTICE,
  FILTER_ALL,
  FIRST_PAGE,
  SIZE_LABEL,
} from "./constants";
import type {
  BackorderLine,
  BackorderPage,
  BackorderSort,
  BackorderSummary,
  BackorderWire,
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
 *
 * 그 집합은 **서버가 준 한 장(`size=100`)**이다. 서버에 도매처·정렬 파라미터가 없어서
 * (`04-wire.md` §3) 필터와 정렬은 받은 장 안에서만 걸린다.
 */

/* ────────────────────────────────────────────────────────────────────────
   wire → 뷰
   ──────────────────────────────────────────────────────────────────────── */

/** 한국 표준시 오프셋. DST가 없어 상수로 둔다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * ISO date-time(오프셋 포함) → 한국 날짜 `YYYY-MM-DD`.
 *
 * 서버의 `orderedAt`은 `OffsetDateTime`이라 `+09:00`일 수도 `Z`일 수도 있다. 앞 10글자를
 * 그냥 자르면 UTC로 온 밤 주문이 하루 전 날짜가 된다. `Intl`을 안 쓰는 이유는 서버(Node)와
 * 브라우저의 ICU 데이터가 갈릴 수 있어서다 — 오프셋 덧셈은 어디서나 같은 답을 낸다.
 */
export function toKstDate(isoDateTime: string): string {
  return new Date(Date.parse(isoDateTime) + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 이 화면이 쓰는 **오늘**. page가 요청 시점의 `Date`를 넘기고, 뷰는 이 문자열만 본다.
 *
 * 렌더 중에 `new Date()`를 여기저기서 부르지 않는 이유: 판정(`etaStateOf`)이 한 요청 안에서
 * 같은 날짜를 봐야 카드와 배지가 같은 말을 한다. 서버 컴포넌트라 하이드레이션 불일치는 없다.
 */
export function todayKst(now: Date): string {
  return toKstDate(now.toISOString());
}

/**
 * 서버 한 줄 → 화면 한 줄. **화면이 wire를 직접 읽지 않는다** — 필드 이름·null·단위
 * 변환이 전부 여기 한 곳이다.
 *
 * 생성 타입은 `expectedInboundDate`·`expectedInboundReason`을 non-optional로 보이지만
 * 스펙 설명은 "아직 안 적었으면 null"이다. `?? null`로 좁혀 `CHECKING` 판정에 넘긴다.
 * `expectedInboundReason`은 옮기지 않는다 — 소매 화면에 사유를 적을 자리가 없다(§5-2).
 */
export function toBackorderLine(wire: BackorderWire): BackorderLine {
  return {
    id: String(wire.backorderId),
    productName: wire.title,
    wholesalerId: String(wire.wholesaler.id),
    wholesalerName: wire.wholesaler.name,
    colorName: wire.colorName,
    sizeName: SIZE_LABEL[wire.size] ?? wire.size,
    qty: wire.qty,
    orderedAt: wire.orderedAt,
    orderedDate: toKstDate(wire.orderedAt),
    etaDate: wire.expectedInboundDate ?? null,
    orderNo: wire.orderNo,
    orderId: wire.orderId,
  };
}

/** 서버 `meta`(0-base) → 화면 페이지 위치(1-base) */
export function toBackorderPage(meta: PageMeta): BackorderPage {
  return {
    page: meta.page + 1,
    totalPages: meta.totalPages,
    totalElements: meta.totalElements,
  };
}

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
 * 떨어뜨리는 동작(위)과 짝이다. 저쪽만 있으면 `?wholesaler=12`가 조용히 전체가 되고,
 * 거래처 관리 미송 배지(RT-66)를 타고 온 사장에게는 그게 그 도매처의 미송으로 읽힌다.
 * 뷰가 안내 한 줄을 띄우려면 **떨어뜨린 값 자체**가 필요하다.
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
 * ` 미송은 지금 없어요`가 되고, id를 그대로 넣으면 `12 미송은 지금 없어요`가 된다.
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
 * 주소의 `?page=`(1-base)를 정리한다. 숫자가 아니거나 1 미만이면 첫 장이다.
 *
 * 범위를 넘는 큰 수는 여기서 못 막는다 — 몇 장인지는 서버가 답해야 안다. 그 경우 서버가
 * 빈 배열을 주고 화면은 0건 + 페이저로 돌아갈 길을 보여준다.
 */
export function resolvePage(
  params: Record<string, string | string[] | undefined>,
): number {
  const value = Number(one(params, "page"));
  return Number.isInteger(value) && value >= FIRST_PAGE ? value : FIRST_PAGE;
}

/**
 * 칩·정렬·페이지 링크의 주소. **기본값인 축은 주소에서 뺀다** — 아무것도 안 고른 화면의
 * 주소가 그냥 `/backorders`여서 공유했을 때 짧고, 무엇이 걸려 있는지가 주소에서 읽힌다.
 *
 * 칩과 정렬 링크는 page를 안 넘긴다(첫 장으로 돌아간다). 필터·정렬이 **받은 장 안에서**
 * 걸리는 것이라 3장에서 도매처를 고르면 그 장의 그 도매처만 남는데, 그게 첫 장에서
 * 시작한 사장이 기대하는 결과와 다르다.
 */
export function backorderHref(
  wholesalerId: string,
  sort: BackorderSort,
  page: number = FIRST_PAGE,
): string {
  const params = new URLSearchParams();
  if (wholesalerId !== FILTER_ALL) params.set("wholesaler", wholesalerId);
  if (sort !== DEFAULT_BACKORDER_SORT) params.set("sort", sort);
  if (page !== FIRST_PAGE) params.set("page", String(page));

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
 * 필터 칩에 세울 도매처. **받은 장에 실제로 있는 곳만** 세운다 —
 * 소매 스펙에 거래처 목록 path가 없기도 하고, 고정 목록으로 두면 눌러도 0건인 칩이 생긴다.
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
 * 주문 시각 오름/내림. 원본 배열을 건드리지 않는다.
 *
 * 문자열 비교가 아니라 `Date.parse`다 — `orderedAt`이 오프셋 붙은 date-time이라
 * `+09:00`과 `Z`가 섞이면 글자 순서와 시각 순서가 다르다.
 */
export function sortByOrderedAt(
  lines: readonly BackorderLine[],
  sort: BackorderSort,
): BackorderLine[] {
  const list = [...lines];
  const sign = sort === "latest" ? -1 : 1;

  return list.sort(
    (a, b) => sign * (Date.parse(a.orderedAt) - Date.parse(b.orderedAt)),
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
export function formatDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
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

/**
 * 미송 행이 나온 통합 주문. 스펙이 "주문 상세로 넘어갈 때 쓴다"고 못박은 `orderId`다 —
 * `orderNo`는 화면에 보여주는 번호이지 주소가 아니다.
 *
 * ⚠️ `/orders/[orderId]`는 아직 fixtures라 이 id로는 `OrderNotFound`가 뜬다. 주문 연동 회차가
 * 같은 `orderId`로 받으면 그때 맞물린다(`04-wire.md` §5).
 */
export function orderHref(line: BackorderLine): string {
  return `/orders/${line.orderId}`;
}

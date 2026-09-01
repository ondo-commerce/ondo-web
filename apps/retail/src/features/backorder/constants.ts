import type { BackorderSort } from "./types";

/** 이 화면의 경로. 칩·정렬 링크가 전부 여기서 주소를 만든다 */
export const BACKORDER_PATH = "/backorders";

/**
 * 도매처를 안 좁힌 상태. `features/catalog`에도 같은 이름의 상수가 있는데
 * **일부러 복제한다** — feature끼리는 직접 import 하지 않는다(CLAUDE.md).
 */
export const FILTER_ALL = "all";
export const FILTER_ALL_LABEL = "전체";

/**
 * 패널 머리 부제. **미송을 만드는 쪽이 소매가 아니라는 사실**을 화면에서 읽히게 한다(RT-59).
 *
 * ⚠️ 확정 와이어프레임은 `주문 내역이 포장 중으로 바뀌어요`라고 적었지만 **의도적으로 고쳤다.**
 * 소매 주문 상태 어휘 5종(확정 대기 · 접수됨 · 수령 가능 · 출고 완료 · 취소됨)에 `포장 중`이
 * 없다. 게이트 §3-0 C가 도매 `출고 대기` → 소매 `수령 가능`으로 확정했으므로(사양 §4 상태
 * 어휘 통일) 소매 어휘 밖의 단어를 화면에 남기지 않는다.
 */
export const BACKORDER_SUB =
  "미송은 도매처가 주문을 확정할 때 생겨요. 물건이 들어오면 이 목록에서 빠지고 주문 내역이 수령 가능으로 바뀌어요.";

/** 정렬 2값. 드롭다운을 지어내지 않고 토글 하나로 둔다 — 사양이 말한 축은 주문일 하나뿐이다 */
export const BACKORDER_SORTS: readonly BackorderSort[] = ["oldest", "latest"];
export const DEFAULT_BACKORDER_SORT: BackorderSort = "oldest";

export const SORT_LABEL: Record<BackorderSort, string> = {
  oldest: "오래된 순",
  latest: "최신 순",
};

/** 예상 입고일 배지 문구. 날짜가 있는 `SCHEDULED`는 배지가 아니라 평문이라 여기 없다 */
export const ETA_BADGE_LABEL = {
  DELAYED: "지연",
  CHECKING: "확인 중",
} as const;

/**
 * `지연` 행에만 붙는 보조 문구. 사장이 **다음에 무엇을 기다리면 되는지**를 화면이 말한다.
 * 변동 사유·원래 예상일은 여기 쓰지 않는다(§5-2 — 소매 화면에 자리가 없다).
 */
export const ETA_DELAYED_NOTE = "새 입고일을 안내할 예정이에요";

/**
 * 요약 3카드의 라벨과, **셀 것이 0건일 때의 보조 문구.**
 *
 * 0건인데 `2026.09.03 예정`이 남아 있으면 **틀린 날짜**가 화면에 서게 된다 —
 * 도매처를 좁히면 실제로 그 상태가 만들어진다.
 */
export const SUMMARY_LABEL = {
  waiting: "미송 대기",
  scheduled: "입고일 확정",
  delayed: "지연",
} as const;

export const SUMMARY_EMPTY_SUB = {
  scheduled: "아직 예정일이 없어요",
  delayed: "예상일이 지난 건이 없어요",
} as const;

/** 표 머리글. 순서가 곧 열 순서다 */
export const TABLE_HEADERS = {
  product: "상품",
  wholesaler: "도매처",
  option: "옵션",
  qty: "미송",
  orderedAt: "주문일",
  eta: "예상 입고일",
  /** 버튼 열. 화면에는 안 보이지만 보조기술에는 이름이 있어야 한다 */
  action: "주문",
} as const;

/** 표 전체의 접근 가능한 이름. `16장`이 무엇의 수량인지 보조기술에서 읽힌다 */
export const TABLE_CAPTION = "미송 대기 목록";

export const TOTAL_ROW_LABEL = "합계";

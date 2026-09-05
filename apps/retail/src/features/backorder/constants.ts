import type { BackorderSort } from "./types";

/** 이 화면의 경로. 칩·정렬·페이지 링크가 전부 여기서 주소를 만든다 */
export const BACKORDER_PATH = "/backorders";

/** 서버 path. 이 feature가 부르는 유일한 path다 — 스냅샷 `GET /api/retail/backorders` */
export const BACKORDER_API_PATH = "/api/retail/backorders";

/**
 * 한 번에 받는 장수. **BE 상한이 100이다**(`BackorderController.MAX_PAGE_SIZE` — 넘기면
 * `VALIDATION_FAILED`). 스펙에는 상한이 안 적혀 있어 여기 적어 둔다(`04-wire.md` §3).
 *
 * 기본값 20 대신 상한을 쓰는 이유: 화면에 페이저가 없었고 요약 3카드가 **받은 목록**으로
 * 계산된다. 20건씩 자르면 카드가 "지금 장"만 세는 폭이 넓어진다. 100을 넘는 사장에게만
 * `이전 · 다음`이 붙는다.
 */
export const BACKORDER_PAGE_SIZE = 100;

/** 첫 장. 주소의 `?page=`는 1-base이고 서버는 0-base라 여기서 한 번 뺀다 */
export const FIRST_PAGE = 1;

/**
 * 서버 사이즈 코드 → 화면 라벨. `FREE`만 다르다(사양 §4 라벨 통일 — `F`·`FREE`가 아니라 `Free`).
 * 나머지(`S`·`M`·`L`…)는 코드가 곧 라벨이라 여기 없다.
 */
export const SIZE_LABEL: Readonly<Record<string, string>> = { FREE: "Free" };

/** `이전 · 다음` 링크. 2장 이상일 때만 보인다 */
export const PAGER_LABEL = {
  prev: "이전",
  next: "다음",
  /** `1 / 3 페이지` 꼴로 위치를 말한다 */
  position: (page: number, totalPages: number) =>
    `${page} / ${totalPages} 페이지`,
} as const;

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

/**
 * 서버가 준 장이 **0건**일 때의 빈 상태 문구(RT-33 — 아이콘 · 한 줄 설명 · 다음 행동).
 *
 * 실서버에서는 미송 0건이 예외가 아니라 대부분 사장의 평소 상태다. 머리글 + `합계 0장`만
 * 서 있으면 화면이 고장난 건지 미송이 없는 건지 모른다(wire 회차 F1). 사양에 미송 전용
 * 문구가 없어 장바구니 빈 상태(`EMPTY_CART`)의 결을 따른다.
 *
 * 설명 한 줄은 `BACKORDER_SUB`와 같은 사실(미송은 도매처가 확정할 때 생긴다)을 되풀이하지
 * 않는다 — 부제가 바로 위 패널에 이미 서 있다. 여기서는 **다음에 어디를 보면 되는지**만 말한다.
 */
export const EMPTY_BACKORDERS = {
  title: "지금 기다리는 미송이 없어요",
  description:
    "주문한 물건이 전부 들어왔거나, 아직 도매처가 확정한 주문이 없어요.",
} as const;

export const TOTAL_ROW_LABEL = "합계";

/**
 * 주소의 `?wholesaler=`를 **못 걸어서 전체를 보여주는 중**이라고 말하는 문구.
 *
 * 없으면 화면이 조용히 거짓말을 한다 — 거래처 관리의 미송 배지(RT-66)를 타고
 * `?wholesaler=w-basic`으로 들어온 사장에게 `더베이직 미송 41장`으로 읽힌다.
 * 41장은 라비앙·코튼클럽·데님하우스 것이다.
 *
 * 상호에 조사를 붙이지 않는다(`더베이직은`/`라비앙은`) — 받침 유무로 은/는이 갈리는데
 * 상호는 더미에서 오는 값이라 여기서 판정할 수 없다. `<상호> 미송은` 형태로 피한다.
 */
export const DROPPED_NOTICE = {
  /** 상호를 아는 경우. **지금은 쓰이지 않는다** — 소매 스펙에 도매처 조회 path가 없다(§3) */
  knownSuffix: "미송은 지금 없어요. 전체 목록을 보여드릴게요.",
  /**
   * 상호를 모르는 경우. 실제 거래처인데 미송이 0건인 것과 오타·옛 링크를 서버 응답만으로는
   * 가를 수 없어서, 둘 다 참인 말로 적는다 — "확인하지 못했다"고 하면 실제 거래처에겐 거짓이다.
   */
  unknown: "그 도매처의 미송은 지금 없어요. 전체 목록을 보여드릴게요.",
} as const;

/**
 * 좁은 폭(≤960px) 카드 목록의 항목 라벨. **표 머리글과 같은 말을 쓴다** —
 * 같은 값을 폭에 따라 다른 이름으로 부르면 두 화면이 된다.
 */
export const CARD_LABEL = {
  qty: TABLE_HEADERS.qty,
  orderedAt: TABLE_HEADERS.orderedAt,
  eta: TABLE_HEADERS.eta,
} as const;

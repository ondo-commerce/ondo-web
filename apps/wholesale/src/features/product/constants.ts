import type { BadgeProps } from "@ondo/ui";
import type {
  PostStatusKey,
  ProductField,
  SkuSize,
  UploadState,
} from "./types";

/** `Badge`가 가진 색은 이 둘뿐이다 — 늘리지 않는다(게이트 G-2) */
type BadgeTone = NonNullable<BadgeProps["tone"]>;

/**
 * 사이즈 축의 **화면 순서.** 값은 스펙 enum 그대로고 순서만 여기서 정한다 —
 * 스펙은 `XS…2XL, FREE` 순인데 표에서는 Free를 앞에 세운다(잡화가 Free 하나뿐이라
 * 맨 뒤에 두면 한 칸만 저 끝에 켜진다).
 */
export const SIZES: readonly SkuSize[] = [
  "FREE",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
];

/**
 * 목록 한 페이지 크기. 스펙 상한(`size > 100`이면 400)이다.
 * 기본값 20을 안 쓰는 이유: 이 표는 세로 스크롤을 직접 받는 100행 밀도로 설계됐고,
 * 게시 필터가 서버에 없어 페이지 안에서 거른다(§3-1) — 페이지가 클수록 덜 샌다.
 */
export const PAGE_SIZE = 100;

/**
 * 목록 화면의 URL 파라미터. 검색·필터·페이지·선택이 전부 URL에 산다(ADR-0003).
 * 새로고침·뒤로가기·등록 후 "상세로 이동"이 이 이름들로 동작한다.
 */
export const LIST_PARAM = {
  query: "q",
  status: "status",
  /** 1-base. 서버 `page`는 0-base라 보낼 때 1 뺀다 */
  page: "page",
  /** 우측 상세에 열린 상품. 등록 직후 여기로 보낸다 */
  productId: "productId",
} as const;

/**
 * 게시 상태 라벨. **`NONE`(미게시)까지 포함해 세 값이다** — 상품은 게시글 없이도 존재하고
 * (`ProductView.post === null`), 목록에서는 그 상태도 한 칸에 같이 그려야 한다.
 * 상세 패널·수정 화면이 같은 문구를 쓰도록 여기 둔다(주문 탭 `ORDER_STATUS_LABEL`과 같은 자리).
 */
export const POST_STATUS_LABEL: Record<PostStatusKey, string> = {
  NONE: "미등록",
  ON_SALE: "판매중",
  SEASON_ENDED: "시즌종료",
};

/**
 * 배지 색은 둘뿐이다 — **진행 중인 것만 파랑**(게이트 G-2).
 * `미등록`과 `시즌종료`가 같은 회색이 되는 건 의도된 결과다. 둘의 구분은 배지 글자가 맡는다.
 */
export const POST_STATUS_TONE: Record<PostStatusKey, BadgeTone> = {
  NONE: "done",
  ON_SALE: "active",
  SEASON_ENDED: "done",
};

/**
 * 게시 필터의 `전체` 값. 상태 코드와 섞이지 않게 별도 값으로 둔다.
 * 주문 탭 `STATUS_FILTER_ALL`과 같은 규칙이지만 **상수를 따로 만든다** —
 * feature끼리는 상수를 공유하지 않는다 — eslint가 feature 간 직접 import를 막는다
 * (재고 탭 `FILTER_ALL`, 출고 탭 `FILTER_ALL`이 각자 있는 것과 같은 이유).
 */
export const POST_FILTER_ALL = "ALL";
export const FILTER_ALL_LABEL = "전체";

export const ALL_STATUS_LABEL = {
  [POST_FILTER_ALL]: FILTER_ALL_LABEL,
};

/**
 * 게시 필터가 가질 수 있는 값. **유니온을 손으로 쓴다** — 값 목록에서 역산하면
 * (`keyof typeof ...`) 게시 상태가 늘었을 때 컴파일이 안 깨져서 알 수가 없다.
 */
export type PostFilterValue = PostStatusKey | typeof POST_FILTER_ALL;

/**
 * 세그먼트에 세울 값과 그 순서. 미등록 → 판매중 → 시즌종료로 게시글의 일생을 따른다.
 *
 * 어느 칸을 세울지는 이 배열이 정한다 — 아래 라벨 표가 아니다
 * (`Object.keys`는 타입이 `string[]`으로 날아간다).
 */
export const POST_FILTER_VALUES: readonly PostFilterValue[] = [
  POST_FILTER_ALL,
  "NONE",
  "ON_SALE",
  "SEASON_ENDED",
];

/**
 * 세그먼트 칸의 라벨. `전체`까지 한 표에서 다 찾히므로 화면에서 `ALL`만 따로
 * 갈라내지 않아도 된다.
 *
 * 상태 라벨을 다시 쓰지 않고 `POST_STATUS_LABEL`을 펼친다 — 배지와 필터가 같은 문구를
 * 쓰게 강제하려는 것이다. 두 벌이 되면 `시즌종료`만 한쪽에서 `시즌 종료`가 된다.
 */
export const POST_FILTER_LABEL: Record<PostFilterValue, string> = {
  ...ALL_STATUS_LABEL,
  ...POST_STATUS_LABEL,
};

/**
 * 가격표 칸(판매가·주문 제한)의 **자릿수 상한.** 9자리 = 최대 999,999,999.
 *
 * 스펙은 둘 다 `int32`(2,147,483,647)인데 그 숫자를 사장에게 보여 줄 수는 없다. 자릿수로
 * 자르면 "9자리까지"라는 한 마디로 설명되고, 9자리는 전부 int32 안이다. 10자리를
 * 그대로 보내면 서버가 역직렬화에서 500을 낸다(dev-verify F3) — 칸 오류로 먼저 막는다.
 * `maxLength`로 자르지 않는 이유: 붙여넣은 `3000000000`이 `300000000`으로 조용히
 * 바뀌어 친 값과 다른 값이 저장된다(가격표가 문자열을 드는 이유와 같다).
 */
export const PRICE_INPUT_MAX_DIGITS = 9;
export const PRICE_INPUT_MAX = 10 ** PRICE_INPUT_MAX_DIGITS - 1;

/**
 * 서버 검증 실패(`errors[].field`)를 폼 칸에 붙일 때 아는 이름들. 순서는 화면 순서 —
 * 첫 오류 칸으로 포커스를 옮길 때 이 순서로 찾는다.
 *
 * 서버 필드명은 스펙에 없고 dev에서 본 것만 안다(dev-verify F4): `name`·`listing.title`은
 * 그대로, 나머지는 이 이름을 **접두어**로 갖는다 — `nameWellFormed`,
 * `listing.variantPrices[0].targetSpecified`. 접두어로 잇는 건 `toFieldErrors`가 하고,
 * 그래도 못 이은 이름은 `_form`으로 폼 위에 올린다 — 틀려도 사장이 아무 말도 못 보는 일은 없다.
 * 전체 목록은 BE에 요청해 둔 상태다(#210).
 */
export const PRODUCT_FIELD_ORDER: readonly ProductField[] = [
  "name",
  "categoryId",
  "colorOptions",
  "listing.title",
  "listing.description",
  "listing.images",
  "listing.variantPrices",
];

/**
 * 입력칸의 DOM id 접두어. 제출 후 **첫 오류 칸으로 포커스를 옮기려면** 칸을 id로
 * 찾아야 한다. 계정 feature와 같은 규칙이지만 접두어를 따로 둔다 — 상수를 feature
 * 사이에서 나누지 않는다.
 */
export function fieldId(field: ProductField): string {
  return `product-${field.replace(".", "-")}`;
}

export function errorId(field: ProductField): string {
  return `${fieldId(field)}-error`;
}

/** `aria-invalid`가 켜진 칸의 테두리. 색은 토큰이 정한다 */
export const INVALID_INPUT_CLASS = "aria-[invalid=true]:border-destructive";

/* ------------------------------------------------------------------------
 * 게시글 이미지 업로드 (#250)
 * ------------------------------------------------------------------------ */

/** 게시글 이미지 칸 수. 등록·대기·진행·실패 슬롯을 다 합쳐 이 수를 넘지 않는다 */
export const MAX_IMAGE_COUNT = 9;

/**
 * 1장 상한. 4 MiB = 4,194,304 (D18). 상한과 **같은** 크기는 통과한다.
 *
 * 목(`packages/api/src/mocks/wholesale/listingImage.ts`)에도 같은 값이 있다 — 역방향
 * import가 금지라 두 곳에 산다. 어긋나면 사전 검사를 통과한 파일이 413으로 돌아와
 * "다시 고르기형" 실패 슬롯으로 드러난다.
 */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** 파일 선택 다이얼로그의 `accept`와 사전 검사의 형식 목록이 같은 값을 본다(D19) */
export const IMAGE_ACCEPT = "image/jpeg,image/png";

/**
 * 동시에 나가는 업로드 수(D20). 프록시가 본문을 통째로 읽어 함수 메모리가 동시 수에
 * 비례한다 — 3 × 4 MiB는 상한 추정이지 보장치가 아니라 상수 하나로 둔다.
 */
export const IMAGE_UPLOAD_CONCURRENCY = 3;

/**
 * 사전 검사 거절 사유별 문구. 격자 아래 목록 한 줄의 파일명 뒤에 붙는다.
 * HEIC 안내는 괄호 한 토막만 — 긴 문장은 다른 파일의 이유를 묻는다(DD8).
 */
export const IMAGE_REJECT_MESSAGE = {
  TYPE: "jpg·png만 올릴 수 있어요 — 아이폰은 사진 앱 공유 › 'JPEG로 보내기'",
  EMPTY: "비어 있는 파일이에요 (0바이트)",
  SIZE: "4MB까지 올릴 수 있어요 — 사진 앱에서 크기를 줄여 주세요",
} as const;

/**
 * 업로드 중 세션이 끊겼을 때 저장 버튼 옆 한 줄(#252 S4-3). 다시 로그인해 이어 저장하는 길은
 * 아직 없어서(다음 회차) 지금 보장할 수 있는 것만 말한다 — 화면은 남고, 저장은 잠긴다.
 */
export const SESSION_LOST_MESSAGE =
  "로그인이 끊겼어요. 다시 로그인하기 전엔 저장할 수 없어요.";

/** 격자가 없거나 비었을 때의 업로드 요약. 등록 화면이 `함께 게시`를 끄면 여기로 돌아온다 */
export const IDLE_UPLOAD_STATE: UploadState = {
  uploading: false,
  failedCount: 0,
};

/**
 * 격자 칸·`+`·`×`에 붙이는 포커스 표시. `packages/ui`의 `Button`·`AddSlot`은 포커스 링이
 * 꺼져 있고 그 파일은 읽기 전용이다(#254 F6). `account`에 같은 값이 있지만 feature끼리
 * import 하지 않으므로 복제한다. **`outline-hidden`을 걸지 않는다** — 기본 링을 지운 채
 * 아무것도 안 그리는 것이 `account` 앞 회차 결함이었다.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

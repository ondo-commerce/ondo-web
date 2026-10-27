import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";
import type { ProductListQuery } from "@/shared/api/product";
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  LIST_PARAM,
  MAX_IMAGE_COUNT,
  PAGE_SIZE,
  POST_FILTER_ALL,
  POST_FILTER_VALUES,
  PRICE_INPUT_MAX,
  PRICE_INPUT_MAX_DIGITS,
  PRODUCT_FIELD_ORDER,
  type PostFilterValue,
} from "./constants";
import type {
  CategoryNode,
  ColorGroup,
  ColorItem,
  ImageRejectReason,
  ListingUpsertRequest,
  PostFormValue,
  PostStatus,
  PostStatusKey,
  PriceValue,
  ProductCreateRequest,
  ProductDetail,
  ProductField,
  ProductFormSnapshot,
  ProductFormValue,
  ProductRowView,
  ProductSummary,
  ProductUpdateRequest,
  ProductView,
  SkuSize,
  SkuView,
  UploadFailure,
  UploadSlotStatus,
} from "./types";
import { formatNumber } from "@/shared/lib/format";

/* ------------------------------------------------------------------------
 * wire → 뷰
 * ------------------------------------------------------------------------ */

/**
 * 게시 상태를 한 축의 값으로 좁힌다.
 *
 * 게시글이 없는 상품은 상태값 자체가 없어서 `NONE`으로 떨어뜨린다. 생성 타입은
 * non-optional(`codegen --properties-required-by-default`)이지만 서버는 게시글이 없으면
 * null을 준다 — 그 사실을 아는 곳이 여기 한 곳이다. 목록 배지와 필터가 **같은 기준으로
 * 갈라야** 하므로 `?? "NONE"`을 각자 쓰지 않는다.
 */
export function postStatusKey(
  status: PostStatus | null | undefined,
): PostStatusKey {
  return status ?? "NONE";
}

/** `여성 > 상의 > 티셔츠`. 서버가 리프까지의 경로를 순서대로 준다 */
export function categoryLabel(
  path: readonly { name: string }[] | null | undefined,
): string {
  return (path ?? []).map((c) => c.name).join(" > ");
}

export function toProductRowView(summary: ProductSummary): ProductRowView {
  return {
    id: summary.id,
    code: String(summary.productNumber),
    name: summary.name,
    categoryLabel: categoryLabel(summary.categoryPath),
    colorCount: summary.colorCount,
    skuCount: summary.variantCount,
    postStatus: postStatusKey(summary.listingStatus),
  };
}

export function toProductView(detail: ProductDetail): ProductView {
  const colorOptions = detail.colorOptions ?? [];
  // 게시글 없음 = null. 스펙엔 nullable이 없어 타입은 객체지만 런타임엔 null이 온다
  const listing = detail.listing ?? null;

  return {
    id: detail.id,
    name: detail.name,
    code: String(detail.productNumber),
    categoryPath: detail.categoryPath ?? [],
    categoryLabel: categoryLabel(detail.categoryPath),
    colors: colorOptions.map((o) => ({
      id: o.color.id,
      name: o.color.name,
      hex: o.color.hex,
    })),
    // 서버 정렬(색상은 그룹→색상, variant는 사이즈)을 그대로 믿는다. 여기서 다시 정렬하지 않는다
    skus: colorOptions.flatMap((o) =>
      (o.variants ?? []).map((v): SkuView => ({
        id: v.id,
        code: String(v.variantNumber),
        colorId: o.color.id,
        color: o.color.name,
        size: v.size,
        stock: v.stockQty,
        reservedQty: v.allocatedQty,
        backorderQty: v.backorderQty,
        availableQty: v.availableQty,
        // 게시글이 없으면 서버가 null을 준다(스펙엔 nullable이 없다). `listing`과 같은 사정
        orderLimit: v.orderLimit ?? null,
        avgCost: v.avgCost,
        price: v.salePrice ?? null,
      })),
    ),
    post: listing
      ? {
          id: listing.id,
          name: listing.title,
          description: listing.description,
          images: (listing.images ?? []).map((img) => img.url),
          allowSinglePiece: listing.isSinglePieceAllowed,
          status: listing.status,
        }
      : null,
  };
}

/**
 * 이미지 칸에 든 문자열이 `next/image`에 넘길 수 있는 주소인가. 아니면 `ListingImage`가
 * 아이콘으로 대신한다. `blob:`을 받는 이유: 업로드 중 미리보기가 로컬 blob인데 이걸
 * 막으면 올리는 사진이 아이콘으로 떨어진다(wire-product F8의 연장, S2-2).
 * `next/image`는 `blob:`·`data:`를 알아서 unoptimized로 다룬다.
 */
export function isImageUrl(value: string): boolean {
  return /^(https?:\/\/|blob:)/.test(value);
}

/* ------------------------------------------------------------------------
 * 게시글 이미지 업로드 (#250)
 * ------------------------------------------------------------------------ */

/**
 * 서버 앞의 사전 검사(S2-6). 순서가 곧 우선순위다 — 형식이 아니면 크기를 볼 이유가 없다.
 * 상한과 같은 크기는 통과한다. `type`은 브라우저가 확장자로 추정한 값이라 "확장자는 jpg인데
 * 내용은 HEIC"는 여기서 못 잡고 서버(목은 매직 넘버)가 415로 돌려보낸다.
 */
export function rejectImageFile(file: {
  name: string;
  size: number;
  type: string;
}): ImageRejectReason | null {
  if (!IMAGE_ACCEPT.split(",").includes(file.type)) return "TYPE";
  if (file.size === 0) return "EMPTY";
  if (file.size > IMAGE_MAX_BYTES) return "SIZE";
  return null;
}

/**
 * 남은 칸(S2-8). 대기·진행·보류·실패 칸도 칸을 차지한다 — 실패 칸을 빼야 칸이 돌아온다.
 * `pending`은 등록 전 슬롯 전부(대기·진행·보류), `failed`는 실패 칸이다.
 */
export function remainingImageSlots(count: {
  registered: number;
  pending: number;
  failed: number;
}): number {
  return Math.max(
    0,
    MAX_IMAGE_COUNT - count.registered - count.pending - count.failed,
  );
}

/**
 * 실패 코드 → 복구 종류와 문구(S1-4). `describeError`를 쓰지 않는 이유: 그건 화면 전체용이라
 * 413을 "재시도 가능"으로 보지만 파일 오류는 재전송으로 안 풀린다(§9-8).
 * 모르는 코드는 재시도형 — 다시 보내 보는 게 빼기보다 싸다.
 */
export function uploadFailure(code: string): UploadFailure {
  switch (code) {
    case WHOLESALE_ERROR_CODE.UNSUPPORTED_FILE_TYPE:
      return {
        kind: "repick",
        short: "jpg·png만 돼요",
        message: "jpg·png만 올릴 수 있어요. 다시 골라 주세요",
      };
    case WHOLESALE_ERROR_CODE.FILE_TOO_LARGE:
      return {
        kind: "repick",
        short: "4MB를 넘어요",
        message:
          "4MB까지 올릴 수 있어요. 사진 앱에서 크기를 줄여 다시 골라 주세요",
      };
    case WHOLESALE_ERROR_CODE.VALIDATION_FAILED:
      // 사전 검사를 지난 파일이 400이면 서버가 본 몸통이 비어 있는 경우뿐이다(§5-4)
      return {
        kind: "repick",
        short: "빈 파일이에요",
        message: "비어 있는 파일이에요. 다시 골라 주세요",
      };
    case WHOLESALE_ERROR_CODE.UNAUTHENTICATED:
    case WHOLESALE_ERROR_CODE.NOT_APPROVED:
      return { kind: "auth" };
    default:
      return {
        kind: "retry",
        short: "올리지 못했어요",
        message: "올리지 못했어요",
      };
  }
}

/**
 * 선택 순서를 지켜 `images[]`에 넘길 수 있는 **앞쪽 연속 구간**(S2-12). 앞 칸이 아직
 * 대기·진행 중이면 뒤에 끝난 칸은 보류한다 — B가 A보다 먼저 끝나도 `대표`는 A다.
 * 실패 칸은 건너뛴다(나중에 재시도해 성공하면 그때의 끝에 붙는다).
 */
export function orderCompleted<T extends { status: UploadSlotStatus }>(
  slots: readonly T[],
): T[] {
  const ready: T[] = [];
  for (const slot of slots) {
    if (slot.status === "failed") continue;
    if (slot.status !== "done") break;
    ready.push(slot);
  }
  return ready;
}

/**
 * 실패 칸 재시도. 대기로 되돌리면서 **큐 끝으로 옮긴다**(§4-4 "그때의 끝에 붙는다").
 *
 * 원래 자리에서 대기로만 바꾸면 `orderCompleted`가 그 칸 앞에서 멈춰, 실패로 이미
 * 건너뛰었던 뒤쪽 완료분이 다시 보류되고 대표 순서까지 바뀐다(F1). 실패한 칸은
 * 선택 순서에서 빠진 것이고, 재시도는 "지금 다시 고른 것"과 같은 순서다.
 * 같은 파일·같은 멱등키는 그대로다 — 자리만 바뀐다. 못 찾으면 그대로 돌려준다.
 */
export function requeueForRetry<
  T extends { slotId: string; status: UploadSlotStatus; failure: unknown },
>(slots: readonly T[], slotId: string): T[] {
  const target = slots.find((s) => s.slotId === slotId);
  if (target === undefined) return [...slots];
  return [
    ...slots.filter((s) => s.slotId !== slotId),
    { ...target, status: "queued", failure: null },
  ];
}

/**
 * 저장 버튼 옆 한 줄. 대기·진행 칸이 있으면 잠금 안내가 실패 안내보다 앞선다 —
 * 잠긴 이유를 먼저 말해야 한다. `null`이면 문구 없음.
 */
export function uploadNote(state: {
  uploading: boolean;
  failedCount: number;
}): { text: string; danger: boolean } | null {
  if (state.uploading) return { text: "사진 올리는 중…", danger: false };
  if (state.failedCount > 0)
    return {
      text: `실패한 사진 ${state.failedCount}장은 저장되지 않아요`,
      danger: true,
    };
  return null;
}

/* ------------------------------------------------------------------------
 * 마스터
 * ------------------------------------------------------------------------ */

/** 그룹 → 색상 2단을 평평하게. 옵션 표·가격표가 id로 색을 찾을 때 쓴다 */
export function flattenColors(groups: readonly ColorGroup[]): ColorItem[] {
  return groups.flatMap((g) => g.colors ?? []);
}

/**
 * 트리에서 id로 노드를 찾아 그 자식 목록을 준다. 대→중→소 Select가 상위 선택에 따라
 * 아래 목록을 바꾸는 데 쓴다. 못 찾으면 빈 배열 — 상위를 아직 안 고른 상태다.
 */
export function categoryChildren(
  tree: readonly CategoryNode[],
  parentId: string,
): CategoryNode[] {
  if (parentId === "") return [];
  const id = Number(parentId);
  for (const node of tree) {
    if (node.id === id) return node.children ?? [];
    const found = categoryChildren(node.children ?? [], parentId);
    if (found.length > 0) return found;
  }
  return [];
}

/* ------------------------------------------------------------------------
 * 목록 URL ↔ 요청
 * ------------------------------------------------------------------------ */

export interface ProductListParams {
  q: string;
  status: PostFilterValue;
  /** 1-base. 화면과 URL이 보는 값 */
  page: number;
  /** 우측 상세에 열린 상품. 없으면 null */
  productId: number | null;
}

/** URL에서 목록 상태를 읽는다. 모르는 값·깨진 값은 기본값으로 — URL은 사람이 고칠 수 있다 */
export function parseListParams(
  searchParams: URLSearchParams,
): ProductListParams {
  const rawStatus = searchParams.get(LIST_PARAM.status);
  const status =
    POST_FILTER_VALUES.find((v) => v === rawStatus) ?? POST_FILTER_ALL;

  const rawPage = Number(searchParams.get(LIST_PARAM.page));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawProductId = Number(searchParams.get(LIST_PARAM.productId));
  const productId =
    Number.isInteger(rawProductId) && rawProductId > 0 ? rawProductId : null;

  return {
    q: (searchParams.get(LIST_PARAM.query) ?? "").trim(),
    status,
    page,
    productId,
  };
}

/**
 * URL 파라미터를 고친 쿼리스트링. `null`은 지운다 — 기본값(빈 검색·전체·1페이지)은
 * URL에 안 남겨서 `/products`가 늘 같은 주소로 읽히게 한다.
 */
export function withListParams(
  current: URLSearchParams,
  patch: Partial<Record<keyof typeof LIST_PARAM, string | null>>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    const name = LIST_PARAM[key as keyof typeof LIST_PARAM];
    if (value === null || value === undefined) next.delete(name);
    else next.set(name, value);
  }
  return next.toString();
}

export function toListQuery(params: ProductListParams): ProductListQuery {
  return {
    q: params.q === "" ? undefined : params.q,
    page: params.page - 1,
    size: PAGE_SIZE,
  };
}

/**
 * URL의 `page`가 서버가 가진 장 수를 넘었나. 북마크·뒤로가기로 들어온 옛 주소는
 * 서버가 빈 장을 준다 — 그걸 `검색 결과가 없습니다`로 그리면 돌아갈 길이 없다(wire-product F6).
 * `totalPages`가 0(빈 목록)이어도 1페이지는 범위 안이다.
 */
export function isPageOutOfRange(page: number, totalPages: number): boolean {
  return page > Math.max(totalPages, 1);
}

/**
 * `이전`이 갈 장. 범위 밖 장에서는 한 장 앞이 아니라 **마지막 실제 장**으로 —
 * `?page=9`에서 `이전`을 눌러 8로 가면 또 빈 장이다.
 */
export function previousPage(page: number, totalPages: number): number {
  return Math.min(page - 1, Math.max(totalPages, 1));
}

/**
 * 게시 상태 필터. **받은 페이지 안에서만** 거른다 — `GET /products`에 상태 파라미터가
 * 없어서다. 다음 페이지에 있는 판매중 상품은 이 페이지에 안 보인다. 서버 필터가
 * 생기면 이 함수는 지우고 `toListQuery`에 실린다.
 */
export function filterByPostStatus(
  rows: readonly ProductRowView[],
  status: PostFilterValue,
): ProductRowView[] {
  if (status === POST_FILTER_ALL) return [...rows];
  return rows.filter((r) => r.postStatus === status);
}

/* ------------------------------------------------------------------------
 * 폼 ↔ 뷰 · 요청
 * ------------------------------------------------------------------------ */

/** 가격표 행·`prices` 키. 색상 id와 사이즈로 SKU 하나를 가리킨다 */
export function priceRowId(colorId: number, size: SkuSize): string {
  return `${colorId}:${size}`;
}

export const EMPTY_PRODUCT_FORM: ProductFormValue = {
  name: "",
  category: ["", "", ""],
  options: [],
};

export const EMPTY_POST_FORM: PostFormValue = {
  name: "",
  description: "",
  // 서버가 준 URL만 들어온다(`PostImageGrid` → `onAdd`). 더미를 두면 그대로 요청에 실린다
  images: [],
  allowSinglePiece: false,
  prices: {},
};

/** 아직 안 친 칸. 빈 문자열이라 요청에는 0으로 간다(`parseIntegerText`) */
export const EMPTY_PRICE_VALUE: PriceValue = { orderLimit: "", price: "" };

/**
 * 가격표 칸에 들어갈 수 있는 글자 — **0 이상 정수의 숫자뿐**이다. 빈 칸도 유효하다(=0).
 *
 * 소수점·부호·`e`·쉼표는 여기서 걸린다. `type="number"`에 맡기지 않는 이유는
 * 브라우저가 `45.5`·`-3`·`1e5`를 스스로 받아 주고, `Number()`로 바꾸면 `455`·`3`·`5`가
 * 되어 친 값과 다른 값이 저장되기 때문이다(계좌번호 `ACCOUNT_NO_SHAPE`와 같은 규칙).
 */
export function isIntegerText(text: string): boolean {
  return /^\d*$/.test(text);
}

/**
 * 정수 글자가 상한 안인가. **자릿수로 본다** — `PRICE_INPUT_MAX_DIGITS`자리면 전부
 * `PRICE_INPUT_MAX` 이하다. 한 글자씩 쳐도, 붙여넣어도 같은 판정이라 10자리가 되는
 * 순간 칸이 빨개진다.
 */
export function isWithinIntegerMax(text: string): boolean {
  return text.length <= PRICE_INPUT_MAX_DIGITS;
}

/** 칸이 지금 빨개야 하는가 — 정수가 아니거나 상한을 넘었다. 가격표의 `aria-invalid`가 이것이다 */
export function isIntegerInput(text: string): boolean {
  return isIntegerText(text) && isWithinIntegerMax(text);
}

/**
 * `isIntegerText`를 통과한 문자열만 받는다. 빈 칸은 0 — 주문 제한 0 = 무제한.
 * 판매가 0은 **서버가 안 막는다**(dev-verify F6: 그대로 0원 ON_SALE이 된다). 그래서
 * 판매가는 보내기 전에 `missingPriceRowIds`로 잡는다.
 */
export function parseIntegerText(text: string): number {
  return text === "" ? 0 : Number(text);
}

/** `parseIntegerText`의 반대. 서버 숫자를 칸 글자로 — 없는 값(null)은 빈 칸이다 */
export function integerText(value: number | null): string {
  return value === null ? "" : String(value);
}

/** 판매가가 비었나. 빈 칸과 `0`은 같은 뜻이다 — 둘 다 0원으로 나간다 */
export function isPriceMissing(text: string): boolean {
  return isIntegerText(text) && parseIntegerText(text) === 0;
}

/**
 * 요청 `variantPrices[i]`의 i번째가 가리키는 가격표 행 id. **`toListingRequest`와 같은 순서**다
 * (색상 순 → 그 색의 사이즈 순). 서버가 `listing.variantPrices[i].*`로 지적하면 이 배열의
 * i번째 행이 그 칸이다 — 순서가 어긋나면 엉뚱한 행이 빨개지므로 두 곳이 같은 함수를 쓴다.
 */
export function requestPriceRowIds(product: ProductFormValue): string[] {
  return product.options.flatMap((option) =>
    option.sizes.map((size) => priceRowId(option.color.id, size)),
  );
}

/**
 * 요청에 실릴 행(옵션 매트릭스의 색×사이즈) 가운데 `failed`에 걸리는 행의 id.
 * `prices`에 남은 옛 키(지운 색)는 보지 않는다 — 안 보낼 칸이 저장을 막으면 안 된다.
 * 아직 안 친 칸은 빈 값으로 본다(요청에도 그렇게 실린다).
 */
function priceRowIdsWhere(
  product: ProductFormValue,
  post: PostFormValue,
  failed: (value: PriceValue) => boolean,
): string[] {
  return requestPriceRowIds(product).filter((id) =>
    failed(post.prices[id] ?? EMPTY_PRICE_VALUE),
  );
}

/** 정수가 아닌 글자(소수점·부호·쉼표)가 든 행 */
export function invalidPriceRowIds(
  product: ProductFormValue,
  post: PostFormValue,
): string[] {
  return priceRowIdsWhere(
    product,
    post,
    (v) => !(isIntegerText(v.price) && isIntegerText(v.orderLimit)),
  );
}

/** 정수지만 자릿수 상한을 넘은 행. 그대로 보내면 서버가 int32 역직렬화에서 500이다 */
export function oversizedPriceRowIds(
  product: ProductFormValue,
  post: PostFormValue,
): string[] {
  return priceRowIdsWhere(
    product,
    post,
    (v) => !(isWithinIntegerMax(v.price) && isWithinIntegerMax(v.orderLimit)),
  );
}

/** 판매가가 빈 칸·0인 행. 사이즈를 켠 SKU 전부가 대상이다 */
export function missingPriceRowIds(
  product: ProductFormValue,
  post: PostFormValue,
): string[] {
  return priceRowIdsWhere(product, post, (v) => isPriceMissing(v.price));
}

/** 상품에 담긴 값을 폼 초기값으로 편다 */
export function toProductForm(product: ProductView): ProductFormValue {
  const [large, medium, small] = product.categoryPath;
  return {
    name: product.name,
    category: [
      large ? String(large.id) : "",
      medium ? String(medium.id) : "",
      small ? String(small.id) : "",
    ],
    options: product.colors.map((color) => ({
      id: `opt-${color.id}`,
      color: { id: color.id, name: color.name, hex: color.hex },
      sizes: product.skus
        .filter((s) => s.colorId === color.id)
        .map((s) => s.size),
    })),
  };
}

export function toPostForm(product: ProductView): PostFormValue {
  return {
    name: product.post?.name ?? "",
    description: product.post?.description ?? "",
    images: product.post?.images ?? [],
    allowSinglePiece: product.post?.allowSinglePiece ?? false,
    prices: Object.fromEntries(
      product.skus.map((s) => [
        priceRowId(s.colorId, s.size),
        // 칸은 문자열을 든다(`PriceValue`). 서버 숫자를 그대로 글자로.
        // null(게시글 없음)은 빈 칸 — "null" 글자가 들어가면 정수 검증에 걸려 빨개진다.
        // 빈 판매가는 저장 때 `missingPriceRowIds`가 잡으니 여기서 0으로 메우지 않는다
        { orderLimit: integerText(s.orderLimit), price: integerText(s.price) },
      ]),
    ),
  };
}

/**
 * 게시글 요청 본문. `variantPrices`는 옵션 매트릭스의 **모든** 색×사이즈를 채운다 —
 * 스펙: "전 variant를 빠짐없이". 판매가가 빈 행은 `validateProductForm`이 먼저 막는다
 * (서버는 0원을 그대로 받아 게시한다 — dev-verify F6).
 *
 * 행이 SKU를 가리키는 방법은 **한쪽뿐**이다(서버 `targetSpecified`: "variantId 또는
 * (colorId, size) 중 한쪽만"). `existing`에 색상 id + 사이즈가 같은 SKU가 있으면(수정)
 * `variantId`만 실어 서버가 기존 것을 고치게 하고, 없으면(등록·새로 켠 사이즈)
 * `colorId`+`size`만 실어 새 variant를 만들게 한다. 둘을 같이 실으면 400이다(dev-verify F2).
 *
 * 행 순서는 `requestPriceRowIds`와 같아야 한다 — 서버가 `variantPrices[i]`로 지적한 행을
 * 그 배열로 되짚는다(#210).
 */
export function toListingRequest(
  product: ProductFormValue,
  post: PostFormValue,
  existing: readonly SkuView[] = [],
): ListingUpsertRequest {
  return {
    title: post.name,
    description: post.description,
    images: post.images,
    isSinglePieceAllowed: post.allowSinglePiece,
    variantPrices: product.options.flatMap((option) =>
      option.sizes.map((size) => {
        const value = post.prices[priceRowId(option.color.id, size)];
        const known = existing.find(
          (s) => s.colorId === option.color.id && s.size === size,
        );
        // 정수 문자열이라는 건 `validateProductForm`이 먼저 보장한다
        const salePrice = parseIntegerText(value?.price ?? "");
        const orderLimit = parseIntegerText(value?.orderLimit ?? "");
        return known
          ? { variantId: known.id, salePrice, orderLimit }
          : { colorId: option.color.id, size, salePrice, orderLimit };
      }),
    ),
  };
}

/** `listing: null` = 상품만 등록(스펙). 체크를 안 했으면 게시글 폼 값은 버린다 */
export function toCreateRequest(
  product: ProductFormValue,
  post: PostFormValue | null,
): ProductCreateRequest {
  return {
    name: product.name.trim(),
    categoryId: Number(product.category[2]),
    colorOptions: product.options.map((o) => ({
      colorId: o.color.id,
      sizes: o.sizes,
    })),
    // 스펙 타입은 non-optional 객체지만 "null이면 상품만"이 계약이다
    listing: (post
      ? toListingRequest(product, post)
      : null) as unknown as ListingUpsertRequest,
  };
}

/** 두 게시글 요청이 같은 내용인가. `toListingRequest`가 만든 것끼리만 비교한다 */
function isSameListingRequest(
  a: ListingUpsertRequest,
  b: ListingUpsertRequest,
): boolean {
  const aPrices = a.variantPrices ?? [];
  const bPrices = b.variantPrices ?? [];
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.isSinglePieceAllowed === b.isSinglePieceAllowed &&
    (a.images ?? []).join("\n") === (b.images ?? []).join("\n") &&
    aPrices.length === bPrices.length &&
    aPrices.every((p, i) => {
      const q = bPrices[i];
      return (
        q !== undefined &&
        p.variantId === q.variantId &&
        p.colorId === q.colorId &&
        p.size === q.size &&
        p.salePrice === q.salePrice &&
        p.orderLimit === q.orderLimit
      );
    })
  );
}

/**
 * PATCH 본문에 `listing`을 실을지. 생략 = 무변경이라 보낼 이유가 있을 때만 싣는다.
 *
 * - 게시글이 없는 상품: **게시글 폼에 손댄 흔적이 있을 때**(→ 서버가 생성 분기).
 *   제목만 보면 판매가·설명을 채우고 제목을 비운 저장이 오류 없이 성공하면서 채운 값이
 *   조용히 버려진다(PR #160 리뷰). 폼 초기값(`toPostForm`)과 다르면 보낼 대상으로 보고,
 *   빈 제목은 `validateProductForm`이 `listing.title`로 잡는다. 양쪽에 같은 `product`를
 *   두는 이유: 사이즈만 켠 것으로 게시글 작성을 강요하면 안 된다.
 * - 게시글이 있는 상품: **폼으로 만든 요청이 서버 값으로 만든 요청과 다를 때.**
 *   게시 상태는 보지 않는다 — 제목·판매가를 고친 뒤 `시즌 종료`로 바꿔 저장하면
 *   잠긴 폼에 고친 값이 그대로 보이는데 요청에서 빠져 조용히 버려졌다(wire-product F1).
 *   상태 자체는 PATCH가 받지 않으므로(스펙) 시즌 종료·재개 호출이 따로 뒤따른다.
 *
 * 폼끼리가 아니라 **요청끼리** 비교하는 이유: `variantPrices`는 전체 교체라(스펙)
 * 게시글 칸은 그대로여도 사이즈를 하나 켜면 행이 늘어 보내야 한다.
 */
export function shouldSendListing(
  current: ProductView,
  product: ProductFormValue,
  post: PostFormValue,
): boolean {
  if (current.post === null) {
    return !isSameListingRequest(
      toListingRequest(product, post, current.skus),
      toListingRequest(product, toPostForm(current), current.skus),
    );
  }
  return !isSameListingRequest(
    toListingRequest(product, post, current.skus),
    toListingRequest(toProductForm(current), toPostForm(current), current.skus),
  );
}

export function toUpdateRequest(
  product: ProductFormValue,
  post: PostFormValue,
  current: ProductView,
): ProductUpdateRequest {
  const sendListing = shouldSendListing(current, product, post);

  return {
    name: product.name.trim(),
    categoryId: Number(product.category[2]),
    colorOptions: product.options.map((o) => ({
      colorId: o.color.id,
      sizes: o.sizes,
    })),
    // 생성 타입은 `listing`을 required로 보지만 계약은 "생략 = 무변경"이다(스펙 설명).
    // undefined는 JSON 직렬화에서 빠지므로 wire에는 키 자체가 안 실린다
    listing: (sendListing
      ? toListingRequest(product, post, current.skus)
      : undefined) as unknown as ListingUpsertRequest,
  };
}

/* ------------------------------------------------------------------------
 * 검증 · 오류
 * ------------------------------------------------------------------------ */

export type ProductFormErrors = FormErrors<ProductField> & {
  /**
   * 서버가 지적한 가격표 행의 id(`priceRowId`). 문구는 `listing.variantPrices` 한 줄이고
   * 이건 **어느 행인지**만 가리킨다 — 서버 `listing.variantPrices[i].*`의 i를 요청 순서로
   * 되짚은 것(`serverPriceRowIds`). 그 행의 칸이 빨개지고 첫 오류 포커스가 거기로 간다(#210).
   */
  priceRowIds?: readonly string[];
};

/**
 * 보내기 전에 잡는 것 — **서버에 못 보낼 값**과 **서버가 안 잡아 주는 값.** 리프
 * 카테고리가 없으면 `categoryId`가 NaN이 되고, 옵션이 없으면 SKU가 0개이며, 사이즈 없는
 * 색은 서버가 거절하거나 SKU 없는 색으로 남는다(`sizelessOptionIds`). 가격표는
 * 정수가 아니면 못 보내고, 자릿수를 넘기면 서버가 500을 내고, 판매가 0은 서버가 그대로
 * 게시한다(dev-verify F3·F6) — 셋 다 여기서 막는다. 나머지 규칙(길이)은 서버 검증에
 * 맡기고 그 답을 칸에 붙인다 — 규칙을 두 벌 들면 한쪽만 바뀐다.
 *
 * 가격표 오류는 한 번에 하나만 말한다. 정수 아님 → 자릿수 → 판매가 없음 순서다 —
 * 앞의 것을 못 고치면 뒤의 판정이 의미가 없다.
 *
 * `requireImages`(D21): **판매 중 상태로 저장되는 게시글**은 사진이 1장 이상이어야 한다 —
 * 마켓에 오르는 순간 썸네일이 있어야 해서다. 등록 화면은 `함께 게시`면 항상(새 게시글은
 * `ON_SALE`로 만들어진다), 수정 화면은 저장 시점 상태 토글이 정한다. 시즌 종료로 저장되면
 * 면제 — 옛 0장 게시글이 격자가 잠긴 채 막다른 길에 갇히지 않게(§9-11).
 */
export function validateProductForm(
  product: ProductFormValue,
  post: PostFormValue | null,
  { requireImages = false }: { requireImages?: boolean } = {},
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  if (product.name.trim() === "") errors.name = "품명을 입력해 주세요.";
  if (product.category[2] === "") errors.categoryId = "소분류까지 골라 주세요.";
  if (!product.options.some((o) => o.sizes.length > 0))
    errors.colorOptions = "색상을 고르고 사이즈를 하나 이상 켜 주세요.";
  else if (sizelessOptionIds(product).length > 0)
    errors.colorOptions =
      "사이즈를 켜지 않은 색상이 있어요. 사이즈를 켜거나 그 색상을 빼 주세요.";
  if (post && post.name.trim() === "")
    errors["listing.title"] = "게시글 이름을 입력해 주세요.";
  if (post && requireImages && post.images.length === 0)
    errors["listing.images"] = LISTING_IMAGES_REQUIRED_MESSAGE;
  if (post) {
    const priceError = priceTableError(product, post);
    if (priceError) errors["listing.variantPrices"] = priceError;
  }
  return errors;
}

/** `validateProductForm`의 이미지 필수 문구. 수정 화면이 게시글을 안 보내는 저장에서도 같은 말을 쓴다 */
export const LISTING_IMAGES_REQUIRED_MESSAGE =
  "대표 이미지를 1장 이상 올려 주세요.";

/**
 * 폼이 초기값에서 벗어났는가(S3-15, D22). `취소` 확인 모달과 `beforeunload` 경고의 조건이다.
 *
 * **값으로 비교한다.** 참조 비교면 같은 값을 다시 친 뒤(품명 한 글자 넣고 지움) "바뀌었다"가
 * 되어 아무것도 안 바꾼 사장에게 되묻는다. 가격표는 키 순서가 달라도 같은 값이면 같다 —
 * `toPostForm`이 만든 순서와 사장이 고친 순서가 다를 수 있다.
 *
 * 업로드 슬롯은 격자가 드는 상태라 인자가 아니다 — 호출부가 `isProductFormDirty(...) || uploading`
 * 으로 합친다. `publishToMarket`(등록)·`status`(수정)는 화면마다 한쪽만 있다.
 */
export function isProductFormDirty(
  initial: ProductFormSnapshot,
  current: ProductFormSnapshot,
): boolean {
  if (initial.publishToMarket !== current.publishToMarket) return true;
  if (initial.status !== current.status) return true;
  const a = initial.product;
  const b = current.product;
  if (
    a.name !== b.name ||
    a.category.join("\n") !== b.category.join("\n") ||
    a.options.length !== b.options.length ||
    a.options.some((o, i) => {
      const p = b.options[i];
      return (
        p === undefined ||
        o.id !== p.id ||
        o.color.id !== p.color.id ||
        o.sizes.join(",") !== p.sizes.join(",")
      );
    })
  )
    return true;
  const x = initial.post;
  const y = current.post;
  if (
    x.name !== y.name ||
    x.description !== y.description ||
    x.allowSinglePiece !== y.allowSinglePiece ||
    x.images.join("\n") !== y.images.join("\n")
  )
    return true;
  const xKeys = Object.keys(x.prices).sort();
  const yKeys = Object.keys(y.prices).sort();
  if (xKeys.join("\n") !== yKeys.join("\n")) return true;
  return xKeys.some((key) => {
    const p = x.prices[key];
    const q = y.prices[key];
    return p?.price !== q?.price || p?.orderLimit !== q?.orderLimit;
  });
}

/**
 * 사이즈를 하나도 안 켠 색상(`OptionDraft.id`). 그대로 보내면 `colorOptions`에
 * `{colorId, sizes: []}`로 실려 서버가 `OPTION_REQUIRED`로 거절하거나 SKU 없는 색을
 * 만든다(wire-product F5). 조용히 빼지 않는다 — 사장이 고른 색이 요청에서 사라지면
 * 저장은 됐는데 색이 없는 이유를 모른다. 대신 그 행을 가리켜 막는다.
 */
export function sizelessOptionIds(product: ProductFormValue): string[] {
  return product.options.filter((o) => o.sizes.length === 0).map((o) => o.id);
}

/** 가격표 아래 한 줄. 어느 칸인지는 칸의 aria-invalid가 가리킨다(`PostPriceTable`) */
function priceTableError(
  product: ProductFormValue,
  post: PostFormValue,
): string | null {
  if (invalidPriceRowIds(product, post).length > 0)
    return "판매가와 주문 제한은 숫자만 입력해 주세요. 소수점·쉼표·부호는 뺍니다.";
  if (oversizedPriceRowIds(product, post).length > 0)
    return `판매가와 주문 제한은 ${formatNumber(PRICE_INPUT_MAX)}까지 입력할 수 있어요.`;
  if (missingPriceRowIds(product, post).length > 0)
    return "판매가를 입력해 주세요. 0원으로는 마켓에 올릴 수 없어요.";
  return null;
}

/**
 * 칸을 고치면 그 칸의 오류는 지운다. 사장이 고친 뒤에도 빨간 줄이 남아 있으면
 * "아직 틀렸다"로 읽힌다. 폼 전체 오류(`_form`)도 같이 지운다 — 다시 보내면 새 답이 온다.
 */
export function clearProductErrors(
  errors: ProductFormErrors,
  prev: ProductFormValue,
  next: ProductFormValue,
): ProductFormErrors {
  const rest: ProductFormErrors = { ...errors };
  delete rest._form;
  if (prev.name !== next.name) delete rest.name;
  if (prev.category !== next.category) delete rest.categoryId;
  if (prev.options !== next.options) delete rest.colorOptions;
  return rest;
}

export function clearPostErrors(
  errors: ProductFormErrors,
  prev: PostFormValue,
  next: PostFormValue,
): ProductFormErrors {
  const rest: ProductFormErrors = { ...errors };
  delete rest._form;
  if (prev.name !== next.name) delete rest["listing.title"];
  if (prev.description !== next.description) delete rest["listing.description"];
  if (prev.images !== next.images) delete rest["listing.images"];
  if (prev.prices !== next.prices) {
    delete rest["listing.variantPrices"];
    delete rest.priceRowIds;
  }
  return rest;
}

/**
 * 이미지 채널(`onImagesChange`)은 값을 받지 않고 **갱신 함수**를 받는다 — 업로드 응답은
 * 사장의 입력이 아니라 뒤늦게 오는 콜백이라 그 시점의 `images`를 닫은 값으로 만들면 앞 장을
 * 덮어쓴다(#250 §4-2). 값이 없으니 `clearPostErrors`의 참조 비교를 못 하고, 그 칸 오류만 지운다.
 */
export function clearImagesError(errors: ProductFormErrors): ProductFormErrors {
  const rest: ProductFormErrors = { ...errors };
  delete rest._form;
  delete rest["listing.images"];
  return rest;
}

export function firstInvalidField(
  errors: ProductFormErrors,
): ProductField | undefined {
  return PRODUCT_FIELD_ORDER.find((f) => errors[f] !== undefined);
}

/**
 * 서버 실패를 폼 오류로. `VALIDATION_FAILED`는 `errors[]`를 칸별로 붙이고, 정책 코드
 * (리프 아님·옵션 없음·가격 없음 …)는 **코드로** 해당 칸을 가리킨다 — 서버 문구는 칸
 * 아래 그대로 보여 주되 어느 칸인지는 코드가 정한다. 모르는 실패면 `null`이라 호출부가
 * 폼 위 한 줄로 보낸다.
 *
 * 실서버 필드명은 칸 이름 그대로가 아니다 — `nameWellFormed`, `listing.variantPrices[0].targetSpecified`
 * (dev-verify F4). 칸으로 잇는 건 `toFieldErrors`의 접두어 매칭이 하고, 가격표는 여기서
 * 한 번 더 **행**까지 짚는다(`priceRowIds`). `product`는 그 행 순서를 되짚는 데 쓴다.
 */
export function toProductFormErrors(
  error: unknown,
  product: ProductFormValue,
): ProductFormErrors | null {
  const validation = toFieldErrors(error, PRODUCT_FIELD_ORDER);
  if (validation) {
    const priceRowIds = serverPriceRowIds(error, product);
    return priceRowIds.length > 0 ? { ...validation, priceRowIds } : validation;
  }
  if (!isApiError(error)) return null;

  const field = fieldOfCode(error.code);
  return field ? { [field]: error.message } : null;
}

/** 서버 필드명 `listing.variantPrices[i]…`의 i */
const VARIANT_PRICE_INDEX = /^listing\.variantPrices\[(\d+)\]/;

/**
 * 서버가 `listing.variantPrices[i].*`로 지적한 행들의 id. i는 요청 `variantPrices` 순서라
 * `requestPriceRowIds`로 되짚는다. 같은 행을 여러 번 지적해도 한 번, 범위 밖 i는 버린다
 * (그때는 `listing.variantPrices` 한 줄만 남아 표 자체로 포커스가 간다).
 */
export function serverPriceRowIds(
  error: unknown,
  product: ProductFormValue,
): string[] {
  if (!isApiError(error)) return [];
  const ids = requestPriceRowIds(product);
  const found = new Set<string>();
  for (const item of error.fieldErrors) {
    const index = VARIANT_PRICE_INDEX.exec(item.field)?.[1];
    const id = index === undefined ? undefined : ids[Number(index)];
    if (id !== undefined) found.add(id);
  }
  return [...found];
}

function fieldOfCode(code: string): ProductField | null {
  switch (code) {
    case WHOLESALE_ERROR_CODE.CATEGORY_NOT_FOUND:
    case WHOLESALE_ERROR_CODE.CATEGORY_NOT_LEAF:
      return "categoryId";
    case WHOLESALE_ERROR_CODE.OPTION_REQUIRED:
    case WHOLESALE_ERROR_CODE.COLOR_DUPLICATED:
    case WHOLESALE_ERROR_CODE.SIZE_DUPLICATED:
      return "colorOptions";
    case WHOLESALE_ERROR_CODE.PRICE_REQUIRED:
      return "listing.variantPrices";
    default:
      return null;
  }
}

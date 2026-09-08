import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";
import {
  LIST_PARAM,
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
  ListingUpsertRequest,
  PostFormValue,
  PostStatus,
  PostStatusKey,
  PriceValue,
  ProductCreateRequest,
  ProductDetail,
  ProductField,
  ProductFormValue,
  ProductRowView,
  ProductSummary,
  ProductUpdateRequest,
  ProductView,
  SkuSize,
  SkuView,
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

/** 이미지 칸에 든 문자열이 실제 URL인가. fixtures 시절의 `IMG 1` 같은 라벨과 가른다 */
export function isImageUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
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

/** 서버에 보낼 쿼리. 게시 상태는 서버 파라미터가 없어 여기 없다(§3-1) */
export interface ProductListQuery {
  q: string | undefined;
  /** 0-base */
  page: number;
  size: number;
}

export function toListQuery(params: ProductListParams): ProductListQuery {
  return {
    q: params.q === "" ? undefined : params.q,
    page: params.page - 1,
    size: PAGE_SIZE,
  };
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
  // 업로드 API가 없어 채울 길이 없다. 더미를 두면 그대로 요청에 실린다
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
 * 요청에 실릴 행(옵션 매트릭스의 색×사이즈) 가운데 `failed`에 걸리는 행의 id.
 * `prices`에 남은 옛 키(지운 색)는 보지 않는다 — 안 보낼 칸이 저장을 막으면 안 된다.
 * 아직 안 친 칸은 빈 값으로 본다(요청에도 그렇게 실린다).
 */
function priceRowIdsWhere(
  product: ProductFormValue,
  post: PostFormValue,
  failed: (value: PriceValue) => boolean,
): string[] {
  return product.options.flatMap((option) =>
    option.sizes
      .map((size) => priceRowId(option.color.id, size))
      .filter((id) => failed(post.prices[id] ?? EMPTY_PRICE_VALUE)),
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

export type ProductFormErrors = FormErrors<ProductField>;

/**
 * 보내기 전에 잡는 것 — **서버에 못 보낼 값**과 **서버가 안 잡아 주는 값.** 리프
 * 카테고리가 없으면 `categoryId`가 NaN이 되고, 옵션이 없으면 SKU가 0개다. 가격표는
 * 정수가 아니면 못 보내고, 자릿수를 넘기면 서버가 500을 내고, 판매가 0은 서버가 그대로
 * 게시한다(dev-verify F3·F6) — 셋 다 여기서 막는다. 나머지 규칙(길이)은 서버 검증에
 * 맡기고 그 답을 칸에 붙인다 — 규칙을 두 벌 들면 한쪽만 바뀐다.
 *
 * 가격표 오류는 한 번에 하나만 말한다. 정수 아님 → 자릿수 → 판매가 없음 순서다 —
 * 앞의 것을 못 고치면 뒤의 판정이 의미가 없다.
 */
export function validateProductForm(
  product: ProductFormValue,
  post: PostFormValue | null,
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  if (product.name.trim() === "") errors.name = "품명을 입력해 주세요.";
  if (product.category[2] === "") errors.categoryId = "소분류까지 골라 주세요.";
  if (!product.options.some((o) => o.sizes.length > 0))
    errors.colorOptions = "색상을 고르고 사이즈를 하나 이상 켜 주세요.";
  if (post && post.name.trim() === "")
    errors["listing.title"] = "게시글 이름을 입력해 주세요.";
  if (post) {
    const priceError = priceTableError(product, post);
    if (priceError) errors["listing.variantPrices"] = priceError;
  }
  return errors;
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
  if (prev.prices !== next.prices) delete rest["listing.variantPrices"];
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
 */
export function toProductFormErrors(error: unknown): ProductFormErrors | null {
  const validation = toFieldErrors(error, PRODUCT_FIELD_ORDER);
  if (validation) return validation;
  if (!isApiError(error)) return null;

  const field = fieldOfCode(error.code);
  return field ? { [field]: error.message } : null;
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

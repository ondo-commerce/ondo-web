import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";
import {
  LIST_PARAM,
  PAGE_SIZE,
  POST_FILTER_ALL,
  POST_FILTER_VALUES,
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
        orderLimit: v.orderLimit,
        avgCost: v.avgCost,
        price: v.salePrice,
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
        { orderLimit: s.orderLimit, price: s.price },
      ]),
    ),
  };
}

/**
 * 게시글 요청 본문. `variantPrices`는 옵션 매트릭스의 **모든** 색×사이즈를 채운다 —
 * 스펙: "전 variant를 빠짐없이". 가격표에 아직 안 친 칸은 0으로 간다(서버가
 * `PRICE_REQUIRED`로 돌려주고, 그 오류는 가격표 위에 붙는다).
 *
 * `existing`을 주면(수정) 색상 id + 사이즈가 같은 기존 SKU의 `variantId`를 붙인다 —
 * 그래야 서버가 새 variant를 만들지 않고 기존 것을 고친다.
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
        return {
          ...(known ? { variantId: known.id } : {}),
          colorId: option.color.id,
          size,
          salePrice: value?.price ?? 0,
          orderLimit: value?.orderLimit ?? 0,
        };
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

/**
 * PATCH 본문. 생략 = 무변경이라 `listing`은 보낼 이유가 있을 때만 싣는다:
 * 게시글이 있고 잠기지 않았거나(판매중), 없던 상품이 제목을 채웠을 때(→ 서버가 생성 분기).
 * 시즌 종료로 잠긴 폼은 값이 못 바뀌었으므로 안 보낸다.
 */
export function shouldSendListing(
  current: ProductView,
  post: PostFormValue,
  status: PostStatus,
): boolean {
  return current.post !== null
    ? status !== "SEASON_ENDED"
    : post.name.trim() !== "";
}

export function toUpdateRequest(
  product: ProductFormValue,
  post: PostFormValue,
  current: ProductView,
  status: PostStatus,
): ProductUpdateRequest {
  const sendListing = shouldSendListing(current, post, status);

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
 * 보내기 전에 잡는 것 — **서버에 못 보낼 값**만. 리프 카테고리가 없으면 `categoryId`가
 * NaN이 되고, 옵션이 없으면 SKU가 0개다. 나머지 규칙(길이·가격)은 서버 검증에 맡기고
 * 그 답을 칸에 붙인다 — 규칙을 두 벌 들면 한쪽만 바뀐다.
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
  return errors;
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

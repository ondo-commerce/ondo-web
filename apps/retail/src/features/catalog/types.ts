/**
 * 마켓 탐색이 다루는 단위. **소매가 보는 것은 상품이 아니라 게시글이다** —
 * 도매 ERP의 `Product`(재고 단위)와 이름이 겹치지만 같은 것이 아니다.
 * 소매에는 현재고·원가·마진이 없고, 도매처가 마켓에 올린 것만 보인다.
 */

/** 사이즈 축. 상품마다 쓰는 값이 다르지만 목록 자체는 고정이다 (도매 `SizeName`과 같은 목록) */
export type SizeName = "Free" | "XS" | "S" | "M" | "L" | "XL" | "2XL";

/**
 * 마켓에서의 노출 상태.
 *
 * `SEASON_ENDED`(시즌 종료)와 `UNPUBLISHED`(게시 내림)는 **둘 다 주문이 잠기지만
 * 다른 사건이다** — 시즌 종료는 상품의 생애가 끝난 것이고, 게시 내림은 도매처가
 * 게시글만 내린 것이라 다시 올라올 수 있다. 그래서 목록에서의 취급도 다르다:
 * 시즌 종료는 흐린 카드로 남고, 게시 내림은 목록에서 아예 빠진다.
 */
export type ListingStatus = "ON_SALE" | "SEASON_ENDED" | "UNPUBLISHED";

/** 마켓 목록 카드 한 장이 쓰는 값 전부 */
export interface CatalogProduct {
  id: string;
  name: string;
  /**
   * 품번. **도매 `SU-18` 형식**이다(게이트 Q3, 2026-08-31).
   * 확정 와이어프레임의 `ST-002`는 더미 문자열이라 쓰지 않는다.
   */
  code: string;
  wholesalerId: string;
  /** 카드에 그대로 찍히는 상호. 도매처 화면을 안 거쳐도 누구 물건인지 보여야 한다 */
  wholesalerName: string;
  /**
   * 카테고리 축은 **셸 카테고리 바 8종과 같은 값**이다(`shared/config/nav.ts`).
   * 게이트 Q2는 카테고리를 도매 3단(대>중>소)으로 정했고, 이 8종은 그 중 화면에
   * 세우는 표시용 묶음이다 — 3단 경로 자체는 상품 상세 브레드크럼이 갖는다.
   */
  categorySlug: string;
  /** 고정 팔레트 26종 중 하나씩. 자유 입력이 아니다 — 필터의 기준값 (게이트 Q4) */
  colors: string[];
  sizes: SizeName[];
  /** 게시된 SKU 판매가의 최솟값. 카드에 찍히는 값이 이것이다 */
  priceMin: number;
  /** 최댓값. `priceMin`과 같으면 카드에 `~`를 붙이지 않는다 */
  priceMax: number;
  status: ListingStatus;
  /** 이 소매처가 전에 주문한 적 있는 상품. 카드에 `구매 이력` 배지가 붙는다 */
  purchased: boolean;
  /** 찜 초기값. 화면 안에서 끄고 켜는 것은 뷰가 들고 있다(서버 저장이 없다) */
  favorited: boolean;
  /** 도매처가 마켓에 올린 날. `최신순` 정렬 축 (ISO 날짜) */
  listedAt: string;
  /** 찜한 시각. `최근 찜한 순` 정렬 축. 찜하지 않았으면 null */
  favoritedAt: string | null;
}

/**
 * 도매처 홈 머리에 서는 값.
 *
 * **진행 중 · 미송 · 미결제 잔액 · 마지막 입금이 여기 없다.** 그 넷은 거래 원장에서
 * 나오는 값이라 원본이 `features/settlement`이고, 같은 숫자를 여기에도 적어 두었더니
 * 무드온이 거래처 목록과 도매처 홈에서 다른 말을 했다(F1 · #128). 도매처 홈은 이제
 * 그 값을 `app/`에서 `TradeStats`로 받는다 — 이 파일은 마켓이 아는 것만 안다.
 */
export interface Wholesaler {
  id: string;
  name: string;
  /** 상호 첫 글자. 이미지가 없어 이니셜 사각형으로 대신한다 */
  initial: string;
  /** 청평화패션몰 2층 24호 */
  location: string;
  /** 20:00~06:00 — 동대문 도매는 밤에 연다 */
  businessHours: string;
  /** 누적 주문 건수. **산식이 §3-D에서 끊겨 있어 여전히 더미다** — 원장에 주문 축이 없다 */
  orderCount: number;
}

/** 툴바가 좁히는 네 축. 값은 전부 문자열이고 `전체`는 `FILTER_ALL` 한 값이다 */
export interface CatalogFilter {
  category: string;
  color: string;
  size: string;
  price: string;
}

/** 정렬 축. 화면마다 고를 수 있는 것이 다르다(찜 목록만 `최근 찜한 순`을 갖는다) */
export type CatalogSort =
  "latest" | "price-asc" | "price-desc" | "favorited-desc";

"use client";

import { Panel } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OptionTable } from "./OptionTable";
import { ProductGallery } from "./ProductGallery";
import { SummaryBar } from "./SummaryBar";
import { PRICE_HINT, QTY_UNIT, TRADE_TERMS } from "../constants";
import {
  describeAddToCartError,
  describePartialAdd,
  draftKey,
  orderTotals,
  parseQty,
  priceRangeLabel,
  toCartItems,
  withoutAdded,
  type QtyIssue,
} from "../derive";
import type {
  AddToCartResult,
  CartItemDraft,
  ColorGroup,
  ProductDetail,
} from "../types";
import { useProductFavorite } from "@/features/catalog";

/**
 * 상품 상세. **읽는 화면이라 1180px 중앙 정렬**이고 2열(좌 갤러리 480 / 우 정보)이다.
 * ≤60rem에서 1열로 접힌다 — 휴대폰에서 사진과 옵션이 나란히 설 자리가 없다.
 *
 * **수량** 상태를 이 화면 하나가 통째로 들고 있다. 옵션 표(오른쪽 열 안)와 합계
 * 바(패널 바닥)는 DOM에서 멀리 떨어져 있지만 같은 값을 본다 — 각자 세면 한쪽만
 * 안 따라오는 화면이 된다. 그래서 상세 전체가 클라이언트 컴포넌트다(첫 HTML은
 * 여전히 서버에서 완성돼 내려간다 — `product`는 `page.tsx`가 `serverApi()`로 받았다).
 *
 * 잠긴 상태(시즌 종료·게시 내림)의 배너가 없다 — 상세 응답에 그 신호가 없고,
 * dev 실측으로 내려간 게시글은 404라 이 화면에 오지 않는다(`04-wire.md` §3).
 *
 * `장바구니 담기`는 `features/cart`의 뮤테이션이 보낸다. feature끼리 직접 잇지
 * 않으므로 `app/`의 조립부가 `onAddToCart`로 넘긴다 — 이 화면은 무엇을 보낼지만
 * 만들고(`toCartItems`) 결과를 받아 문구로 바꾼다.
 */
export function ProductDetailView({
  product,
  onAddToCart,
}: {
  product: ProductDetail;
  /**
   * 조합마다 하나씩 `POST /cart-items`. **reject하지 않고** 담긴 것과 못 담은 것을
   * 갈라 돌려준다 — 부분 성공을 화면이 알아야 성공분을 두 번 담지 않는다(F2)
   */
  onAddToCart: (items: readonly CartItemDraft[]) => Promise<AddToCartResult>;
}) {
  /* 칸에 있는 **글자 그대로**를 들고 있다. 숫자로 바꿔 두면 `45.5`를 친 사장에게
     무엇이 잘못됐는지 되돌려 줄 방법이 없다 (`parseQty` 주석 참조) */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /* 걸린 이유는 값과 따로 산다. 상한 초과는 값을 500으로 되돌리는데, 그러면
     값만 봐서는 왜 500이 됐는지 알 수 없어서 문구가 같이 사라진다 */
  const [issues, setIssues] = useState<Record<string, QtyIssue | null>>({});
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  /* 찜은 이 화면이 기억하지 않는다. `useState(false)`로 두었더니 홈 카드에서
     하트가 켜진 상품을 눌러 들어와도 상세는 늘 `찜`(꺼짐)으로 시작해서, 같은
     상품을 두고 두 화면이 반대되는 말을 했다 */
  const { favorited, toggleFavorite } = useProductFavorite(product.id);
  /** 마지막으로 담은 수량의 지문. 지금 값과 같으면 또 담을 이유가 없다 */
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const [addFailed, setAddFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const totals = orderTotals(product, drafts);
  const currentKey = draftKey(product, drafts);
  const alreadyAdded = addedKey !== null && addedKey === currentKey;

  const changeQty = (skuId: string, next: string) => {
    const { qty, issue } = parseQty(next);

    setDrafts((prev) => ({
      ...prev,
      /* 상한을 넘긴 값만 되돌린다. 못 읽는 글자는 그대로 둔다 —
         지우면 `45.5`가 `455`가 되거나 칸이 저 혼자 비는 것처럼 보인다 */
      [skuId]: issue === "OVER_LIMIT" ? String(qty) : next,
    }));
    setIssues((prev) => ({ ...prev, [skuId]: issue }));
    /* 손으로 한 칸이라도 고치면 직전 일괄 입력 안내는 낡은 말이 된다 */
    setBulkNotice(null);
    setAddedNotice(null);
    setAddFailed(null);
  };

  const bulkApply = (group: ColorGroup, value: string) => {
    /* 팝오버가 이미 정수만 통과시키지만 같은 함수로 한 번 더 읽는다 —
       상한 방어가 표 한 칸에만 있으면 일괄 입력으로 뚫린다 */
    const { qty } = parseQty(value);

    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of group.rows) next[row.skuId] = String(qty);
      return next;
    });
    setIssues((prev) => {
      const next = { ...prev };
      for (const row of group.rows) next[row.skuId] = null;
      return next;
    });
    setBulkNotice(
      `${group.displayName} 사이즈 ${group.rows.length}칸에 ${qty}${QTY_UNIT}씩 넣었어요.`,
    );
    setAddedNotice(null);
    setAddFailed(null);
  };

  /* 못 담는 이유를 문장 하나로 좁힌다. 못 읽는 칸 → 0장 순서인 건
     사장이 먼저 고쳐야 하는 것이 그 순서라서다 */
  const disabledReason = totals.hasIssue
    ? "수량 칸에 못 읽는 값이 있어요. 빨간 글씨가 붙은 줄을 고치면 담을 수 있어요."
    : totals.sheets === 0
      ? `수량을 1${QTY_UNIT} 이상 넣어야 담거나 주문할 수 있어요.`
      : null;

  const addToCart = async () => {
    setBulkNotice(null);
    setAddFailed(null);
    setAdding(true);
    try {
      const result = await onAddToCart(toCartItems(product, drafts));

      if (result.failed.length === 0) {
        setAddedKey(currentKey);
        setAddedNotice(
          `장바구니에 ${totals.comboCount}개 조합 · ${totals.sheets}${QTY_UNIT}을 담았어요. 수량을 바꾸면 다시 담을 수 있어요.`,
        );
        return;
      }

      /* 하나도 안 들어갔다 — 칸은 그대로, 지문도 안 굳힌다. 다시 누르면 전부 보낸다 */
      if (result.done.length === 0) {
        setAddFailed(describeAddToCartError(result.failed[0]?.error));
        return;
      }

      /* 일부만 들어갔다 — 담긴 조합의 칸을 비워 다음 담기는 못 담은 것만 보낸다.
         지문을 굳히지 않으면 성공분이 또 POST 돼 서버가 합산한다(F2) */
      setDrafts((prev) => withoutAdded(product, prev, result.done));
      setAddFailed(describePartialAdd(product, result));
    } catch (error) {
      /* 조립부가 reject하지 않는 계약이지만, 예상 밖의 throw(코드 오류·네트워크
         계층)는 여기서 받아 화면이 `담는 중…`에 갇히지 않게 한다 */
      setAddFailed(describeAddToCartError(error));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-wrap">
      <Breadcrumb categoryPath={product.categoryPath} />

      <Panel>
        <div className="grid grid-cols-[minmax(0,480px)_minmax(0,1fr)] items-start gap-7 tablet:grid-cols-1">
          <ProductGallery images={product.images} productName={product.name} />

          <div>
            <SellerCard product={product} />

            <section className="mt-6">
              <h1 className="text-xl font-medium">{product.name}</h1>
              {/* 원본 실측은 26px/34지만 Tailwind 기본 단계에 없는 값이라
                  text-2xl(24/32)로 내린다 — 타이포 슬롯을 새로 파는 것은
                  packages/ui 변경이고 이번 회차 범위 밖이다 */}
              <p className="mt-2 text-2xl font-medium tabular-nums">
                {priceRangeLabel(product)}
                <span className="text-muted-foreground ml-1 text-base font-normal">
                  원
                </span>
              </p>
              <p className="text-muted-foreground text-body mt-1">
                {PRICE_HINT}
              </p>
            </section>

            <OptionTable
              product={product}
              drafts={drafts}
              issues={issues}
              onChangeQty={changeQty}
              onBulkApply={bulkApply}
              bulkNotice={bulkNotice}
              disabled={adding}
            />

            <TradeTermsList />
          </div>
        </div>

        <SummaryBar
          totals={totals}
          disabledReason={disabledReason}
          favorited={favorited}
          onToggleFavorite={toggleFavorite}
          onAddToCart={addToCart}
          adding={adding}
          addedNotice={addFailed ?? addedNotice}
          failed={addFailed !== null}
          alreadyAdded={alreadyAdded}
        />
      </Panel>
    </div>
  );
}

/**
 * `홈 › 여성 › 의류 › 상의` — 서버의 `categoryPath`(루트 → 리프) 그대로다(게이트 Q2).
 *
 * **홈만 링크다.** 중간 축에는 갈 화면이 아직 없다 — 링크처럼 보이게 해 두고
 * 아무 데도 안 가는 것보다 글자로 두는 편이 낫다. 리프를 셸 카테고리로 이어 주는
 * 것은 카테고리 바가 최상위 한 단만 그리는 지금은 맞지 않는다(`04-wire.md` §3).
 */
function Breadcrumb({ categoryPath }: { categoryPath: readonly string[] }) {
  const last = categoryPath.length - 1;

  return (
    <nav
      aria-label="위치"
      className="text-muted-foreground text-body flex flex-wrap items-center gap-1.5 px-1 py-3"
    >
      <Link href="/" className="hover:text-foreground">
        홈
      </Link>
      {categoryPath.map((name, index) => (
        <span key={`${index}-${name}`} className="contents">
          <ChevronRight aria-hidden className="text-border-strong size-3.5" />
          <span className={index === last ? "text-foreground" : undefined}>
            {name}
          </span>
        </span>
      ))}
    </nav>
  );
}

/** 누구 물건인지. 상품 상세에 들어온 사장이 가장 먼저 확인하는 값이다 */
function SellerCard({ product }: { product: ProductDetail }) {
  const { wholesaler } = product;

  return (
    <div className="border-border flex items-center gap-2.5 rounded-control border p-3">
      <span
        aria-hidden
        className="bg-secondary text-secondary-foreground text-body grid size-8.5 shrink-0 place-items-center rounded-button"
      >
        {wholesaler.initial}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{wholesaler.name}</p>
        {/* 위치가 비어 오면 줄을 안 그린다 — 빈 줄은 "주소 없음"으로 읽힌다 */}
        {wholesaler.location ? (
          <p className="text-muted-foreground text-body truncate">
            {wholesaler.location}
          </p>
        ) : null}
      </div>
      <Link
        href={`/wholesalers/${wholesaler.id}`}
        className="text-muted-foreground hover:text-foreground text-body ml-auto flex shrink-0 items-center gap-0.5"
      >
        도매처 홈
        <ChevronRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/**
 * 거래 조건 3줄. 문구는 `constants.ts` 한 곳에서 온다 —
 * 결제 수단 표기가 화면마다 갈리면 어느 쪽이 맞는지 사장이 알 수 없다.
 */
function TradeTermsList() {
  return (
    <section className="mt-6">
      <h2 className="text-muted-foreground text-body mb-2.5">거래 조건</h2>
      <dl className="text-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 phone:grid-cols-1 phone:gap-y-1">
        {TRADE_TERMS.map(({ term, value, why }) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground whitespace-nowrap">{term}</dt>
            <dd className="m-0">
              {value} <span className="text-muted-foreground">— {why}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

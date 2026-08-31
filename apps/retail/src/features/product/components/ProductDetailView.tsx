import { Notice, Panel } from "@ondo/ui";
import { ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { ProductGallery } from "./ProductGallery";
import { LOCKED_NOTICE, PRICE_HINT, TRADE_TERMS } from "../constants";
import { priceRangeLabel } from "../derive";
import type { ProductDetail } from "../types";

/**
 * 상품 상세. **읽는 화면이라 1180px 중앙 정렬**이고 2열(좌 갤러리 480 / 우 정보)이다.
 * ≤60rem에서 1열로 접힌다 — 휴대폰에서 사진과 옵션이 나란히 설 자리가 없다.
 *
 * 게시 옵션 표·합계 바는 다음 이슈가 이 아래에 얹는다.
 */
export function ProductDetailView({ product }: { product: ProductDetail }) {
  /* 상태값에서 문구를 바로 뽑는다. `주문 가능한가`를 boolean으로 먼저 좁히면
     타입이 다시 세 값으로 넓어져서, 어느 문구를 쓸지 컴파일러가 못 고른다 */
  const lockedNotice =
    product.status === "ON_SALE" ? null : LOCKED_NOTICE[product.status];

  return (
    <div className="mx-auto max-w-wrap">
      <Breadcrumb category={product.category} />

      <Panel>
        <div className="grid grid-cols-[minmax(0,480px)_minmax(0,1fr)] items-start gap-7 tablet:grid-cols-1">
          <ProductGallery
            imageCount={product.imageCount}
            productName={product.name}
          />

          <div>
            <SellerCard product={product} />

            {lockedNotice ? (
              /* 잠긴 이유를 **옵션 표보다 먼저** 말한다. 아래에서 수량을 다 넣고
                 나서야 못 산다는 걸 알게 되면 그 시간이 통째로 버려진다 */
              <div className="mt-6">
                <Notice className="border-destructive text-destructive bg-card border">
                  <span className="flex items-start gap-2">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {lockedNotice}
                  </span>
                </Notice>
              </div>
            ) : null}

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

            <TradeTermsList />
          </div>
        </div>
      </Panel>
    </div>
  );
}

/**
 * `홈 › 여성 › 의류 › 상의` — 도매 3단(대>중>소) 그대로다(게이트 Q2).
 *
 * **홈만 링크다.** 대·중 축에는 갈 화면이 아직 없다 — 링크처럼 보이게 해 두고
 * 아무 데도 안 가는 것보다 글자로 두는 편이 낫다. 소 축을 셸 카테고리 슬러그로
 * 이어 주는 것은 축 대응표(§4 Q2)가 확정된 뒤에 한다.
 */
function Breadcrumb({ category }: { category: [string, string, string] }) {
  const [major, middle, minor] = category;

  return (
    <nav
      aria-label="위치"
      className="text-muted-foreground text-body flex flex-wrap items-center gap-1.5 px-1 py-3"
    >
      <Link href="/" className="hover:text-foreground">
        홈
      </Link>
      <ChevronRight aria-hidden className="text-border-strong size-3.5" />
      <span>{major}</span>
      <ChevronRight aria-hidden className="text-border-strong size-3.5" />
      <span>{middle}</span>
      <ChevronRight aria-hidden className="text-border-strong size-3.5" />
      <span className="text-foreground">{minor}</span>
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
        <p className="text-muted-foreground text-body truncate">
          {wholesaler.location}
        </p>
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

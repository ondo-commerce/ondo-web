"use client";

import { Button, Dialog } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PostFormPanel, type PostFormValue } from "./PostFormPanel";
import { ProductFormPanel, type ProductFormValue } from "./ProductFormPanel";
import { colorHex } from "../constants";
import { priceRowsFromProduct } from "../priceRows";
import type { PostStatus, Product } from "../types";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

/** 상품에 담긴 값을 폼 초기값으로 편다 */
function toProductForm(product: Product): ProductFormValue {
  return {
    name: product.name,
    category: product.category,
    options: product.colors.map((color, i) => ({
      id: `opt-${color.name}-${i}`,
      color: { name: color.name, hex: colorHex(color.name) },
      sizes: product.skus
        .filter((s) => s.color === color.name)
        .map((s) => s.size),
    })),
  };
}

function toPostForm(product: Product): PostFormValue {
  return {
    name: product.post?.name ?? "",
    description: product.post?.description ?? "",
    images: product.post?.images ?? [],
    allowSinglePiece: product.post?.allowSinglePiece ?? false,
    prices: Object.fromEntries(
      product.skus.map((s) => [
        s.id,
        { orderLimit: s.orderLimit, price: s.price },
      ]),
    ),
  };
}

export function ProductEditView({ product }: { product: Product }) {
  const router = useRouter();
  const [productForm, setProductForm] = useState(() => toProductForm(product));
  const [postForm, setPostForm] = useState(() => toPostForm(product));
  const [status, setStatus] = useState<PostStatus>(
    product.post?.status ?? "ON_SALE",
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 저장·검증은 하지 않는다. 이번 단계의 목표는 화면 이동까지다
  const submit = () => router.push("/products");

  return (
    <FormSplitLayout
      left={
        <ProductFormPanel
          title="상품 수정"
          /* 삭제는 지우는 대상(상품) 패널의 제목 우측에 둔다. 하단 바에 두면
             `취소`·`수정`과 같은 크기로 나란히 서서 손이 미끄러진다 */
          action={
            <Button
              variant="ghost"
              size="md"
              className="px-2"
              onClick={() => setDeleteOpen(true)}
            >
              삭제
            </Button>
          }
          value={productForm}
          onChange={setProductForm}
        />
      }
      right={
        <PostFormPanel
          title="게시글 수정"
          value={postForm}
          onChange={setPostForm}
          priceRows={priceRowsFromProduct(product)}
          status={status}
          onStatusChange={setStatus}
        />
      }
      actions={
        <>
          <Button asChild variant="line" size="lg">
            <Link href="/products">취소</Link>
          </Button>
          <Button size="lg" onClick={submit}>
            저장하기
          </Button>

          {/* 여는 버튼은 좌측 상품 패널 제목에 있다. 다이얼로그는 포털로 뜨므로
              위치는 상관없고, 열림 상태를 쥔 이 컴포넌트에 둔다.
              삭제 확인은 URL을 바꾸지 않는다 (규칙 3-A) */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <Dialog.Content>
              {/*
               * 지우는 단위는 **상품 하나뿐이다.** 게시글만 따로 지우는 기능은 두지
               * 않기로 했다 — 마켓에서 내리고 싶으면 `시즌 종료`로 상태만 바꾸면 되고,
               * 그러면 판매가·주문 제한이 남아 있어 다시 올릴 때 그대로 쓴다.
               * 그래서 게시글은 상품에 딸려서만 사라진다.
               *
               * TODO: 재고·주문 이력이 있는 상품도 지울 수 있는지 미정. 주문 라인이
               *       SKU를 참조하고 있어(OrderLine.skuId) 그냥 지우면 이력이 끊긴다.
               *       막을지, 재고 0일 때만 허용할지 정해지면 이 문구에 한 줄 붙는다.
               */}
              <Dialog.Title>상품을 삭제할까요?</Dialog.Title>
              <Dialog.Description>
                게시글도 함께 삭제되어 온도 마켓에서 내려갑니다. 되돌릴 수
                없습니다.
              </Dialog.Description>
              <Dialog.Footer>
                <Dialog.Close asChild>
                  <Button variant="line">닫기</Button>
                </Dialog.Close>
                <Button variant="danger" onClick={() => setDeleteOpen(false)}>
                  삭제하기
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog>
        </>
      }
    />
  );
}

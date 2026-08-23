"use client";

import { Button, Dialog } from "@ondo/ui";
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
          <Button variant="line" onClick={() => setDeleteOpen(true)}>
            게시글 삭제
          </Button>
          <Button onClick={submit}>상품 & 게시글 수정</Button>

          {/* 삭제 확인은 URL을 바꾸지 않는다 (규칙 3-A) */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <Dialog.Content>
              <Dialog.Title>게시글을 삭제할까요?</Dialog.Title>
              <Dialog.Description>
                온도 마켓에서 내려가고 판매가·주문 제한 설정이 사라집니다.
                상품과 재고는 그대로 남습니다.
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

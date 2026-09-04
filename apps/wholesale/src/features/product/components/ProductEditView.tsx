"use client";

import { Button, Dialog, Panel } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PostFormPanel } from "./PostFormPanel";
import { ProductFormPanel } from "./ProductFormPanel";
import {
  useDeleteProductMutation,
  useListingStatusMutation,
  useUpdateProductMutation,
} from "../api/mutations";
import { useProductDetailQuery } from "../api/queries";
import { fieldId, LIST_PARAM } from "../constants";
import {
  clearPostErrors,
  clearProductErrors,
  firstInvalidField,
  shouldSendListing,
  toPostForm,
  toProductForm,
  toProductFormErrors,
  toUpdateRequest,
  validateProductForm,
  type ProductFormErrors,
} from "../derive";
import { priceRowsFromOptions } from "../priceRows";
import type { PostStatus, ProductView } from "../types";
import { describeError } from "@/shared/api/describeError";
import { QueryBoundary, QuerySkeleton } from "@/shared/api/QueryBoundary";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

/**
 * 상품 수정 — 상세를 받은 뒤에야 폼을 만들 수 있다.
 *
 * 경계가 패널이 아니라 화면 하나를 감싼다. 두 패널이 **한 폼 상태**를 나눠 갖는데
 * 그 초기값이 서버 응답이라, 패널마다 따로 기다리면 상태를 둘 곳이 없다.
 * 대신 기다리는 동안의 모양은 같은 2단 레이아웃으로 그려서 자리는 흔들리지 않는다.
 */
export function ProductEditView({ productId }: { productId: number }) {
  return (
    <QueryBoundary
      fallback={
        <FormSplitLayout
          left={
            <Panel className="flex-1">
              <QuerySkeleton />
            </Panel>
          }
          right={
            <Panel className="flex-1">
              <QuerySkeleton />
            </Panel>
          }
          actions={null}
        />
      }
      notFound={
        <Panel className="text-muted-foreground grid flex-1 place-items-center text-sm">
          없거나 지워진 상품입니다
        </Panel>
      }
    >
      <ProductEditLoaded productId={productId} />
    </QueryBoundary>
  );
}

function ProductEditLoaded({ productId }: { productId: number }) {
  const { data: product } = useProductDetailQuery(productId);
  // 서버 값이 바뀌면(저장 후 무효화) 폼을 새 값으로 다시 연다
  return <ProductEditForm key={product.id} product={product} />;
}

function ProductEditForm({ product }: { product: ProductView }) {
  const router = useRouter();
  const [productForm, setProductForm] = useState(() => toProductForm(product));
  const [postForm, setPostForm] = useState(() => toPostForm(product));
  const [status, setStatus] = useState<PostStatus>(
    product.post?.status ?? "ON_SALE",
  );
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const update = useUpdateProductMutation(product.id);
  const listingStatus = useListingStatusMutation();
  const remove = useDeleteProductMutation();
  const saving = update.isPending || listingStatus.isPending;

  const focusField = (found: ProductFormErrors) => {
    const first = firstInvalidField(found);
    if (first) document.getElementById(fieldId(first))?.focus();
  };

  /**
   * 저장 = `PATCH /products/{id}` + (상태가 바뀌었으면) 시즌 종료/재개 호출.
   * PATCH는 `listing.status`를 받지 않아서(스펙) 상태만 따로 간다. 순서는 PATCH가 먼저 —
   * 잠기기 전 마지막 편집이 먼저 남아야 한다.
   */
  const submit = async () => {
    const sendListing = shouldSendListing(product, postForm, status);
    const found = validateProductForm(
      productForm,
      sendListing ? postForm : null,
    );
    setErrors(found);
    if (firstInvalidField(found)) {
      focusField(found);
      return;
    }

    try {
      await update.mutateAsync(
        toUpdateRequest(productForm, postForm, product, status),
      );
      if (product.post && status !== product.post.status) {
        await listingStatus.mutateAsync({
          listingId: product.post.id,
          productId: product.id,
          next: status,
        });
      }
      router.push(`/products?${LIST_PARAM.productId}=${product.id}`);
    } catch (error) {
      const mapped = toProductFormErrors(error);
      if (mapped) {
        setErrors(mapped);
        focusField(mapped);
        return;
      }
      const described = describeError(error);
      setErrors({ _form: described.detail ?? described.title });
    }
  };

  /** `DELETE /products/{id}`. 게시글도 같이 사라진다. 409(재고·주문 있음)는 다이얼로그 안에 */
  const confirmDelete = () =>
    remove.mutate(product.id, {
      onSuccess: () => router.push("/products"),
      onError: (error) => {
        const described = describeError(error);
        setDeleteError(described.detail ?? described.title);
      },
    });

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
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              삭제
            </Button>
          }
          value={productForm}
          onChange={(next) => {
            setErrors((prev) => clearProductErrors(prev, productForm, next));
            setProductForm(next);
          }}
          errors={errors}
        />
      }
      right={
        <PostFormPanel
          title="게시글 수정"
          value={postForm}
          onChange={(next) => {
            setErrors((prev) => clearPostErrors(prev, postForm, next));
            setPostForm(next);
          }}
          /* 현재고·평균원가는 서버가 준 SKU에서. 새로 켠 색×사이즈는 아직 0이다 */
          priceRows={priceRowsFromOptions(productForm.options, product.skus)}
          /* 게시글이 없으면 끝낼 것도 없다 — 세그먼트 자체가 안 나온다 */
          status={product.post ? status : undefined}
          onStatusChange={product.post ? setStatus : undefined}
          errors={errors}
        />
      }
      actions={
        <>
          {errors._form ? (
            <p role="alert" className="text-destructive-strong mr-auto text-sm">
              {errors._form}
            </p>
          ) : null}
          <Button asChild variant="line" size="lg">
            <Link href="/products">취소</Link>
          </Button>
          <Button size="lg" onClick={submit} disabled={saving}>
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
               * 재고·주문 이력이 있는 상품은 서버가 409로 막는다(`VARIANT_HAS_STOCK` ·
               * `VARIANT_ALLOCATED` · `VARIANT_HAS_BACKORDER` · `VARIANT_IN_PENDING_ORDER`).
               * 그 문구가 아래 한 줄에 온다.
               */}
              <Dialog.Title>상품을 삭제할까요?</Dialog.Title>
              <Dialog.Description>
                게시글도 함께 삭제되어 온도 마켓에서 내려갑니다. 되돌릴 수
                없습니다.
              </Dialog.Description>
              {deleteError ? (
                <p
                  role="alert"
                  className="text-destructive-strong mt-3 text-sm"
                >
                  {deleteError}
                </p>
              ) : null}
              <Dialog.Footer>
                <Dialog.Close asChild>
                  <Button variant="line">닫기</Button>
                </Dialog.Close>
                <Button
                  variant="danger"
                  onClick={confirmDelete}
                  disabled={remove.isPending}
                >
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

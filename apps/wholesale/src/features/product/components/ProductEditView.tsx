"use client";

import { Button, cn, Dialog, Panel } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { LeaveConfirmDialog } from "./LeaveConfirmDialog";
import { PostFormPanel } from "./PostFormPanel";
import { ProductFormPanel } from "./ProductFormPanel";
import {
  useDeleteProductMutation,
  useListingStatusMutation,
  useUpdateProductMutation,
} from "../api/mutations";
import { useProductDetailQuery } from "../api/queries";
import {
  IDLE_UPLOAD_STATE,
  SESSION_LOST_MESSAGE,
  LIST_PARAM,
} from "../constants";
import {
  clearImagesError,
  clearPostErrors,
  clearProductErrors,
  firstInvalidField,
  isProductFormDirty,
  isSessionLostError,
  LISTING_IMAGES_REQUIRED_MESSAGE,
  shouldSendListing,
  toPostForm,
  toProductForm,
  toProductFormErrors,
  toUpdateRequest,
  uploadNote,
  validateProductForm,
} from "../derive";
import { priceRowsFromOptions } from "../priceRows";
import type { PostStatus, ProductView, UploadState } from "../types";
import { useBeforeUnloadGuard } from "../useBeforeUnloadGuard";
import { useProductFormErrors } from "../useProductFormErrors";
import { describeError } from "@/shared/api/describeError";
import {
  QueryBoundary,
  QueryErrorView,
  QuerySkeleton,
} from "@/shared/api/QueryBoundary";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

/**
 * 상품 수정 — 상세를 받은 뒤에야 폼을 만들 수 있다.
 *
 * 경계가 패널이 아니라 화면 하나를 감싼다. 두 패널이 **한 폼 상태**를 나눠 갖는데
 * 그 초기값이 서버 응답이라, 패널마다 따로 기다리면 상태를 둘 곳이 없다.
 * 대신 기다리는 동안·실패했을 때의 모양은 같은 2단 레이아웃으로 그려서 자리는 흔들리지 않는다
 * — 실패를 기본 에러 블록에 맡기면 `Panel` 없는 alert가 본문 전체 폭에 그려진다(wire-product F4).
 */
export function ProductEditView({ productId }: { productId: number }) {
  return (
    <QueryBoundary
      errorFallback={({ described, retry }) => (
        <FormSplitLayout
          left={
            <Panel className="flex-1">
              <Panel.Title>상품 수정</Panel.Title>
              <QueryErrorView described={described} onRetry={retry} />
            </Panel>
          }
          right={
            <Panel className="flex-1">
              <Panel.Title>게시글 수정</Panel.Title>
            </Panel>
          }
          actions={
            <Button asChild variant="line" size="lg">
              <Link href={`/products?${LIST_PARAM.productId}=${productId}`}>
                취소
              </Link>
            </Button>
          }
        />
      )}
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
  const { errors, setErrors, showErrors } = useProductFormErrors();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /* 격자의 업로드 요약. 대기·진행 칸이 있으면 저장을 잠근다(`ProductCreateView`와 같은 이유) */
  const [uploadState, setUploadState] =
    useState<UploadState>(IDLE_UPLOAD_STATE);
  const note = uploadNote(uploadState);
  const noteId = useId();
  /*
   * 업로드가 401을 받았다(S4-3). 화면은 그대로 두고 저장과 `+`만 잠근다 — 지금 저장하면 저장도
   * 401이라 전역 핸들러가 `/login`으로 보내 폼이 날아간다. `errors._form`에 넣지 않는 이유:
   * 칸을 고칠 때마다 `_form`이 지워지는데 잠금은 남으면 버튼이 왜 잠겼는지 사라진다.
   */
  const [sessionLost, setSessionLost] = useState(false);
  const formAlertId = useId();
  const formMessage = sessionLost ? SESSION_LOST_MESSAGE : errors._form;
  const handleUploadAuthFailure = (error: unknown) => {
    if (isSessionLostError(error)) {
      setSessionLost(true);
      return;
    }
    // 403(승인 안 됨)은 서버 문구 그대로. 저장은 잠그지 않는다 — 저장 경로의 403 처리에 맡긴다
    const described = describeError(error);
    setErrors((prev) => ({
      ...prev,
      _form: described.detail ?? described.title,
    }));
  };
  const saveDescribedBy =
    [sessionLost ? formAlertId : null, note ? noteId : null]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  const update = useUpdateProductMutation(product.id);
  const listingStatus = useListingStatusMutation();
  const remove = useDeleteProductMutation();
  const saving =
    update.isPending ||
    listingStatus.isPending ||
    uploadState.uploading ||
    sessionLost;

  /** 저장과 취소가 같은 자리로 돌아간다 — 보던 상품이 우측에 열린 채 */
  const detailPath = `/products?${LIST_PARAM.productId}=${product.id}`;

  /*
   * 이미지 필수(D21)는 **저장 시점 상태**가 정한다. 판매 중이면 필수, 시즌 종료면 면제 —
   * 게시글이 없는 상품도 게시글을 만들면 판매 중으로 만들어지니 같은 기준이다.
   */
  const requireImages = status === "ON_SALE";

  /*
   * 이탈 확인(D22). 서버 값으로 만든 폼과 지금 폼을 값으로 비교한다 — 저장 뒤 refetch 로
   * `product`가 바뀌면 그게 새 기준이다. `leaving`은 저장 성공과 `나가기` 뒤.
   */
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dirty =
    isProductFormDirty(
      {
        product: toProductForm(product),
        post: toPostForm(product),
        status: product.post?.status,
      },
      {
        product: productForm,
        post: postForm,
        status: product.post ? status : undefined,
      },
    ) || uploadState.uploading;
  useBeforeUnloadGuard(dirty && !leaving);

  const leave = () => {
    setLeaving(true);
    router.push(detailPath);
  };

  /**
   * 저장 = `PATCH /products/{id}` + (상태가 바뀌었으면) 시즌 종료/재개 호출.
   * PATCH는 `listing.status`를 받지 않아서(스펙) 상태만 따로 간다. 순서는 PATCH가 먼저 —
   * 잠기기 전 마지막 편집이 먼저 남아야 한다. 그래서 `시즌 종료`로 바꿔 저장해도
   * 그 전에 고친 제목·판매가는 PATCH에 같이 실린다(`shouldSendListing`은 상태를 안 본다).
   */
  const submit = async () => {
    const sendListing = shouldSendListing(product, productForm, postForm);
    const found = validateProductForm(
      productForm,
      sendListing ? postForm : null,
      { requireImages },
    );
    /*
     * 게시글을 안 보내는 저장(`시즌 종료 → 판매 중` 토글만)도 판매 중으로 오르는 순간이라
     * 이미지는 본다(D21). `post: null`은 "게시글 칸은 검사 안 함"이라 이 한 칸만 따로 —
     * 제목·가격표는 서버가 이미 받아 준 값이다.
     */
    if (
      !sendListing &&
      product.post &&
      requireImages &&
      postForm.images.length === 0
    )
      found["listing.images"] = LISTING_IMAGES_REQUIRED_MESSAGE;
    showErrors(found);
    if (firstInvalidField(found)) return;

    try {
      await update.mutateAsync(toUpdateRequest(productForm, postForm, product));
      if (product.post && status !== product.post.status) {
        await listingStatus.mutateAsync({
          listingId: product.post.id,
          productId: product.id,
          next: status,
        });
      }
      setLeaving(true);
      router.push(detailPath);
    } catch (error) {
      const mapped = toProductFormErrors(error, productForm);
      if (mapped) {
        showErrors(mapped);
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
          /* 갱신 함수로 — 업로드 응답은 이 렌더의 `postForm`을 믿으면 안 된다(`PostFormPanel` 주석) */
          onImagesChange={(update) => {
            setErrors(clearImagesError);
            setPostForm((prev) => ({ ...prev, images: update(prev.images) }));
          }}
          /* 현재고·평균원가는 서버가 준 SKU에서. 새로 켠 색×사이즈는 아직 0이다 */
          priceRows={priceRowsFromOptions(productForm.options, product.skus)}
          /* 게시글이 없으면 끝낼 것도 없다 — 세그먼트 자체가 안 나온다 */
          status={product.post ? status : undefined}
          onStatusChange={product.post ? setStatus : undefined}
          errors={errors}
          requireImages={requireImages}
          onUploadStateChange={setUploadState}
          onUploadAuthFailure={handleUploadAuthFailure}
          uploadLocked={sessionLost}
        />
      }
      actions={
        <>
          {formMessage ? (
            <p
              id={formAlertId}
              role="alert"
              data-ac={sessionLost ? "S4-3 S4-7" : undefined}
              className="text-destructive-strong mr-auto text-sm"
            >
              {formMessage}
            </p>
          ) : null}
          {note ? (
            <p
              id={noteId}
              role="status"
              data-ac="S2-3 S2-5"
              className={cn(
                "mr-auto text-sm",
                note.danger
                  ? "text-destructive-strong"
                  : "text-muted-foreground",
              )}
            >
              {note.text}
            </p>
          ) : null}
          {/*
           * 저장과 같은 자리로 돌아간다 — 보던 상품이 우측에 열린 채. `/products`로만 가면
           * 100행 목록에서 그 상품을 다시 찾아야 한다(wire-product F7).
           * `<a>`가 아니라 버튼인 이유(D22): 값을 바꿨으면 되물어야 하는데 링크는 누르는 순간
           * 떠난다. 안 바꿨으면 바로 간다.
           */}
          <LeaveConfirmDialog
            open={leaveOpen}
            /* 트리거(취소)가 열자고 할 때 더티가 아니면 열지 않고 바로 떠난다 */
            onOpenChange={(open) =>
              open && !dirty ? leave() : setLeaveOpen(open)
            }
            onLeave={leave}
          >
            <Button
              type="button"
              variant="line"
              size="lg"
              data-ac="S3-11 S3-12"
            >
              취소
            </Button>
          </LeaveConfirmDialog>
          <Button
            size="lg"
            onClick={submit}
            disabled={saving}
            aria-describedby={saveDescribedBy}
            data-ac="S2-3 S2-4"
          >
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

"use client";

import { Button, Checkbox, cn, Panel } from "@ondo/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PostFormPanel } from "./PostFormPanel";
import { ProductFormPanel } from "./ProductFormPanel";
import { useCreateProductMutation } from "../api/mutations";
import { IDLE_UPLOAD_STATE, LIST_PARAM } from "../constants";
import {
  clearPostErrors,
  clearProductErrors,
  EMPTY_POST_FORM,
  EMPTY_PRODUCT_FORM,
  firstInvalidField,
  toCreateRequest,
  toProductFormErrors,
  uploadNote,
  validateProductForm,
} from "../derive";
import { priceRowsFromOptions } from "../priceRows";
import type { PostFormValue, ProductFormValue, UploadState } from "../types";
import { useProductFormErrors } from "../useProductFormErrors";
import { describeError } from "@/shared/api/describeError";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

export function ProductCreateView() {
  const router = useRouter();
  const [product, setProduct] = useState<ProductFormValue>(EMPTY_PRODUCT_FORM);
  const [post, setPost] = useState<PostFormValue>(EMPTY_POST_FORM);
  // 체크하면 우측 자리가 안내에서 게시글 폼으로 바뀌고 제출 버튼 문구도 바뀐다
  const [publishToMarket, setPublishToMarket] = useState(false);
  const { errors, setErrors, showErrors } = useProductFormErrors();
  const create = useCreateProductMutation();
  /*
   * 격자의 업로드 요약. 대기·진행 칸이 있으면 저장을 잠근다 — 지금 저장하면 올라가는 중인
   * 사진이 빠진 게시글이 된다. `함께 게시`를 끄면 격자가 사라지며 요약도 "없음"으로 돌아온다.
   */
  const [uploadState, setUploadState] =
    useState<UploadState>(IDLE_UPLOAD_STATE);
  const note = uploadNote(uploadState);
  const noteId = useId();

  /**
   * `POST /products`. 체크를 안 했으면 `listing: null`로 상품만 만든다(스펙).
   * 성공하면 목록으로 가되 새 상품을 우측 상세에 열어 둔다 — "등록됐다"를 화면이 말한다.
   */
  const submit = () => {
    const postToSend = publishToMarket ? post : null;
    const found = validateProductForm(product, postToSend);
    showErrors(found);
    if (firstInvalidField(found)) return;

    create.mutate(toCreateRequest(product, postToSend), {
      onSuccess: (created) =>
        router.push(`/products?${LIST_PARAM.productId}=${created.id}`),
      onError: (error) => {
        const mapped = toProductFormErrors(error, product);
        if (mapped) {
          showErrors(mapped);
          return;
        }
        // 칸에 못 붙이는 실패(서버 장애·네트워크). 폼 위 한 줄로
        const described = describeError(error);
        setErrors({ _form: described.detail ?? described.title });
      },
    });
  };

  /*
   * 켜는 자리와 끄는 자리가 같아야 해서 체크박스는 하나만 만들어 양쪽에 꽂는다.
   * 안내 상태에서는 카드 가운데, 폼 상태에서는 패널 제목 우측이다.
   */
  const publishToggle = (
    <label className="flex w-fit cursor-pointer items-center gap-2">
      <Checkbox
        checked={publishToMarket}
        onCheckedChange={(v) => setPublishToMarket(v === true)}
      />
      <span>온도 마켓에 함께 게시</span>
    </label>
  );

  return (
    <FormSplitLayout
      left={
        <ProductFormPanel
          title="상품 등록"
          value={product}
          onChange={(next) => {
            setErrors((prev) => clearProductErrors(prev, product, next));
            setProduct(next);
          }}
          errors={errors}
        />
      }
      right={
        publishToMarket ? (
          <PostFormPanel
            title="게시글 등록"
            action={publishToggle}
            value={post}
            onChange={(next) => {
              setErrors((prev) => clearPostErrors(prev, post, next));
              setPost(next);
            }}
            priceRows={priceRowsFromOptions(product.options)}
            // 등록 시점엔 입고가 없다 → 평균원가가 존재하지 않는다.
            // 현재고는 게시글과 별개로 등록되므로 열 자체는 늘 둔다
            showAvgCost={false}
            errors={errors}
            onUploadStateChange={setUploadState}
          />
        ) : (
          /*
           * 체크 전에도 우측 폭을 그대로 유지한다. 체크할 때 좌측이 좁아지면
           * 입력하던 자리가 통째로 밀린다 (ListDetailLayout과 같은 이유).
           */
          <Panel className="flex-1">
            <Panel.Title>게시글 등록</Panel.Title>
            <Panel.Body className="grid place-items-center">
              <div className="border-border max-w-xs rounded-control border border-dashed p-8">
                <p className="text-lg font-medium">아직 게시하지 않습니다</p>
                <p className="text-muted-foreground mt-1.5">
                  체크하면 상품 등록과 동시에 온도 마켓 게시글도 함께
                  등록됩니다. <br />
                  나중에 상품 수정 화면에서 게시할 수도 있어요.
                </p>
                <div className="mt-6 flex">{publishToggle}</div>
              </div>
            </Panel.Body>
          </Panel>
        )
      }
      actions={
        <>
          {/* 칸에 못 붙인 실패. 버튼 왼쪽에 둬서 누른 결과가 누른 자리에서 읽힌다 */}
          {errors._form ? (
            <p role="alert" className="text-destructive-strong mr-auto text-sm">
              {errors._form}
            </p>
          ) : null}
          {/* 저장이 왜 잠겼는지 / 뭐가 안 실리는지. 버튼이 `aria-describedby`로 가리킨다(DD10) */}
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
          {/* 목적지가 고정이라 실제 <a>로 둔다 — onClick+push면 새 탭·주소 복사가 죽는다
              (Button의 asChild 주석 참고) */}
          <Button asChild variant="line" size="lg">
            <Link href="/products">취소</Link>
          </Button>
          <Button
            size="lg"
            onClick={submit}
            disabled={create.isPending || uploadState.uploading}
            aria-describedby={note ? noteId : undefined}
            data-ac="S2-3 S2-4"
          >
            {publishToMarket ? "상품 & 게시글 등록" : "상품 등록"}
          </Button>
        </>
      }
    />
  );
}

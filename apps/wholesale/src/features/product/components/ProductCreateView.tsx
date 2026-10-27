"use client";

import { Button, Checkbox, cn, Panel } from "@ondo/ui";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { LeaveConfirmDialog } from "./LeaveConfirmDialog";
import { PostFormPanel } from "./PostFormPanel";
import { ProductFormPanel } from "./ProductFormPanel";
import { useCreateProductMutation } from "../api/mutations";
import {
  IDLE_UPLOAD_STATE,
  SESSION_LOST_MESSAGE,
  LIST_PARAM,
} from "../constants";
import {
  clearImagesError,
  clearPostErrors,
  clearProductErrors,
  EMPTY_POST_FORM,
  EMPTY_PRODUCT_FORM,
  firstInvalidField,
  isProductFormDirty,
  isSessionLostError,
  toCreateRequest,
  toProductFormErrors,
  uploadNote,
  validateProductForm,
} from "../derive";
import { priceRowsFromOptions } from "../priceRows";
import type { PostFormValue, ProductFormValue, UploadState } from "../types";
import { useBeforeUnloadGuard } from "../useBeforeUnloadGuard";
import { useLinkLeaveGuard } from "../useLinkLeaveGuard";
import { useProductFormErrors } from "../useProductFormErrors";
import { describeError } from "@/shared/api/describeError";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

/** 취소·등록 뒤 돌아가는 곳 */
const LIST_PATH = "/products";

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

  /*
   * 이탈 확인(D22). 입력이 있거나 사진이 올라가는 중이면 `취소`는 모달로 되묻고 새로고침·탭
   * 닫기는 브라우저가 경고한다. `leaving`은 등록 성공과 `나가기` 뒤 — 떠나기로 한 이동에
   * 경고가 뜨면 안 된다.
   */
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dirty =
    isProductFormDirty(
      {
        product: EMPTY_PRODUCT_FORM,
        post: EMPTY_POST_FORM,
        publishToMarket: false,
      },
      { product, post, publishToMarket },
    ) || uploadState.uploading;
  useBeforeUnloadGuard(dirty && !leaving);

  /*
   * 모달이 열린 이유. `null`이면 `취소`(→ LIST_PATH), 경로가 있으면 앱 안 Link가 가려던 곳(S5).
   * 모달은 하나다 — 문구가 같고, 닫히면 포커스는 트리거인 `취소`로 돌아간다(S5-4).
   */
  const [linkHref, setLinkHref] = useState<string | null>(null);
  useLinkLeaveGuard(dirty && !leaving, (href) => {
    setLinkHref(href);
    setLeaveOpen(true);
  });

  const leave = () => {
    setLeaving(true);
    router.push(linkHref ?? LIST_PATH);
  };

  /**
   * `POST /products`. 체크를 안 했으면 `listing: null`로 상품만 만든다(스펙).
   * 성공하면 목록으로 가되 새 상품을 우측 상세에 열어 둔다 — "등록됐다"를 화면이 말한다.
   * 새 게시글은 판매 중으로 만들어지므로 `함께 게시`면 이미지가 필수다(D21).
   */
  const submit = () => {
    const postToSend = publishToMarket ? post : null;
    const found = validateProductForm(product, postToSend, {
      requireImages: publishToMarket,
    });
    showErrors(found);
    if (firstInvalidField(found)) return;

    create.mutate(toCreateRequest(product, postToSend), {
      onSuccess: (created) => {
        setLeaving(true);
        router.push(`${LIST_PATH}?${LIST_PARAM.productId}=${created.id}`);
      },
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
            /* 갱신 함수로 — 업로드 응답은 이 렌더의 `post`를 믿으면 안 된다(`PostFormPanel` 주석) */
            onImagesChange={(update) => {
              setErrors(clearImagesError);
              setPost((prev) => ({ ...prev, images: update(prev.images) }));
            }}
            priceRows={priceRowsFromOptions(product.options)}
            // 등록 시점엔 입고가 없다 → 평균원가가 존재하지 않는다.
            // 현재고는 게시글과 별개로 등록되므로 열 자체는 늘 둔다
            showAvgCost={false}
            errors={errors}
            /* 체크된 게시글은 판매 중으로 만들어진다 — 항상 필수(D21) */
            requireImages
            onUploadStateChange={setUploadState}
            onUploadAuthFailure={handleUploadAuthFailure}
            uploadLocked={sessionLost}
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
          {/*
           * `<a>`가 아니라 버튼이다(D22). 입력이 있을 때 되물어야 하는데 링크는 누르는 순간
           * 떠난다 — 새 탭·주소 복사를 잃는 대신 쓰다 만 폼을 지킨다. 입력이 없으면 바로 간다.
           */}
          <LeaveConfirmDialog
            open={leaveOpen}
            /* 트리거(취소)가 열자고 할 때 더티가 아니면 열지 않고 바로 떠난다 */
            onOpenChange={(open) => {
              if (open && !dirty) return leave();
              setLeaveOpen(open);
              if (!open) setLinkHref(null);
            }}
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
            disabled={create.isPending || uploadState.uploading || sessionLost}
            aria-describedby={saveDescribedBy}
            data-ac="S2-3 S2-4"
          >
            {publishToMarket ? "상품 & 게시글 등록" : "상품 등록"}
          </Button>
        </>
      }
    />
  );
}

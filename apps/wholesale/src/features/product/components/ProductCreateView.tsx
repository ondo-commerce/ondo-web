"use client";

import { Button, Checkbox, Panel } from "@ondo/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EMPTY_POST_FORM,
  PostFormPanel,
  type PostFormValue,
} from "./PostFormPanel";
import {
  EMPTY_PRODUCT_FORM,
  ProductFormPanel,
  type ProductFormValue,
} from "./ProductFormPanel";
import { priceRowsFromOptions } from "../priceRows";
import { FormSplitLayout } from "@/shared/components/FormSplitLayout";

export function ProductCreateView() {
  const router = useRouter();
  const [product, setProduct] = useState<ProductFormValue>(EMPTY_PRODUCT_FORM);
  const [post, setPost] = useState<PostFormValue>(EMPTY_POST_FORM);
  // 체크하면 우측 자리가 안내에서 게시글 폼으로 바뀌고 제출 버튼 문구도 바뀐다
  const [publishToMarket, setPublishToMarket] = useState(false);

  // 저장·검증은 하지 않는다. 이번 단계의 목표는 화면 이동까지다
  const submit = () => router.push("/products");

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
          onChange={setProduct}
        />
      }
      right={
        publishToMarket ? (
          <PostFormPanel
            title="게시글 등록"
            action={publishToggle}
            value={post}
            onChange={setPost}
            priceRows={priceRowsFromOptions(product.options)}
            // 등록 시점엔 입고가 없다 → 평균원가가 존재하지 않는다.
            // 현재고는 게시글과 별개로 등록되므로 열 자체는 늘 둔다
            showAvgCost={false}
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
          <Button variant="line" onClick={() => router.push("/products")}>
            취소
          </Button>
          <Button onClick={submit}>
            {publishToMarket ? "상품 & 게시글 등록" : "상품 등록"}
          </Button>
        </>
      }
    />
  );
}

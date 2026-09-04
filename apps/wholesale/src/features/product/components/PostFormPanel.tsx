"use client";

import {
  cn,
  FormField,
  Input,
  Panel,
  Segmented,
  Switch,
  Textarea,
} from "@ondo/ui";
import type { ReactNode } from "react";
import { PostImageGrid } from "./PostImageGrid";
import { PostPriceTable } from "./PostPriceTable";
import { errorId, fieldId, INVALID_INPUT_CLASS } from "../constants";
import { EMPTY_PRICE_VALUE, type ProductFormErrors } from "../derive";
import type { PostFormValue, PostStatus, PriceRow } from "../types";
import { FieldError } from "@/shared/components/FieldError";

/**
 * 게시글 등록/수정 패널.
 * 시즌 종료를 고르면 이 패널 전체가 잠긴다 — 상품 패널은 계속 편집할 수 있다.
 */
export function PostFormPanel({
  title,
  value,
  onChange,
  priceRows,
  showAvgCost,
  status,
  onStatusChange,
  action,
  errors = {},
}: {
  title: string;
  value: PostFormValue;
  onChange: (next: PostFormValue) => void;
  priceRows: PriceRow[];
  /**
   * 가격표의 평균원가 열을 보일지.
   * 등록 화면은 아직 입고가 없어 원가가 존재하지 않으므로 끈다.
   */
  showAvgCost?: boolean;
  /**
   * 수정 화면에서 **게시글이 있을 때만** 넘긴다. 없으면 세그먼트 토글이 나오지 않는다 —
   * 끝내거나 재개할 listing 자체가 없다(시즌 종료·재개는 `listingId`를 받는 별도 호출).
   */
  status?: PostStatus;
  onStatusChange?: (next: PostStatus) => void;
  /**
   * 제목 우측에 놓을 것. 등록 화면이 "함께 게시" 체크박스를 여기 꽂는다.
   *
   * 여기 오는 건 **저장되지 않는 화면 모드**뿐이다. 게시글에 저장되는 값
   * (상태·이름·판매가 …)은 제목이 아니라 폼 자리에 둔다 — status가 제목
   * 우측에서 내려온 이유다.
   */
  action?: ReactNode;
  errors?: ProductFormErrors;
}) {
  const disabled = status === "SEASON_ENDED";

  /**
   * 이미지 순서 변경. from 번째를 to 번째 자리로 옮긴다.
   *
   * PostImageGrid 가 아니라 여기서 배열을 다시 만드는 이유: images 는 폼 값이라
   * 다른 필드와 똑같이 onChange 한 갈래로 나가야 한다. 그리드가 자기 안에서
   * 상태를 들면 저장 시점에 어느 쪽이 진짜인지 모르게 된다.
   */
  function handleImageReorder(from: number, to: number) {
    // dnd-kit 의 arrayMove 를 쓰지 않고 손으로 옮긴다 — 이 파일이 라이브러리를
    // import 하는 순간, 위에 적어둔 "그리드만 갈아끼우면 된다"는 경계가 깨진다.
    // 세 줄이라 가져올 값어치도 없다.
    const next = [...value.images];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);

    onChange({ ...value, images: next });
  }

  return (
    <Panel className="flex-1">
      <Panel.Title action={action}>{title}</Panel.Title>

      {/*
       * 게시 상태는 Panel.Body **밖**이다. 안에 넣으면 스크롤에 밀려서,
       * 시즌 종료로 전부 잠긴 화면을 내려다보는 동안 그걸 푸는 컨트롤만
       * 화면 밖에 있게 된다. 잠금 안내를 바로 아래 붙여 "이 스위치 → 아래가
       * 잠김"이 이어 읽히게 한다.
       *
       * 라벨을 붙이지 않는다 — 판매중/시즌 종료가 이미 자기 설명이라
       * `게시 상태` 라벨을 달면 아래 FormField들과 같은 무게가 된다.
       */}
      {status && onStatusChange ? (
        <div className="mb-4 shrink-0">
          <Segmented
            value={status}
            /* 빈 값 차단은 Segmented가 안에서 한다 — 여기서 또 거를 필요가 없다 */
            onValueChange={(v) => onStatusChange(v as PostStatus)}
          >
            <Segmented.Item value="ON_SALE">판매중</Segmented.Item>
            <Segmented.Item value="SEASON_ENDED">시즌 종료</Segmented.Item>
          </Segmented>

          {disabled ? (
            <p className="text-muted-foreground mt-2 pl-1 text-[14px]">
              * 시즌 종료 상태에서는 게시글을 수정할 수 없습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      <Panel.Body>
        {/*
         * 시즌 종료 잠금은 **fieldset 하나**가 맡는다. 안의 input·textarea·button이
         * 전부 네이티브 폼 컨트롤이라, disabled를 필드마다 내려보내지 않아도
         * 브라우저가 한 번에 끈다 — 탭 순서에서 빠지는 것까지 공짜다.
         * 그래서 아래 필드들에는 disabled prop이 없다.
         *
         * Panel.Body가 아니라 여기에 거는 이유: Panel.Body는 스크롤을 받는 자리다.
         * 거기에 pointer-events-none을 걸면 잠긴 내용을 훑어볼 수조차 없게 된다.
         * opacity는 스크롤을 막지 않으므로 가라앉히는 것만 여기서 한다.
         *
         * min-w-0: fieldset의 기본 min-width는 auto라, 안의 표가 넓어지면
         * 칸이 줄지 못하고 패널을 밀어낸다.
         */}
        <fieldset
          disabled={disabled}
          className={cn("min-w-0", disabled && "opacity-60")}
        >
          {/* 온도 마켓에 그대로 보이는 것들. 제목을 달지 않는다 — 패널 제목이
              이미 "게시글"이라 첫 묶음까지 이름 붙이면 같은 말이 두 번 나온다.
              구분은 아래 "판매 조건" 쪽 제목과 구분선이 맡는다 */}
          <Panel.Section>
            <FormField
              label="게시글 이름"
              required
              htmlFor={fieldId("listing.title")}
            >
              <Input
                id={fieldId("listing.title")}
                className={`max-w-70 ${INVALID_INPUT_CLASS}`}
                value={value.name}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
                placeholder="예: [신상] 루즈 오버핏 셔츠 데일리 남방"
                maxLength={100}
                aria-invalid={errors["listing.title"] !== undefined}
                aria-describedby={
                  errors["listing.title"] ? errorId("listing.title") : undefined
                }
              />
              {errors["listing.title"] ? (
                <FieldError id={errorId("listing.title")}>
                  {errors["listing.title"]}
                </FieldError>
              ) : null}
            </FormField>

            <FormField
              label="상세 설명"
              htmlFor={fieldId("listing.description")}
            >
              <Textarea
                id={fieldId("listing.description")}
                className={INVALID_INPUT_CLASS}
                value={value.description}
                onChange={(e) =>
                  onChange({ ...value, description: e.target.value })
                }
                rows={3}
                aria-invalid={errors["listing.description"] !== undefined}
                aria-describedby={
                  errors["listing.description"]
                    ? errorId("listing.description")
                    : undefined
                }
              />
              {errors["listing.description"] ? (
                <FieldError id={errorId("listing.description")}>
                  {errors["listing.description"]}
                </FieldError>
              ) : null}
            </FormField>

            {/*
             * 필수(*) 표시를 붙이지 않는다 — 업로드 API가 없어 지금은 채울 수 없는 칸이다.
             * 필수라고 써 두고 채울 길이 없으면 사장은 자기가 뭘 빠뜨렸는지 찾는다.
             * TODO(#156): 업로드 API가 오면 `required`를 되살린다(PostImageGrid 주석 참고).
             */}
            <FormField
              label="게시글 이미지"
              hint="첫 번째 이미지가 대표 이미지로 지정됩니다. 드래그하거나, 슬롯을 선택한 뒤 스페이스바로 집어 방향키로 순서를 바꿀 수 있어요."
            >
              {/*
               * disabled 를 손으로 내려보내는 유일한 필드다. 위 fieldset 이
               * 껐다고 안심할 수 없다 — fieldset 은 input·button 같은 **네이티브
               * 폼 컨트롤**만 끈다. 순서 변경 슬롯은 드래그 리스너를 단 div 라
               * 그 그물에 걸리지 않아서, 시즌 종료로 잠긴 화면에서도 이미지 순서만
               * 계속 바뀐다.
               */}
              <PostImageGrid
                images={value.images}
                disabled={disabled}
                onReorder={handleImageReorder}
              />
              {errors["listing.images"] ? (
                <FieldError id={errorId("listing.images")}>
                  {errors["listing.images"]}
                </FieldError>
              ) : null}
            </FormField>
          </Panel.Section>

          {/*
           * 마켓에 보이는 값이 아니라 거래 규칙. 낱장·판매가·주문 제한이 한 묶음이다.
           * 가벼운 토글을 먼저 두고, 표는 맨 아래에 둔다 — 표가 위에 오면 그 아래 붙은
           * 한 줄짜리 토글이 표의 부속처럼 읽힌다.
           *
           * 구분선을 두는 이유: 필드 사이가 20px인데 섹션 사이는 44px이라 간격만으로도
           * 차이는 나지만, 가격표처럼 자기 테두리를 가진 덩어리가 섞여 있으면 그 차이가
           * 묻힌다. 선을 그으면 어디까지가 한 묶음인지 한 번에 읽힌다.
           */}
          <Panel.Section
            title="판매 조건"
            className="border-border border-t pt-6"
          >
            <FormField label="낱장 등록">
              <div className="border-border flex items-center justify-between rounded-control border px-4 py-3">
                <span className="text-sm">첫 구매시 1장 구매 허용</span>
                <Switch
                  checked={value.allowSinglePiece}
                  onCheckedChange={(checked) =>
                    onChange({ ...value, allowSinglePiece: checked })
                  }
                  aria-label="첫 구매시 1장 구매 허용"
                />
              </div>
            </FormField>

            <FormField
              label="옵션별 판매가 & 주문 제한 재고 설정"
              required
              className="mb-0"
            >
              <PostPriceTable
                rows={priceRows}
                values={value.prices}
                showAvgCost={showAvgCost}
                describedBy={
                  errors["listing.variantPrices"]
                    ? errorId("listing.variantPrices")
                    : undefined
                }
                onChange={(id, next) =>
                  onChange({
                    ...value,
                    prices: { ...value.prices, [id]: next },
                  })
                }
                onApplyAll={(field, v) =>
                  onChange({
                    ...value,
                    prices: Object.fromEntries(
                      priceRows.map((r) => [
                        r.id,
                        {
                          ...(value.prices[r.id] ?? EMPTY_PRICE_VALUE),
                          [field]: v,
                        },
                      ]),
                    ),
                  })
                }
              />
              {errors["listing.variantPrices"] ? (
                <FieldError id={errorId("listing.variantPrices")}>
                  {errors["listing.variantPrices"]}
                </FieldError>
              ) : null}
            </FormField>
          </Panel.Section>
        </fieldset>
      </Panel.Body>
    </Panel>
  );
}

"use client";

import { FormField, Input, Panel, Select } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { ProductOptionMatrix } from "./ProductOptionMatrix";
import { useCategoriesQuery } from "../api/queries";
import { errorId, fieldId, INVALID_INPUT_CLASS } from "../constants";
import { categoryChildren, type ProductFormErrors } from "../derive";
import type { CategoryNode, ProductFormValue } from "../types";
import { QueryBoundary } from "@/shared/api/QueryBoundary";
import { FieldError } from "@/shared/components/FieldError";

/**
 * 상품 등록/수정 폼의 좌측 패널. 등록과 수정이 같은 구조라 한 컴포넌트를 공유한다
 * (제목만 다르다). 저장은 하지 않는다 — 값 편집만 하고 제출은 부르는 쪽이 한다.
 *
 * 카테고리 목록이 서버(`GET /categories`)에서 오므로 패널 속에 경계를 둔다. 폼 값은
 * 부르는 쪽이 쥐고 있어서 경계가 다시 그려져도 친 글자는 남는다.
 */
export function ProductFormPanel({
  title,
  action,
  value,
  onChange,
  errors = {},
  disabled = false,
}: {
  title: string;
  /**
   * 제목 우측 끝에 놓을 액션. 수정 화면이 `상품 삭제`를 여기 꽂는다.
   *
   * 지우는 단위가 상품이라 이 패널이 그 액션의 주인이다 — 게시글은 상품에 딸려
   * 사라지고, 게시글만 따로 지우는 기능은 없다.
   */
  action?: ReactNode;
  value: ProductFormValue;
  onChange: (next: ProductFormValue) => void;
  /** 칸별 오류. 클라이언트 검증과 서버 `VALIDATION_FAILED`가 같은 모양으로 온다 */
  errors?: ProductFormErrors;
  disabled?: boolean;
}) {
  return (
    <Panel className="flex-1">
      <Panel.Title action={action}>{title}</Panel.Title>

      {/* 스크롤은 여기 안에서만 */}
      <Panel.Body>
        <QueryBoundary>
          <ProductFormFields
            value={value}
            onChange={onChange}
            errors={errors}
            disabled={disabled}
          />
        </QueryBoundary>
      </Panel.Body>
    </Panel>
  );
}

function ProductFormFields({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: ProductFormValue;
  onChange: (next: ProductFormValue) => void;
  errors: ProductFormErrors;
  disabled: boolean;
}) {
  const { data: tree } = useCategoriesQuery();
  const [large, medium, small] = value.category;
  const mediumOptions = categoryChildren(tree, large);
  const smallOptions = categoryChildren(tree, medium);

  const setCategory = (depth: 0 | 1 | 2, next: string) => {
    // 상위를 바꾸면 하위는 무효가 된다
    const category: [string, string, string] =
      depth === 0
        ? [next, "", ""]
        : depth === 1
          ? [large, next, ""]
          : [large, medium, next];
    onChange({ ...value, category });
  };

  const categoryInvalid = errors.categoryId !== undefined;

  return (
    <>
      <FormField label="품명" required htmlFor={fieldId("name")}>
        <Input
          id={fieldId("name")}
          className={`max-w-70 ${INVALID_INPUT_CLASS}`}
          disabled={disabled}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="예: 루즈 오버핏 셔츠"
          maxLength={100}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? errorId("name") : undefined}
        />
        {errors.name ? (
          <FieldError id={errorId("name")}>{errors.name}</FieldError>
        ) : null}
      </FormField>

      <FormField label="카테고리 분류" required>
        {/* 값은 카테고리 id다(`ProductFormValue.category` 주석). 라벨은 트리에서 찾는다.
            소분류(리프)만 요청에 실린다 — 상위 둘은 그 리프를 찾기 위한 길이다 */}
        <div className="flex items-center gap-2">
          <CategorySelect
            id={fieldId("categoryId")}
            label="카테고리 대분류"
            placeholder="대분류 선택"
            value={large}
            options={tree}
            disabled={disabled}
            invalid={categoryInvalid}
            onChange={(v) => setCategory(0, v)}
          />

          <ChevronRight
            aria-hidden
            className="text-border-strong size-4 shrink-0"
          />

          <CategorySelect
            label="카테고리 중분류"
            placeholder="중분류 선택"
            value={medium}
            options={mediumOptions}
            disabled={disabled || large === ""}
            invalid={categoryInvalid}
            onChange={(v) => setCategory(1, v)}
          />

          <ChevronRight
            aria-hidden
            className="text-border-strong size-4 shrink-0"
          />

          <CategorySelect
            label="카테고리 소분류"
            placeholder="소분류 선택"
            value={small}
            options={smallOptions}
            disabled={disabled || medium === ""}
            invalid={categoryInvalid}
            describedBy={categoryInvalid ? errorId("categoryId") : undefined}
            onChange={(v) => setCategory(2, v)}
          />
        </div>
        {errors.categoryId ? (
          <FieldError id={errorId("categoryId")}>
            {errors.categoryId}
          </FieldError>
        ) : null}
      </FormField>

      <FormField label="옵션" required>
        <ProductOptionMatrix
          options={value.options}
          disabled={disabled}
          onChange={(options) => onChange({ ...value, options })}
          triggerId={fieldId("colorOptions")}
          invalid={errors.colorOptions !== undefined}
          describedBy={
            errors.colorOptions ? errorId("colorOptions") : undefined
          }
        />
        {errors.colorOptions ? (
          <FieldError id={errorId("colorOptions")}>
            {errors.colorOptions}
          </FieldError>
        ) : null}
      </FormField>
    </>
  );
}

function CategorySelect({
  id,
  label,
  placeholder,
  value,
  options,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id?: string;
  label: string;
  placeholder: string;
  /** 카테고리 id 문자열. 빈 문자열 = 미선택 */
  value: string;
  options: readonly CategoryNode[];
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  onChange: (next: string) => void;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        className={`max-w-44 ${INVALID_INPUT_CLASS}`}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>
      <Select.Content>
        {options.map((node) => (
          <Select.Item key={node.id} value={String(node.id)}>
            {node.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
}

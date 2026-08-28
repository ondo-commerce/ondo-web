"use client";

import { FormField, Input, Panel, Select } from "@ondo/ui";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { ProductOptionMatrix, type OptionDraft } from "./ProductOptionMatrix";
import { CATEGORY_TREE } from "../constants";

export interface ProductFormValue {
  name: string;
  category: [string, string, string];
  options: OptionDraft[];
}

export const EMPTY_PRODUCT_FORM: ProductFormValue = {
  name: "",
  category: ["", "", ""],
  options: [],
};

/**
 * 상품 등록/수정 폼의 윗 패널. 등록과 수정이 같은 구조라 한 컴포넌트를 공유한다
 * (제목만 다르다). 저장은 하지 않는다 — 값 편집과 이동만 한다.
 */
export function ProductFormPanel({
  title,
  action,
  value,
  onChange,
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
  disabled?: boolean;
}) {
  const [large, medium] = value.category;
  const mediumOptions = large ? Object.keys(CATEGORY_TREE[large] ?? {}) : [];
  const smallOptions =
    large && medium ? (CATEGORY_TREE[large]?.[medium] ?? []) : [];

  const setCategory = (depth: 0 | 1 | 2, next: string) => {
    // 상위를 바꾸면 하위는 무효가 된다
    const category: [string, string, string] =
      depth === 0
        ? [next, "", ""]
        : depth === 1
          ? [value.category[0], next, ""]
          : [value.category[0], value.category[1], next];
    onChange({ ...value, category });
  };

  return (
    <Panel className="flex-1">
      <Panel.Title action={action}>{title}</Panel.Title>

      {/* 스크롤은 여기 안에서만. 스파이 목차를 없애면서 앵커 id도 같이 지웠다 */}
      <Panel.Body>
        <FormField label="품명" required htmlFor="name">
          <Input
            id="name"
            disabled={disabled}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="예: 루즈 오버핏 셔츠"
            className="max-w-70"
          />
        </FormField>

        <FormField label="카테고리 분류" required>
          <div className="flex items-center gap-2">
            <Select
              value={large || undefined}
              onValueChange={(v) => setCategory(0, v)}
              disabled={disabled}
            >
              <Select.Trigger className="max-w-44" aria-label="카테고리 대분류">
                <Select.Value placeholder="대분류 선택" />
              </Select.Trigger>
              <Select.Content>
                {Object.keys(CATEGORY_TREE).map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <ChevronRight
              aria-hidden
              className="text-border-strong size-4 shrink-0"
            />

            <Select
              value={medium || undefined}
              onValueChange={(v) => setCategory(1, v)}
              disabled={disabled || !large}
            >
              <Select.Trigger className="max-w-44" aria-label="카테고리 중분류">
                <Select.Value placeholder="중분류 선택" />
              </Select.Trigger>
              <Select.Content>
                {mediumOptions.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <ChevronRight
              aria-hidden
              className="text-border-strong size-4 shrink-0"
            />

            <Select
              value={value.category[2] || undefined}
              onValueChange={(v) => setCategory(2, v)}
              disabled={disabled || !medium}
            >
              <Select.Trigger className="max-w-44" aria-label="카테고리 소분류">
                <Select.Value placeholder="소분류 선택" />
              </Select.Trigger>
              <Select.Content>
                {smallOptions.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </FormField>

        <FormField
          label="옵션"
          required
          // hint="색상 × 사이즈가 그대로 SKU가 됩니다. 색마다 사이즈가 다르면 표를 펴서 지정하세요."
        >
          <ProductOptionMatrix
            options={value.options}
            disabled={disabled}
            onChange={(options) => onChange({ ...value, options })}
          />
        </FormField>
      </Panel.Body>
    </Panel>
  );
}

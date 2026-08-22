"use client";

import { FormField, Input, Panel, Segmented, Switch, Textarea } from "@ondo/ui";
import type { ReactNode } from "react";
import { PostImageGrid } from "./PostImageGrid";
import {
  PostPriceTable,
  type PriceRow,
  type PriceValue,
} from "./PostPriceTable";
import type { PostStatus } from "../types";

export interface PostFormValue {
  name: string;
  description: string;
  images: string[];
  allowSinglePiece: boolean;
  prices: Record<string, PriceValue>;
}

export const EMPTY_POST_FORM: PostFormValue = {
  name: "",
  description: "",
  // TODO(임시): 슬롯 너비 눈으로 확인하려고 채워둔 더미. 확인 끝나면 [] 로 되돌린다
  images: Array.from({ length: 9 }, () => "IMG"),
  allowSinglePiece: false,
  prices: {},
};

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
  /** 수정 화면에서만 넘긴다. 없으면 세그먼트 토글이 나오지 않는다 */
  status?: PostStatus;
  onStatusChange?: (next: PostStatus) => void;
  /**
   * 제목 우측에 놓을 것. 등록 화면이 "함께 게시" 체크박스를 여기 꽂는다.
   * 상태 토글과 같은 자리라 둘이 동시에 오는 경우는 없다 (등록엔 상태가 없다).
   */
  action?: ReactNode;
}) {
  const disabled = status === "SEASON_ENDED";

  return (
    <Panel className="flex-1">
      <Panel.Title
        action={
          action ??
          (status && onStatusChange ? (
            <Segmented
              value={status}
              onValueChange={(v) => v && onStatusChange(v as PostStatus)}
            >
              <Segmented.Item value="ON_SALE">판매중</Segmented.Item>
              <Segmented.Item value="SEASON_ENDED">시즌 종료</Segmented.Item>
            </Segmented>
          ) : null)
        }
      >
        {title}
      </Panel.Title>

      <Panel.Body>
        {disabled ? (
          <p className="text-muted-foreground mb-6 text-sm">
            시즌 종료 상태에서는 게시글을 수정할 수 없습니다. 판매중으로
            되돌리면 다시 편집할 수 있어요.
          </p>
        ) : null}

        {/* 패널이 반쪽 폭이라 좁을 땐 이미지가 아래로 내려간다 */}
        <div className="flex flex-col gap-8 2xl:flex-row">
          <div className="min-w-0 flex-1">
            <FormField label="게시글 이름" required htmlFor="post-name-input">
              <Input
                id="post-name-input"
                disabled={disabled}
                value={value.name}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
                placeholder="예: [신상] 루즈 오버핏 셔츠 데일리 남방"
                className="max-w-70"
              />
            </FormField>

            <FormField label="상세 설명" htmlFor="post-desc">
              <Textarea
                id="post-desc"
                disabled={disabled}
                value={value.description}
                onChange={(e) =>
                  onChange({ ...value, description: e.target.value })
                }
                rows={3}
              />
            </FormField>

            <FormField
              label="게시글 이미지"
              hint="첫 번째 이미지가 대표 이미지로 지정됩니다. 드래그하여 순서를 변경할 수 있어요."
              required
            >
              <PostImageGrid images={value.images} disabled={disabled} />
            </FormField>

            <FormField label="낱장 등록">
              <div className="border-border flex items-center justify-between rounded-control border px-4 py-3">
                <span className="text-sm">첫 구매시 1장 구매 허용</span>
                <Switch
                  disabled={disabled}
                  checked={value.allowSinglePiece}
                  onCheckedChange={(checked) =>
                    onChange({ ...value, allowSinglePiece: checked })
                  }
                  aria-label="첫 구매시 1장 구매 허용"
                />
              </div>
            </FormField>

            <FormField label="옵션별 판매가 & 주문 제한 재고 설정" required>
              <PostPriceTable
                rows={priceRows}
                values={value.prices}
                disabled={disabled}
                showAvgCost={showAvgCost}
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
                          ...(value.prices[r.id] ?? {
                            orderLimit: 0,
                            price: 0,
                          }),
                          [field]: v,
                        },
                      ]),
                    ),
                  })
                }
              />
            </FormField>
          </div>
        </div>
      </Panel.Body>
    </Panel>
  );
}

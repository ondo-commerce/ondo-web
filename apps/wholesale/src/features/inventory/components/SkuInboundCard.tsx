"use client";

import { Button, Chip, Input, Panel, cn } from "@ondo/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import { InboundConfirmDialog } from "./InboundConfirmDialog";
import { useInboundMutation, useStockRefresh } from "../api/mutations";
import { useInventoryProductQuery } from "../api/queries";
import { INBOUND_FIELDS } from "../constants";
import {
  inboundEntries,
  missingUnitPriceCount,
  inboundErrorText,
  inboundNotice,
  inputOf,
  isDigits,
  parseNumberInput,
  stockAfterInbound,
  toInboundRequest,
  totalAmount,
} from "../derive";
import type { InboundDrafts, InboundEntry, InboundInput } from "../types";
import { toFieldErrors } from "@/shared/api/fieldErrors";
import { formatNumber } from "@/shared/lib/format";

/**
 * 라벨-값 한 줄. 좌우 두 열이 같은 높이로 맞아야 `현재고 / +추가 재고 / 변동 후 재고`가
 * 위아래 계산식으로 읽힌다 — 그래서 높이를 고정한다.
 */
function Row({
  label,
  children,
  divider,
}: {
  label: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between gap-3",
        divider && "border-border border-b",
      )}
    >
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      {children}
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-sm tabular-nums">{children}</span>;
}

/** 파생값 두 개는 이 카드에서 가장 큰 글자다. 입력의 결과가 결론이기 때문이다 */
function Result({ children }: { children: ReactNode }) {
  return <span className="text-lg font-bold tabular-nums">{children}</span>;
}

/**
 * 우측 모드 B 카드 1 — SKU 한 줄 입고(`POST /inbounds`, 라인 1줄).
 *
 * `입력재고`는 별도 입력이 아니라 **`추가 재고`의 미러**다. 라벨 앞의 `+` `×`는
 * 장식이 아니라 위아래 값의 연산 관계를 읽히게 하는 기호다.
 *
 * 현재고는 상품 상세에서 온다 — 목록·모드 A와 같은 키라 입고 뒤 셋이 같이 움직인다.
 * 입력값은 모드 A와 **같은 칸**(`drafts[variantId]`)이다 — 표에서 적은 값이 여기 보이고,
 * 여기서 적은 값이 표로 돌아간다.
 *
 * `Panel`은 부르는 쪽이 그린다 — 경계가 패널 안에 있어야 기다리는 동안 폭이 유지된다.
 */
export function SkuInboundCard({
  productId,
  variantId,
  drafts,
  onDraftChange,
  onReceived,
}: {
  productId: number;
  variantId: number;
  drafts: InboundDrafts;
  onDraftChange: (variantId: number, next: InboundInput) => void;
  onReceived: (entries: InboundEntry[]) => void;
}) {
  /* `isRefetchError`: 캐시엔 데이터가 있는데 재조회만 실패한 상태. 경계가 못 잡는 유일한 실패라
     여기서 읽는다 — 입고 뒤 이 상태면 카드 숫자가 옛 값이다(wire-inventory F2) */
  const { data: product, isRefetchError } = useInventoryProductQuery(productId);
  const sku = product.skus.find((s) => s.id === variantId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sent, setSent] = useState<InboundEntry[]>([]);
  const inbound = useInboundMutation(productId, {
    onDone: () => onReceived(sent),
  });
  const refresh = useStockRefresh(productId);

  /* 다른 데서 지워진 SKU(입고 뒤 재조회로 사라짐). 카드는 남기되 안내만 — 목록이 곧 따라온다 */
  if (!sku) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        이 SKU가 상품에서 사라졌어요. 좌측 목록을 다시 확인해 주세요.
      </p>
    );
  }

  const value = inputOf(drafts, sku.id);
  const added = parseNumberInput(value.qty);
  const price = parseNumberInput(value.unitPrice);
  const after = stockAfterInbound(sku.stock, added);
  const amount = totalAmount(added, price);
  const entries = inboundEntries([sku], drafts);
  /* 수량은 적고 단가는 빈 상태 — 서버가 거절하니 여기서 막고 무엇을 채울지 말한다 */
  const missingPrice = missingUnitPriceCount([sku], drafts) > 0;

  const setField = (field: keyof InboundInput, raw: string) => {
    if (inbound.error || inbound.isSuccess) inbound.reset();
    onDraftChange(sku.id, { ...value, [field]: raw });
  };

  /* 숫자 아닌 키·붙여넣기는 칸에 들어오기 전에 막는다(Q-03) */
  const blockNonDigits = (event: FormEvent<HTMLInputElement>) => {
    const data = (event.nativeEvent as InputEvent).data;
    if (data !== null && data !== undefined && !isDigits(data)) {
      event.preventDefault();
    }
  };

  const confirm = () => {
    if (entries.length === 0) return;
    setSent(entries);
    setConfirmOpen(false);
    inbound.mutate(toInboundRequest(entries, new Date().toISOString()));
  };

  const errorText = inbound.error
    ? (() => {
        const fields = toFieldErrors(inbound.error, INBOUND_FIELDS);
        if (fields)
          return fields.items ?? fields.receivedAt ?? fields._form ?? null;
        return inboundErrorText(inbound.error);
      })()
    : null;
  const notice = inboundNotice(inbound.isSuccess, isRefetchError);

  return (
    <>
      <Panel.Title action={<Chip tone="sub">{product.code}</Chip>}>
        {product.name} · {sku.color}/{sku.size}
      </Panel.Title>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <Row label="현재고">
            <Value>{formatNumber(sku.stock)}</Value>
          </Row>
          <Row label="+ 추가 재고" divider>
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              className="w-24"
              aria-label="추가 재고"
              value={value.qty}
              onBeforeInput={blockNonDigits}
              onChange={(e) => setField("qty", e.target.value)}
            />
          </Row>
          <Row label="변동 후 재고">
            <Result>{formatNumber(after)}개</Result>
          </Row>
        </div>

        <div>
          {/* 입력재고 = 추가 재고의 미러. 따로 적는 값이 아니라 읽기 전용이다 */}
          <Row label="입력재고">
            <Value>{formatNumber(added ?? 0)}</Value>
          </Row>
          <Row label="× 매입단가" divider>
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              className="w-24"
              aria-label="매입단가"
              value={value.unitPrice}
              onBeforeInput={blockNonDigits}
              onChange={(e) => setField("unitPrice", e.target.value)}
            />
          </Row>
          <Row label="총 금액">
            {/* 수량·단가 중 하나만 적혀 있으면 빈칸이다(§7 Q5와 같은 규칙) */}
            <Result>
              {amount === null ? "" : `${formatNumber(amount)}원`}
            </Result>
          </Row>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {errorText ? (
          <p role="alert" className="text-destructive-strong text-sm">
            {errorText}
          </p>
        ) : missingPrice ? (
          <p role="status" className="text-destructive-strong text-sm">
            매입단가를 적어 주세요
          </p>
        ) : notice ? (
          <p
            role={notice.tone === "stale" ? "alert" : "status"}
            className={
              notice.tone === "stale"
                ? "text-destructive-strong text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {notice.text}
          </p>
        ) : null}
        {/* 숫자가 낡았으면 새 입고 대신 다시 불러오기 — 옛 숫자를 보고 한 번 더 누르는 길을 막는다 */}
        {isRefetchError ? (
          <Button
            type="button"
            variant="line"
            onClick={() => void refresh([sku.id])}
          >
            다시 불러오기
          </Button>
        ) : null}
        <Button
          disabled={entries.length === 0 || inbound.isPending || isRefetchError}
          onClick={() => setConfirmOpen(true)}
        >
          입고 처리
        </Button>
      </div>

      <InboundConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirm}
        description={
          <>
            {sku.color}/{sku.size} · 현재고 {formatNumber(sku.stock)}개 →{" "}
            <b className="text-foreground">{formatNumber(after)}개</b>로
            늘립니다.
            <br />
            처리하면 변동 이력 맨 위에 입고 한 줄이 남습니다.
          </>
        }
      />
    </>
  );
}

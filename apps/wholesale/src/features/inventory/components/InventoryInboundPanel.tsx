"use client";

import { Button, Chip, ColorDot, Input, Panel, Table } from "@ondo/ui";
import { useState, type FormEvent } from "react";
import { InboundConfirmDialog } from "./InboundConfirmDialog";
import { useInboundMutation } from "../api/mutations";
import { useInventoryProductQuery } from "../api/queries";
import { INBOUND_FIELDS } from "../constants";
import {
  estimatedAmount,
  inboundEntries,
  inboundErrorText,
  inputOf,
  isDigits,
  parseNumberInput,
  toInboundRequest,
  totalInboundQty,
} from "../derive";
import type { InboundDrafts, InboundEntry, InboundInput } from "../types";
import { toFieldErrors } from "@/shared/api/fieldErrors";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 모드 A — 상품 단위 일괄 입고 표(`POST /inbounds`, 라인 N줄).
 * 상품 행을 펼쳤고 SKU 행은 아직 고르지 않은 상태에서 보인다.
 *
 * 행은 **그 상품의 SKU 전부**다. 좌측 표에서 색상을 접거나 필터를 걸어도
 * 여기서는 줄지 않는다 — 좌측은 보는 화면이고 여기는 적는 화면이라, 안 보이는
 * 줄에 값이 남아 있는 채로 입고되는 상황을 만들지 않기 위해서다(Q-05).
 *
 * 매입단가는 **빈칸으로 시작한다**(§7 Q3). 직전 값이 남아 있으면 이번 입고분의
 * 단가가 아닌 값이 그대로 확정된다.
 *
 * 입력값(`drafts`)은 여기 두지 않고 `InventoryListView`가 SKU별로 든다 — SKU 행을 눌러
 * 모드 B로 갔다 오면 이 컴포넌트가 내려가는데 그때 적은 값이 사라지면 안 된다(Q-01).
 *
 * `Panel`은 부르는 쪽이 그린다 — 경계가 패널 안에 있어야 기다리는 동안 폭이 유지된다.
 */
export function InventoryInboundPanel({
  productId,
  drafts,
  onDraftChange,
  onReceived,
}: {
  productId: number;
  drafts: InboundDrafts;
  onDraftChange: (variantId: number, next: InboundInput) => void;
  /** 서버가 받아 준 뒤. 보낸 줄이 무엇인지 알려 준다 — 그 줄의 입력만 비운다 */
  onReceived: (entries: InboundEntry[]) => void;
}) {
  const { data: product } = useInventoryProductQuery(productId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* 수량을 적은 줄만 입고 대상이다. 단가만 적힌 줄은 입고가 아니다 */
  const entries = inboundEntries(product.skus, drafts);
  const totalQty = totalInboundQty(entries);

  /* 보낸 줄을 기억해 둔다 — 응답이 올 때쯤 입력이 바뀌어 있어도 그때 보낸 줄만 지운다 */
  const [sent, setSent] = useState<InboundEntry[]>([]);
  const inbound = useInboundMutation(productId, {
    onDone: () => onReceived(sent),
  });

  const setField = (
    variantId: number,
    field: keyof InboundInput,
    raw: string,
  ) => {
    // 고치기 시작하면 직전 결과(오류·처리됨)를 지운다 — 옛 오류가 새 입력 밑에 남지 않게
    if (inbound.error || inbound.isSuccess) inbound.reset();
    onDraftChange(variantId, { ...inputOf(drafts, variantId), [field]: raw });
  };

  /* 숫자 아닌 키·붙여넣기는 칸에 들어오기 전에 막는다(Q-03) */
  const blockNonDigits = (event: FormEvent<HTMLInputElement>) => {
    const data = (event.nativeEvent as InputEvent).data;
    if (data !== null && data !== undefined && !isDigits(data)) {
      event.preventDefault();
    }
  };

  const confirm = () => {
    setSent(entries);
    setConfirmOpen(false);
    // 오늘 시각은 렌더가 아니라 버튼을 누른 이 순간에만 읽는다
    inbound.mutate(toInboundRequest(entries, new Date().toISOString()));
  };

  /* 서버 오류: `VALIDATION_FAILED`는 칸 이름으로(둘 다 폼 위 한 줄로 떨어진다 — 줄 단위 칸이 없다),
     나머지(400 로트 중복·409·404·5xx)는 코드별 문구 */
  const errorText = inbound.error
    ? (() => {
        const fields = toFieldErrors(inbound.error, INBOUND_FIELDS);
        if (fields)
          return fields.items ?? fields.receivedAt ?? fields._form ?? null;
        return inboundErrorText(inbound.error);
      })()
    : null;

  /* 색상은 그룹의 첫 행에만 그린다. 좌측 표와 같은 규칙이다 */
  const firstOfColor = new Map<string, number>();
  for (const s of product.skus) {
    if (!firstOfColor.has(s.color)) firstOfColor.set(s.color, s.id);
  }

  return (
    <>
      <Panel.Title action={<Chip tone="sub">{product.code}</Chip>}>
        {product.name}
      </Panel.Title>

      <Panel.Body>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Th align="left">색상</Table.Th>
              <Table.Th align="center">사이즈</Table.Th>
              <Table.Th>입고수량</Table.Th>
              <Table.Th>매입단가</Table.Th>
              <Table.Th>예상 금액</Table.Th>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {product.skus.map((s) => {
              const value = inputOf(drafts, s.id);
              const amount = estimatedAmount(
                parseNumberInput(value.qty),
                parseNumberInput(value.unitPrice),
              );

              return (
                <Table.Row key={s.id}>
                  <Table.Td align="left">
                    {firstOfColor.get(s.color) === s.id ? (
                      <span className="flex items-center gap-1.5">
                        <ColorDot color={s.colorHex} />
                        <span>{s.color}</span>
                      </span>
                    ) : null}
                  </Table.Td>
                  <Table.Td align="center">{s.size}</Table.Td>
                  <Table.Td>
                    <Input
                      size="sm"
                      numeric
                      inputMode="numeric"
                      className="w-20"
                      aria-label={`${s.color} ${s.size} 입고수량`}
                      value={value.qty}
                      onBeforeInput={blockNonDigits}
                      onChange={(e) => setField(s.id, "qty", e.target.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Input
                      size="sm"
                      numeric
                      inputMode="numeric"
                      className="w-20"
                      aria-label={`${s.color} ${s.size} 매입단가`}
                      value={value.unitPrice}
                      onBeforeInput={blockNonDigits}
                      onChange={(e) =>
                        setField(s.id, "unitPrice", e.target.value)
                      }
                    />
                  </Table.Td>
                  {/* 둘 중 하나만 적혀 있으면 빈칸이다. 0원은 "공짜로 받았다"로 읽힌다(§7 Q5) */}
                  <Table.Td>
                    {amount === null ? "" : formatNumber(amount)}
                  </Table.Td>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </Panel.Body>

      {/* 거절 사유·처리 결과는 버튼 왼쪽 한 줄 — 패널 안, 입력 바로 아래다 */}
      <div className="mt-4 flex shrink-0 items-center justify-end gap-3">
        {errorText ? (
          <p role="alert" className="text-destructive-strong text-sm">
            {errorText}
          </p>
        ) : inbound.isSuccess ? (
          <p role="status" className="text-muted-foreground text-sm">
            입고 처리했어요
          </p>
        ) : null}
        <Button
          disabled={entries.length === 0 || inbound.isPending}
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
            {product.name} · SKU {entries.length}줄에 총{" "}
            <b className="text-foreground">{formatNumber(totalQty)}개</b>를
            입고합니다.
            <br />
            처리하면 좌측 표의 현재고가 바로 늘어납니다.
          </>
        }
      />
    </>
  );
}

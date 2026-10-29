"use client";

import { Button } from "@ondo/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useStockCartMutation } from "../api/cart";
import { isChatSessionLostError } from "../api/session";
import { APPROVAL_PATH, CART_HREF, STOCK_TEXT } from "../constants";
import {
  cardAddedText,
  cartAddFailureOf,
  checkCardQty,
  stockCardLine,
} from "../derive";
import type { AddToCart, CardNote, StockCardView } from "../types";
import { QtyStepper } from "@/shared/components/QtyStepper";

/**
 * 재고 자동 답 말풍선 안 카드 칸(loop-05b S8-4~S8-9, 디자인 결정 18 19 24~27 29). 별도 상자가 아니라 근거 칸과
 * 같은 위 선 1px 아래다 — 답 하나가 상자 하나라 어느 담기가 어느 답 것인지 헷갈리지 않는다(방향안 A).
 *
 * 수량 칸은 친 글자 그대로 둔다(`checkCardQty`, S8-6). 담기는 누르는 즉시 `담는 중` + 잠김이라 연타해도
 * 요청 1회(S8-7). 결과는 카드 맨 아래 한 줄 — 성공은 role=status, 실패는 role=alert. 401은 방 전체가 끊김
 * 상태가 되고 카드엔 따로 띄우지 않는다(결정 29).
 */
export function StockReplyCard({
  card,
  sessionLost,
  addToCart,
}: {
  card: StockCardView;
  sessionLost: boolean;
  /** 조립부가 준 담기. 없으면(조립부 밖에서 그린 방) 버튼은 그리되 잠근다 */
  addToCart: AddToCart | null;
}) {
  const router = useRouter();
  const noteId = useId();
  const [qtyText, setQtyText] = useState("1");
  const [note, setNote] = useState<CardNote | null>(null);
  const mutation = useStockCartMutation(
    addToCart ?? (() => Promise.reject(new Error("담기 없음"))),
  );
  /* 같은 틱의 두 번째 클릭은 아직 `isPending`이 반영되기 전이라 ref로 한 번 더 막는다(S8-7) */
  const inflight = useRef(false);

  const check = checkCardQty(qtyText, card.orderLimit);
  const busy = mutation.isPending;
  const locked = sessionLost || busy || addToCart === null;
  const canAdd = card.addable && !locked && check.qty !== null;

  const add = () => {
    if (!canAdd || check.qty === null || inflight.current) return;
    inflight.current = true;
    setNote(null);
    mutation.mutate(
      { variantId: card.variantId, qty: check.qty },
      {
        onSuccess: (result) => setNote({ type: "added", qty: result.qty }),
        onError: (error) => {
          if (isChatSessionLostError(error)) return;
          const failure = cartAddFailureOf(error);
          if (failure === "approval") {
            router.replace(APPROVAL_PATH);
            return;
          }
          setNote({ type: "failed", message: failure.message });
        },
        onSettled: () => {
          inflight.current = false;
        },
      },
    );
  };

  /* 아래 한 줄: 수량 이유가 먼저(지금 고칠 것), 그다음 지난 담기 결과 */
  const reason = card.addable ? check.reason : null;
  const describedBy = reason !== null || note !== null ? noteId : undefined;

  return (
    <div
      data-ac="S8-4"
      data-variant-id={card.variantId}
      className="border-border grid gap-2 border-t pt-2"
    >
      {/* 와이어프레임 .scard .fl — 본문 13px 보조색, 옵션 이름과 값만 500 + 본문색(QA F3) */}
      <span
        data-ac={card.band === "NONE" ? "S8-9" : "S8-4"}
        className="text-secondary-foreground text-body"
      >
        {stockCardLine(card).map((part, i) =>
          part.strong ? (
            <b key={i} className="text-foreground font-medium">
              {part.text}
            </b>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </span>
      {/* 수량 칸과 버튼은 한 줄, 좁으면 버튼이 다음 줄(결정 24) */}
      <div className="flex flex-wrap items-center gap-2">
        {card.addable ? (
          <span data-ac="S8-6" className="w-24.5">
            <QtyStepper
              value={qtyText}
              onChange={(next) => {
                setQtyText(next);
                if (note?.type === "failed") setNote(null);
              }}
              disabled={locked}
              label={`${card.optionName}${STOCK_TEXT.qtyLabelSuffix}`}
              invalid={reason !== null}
              describedBy={describedBy}
            />
          </span>
        ) : null}
        <Button
          type="button"
          disabled={!canAdd}
          aria-busy={busy || undefined}
          aria-describedby={describedBy}
          onClick={add}
          data-ac="S8-5 S8-7 S8-9 S8-11"
          className="phone:h-11"
        >
          {busy ? STOCK_TEXT.adding : STOCK_TEXT.add}
        </Button>
      </div>
      {reason !== null ? (
        <span
          id={noteId}
          data-ac="S8-6"
          className="text-destructive-strong text-body"
        >
          {reason}
        </span>
      ) : note?.type === "added" ? (
        <span
          role="status"
          id={noteId}
          data-ac="S8-5"
          className="text-body flex flex-wrap items-center gap-1.5"
        >
          <Check aria-hidden className="size-3.5" />
          {cardAddedText(note.qty)}
          <Link
            href={CART_HREF}
            data-ac="S8-5 S8-13"
            className="text-primary inline-flex items-center underline phone:min-h-11"
          >
            {STOCK_TEXT.viewCart}
          </Link>
        </span>
      ) : note?.type === "failed" ? (
        <span
          role="alert"
          id={noteId}
          data-ac="S8-7"
          className="text-destructive-strong text-body"
        >
          {note.message}
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { cn, Input, type InputProps } from "@ondo/ui";
import { useEffect, useRef, useState, type InputEvent } from "react";
import { isDigits } from "@/shared/lib/numericInput";

/** 거부 표시(빨간 테두리)가 남는 시간. 키를 친 사람이 알아채기엔 충분하고 다음 글자를 막을 만큼 길진 않다 */
const REJECT_SIGNAL_MS = 700;

export type NumericInputProps = Omit<
  InputProps,
  "type" | "inputMode" | "numeric"
>;

/**
 * 0 이상 정수만 받는 칸. 수량·금액 칸은 전부 이걸 쓴다(주문 `이번 출고`·미송 배분·재고 입고·정산 입금).
 *
 * **숫자 아닌 글자는 칸에 들어가기 전에 막는다**(`onBeforeInput`). `onChange`에서 거르면 React가
 * 값을 되돌리는 사이 다음 글자가 이어 붙어 `4·5·.·5`가 `455`가 된다 — 사장은 `.`이 먹은 줄 안다
 * (wire-order F7). 붙여넣기도 같은 이벤트라 `3.5`는 통째로 거부된다. `type="number"`를 안 쓰는
 * 이유는 브라우저가 `-`·`e`·`.`을 받아 주고 `Number()`가 `45.5`를 그대로 저장하기 때문이다.
 *
 * 막은 뒤엔 **테두리를 잠깐 빨갛게** 한다 — 조용히 버리면 키가 안 먹은 건지 자기가 잘못 친 건지
 * 모른다(wire-backorder F6 · wire-inventory F4). 값이 상한을 넘겼는지는 이 컴포넌트가 모른다 —
 * 부르는 쪽이 `exceedsNumericMax`로 `aria-invalid`를 켜고 문구를 붙인다(같은 테두리 색이다).
 */
export function NumericInput({
  className,
  onBeforeInput,
  ...props
}: NumericInputProps) {
  const [rejected, setRejected] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const block = (event: InputEvent<HTMLInputElement>) => {
    const data = event.nativeEvent.data;
    // data가 null이면 지우기·잘라내기 같은 편집이라 막을 글자가 없다
    if (data !== null && data !== undefined && !isDigits(data)) {
      event.preventDefault();
      setRejected(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setRejected(false),
        REJECT_SIGNAL_MS,
      );
    }
    onBeforeInput?.(event);
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      numeric
      autoComplete="off"
      data-rejected={rejected ? "true" : undefined}
      onBeforeInput={block}
      className={cn(
        "aria-[invalid=true]:border-destructive data-[rejected=true]:border-destructive",
        className,
      )}
    />
  );
}

"use client";

import { cn, Input, type InputProps } from "@ondo/ui";
import { useEffect, useRef, useState, type InputEvent } from "react";
import { isDigits, stripSeparators } from "@/shared/lib/numericInput";

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
 * 막은 뒤엔 **칸을 잠깐 빨갛게** 한다 — 조용히 버리면 키가 안 먹은 건지 자기가 잘못 친 건지
 * 모른다(wire-backorder F6 · wire-inventory F4). 테두리만 바꾸면 안 보인다: 타이핑 중이라 칸은
 * 늘 포커스 상태고 브라우저 기본 포커스 링(`outline: auto 1px`)이 1px 테두리를 그대로 덮는다
 * (fix-197-198-199 F1, 확대 캡처로 0픽셀 차이). 그래서 outline 자체를 빨간 2px로 바꾸고 배경도
 * 옅게 물들인다. 값이 상한을 넘겼는지는 이 컴포넌트가 모른다 — 부르는 쪽이 `exceedsNumericMax`로
 * `aria-invalid`를 켜고 문구를 붙인다(같은 색으로 같은 자리에서 보인다).
 *
 * **쉼표·공백은 벗겨서 받는다.** 좌측 표·통장 앱에서 복사한 `37,500`을 못 붙이면 금액 칸 구실을
 * 못 한다(F2 회귀). 벗긴 결과가 숫자면 그 값을 커서 자리에 넣고 `input` 이벤트를 다시 쏜다 —
 * React는 `value` setter를 거치지 않은 변경을 이벤트 때 알아채므로 `onChange`가 돈다.
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

  const signalReject = () => {
    setRejected(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setRejected(false),
      REJECT_SIGNAL_MS,
    );
  };

  const block = (event: InputEvent<HTMLInputElement>) => {
    const data = event.nativeEvent.data;
    // data가 null이면 지우기·잘라내기 같은 편집이라 막을 글자가 없다
    if (data === null || data === undefined || isDigits(data)) {
      onBeforeInput?.(event);
      return;
    }
    const stripped = stripSeparators(data);
    if (stripped !== "" && isDigits(stripped)) {
      // `37,500` 붙여넣기 — 쉼표만 벗겨 커서 자리에 넣는다
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.setRangeText(stripped, start, end, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      onBeforeInput?.(event);
      return;
    }
    event.preventDefault();
    signalReject();
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
        // 포커스 링 위에서도 보이게 outline을 통째로 바꾼다 — 테두리만으론 링에 덮인다
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-destructive",
        "data-[rejected=true]:border-destructive data-[rejected=true]:bg-destructive/10 data-[rejected=true]:outline-2 data-[rejected=true]:outline-destructive",
        className,
      )}
    />
  );
}

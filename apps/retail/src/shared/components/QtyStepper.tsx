"use client";

import { cn } from "@ondo/ui";
import { Minus, Plus } from "lucide-react";
import { SKU_ORDER_LIMIT, clampQty, parseQty } from "@/shared/qty";

/**
 * 수량 입력 한 칸 — `−` / 값 / `+`.
 *
 * **`type="number"`를 쓰지 않는다.** 브라우저의 number 입력은 `45.5`·`1e3`·`-3`을
 * 스스로 받아 주고, 값이 유효하지 않으면 `value`가 빈 문자열로 오기까지 한다.
 * 그러면 사장이 무엇을 쳤는지 화면이 잃어버려서 "왜 안 되는지"를 말할 수 없다.
 * 글자를 그대로 받고(`type="text"`) 판정은 `parseQty` 한 곳에서 한다.
 * `inputMode="numeric"`은 휴대폰에서 숫자 자판이 뜨게 하는 것뿐이다.
 *
 * 값을 **상태로 지우지 않는 것**이 이 컴포넌트의 규칙이다 — 못 읽는 글자도
 * 그대로 두고, 부르는 쪽이 그 행에 이유를 적는다.
 *
 * **못 읽는 값에서는 −/+ 가 걸린다.** `45.5`가 든 칸에서 `+`를 누르면 `parseQty`가
 * 0으로 읽은 값에서 다시 세어 칸이 `1`이 되고, 친 글자도 빨간 이유 문구도 같이
 * 사라졌다. `45.5`를 `45`로 고치려던 손이 `1`을 만드는 것이라, 45배 주문을 막으려고
 * 값을 지키기로 한 규칙이 ± 경로에서만 새고 있었다. 읽을 수 없는 값에서 1을
 * 더하거나 뺄 방법은 없으므로 버튼을 막고, 왜 막혔는지는 이미 그 행에 떠 있는
 * 이유 문구가 말한다.
 *
 * **`features/product`에서 `shared/`로 올렸다.** 상품 상세와 장바구니 두 곳이
 * 같은 칸을 쓴다(Rule of Two). 내용은 그대로고 import 경로만 바뀌었다.
 *
 * **폭이 셀을 따라 줄어든다.** 98px 고정이던 시절에는 390px 옵션 표에서 셀이
 * 68px까지 좁아져 스테퍼가 옆 `소계` 칸 위로 42px 넘어가 그려졌다. −/+ 는 크기를
 * 지키고(손가락으로 눌러야 한다) 가운데 값 칸만 남는 폭을 먹는다.
 */
export function QtyStepper({
  value,
  onChange,
  disabled = false,
  label,
}: {
  /** 칸에 들어 있는 **글자 그대로**. 숫자가 아니다 */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** 스크린리더용 이름. `체리레드 S 수량`처럼 어느 조합인지까지 읽혀야 한다 */
  label: string;
}) {
  const { qty, issue } = parseQty(value);
  /* 상한 초과(OVER_LIMIT)는 값이 500으로 맞춰져 있어 셀 수 있다 — 막을 것은
     숫자로 읽히지 않는 글자뿐이다 */
  const unreadable = issue === "NOT_A_NUMBER";

  const step = (delta: number) => onChange(String(clampQty(qty + delta)));

  return (
    <span
      className={cn(
        "border-input inline-flex h-7 w-full max-w-24.5 items-center overflow-hidden rounded-control border",
        disabled && "bg-muted",
      )}
    >
      <button
        type="button"
        aria-label={`${label} 1 줄이기`}
        disabled={disabled || unreadable || qty <= 0}
        onClick={() => step(-1)}
        className="text-muted-foreground hover:text-foreground grid size-6.5 shrink-0 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus aria-hidden className="size-3.5" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        /* `outline-hidden`으로 브라우저 기본 링까지 지웠던 자리다. 이 페이지에서
           −/+ · 일괄 입력 · 썸네일은 모두 기본 링이 보이는데 **숫자를 넣는 칸
           하나만** 안 보였다. 상자 안쪽으로 그리는 것은 부모가 overflow-hidden
           이라 바깥 링이 잘려서다 */
        className="border-border h-6.5 w-full min-w-0 border-x bg-transparent text-center tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
      />

      <button
        type="button"
        aria-label={`${label} 1 늘리기`}
        disabled={disabled || unreadable || qty >= SKU_ORDER_LIMIT}
        onClick={() => step(1)}
        className="text-muted-foreground hover:text-foreground grid size-6.5 shrink-0 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

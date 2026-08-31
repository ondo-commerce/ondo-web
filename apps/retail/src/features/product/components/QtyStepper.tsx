"use client";

import { cn } from "@ondo/ui";
import { Minus, Plus } from "lucide-react";
import { SKU_ORDER_LIMIT } from "../constants";
import { clampQty, parseQty } from "../derive";

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
  const { qty } = parseQty(value);

  const step = (delta: number) => onChange(String(clampQty(qty + delta)));

  return (
    <span
      className={cn(
        "border-input inline-flex h-7 items-center overflow-hidden rounded-control border",
        disabled && "bg-muted",
      )}
    >
      <button
        type="button"
        aria-label={`${label} 1 줄이기`}
        disabled={disabled || qty <= 0}
        onClick={() => step(-1)}
        className="text-muted-foreground hover:text-foreground grid size-6.5 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-40"
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
        className="border-border h-6.5 w-11 border-x bg-transparent text-center tabular-nums outline-hidden disabled:cursor-not-allowed"
      />

      <button
        type="button"
        aria-label={`${label} 1 늘리기`}
        disabled={disabled || qty >= SKU_ORDER_LIMIT}
        onClick={() => step(1)}
        className="text-muted-foreground hover:text-foreground grid size-6.5 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

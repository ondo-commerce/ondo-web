import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface ToggleChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value"
> {
  selected?: boolean;
}

/**
 * 테두리형 토글 칩. 다중 선택용 (색상 팔레트 등).
 * 선택 여부는 aria-pressed로 노출한다 — 색만으로 상태를 알리지 않는다.
 *
 * 글자 앞에 ColorDot 같은 표시를 넣을 수 있다. 자식이 하나뿐이면 gap은
 * 아무것도 하지 않으므로 글자만 있는 칩의 모양은 그대로다.
 */
export function ToggleChip({
  className,
  selected = false,
  children,
  ...props
}: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        /* cursor-pointer: Tailwind v4 preflight가 button의 커서를 default로
           바꿔서 직접 준다 (Button·Select와 같은 이유) */
        "inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 text-sm transition-colors",
        // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border bg-card text-muted-foreground hover:border-border-strong/70",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button, type ButtonProps } from "./Button";
import { cva, type VariantProps } from "class-variance-authority";

export interface IconButtonProps
  extends
    Omit<ButtonProps, "size" | "asChild">,
    VariantProps<typeof iconButton> {
  /** 글자가 없으니 필수다. 없으면 스크린리더에 "버튼"으로만 읽힌다 */
  "aria-label": string;
  size?: "sm" | "md";
  /** 아이콘 하나. 글자를 넣지 않는다 — 넣어야 하면 `Button`이다 */
  children: ReactNode;
}

const iconButton = cva("shrink-0 px-0", {
  variants: {
    size: {
      sm: "size-7 [&_svg]:size-4.5",
      md: "size-8 [&_svg]:size-5",
    },
  },
  defaultVariants: { size: "md" },
});

export function IconButton({
  size = "sm",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Button
      /* Button은 type 기본값을 주지 않아서 submit이 된다. ...props보다 앞이라
         호출부가 필요하면 덮을 수 있다 */
      type="button"
      /* Button의 크기 축을 끈다. null이면 cva가 size 클래스를 아예 안 붙인다.
         안 끄면 defaultVariants의 md(h-8 px-4)가 붙어서 px-4 때문에 정사각이 깨진다 */
      className={cn(iconButton({ size }), className)}
      {...props}
    >
      {children}
    </Button>
  );
}

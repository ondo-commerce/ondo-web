import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const button = cva(
  /* gap: 아이콘 + 글자를 나란히 두는 버튼이 있다 (◎ 색상 선택).
     cursor-pointer: Tailwind v4 preflight가 button의 커서를 default로 바꿔서 직접 준다 */
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-button font-medium whitespace-nowrap transition-colors " +
    // "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden " +
    "disabled:pointer-events-none",
  {
    variants: {
      variant: {
        /* 주요 액션. 화면당 하나가 원칙이다 */
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-border-strong",
        /* 보조 액션 — 회색 채움. 디자인 시스템 카탈로그의 `.btn.ghost`가 이것이다.
           와이어프레임 HTML은 계속 .btn.ghost로 이 모양을 그리므로 옮길 때 주의 */
        soft: "bg-secondary text-muted-foreground hover:bg-secondary-strong disabled:text-border-strong",
        /* 표면 없는 액션. 표 안의 ✕, 아코디언 토글처럼 상자를 보이면 안 되는 자리.
           관례(shadcn)대로 평소엔 투명하고 hover에서만 배경이 생긴다 */
        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground disabled:text-border-strong",
        /* 보조 액션 — 흰 배경 + 테두리 */
        line: "bg-card text-secondary-foreground border-border-strong hover:bg-secondary border disabled:text-border-strong",
        /* 되돌릴 수 없는 파괴적 액션(삭제 확정) 전용.
           목록의 삭제 "진입" 버튼은 line이다 — 빨강은 마지막 확인 한 곳에만 쓴다 */
        danger:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-muted disabled:text-border-strong",
        /* 글자만 남는 인라인 액션 (카탈로그의 .link-act).
           크기 variant의 상자값은 아래 compoundVariants에서 전부 벗긴다 */
        link: "text-primary underline-offset-4 hover:underline disabled:text-border-strong",
      },
      size: {
        sm: "h-7 min-w-15 px-3 text-xs",
        md: "h-9 min-w-15 px-4 text-sm",
        /* 등록 폼 하단의 전폭 CTA */
        lg: "h-13 w-full rounded-cta text-lg",
        /* 아이콘 하나만 들어가는 정사각. min-w를 두지 않는다 */
        icon: "size-9",
        iconSm: "size-7",
      },
    },
    /* link는 버튼 상자가 아니라 글자다. 높이·최소폭·좌우 여백을 갖고 있으면
       옆 글자와 베이스라인이 어긋난다 */
    compoundVariants: [
      { variant: "link", class: "h-auto min-w-0 w-auto px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  /**
   * 자식 요소를 버튼 모양으로 렌더한다. 화면을 이동하는 액션은
   * `<Button asChild><Link …/></Button>` 으로 실제 <a>가 되게 한다 —
   * onClick + router.push로 만들면 새 탭 열기·미리보기가 죽는다.
   */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp className={cn(button({ variant, size }), className)} {...props}>
      {children}
    </Comp>
  );
}

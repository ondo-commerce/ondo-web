import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * 이름 첫 글자 아바타 — 회색 바탕에 글자 하나. 채팅 목록 줄과 헤더 계정 버튼에서 상대가 누군지 먼저 보이게 한다.
 * 프로필 이미지는 서버에 필드가 없어 받지 않는다(#454). 생기면 그때 `src`를 더한다.
 *
 * 장식이다 — 이름은 늘 옆에 글자로 있으니 `aria-hidden`으로 스크린리더에서 뺀다. 글자도 DOM 글자가 아니라
 * `::before`로 그린다 — 행이나 제목 안에 들어가도 그 요소의 textContent(복사, 테스트의 글자 비교)에 끼지 않는다.
 */
const avatar = cva(
  "bg-secondary text-secondary-foreground inline-grid shrink-0 place-items-center leading-none font-medium tracking-normal select-none",
  {
    variants: {
      size: {
        /* 헤더 계정 칩. 32px 버튼 안에 들어간다 */
        sm: "size-6 rounded-md text-xs",
        /* 채팅 목록 줄, 방 머리 */
        md: "size-10 rounded-xl text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface AvatarProps
  extends
    Omit<HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof avatar> {
  /** 상호. 첫 글자를 쓴다. 비면 빈 회색 칸이다 */
  name: string;
}

/**
 * `(주)무드온`의 괄호처럼 글자가 아닌 것은 건너뛴다. `Array.from`이 아니면 이모지가 반쪽으로 잘린다.
 * 영문은 대문자로(`moodon@…` → `M`) — 소문자 한 글자는 칸 안에서 작고 낮게 앉는다
 */
function initialOf(name: string): string {
  return (
    Array.from(name)
      .find((ch) => /[\p{L}\p{N}]/u.test(ch))
      ?.toUpperCase() ?? ""
  );
}

export function Avatar({ name, size, className, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden
      data-initial={initialOf(name)}
      className={cn(
        avatar({ size }),
        "before:content-[attr(data-initial)]",
        className,
      )}
      {...props}
    />
  );
}

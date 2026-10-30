"use client";

import { Button, cn } from "@ondo/ui";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHeaderCountsQuery } from "../api/headerCounts";
import { CHATS_HREF } from "../constants";
import { chatBadgeLabel } from "../derive";

/**
 * 헤더 `채팅` 링크 + 안 읽은 메시지 배지(loop-06 S2, 디자인 결정 30~32). 찜과 장바구니 사이에
 * `app/(shop)/layout.tsx`가 끼운다 — 셸(`shared/`)은 이 feature를 못 읽는다.
 *
 * 배지는 옆 장바구니 카운터(`CartButton`)와 **같은 모양**이다. 같은 줄의 두 숫자는 같은 모양이어야 한다
 * (도매의 primary 알약을 따르지 않은 이유, 결정 30). 글자는 `aria-hidden` — 숫자는 링크 이름에 한 번만 있다.
 *
 * 실패(401, 403, 404, 500, 연결 실패)는 전부 배지 없는 아이콘이다. 문구도 이동도 없다(결정 32).
 * `/chats`와 `/chats/{id}`에서 `aria-current="page"` + accent 면(결정 31).
 */
export function ChatNavButton() {
  const { data: counts } = useHeaderCountsQuery();
  const pathname = usePathname();
  const { label, badge } = chatBadgeLabel(counts);
  const active =
    pathname === CHATS_HREF || pathname.startsWith(`${CHATS_HREF}/`);

  return (
    /* ≤40rem에서 44×44 — 손가락 최소 타깃(`_base.css:340` `.iconbtn`, CartButton과 같다) */
    <Button
      asChild
      variant="ghost"
      className={cn(
        "relative size-8 px-0 phone:size-11",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <Link
        href={CHATS_HREF}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        data-ac="S2-1 S2-2 S2-9"
      >
        <MessageCircle aria-hidden className="size-4.5" />
        {badge === null ? null : (
          <span
            aria-hidden
            data-ac="S2-2 S2-9"
            className="bg-foreground text-card pointer-events-none absolute top-px right-px grid h-4 min-w-4 place-items-center rounded-full px-1 text-xs leading-none tracking-normal tabular-nums"
          >
            {badge}
          </span>
        )}
      </Link>
    </Button>
  );
}

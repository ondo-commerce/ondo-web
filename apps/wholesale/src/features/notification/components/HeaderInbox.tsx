"use client";

import { cn } from "@ondo/ui";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountBadge } from "./CountBadge";
import { NotificationBell } from "./NotificationBell";
import { useHeaderCountsQuery } from "../api/queries";
import { CHAT_HREF } from "../constants";
import { chatBadge } from "../derive";

/**
 * 헤더 오른쪽의 채팅 링크 + 알림 종(#295 S11). 셸이 계정 메뉴 앞 자리에 끼운다(`Topbar`의 `inbox`).
 *
 * 둘이 한 컴포넌트인 이유: 배지 둘이 **같은 count 응답 하나**(`unread-count`)에서 나온다. 요청을 하나로
 * 두려면 쿼리를 아는 쪽이 둘을 같이 그려야 한다. 셸(`shared`)은 feature를 몰라 여기서 그린다.
 *
 * 실패해도 아이콘은 늘 있다(디자인 결정 36). count를 모르면 배지만 없다.
 */
export function HeaderInbox() {
  const { data: counts, dataUpdatedAt: countsAt } = useHeaderCountsQuery();
  const pathname = usePathname();
  const chat = chatBadge(counts);
  const chatActive =
    pathname === CHAT_HREF || pathname.startsWith(`${CHAT_HREF}/`);

  return (
    /* 헤더 줄의 배지 둘(와이어프레임 `.hbar` S11-12 S11-15). `contents`라 셸 flex 배치는 그대로다 */
    <div className="contents" data-ac="S11-12 S11-15">
      {/* 채팅은 주 메뉴 탭이 아니다 — 어느 화면에서나 여는 받은편지함이고, 탭을 늘리면 `Topbar` 경고대로
          그 줄이 무너진다(loop-04 01-plan §4-1 1). 화면 이동이라 버튼이 아니라 `<a>`다.
          IconButton은 asChild를 막아 두어 같은 모양(ghost, size-8, 아이콘 20px)을 여기서 그린다 */}
      <Link
        href={CHAT_HREF}
        aria-label={chat.label}
        title="채팅"
        aria-current={chatActive ? "page" : undefined}
        data-ac="S2-1 S11-2"
        className={cn(
          "focus-visible:ring-ring relative inline-flex size-8 shrink-0 items-center justify-center rounded-button transition-colors focus-visible:ring-2 focus-visible:outline-hidden [&_svg]:size-5",
          chatActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <MessageCircle aria-hidden />
        {chat.badge !== null ? (
          <CountBadge text={chat.badge} data-ac="S11-2 S11-15" />
        ) : null}
      </Link>

      <NotificationBell counts={counts} countsAt={countsAt} />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseRoomId } from "@/features/chat";
import { ChatRoomClient } from "./ChatRoomClient";

type PageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "대화" };

/**
 * 소매 채팅방. `(browse)` 밖이라 카테고리 줄이 없다. 셸과 로그인 가드는 `(shop)/layout.tsx`.
 *
 * 이 페이지는 주소만 본다 — 방 번호가 숫자가 아니면 `notFound()`, `?from=`은 그대로 넘긴다(검사는
 * feature). 방 머리와 메시지는 **브라우저에서** 받는다(01-plan §4-2 1): 목이 브라우저 MSW라 서버
 * fetch는 목에 닿지 않고, 채팅방은 검색에 걸릴 화면도 아니다. 장바구니 담기를 끼우는 건 `ChatRoomClient`.
 */
export default async function Page({ params, searchParams }: PageProps) {
  const roomId = parseRoomId((await params).roomId);
  if (roomId === null) notFound();

  const { from } = await searchParams;
  return (
    <ChatRoomClient
      roomId={roomId}
      from={typeof from === "string" ? from : null}
    />
  );
}

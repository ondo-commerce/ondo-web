"use client";

import { useEffect } from "react";
import { onSignOut } from "@/features/account";
import { clearChatDrafts } from "@/features/chat";

/**
 * 로그아웃 때 채팅의 쓰던 글을 지우게 잇는다(loop-08b Q2 ①). 그리는 것은 없다.
 *
 * 채팅 화면이 아니라 ERP 레이아웃에 두는 이유: 로그아웃 버튼은 모든 ERP 화면 헤더에 있다. 채팅에서 글을 쓰고
 * 주문 탭으로 가서 로그아웃해도 그 글은 지워져야 한다 — 채팅 화면이 떠 있을 때만 이으면 그 길이 빈다.
 */
export function SignOutCleanup() {
  useEffect(() => onSignOut(clearChatDrafts), []);
  return null;
}

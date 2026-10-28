"use client";

import { Button } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCreateRoomMutation } from "../api/mutations";
import { chatMockReady } from "../api/mockWorker";
import { APPROVAL_PATH, ENTRY_TEXT } from "../constants";
import { chatRoomHref, entryFailureOf } from "../derive";

interface InquiryState {
  opening: boolean;
  error: string | null;
  open: () => void;
}

const InquiryContext = createContext<InquiryState | null>(null);

function useInquiry(): InquiryState {
  const value = useContext(InquiryContext);
  if (value === null)
    throw new Error("InquiryButton, InquiryError는 InquiryEntry 안에 둔다");
  return value;
}

/**
 * `문의하기` 입구(S5-1 S5-2 S5-4). 버튼과 실패 한 줄이 **떨어진 자리**에 선다 — 버튼은 판매처 칸 안,
 * 실패 문구는 칸 바로 아래(디자인 결정 3). 그래서 상태를 이 provider가 갖고 `InquiryButton`과
 * `InquiryError`가 나눠 읽는다. 상품 상세와 도매처 홈은 `features/chat`을 import할 수 없어
 * `app/`이 이 셋을 끼워 넣는다(`docs/02-folder-structure.md` 원칙 3).
 *
 * 누르면 버튼이 `여는 중`으로 바뀌고 잠긴다. 목 모드면 먼저 worker 준비를 기다리고(S5-12), 그다음
 * `POST /rooms {wholesalerId, listingId}`. 200과 201을 똑같이 다룬다. 확인 창 없이 `router.push`로
 * `/chats/{roomId}?from={지금 경로}` — push라서 브라우저 뒤로가기가 보던 화면으로 간다(Q3, S5-13).
 */
export function InquiryEntry({
  wholesalerId,
  listingId,
  children,
}: {
  wholesalerId: number;
  /** 문의를 시작한 상품. 도매처 홈이면 null. 방을 가르지 않는다(§4-1 3) */
  listingId: number | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { mutateAsync } = useCreateRoomMutation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 3연타 → POST 1회(S5-4). state는 다음 렌더에야 버튼을 잠그므로 같은 틱의 두 번째 클릭은 ref가 막는다 */
  const busy = useRef(false);

  /* 화면에 들어오자마자 worker를 깨운다. 누를 때 기다릴 시간이 줄어든다. 누를 때도 같은 Promise를 기다린다 */
  useEffect(() => {
    void chatMockReady();
  }, []);

  const open = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setOpening(true);
    setError(null);
    mutateAsync({ wholesalerId, listingId }).then(
      // 이동이 끝날 때까지 `여는 중`으로 둔다 — 풀면 이동 직전에 한 번 더 눌린다
      (room) => router.push(chatRoomHref(room.roomId, pathname)),
      (failure: unknown) => {
        busy.current = false;
        setOpening(false);
        const reaction = entryFailureOf(failure);
        if (reaction === "approval") router.push(APPROVAL_PATH);
        // 401은 공용 처리가 `/login`으로 보낸다. 여기선 아무것도 띄우지 않는다
        else if (reaction !== "session") setError(reaction.message);
      },
    );
  }, [listingId, mutateAsync, pathname, router, wholesalerId]);

  const value = useMemo(
    () => ({ opening, error, open }),
    [opening, error, open],
  );
  return (
    <InquiryContext.Provider value={value}>{children}</InquiryContext.Provider>
  );
}

/** Button line sm. ≤40rem에선 높이 44 — 헤더 아이콘과 같은 손가락 기준(디자인 결정 1) */
export function InquiryButton({ ac }: { ac: string }) {
  const { opening, open } = useInquiry();
  return (
    <Button
      type="button"
      variant="line"
      size="sm"
      className="phone:h-11"
      disabled={opening}
      aria-busy={opening || undefined}
      onClick={open}
      data-ac={ac}
    >
      {opening ? ENTRY_TEXT.opening : ENTRY_TEXT.open}
    </Button>
  );
}

/** 실패 한 줄. 버튼은 다시 켜져 있다 — 다시 누르면 재요청 1회, 문구는 다음 누름에서 사라진다 */
export function InquiryError() {
  const { error } = useInquiry();
  if (error === null) return null;
  return (
    <p
      role="alert"
      data-ac="S5-4"
      className="text-destructive-strong mt-1.5 flex items-center gap-1.5 text-xs"
    >
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {error}
    </p>
  );
}

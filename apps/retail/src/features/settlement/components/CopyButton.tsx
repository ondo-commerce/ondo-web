"use client";

import { Button, IconButton, cn } from "@ondo/ui";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY_STATUS_MS, COPY_STATUS_TEXT } from "../constants";

/**
 * 계좌번호 복사. **이 화면 두 장에서 유일하게 부작용이 있는 동작이다.**
 *
 * 누른 뒤 아무 말도 안 하면 사장이 눌렀는지 모르고 여러 번 누른다 — 앞 회차 도매
 * `settlements`의 P0(`실행에 아무 확인 신호가 없다`)가 정확히 이 자리다. 그래서
 * 결과를 **그 자리에서** 말하고, 몇 초 뒤 지운다.
 *
 * 실패도 말한다. 클립보드는 보안 컨텍스트(https·localhost)에서만 열리고 권한이
 * 거부될 수도 있어서, 조용히 성공한 척하면 사장이 붙여넣기에서야 빈 걸 안다.
 *
 * 상태 문구는 `role="status"`다 — 아이콘만 바꾸면 화면을 못 보는 사장에게는
 * 아무 일도 안 일어난 것과 같다.
 */
type CopyState = "idle" | "copied" | "failed";

function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 타이머가 남은 채 화면이 바뀌면(도매처 전환) 사라진 노드에 setState가 걸린다 */
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = (next: CopyState) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPY_STATUS_MS);
  };

  const copy = (text: string) => {
    /* 옵셔널 체이닝으로 부른다 — 비보안 컨텍스트에서는 `navigator.clipboard`
       자체가 undefined라 호출만으로 예외가 난다 */
    const done = navigator.clipboard?.writeText(text);
    if (!done) {
      show("failed");
      return;
    }

    done.then(
      () => show("copied"),
      () => show("failed"),
    );
  };

  return [state, copy];
}

function statusText(state: CopyState): string {
  if (state === "copied") return COPY_STATUS_TEXT.copied;
  if (state === "failed") return COPY_STATUS_TEXT.failed;
  return "";
}

/**
 * 상태 문구 자리. **자리를 늘 비워 두어야** 눌렀을 때 옆 내용이 밀리지 않는다.
 *
 * `role="status"` 껍데기는 늘 DOM에 남긴다 — 눌렀을 때 통째로 생겨나는 영역은
 * 보조기술이 못 읽고 지나갈 수 있다. 눈에 보이는 상자(`boxClassName`)만 글자가
 * 있을 때 그린다. 비어 있는데도 테두리가 떠 있으면 아무 일 없는 화면에 자국이 남는다.
 */
function CopyStatus({
  state,
  className,
  boxClassName,
}: {
  state: CopyState;
  className?: string;
  /** 글자를 감싸는 상자. 떠 있는 표시로 그릴 때만 넘긴다 */
  boxClassName?: string;
}) {
  const text = statusText(state);

  return (
    <span
      role="status"
      className={cn(
        "text-xs whitespace-nowrap",
        state === "failed" ? "text-destructive-strong" : "text-success",
        className,
      )}
    >
      {text ? <span className={boxClassName}>{text}</span> : null}
    </span>
  );
}

/** 글자 있는 복사 버튼. 계좌 안내 줄 우측 끝에 선다 */
export function CopyTextButton({
  text,
  label,
}: {
  /** 클립보드에 들어갈 문자열 */
  text: string;
  /** 접근가능 이름. 버튼 글자는 `복사` 하나뿐이라 무엇을 복사하는지 여기서 말한다 */
  label: string;
}) {
  const [state, copy] = useCopy();

  return (
    <span className="flex items-center gap-2">
      <CopyStatus state={state} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={label}
        onClick={() => copy(text)}
      >
        <Copy aria-hidden className="size-3.5" />
        복사
      </Button>
    </span>
  );
}

/**
 * 아이콘만 있는 복사 버튼. 거래처 표의 `연락 · 계좌` 칸에 선다.
 *
 * 아이콘을 체크로 바꾸는 것에 더해 **글자로도** 결과를 적는다 — 아이콘 하나만
 * 바뀌면 무슨 일이 일어났는지 단정할 수 없다.
 *
 * 그 글자를 **흐름에서 빼 아이콘 위에 띄운다.** 예전에는 옆에 `w-16` 고정 슬롯을
 * 잡아 두었는데, 평소에는 늘 비어 있는 그 64px이 아이콘과 같이 가운데 정렬되면서
 * 아이콘 두 개가 머리글 중심에서 33px 왼쪽으로 치우쳤다(F8). 열 폭이 흔들리지
 * 않게 하려던 목적(J3)은 절대 배치가 더 확실하게 지킨다 — 뜨든 말든 폭에 0을
 * 차지하므로 열 폭이 상태와 무관해진다.
 */
export function CopyIconButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [state, copy] = useCopy();

  const Icon =
    state === "copied" ? Check : state === "failed" ? TriangleAlert : Copy;

  return (
    <span className="relative inline-flex">
      <IconButton
        variant="ghost"
        size="md"
        aria-label={label}
        onClick={() => copy(text)}
        /* 시장에서 휴대폰으로 누르는 화면이라 좁은 폭에서 손가락 크기(44px)로 키운다 */
        className={cn(
          "phone:size-11",
          state === "copied" && "text-success",
          state === "failed" && "text-destructive-strong",
        )}
      >
        <Icon aria-hidden />
      </IconButton>
      {/* 버튼 바로 위에 뜬다. 배경과 테두리를 갖는 이유는 윗줄 위에 겹치기 때문이다 —
          투명한 채로 겹치면 남의 줄 글자와 섞여 읽힌다. 클릭을 가로채지 않게
          `pointer-events-none`을 준다 */}
      <CopyStatus
        state={state}
        className="pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1"
        boxClassName="border-border bg-card block rounded-control border px-2 py-0.5 shadow-dropdown"
      />
    </span>
  );
}

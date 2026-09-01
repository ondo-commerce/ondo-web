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

/** 상태 문구 자리. **자리를 늘 비워 두어야** 눌렀을 때 옆 내용이 밀리지 않는다 */
function CopyStatus({
  state,
  className,
}: {
  state: CopyState;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={cn(
        "text-xs whitespace-nowrap",
        state === "failed" ? "text-destructive-strong" : "text-success",
        className,
      )}
    >
      {statusText(state)}
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
 * 바뀌면 무슨 일이 일어났는지 단정할 수 없다. 다만 그 자리를 고정 폭으로 잡아
 * 둔다: 표 칸 안이라 글자가 나타났다 사라지면 열 폭이 흔들려 옆 줄까지 밀린다.
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
    <>
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
      <CopyStatus state={state} className="inline-block w-16 text-left" />
    </>
  );
}

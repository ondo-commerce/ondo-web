"use client";

import { Notice, Switch } from "@ondo/ui";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import {
  useAutoReplySettingsQuery,
  useUpdateAutoReplySettingsMutation,
} from "../api/settings";
import { isChatSessionLostError, useChatSessionLost } from "../api/session";
import { AUTO_REPLY_TEXT } from "../constants";
import { autoReplyNoteOf, toggledSettings } from "../derive";
import type { AutoReplyNote, AutoReplySettings } from "../types";
import { useSingleFlight } from "@/shared/lib/useSingleFlight";

export interface AutoReplyToggle {
  /** 아직 모르거나 GET이 실패했으면 undefined — 스위치를 그리지 않는다 */
  settings: AutoReplySettings | undefined;
  saving: boolean;
  /** 채팅 세션이 끊겼다. 스위치 잠김(누르면 401일 뿐이다) */
  locked: boolean;
  note: AutoReplyNote;
  toggle: (enabled: boolean) => void;
}

/**
 * 목록 머리 스위치의 상태 하나. 스위치(머리 오른쪽)와 안내 줄(머리 아래)이 자리가 달라 훅으로 나눠 준다.
 *
 * - 누르면 한 번만 보낸다(S9-2 3연타 PUT 1회). `disabled`는 다음 렌더에야 걸려서 같은 틱의 두 번째 누름을
 *   못 막는다 — `useSingleFlight`가 막는다
 * - 실패 표시는 다음 누름에서 지운다(디자인 결정 25). 401은 표시하지 않는다 — 채팅 세션 끊김 상태가
 *   입력창 자리에서 이유를 말한다(loop-04 그대로)
 */
export function useAutoReplyToggle(): AutoReplyToggle {
  const { data: settings } = useAutoReplySettingsQuery();
  const mutation = useUpdateAutoReplySettingsMutation();
  const locked = useChatSessionLost();
  const singleFlight = useSingleFlight();
  const [failed, setFailed] = useState(false);

  const toggle = (enabled: boolean) => {
    if (settings === undefined || locked) return;
    singleFlight((release) => {
      setFailed(false);
      mutation
        .mutateAsync(toggledSettings(settings, enabled))
        .catch((error: unknown) => {
          if (!isChatSessionLostError(error)) setFailed(true);
        })
        .finally(release);
    });
  };

  return {
    settings,
    saving: mutation.isPending,
    locked,
    note: autoReplyNoteOf(settings, failed),
    toggle,
  };
}

/**
 * `자동 답변` 글자 + Switch(디자인 결정 22, 23). 보이는 글자는 낭독에서 숨긴다 — 스위치 이름과 같아서
 * 두 번 읽힌다. 손잡이는 응답 뒤에 움직인다: `checked`는 늘 서버 값이다.
 */
export function AutoReplySwitch({ state }: { state: AutoReplyToggle }) {
  const { settings, saving, locked, toggle } = state;
  if (settings === undefined) return null;
  return (
    <span
      data-ac="S9-1 S9-2"
      className="text-secondary-foreground flex items-center gap-2 text-sm whitespace-nowrap"
    >
      {saving ? (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className="border-border border-t-secondary-foreground size-3 animate-spin rounded-full border-2 motion-reduce:animate-none"
          />
          {AUTO_REPLY_TEXT.saving}
        </span>
      ) : null}
      <span aria-hidden>{AUTO_REPLY_TEXT.label}</span>
      <Switch
        checked={settings.enabled}
        onCheckedChange={toggle}
        disabled={saving || locked}
        aria-busy={saving || undefined}
        aria-label={AUTO_REPLY_TEXT.label}
        data-ac="S9-1 S9-2 S9-4"
      />
    </span>
  );
}

/**
 * 목록 머리 바로 아래 한 줄. 꺼짐은 Notice(accent, 빨강 아님 — 사장이 고른 상태, 결정 24),
 * 실패는 빨간 글 한 줄(결정 25). `Panel.Title`의 아래 여백(24px) 안으로 당겨 머리에 붙인다.
 */
export function AutoReplyNoteLine({ note }: { note: AutoReplyNote }) {
  if (note === "off")
    return (
      <Notice role="status" data-ac="S9-2" className="-mt-3 mb-3">
        {AUTO_REPLY_TEXT.off}
      </Notice>
    );
  if (note === "failed")
    return (
      <p
        role="alert"
        data-ac="S9-4"
        className="text-destructive-strong text-body -mt-3 mb-3 flex items-start gap-1"
      >
        <CircleAlert aria-hidden className="mt-0.75 size-3.5 shrink-0" />
        {AUTO_REPLY_TEXT.failed}
      </p>
    );
  return null;
}

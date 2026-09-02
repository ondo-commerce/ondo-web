import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 입력칸 아래 오류 한 줄. 글자가 `destructive-strong`(red-700)인 이유:
 * `destructive`(red-500)는 흰 바탕에서 3.81:1이라 **선으로는 되지만 글자로는 AA에
 * 못 미친다**(`retail-shell` F2). 테두리는 red-500 그대로 — 선은 3:1이면 된다.
 *
 * `id`는 반드시 입력의 `aria-describedby`가 가리키는 값이어야 한다 — 그래야
 * 낭독기가 칸에 들어간 순간 이유를 같이 읽는다.
 */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="text-destructive-strong text-body mt-1.5 flex items-start gap-1"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="sr-only">오류: </span>
        {children}
      </span>
    </p>
  );
}

/** 입력칸 아래 회색 도움말(`.help`). 오류가 아니라 미리 알려 주는 말이다 */
export function FieldHelp({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="text-muted-foreground mt-1.5 text-xs leading-4.5">
      {children}
    </p>
  );
}

/**
 * 필수 칸의 라벨. **`*` 하나에 기대지 않는다** — 낭독기에는 `(필수)`를 읽히고,
 * 눈으로 보는 쪽에는 폼 머리에 `* 표시는 필수 항목이에요` 범례를 같이 둔다.
 */
export function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {children}{" "}
      <span className="text-destructive-strong" aria-hidden>
        *
      </span>
      <span className="sr-only">(필수)</span>
    </>
  );
}

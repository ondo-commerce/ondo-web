import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 경고 배너(`.notice.warn`). `packages/ui`의 `Notice`에 경고 변형이 없어서 여기
 * 둔다 — 사용처가 이 화면 하나뿐이라 `shared/`로 올리지 않는다(Rule of Two).
 *
 * **글자는 red-700, 테두리는 red-500이다.** red-500은 흰 바탕에서 3.81:1이라
 * 선(3:1)은 되지만 글자(4.5:1)는 안 된다(`retail-shell` F2). 소매 `WarnNotice`는
 * 그걸 알면서 red-500 글자로 뒀고 도매는 그 자리를 물려받지 않는다.
 */
export function WarnNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive text-destructive-strong bg-card text-body flex items-start gap-2 rounded-control border px-4 py-3"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="sr-only">경고: </span>
        {children}
      </span>
    </div>
  );
}

/**
 * 경고 배지(`.badge.warn`). `packages/ui`의 `Badge`는 tone이 `active`/`done`
 * 둘뿐이라 여기서 그린다. 글자는 배너와 같은 이유로 red-700이다.
 */
export function WarnBadge({ children }: { children: ReactNode }) {
  return (
    <span className="border-destructive text-destructive-strong bg-card inline-flex h-6.5 items-center justify-center rounded-button border px-2.5 text-xs whitespace-nowrap">
      {children}
    </span>
  );
}

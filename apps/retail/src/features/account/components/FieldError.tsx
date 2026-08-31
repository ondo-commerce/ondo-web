import { CircleAlert } from "lucide-react";

/**
 * 입력칸 아래 오류 한 줄.
 *
 * 아이콘과 `오류` 라는 말을 같이 둔다. 이 빨강(red-500)은 흰 바탕에서 3.81:1이라
 * AA에 못 미치고, 토큰을 고치는 건 이번 회차 범위 밖이다(`01-pm.md` Q5). 색이
 * 흐리게 보여도 아이콘과 글자로 "여기가 잘못됐다"가 전달되게 한다.
 *
 * `id`는 반드시 입력의 `aria-describedby`가 가리키는 값이어야 한다 — 그래야
 * 화면 낭독기가 칸에 들어간 순간 이유를 같이 읽는다.
 */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="text-destructive mt-1.5 flex items-start gap-1 text-body"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="sr-only">오류: </span>
        {children}
      </span>
    </p>
  );
}

/** 입력칸 아래 회색 도움말 (`.help`). 오류가 아니라 미리 알려 주는 말이다 */
export function FieldHelp({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className="text-muted-foreground mt-1.5 text-xs leading-4.5">
      {children}
    </p>
  );
}

import { CircleAlert } from "lucide-react";

/**
 * 입력칸 아래 오류 한 줄.
 *
 * 글자는 `destructive-strong`(red-700)이다. `destructive`(red-500)는 흰 바탕에서
 * 3.81:1이라 선으로는 되지만 글자로는 AA에 못 미친다(`retail-shell` F2 ·
 * 확정 와이어프레임 `_base.css` 474행). 칸 테두리는 red-500 그대로다.
 *
 * 색에만 기대지도 않는다 — 아이콘과 `오류`라는 말을 같이 둬서, 색이 안 보여도
 * "여기가 잘못됐다"가 전달되게 한다.
 *
 * `id`는 반드시 입력의 `aria-describedby`가 가리키는 값이어야 한다 — 그래야
 * 화면 낭독기가 칸에 들어간 순간 이유를 같이 읽는다.
 */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="text-destructive-strong mt-1.5 flex items-start gap-1 text-body"
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

/**
 * 필수 칸의 라벨. `*` 하나에 기대지 않는다.
 *
 * 색은 오류 문구와 같은 `destructive-strong`(red-700)이다 — 흰 바탕의 빨간
 * **글자**는 한 단계 진해야 AA를 넘는다. 그래도 색 하나에 기대지 않으려고
 * 화면 낭독기에는 `(필수)`를 읽히고, 눈으로 보는 쪽에는 폼 머리에
 * `* 표시는 필수 항목이에요`라는 범례를 같이 둔다.
 */
export function RequiredLabel({ children }: { children: React.ReactNode }) {
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

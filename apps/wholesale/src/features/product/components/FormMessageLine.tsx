import Link from "next/link";
import { RELOGIN_HREF, SESSION_RESTORED_MESSAGE } from "../constants";

/**
 * 하단 바 왼쪽 한 줄(등록, 수정 공용). 칸에 못 붙인 실패나 세션 잠금 문구, 잠금이 풀린 뒤의
 * 안내 중 하나만 그린다 — 같은 자리라 겹치면 어느 쪽도 안 읽힌다.
 *
 * 잠금 중엔 문구 옆에 `새 탭에서 로그인`을 둔다(#403 S2-5). `<p role="alert">` 밖 형제다 —
 * 알림 안에 링크를 넣으면 낭독기가 링크 이름까지 읽고, loop-03 e2e의 문구 정확 비교도 깨진다.
 * 새 탭으로 열리므로 이탈 가드(`linkLeaveTarget`의 `_self` 아닌 target)가 붙잡지 않는다.
 */
export function FormMessageLine({
  id,
  message,
  sessionLost,
  restored,
  tag,
}: {
  /** 저장 버튼 `aria-describedby`가 가리키는 id */
  id: string;
  /** 잠금 문구 또는 `errors._form` */
  message: string | undefined;
  sessionLost: boolean;
  /** 잠겼다가 같은 계정 재로그인으로 풀렸고 아직 저장을 안 눌렀다 */
  restored: boolean;
  /** 저장 401 줄의 loop-10 표식(`saveLineTag`). 기존 값 뒤에 붙는다 */
  tag?: string;
}) {
  const ac =
    [sessionLost ? "S4-3 S4-7" : null, tag ?? null]
      .filter((v) => v !== null)
      .join(" ") || undefined;
  if (message)
    return (
      <div className="mr-auto flex items-center gap-3">
        <p
          id={id}
          role="alert"
          data-ac={ac}
          className="text-destructive-strong text-sm"
        >
          {message}
        </p>
        {sessionLost ? (
          <Link
            href={RELOGIN_HREF}
            target="_blank"
            rel="noopener"
            data-ac="09:S2-5"
            className="text-foreground text-sm underline underline-offset-4"
          >
            새 탭에서 로그인
          </Link>
        ) : null}
      </div>
    );
  if (restored)
    return (
      <p
        role="status"
        data-ac="09:S2-2"
        className="text-foreground mr-auto text-sm"
      >
        {SESSION_RESTORED_MESSAGE}
      </p>
    );
  return null;
}

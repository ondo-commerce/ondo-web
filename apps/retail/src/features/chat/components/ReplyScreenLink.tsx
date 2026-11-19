import { Button } from "@ondo/ui";
import Link from "next/link";
import type { ReplyLinkView } from "../types";

/**
 * 자동 답 말풍선 아래 다른 화면 링크 하나(loop-08f §4-1). 미송 카드, 미송 되묻기, 미수 카드 셋이 같이 쓴다 —
 * 모양이 갈리면 한 방 안에서 링크 셋이 다른 물건으로 보인다. 모양은 loop-07 결정 43 그대로:
 * `Button asChild variant="line" size="sm"`, ≤40rem 높이 44, 아이콘 없음, 한 줄.
 *
 * 끊긴 방이면 `<a href>` 전체 이동(결정 15, 방 머리 돌아가기와 같다). 평소엔 `Link` — 쓰던 글과 방 캐시가 남아
 * 뒤로가기로 그 방에 그대로 돌아온다.
 */
export function ReplyScreenLink({ link }: { link: ReplyLinkView }) {
  const attrs = {
    href: link.href,
    "data-reply-link": link.kind,
    "data-nav": link.documentNav ? "document" : "client",
    /* 정산 링크는 loop-07 S2-3 번호를 그대로 단다(그 회차 e2e가 이 번호를 본다) */
    "data-ac":
      link.kind === "settlement"
        ? "S2-3 08f:S4-5 08f:S4-7"
        : "08f:S4-2 08f:S4-3 08f:S4-5 08f:S4-7",
  };
  return (
    <div className="flex">
      <Button asChild variant="line" size="sm" className="phone:h-11">
        {link.documentNav ? (
          <a {...attrs}>{link.label}</a>
        ) : (
          <Link {...attrs}>{link.label}</Link>
        )}
      </Button>
    </div>
  );
}

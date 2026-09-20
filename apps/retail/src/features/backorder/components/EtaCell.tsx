import { Badge } from "@ondo/ui";
import { ETA_BADGE_LABEL, ETA_DELAYED_NOTE } from "../constants";
import { etaStateOf, formatDate } from "../derive";
import type { BackorderLine } from "../types";

/**
 * 예상 입고일 한 칸 — 3상태(RT-58)를 **색과 모양으로** 가른다.
 *
 * 셋이 같은 회색이면 3상태가 사실상 2상태가 된다(shipments F1: 수령방식 배지 2종이
 * 색으로 안 갈렸다). 그래서 확정된 날짜는 아예 배지를 안 쓰고 평문으로 두고, 배지 둘은
 * 테두리 색으로 갈린다.
 *
 * ⚠️ `packages/ui`의 `Badge`에는 `warn` 톤이 없다(`active`/`done` 둘뿐)고, `packages/ui`는
 * 읽기 전용이다. 그래서 호출부에서 `className`으로 테두리·글자색을 덮는다.
 * 두 번째 사용처가 생기면 그때 `design(ui)` 톤 추가 이슈를 연다.
 */
export function EtaCell({
  line,
  today,
}: {
  line: BackorderLine;
  today: string;
}) {
  const state = etaStateOf(line, today);

  if (state === "CHECKING") {
    /* 날짜를 아직 못 받았다. `-`나 오늘 날짜로 채우면 없는 약속이 생긴다 */
    return (
      <Badge className="bg-card border-input text-muted-foreground border">
        {ETA_BADGE_LABEL.CHECKING}
      </Badge>
    );
  }

  if (state === "DELAYED") {
    return (
      <>
        {/*
          글자는 `destructive-strong`(red-700), 테두리만 `destructive`(red-500)다.
          red-500은 흰 배경에서 3.81:1로 **글자로는 AA 미달**이고(retail-shell F2),
          선으로는 3:1을 넘어 괜찮다. 확정 와이어프레임 `_base.css`의 대비 수정 2번이
          같은 처방이다.
        */}
        <Badge className="bg-card border-destructive text-destructive-strong border">
          {ETA_BADGE_LABEL.DELAYED}
        </Badge>
        {/* 사장이 **다음에 무엇을 기다리면 되는지**를 화면이 말한다.
            원래 예상일과 변동 사유는 쓰지 않는다(§5-2 — 소매 화면에 자리가 없다) */}
        <span className="text-muted-foreground mt-1 block text-xs">
          {ETA_DELAYED_NOTE}
        </span>
      </>
    );
  }

  /* 날짜가 잡혔고 아직 안 지났다. 배지를 씌우면 `지연`·`확인 중`과 한 덩어리로 읽힌다 */
  return <span>{line.etaDate === null ? "" : formatDate(line.etaDate)}</span>;
}

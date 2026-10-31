"use client";

import { Panel } from "@ondo/ui";
import Link from "next/link";
import { useInquiryStatsQuery } from "../api/queries";
import { INQUIRY_TEXT, TAB_HREF } from "../constants";
import {
  QueryBoundary,
  QueryBoundaryGroup,
  QueryErrorView,
  useQueryBoundaryGroupRetry,
} from "@/shared/api/QueryBoundary";
import type { ErrorDescription } from "@/shared/api/describeError";
import { formatNumber } from "@/shared/lib/format";

/**
 * 우측 `문의` 카드(loop-08 S2, 와이어프레임 21, 디자인 결정 49~53). 오늘 영업일 소매 메시지가 몇 건이고
 * 그중 몇 건이 자동으로 끝났나. 보고서에 옮겨 적는 숫자라 끝 줄에 세는 기준과 집계 시각(`asOf`)을 같이 둔다.
 *
 * 제목과 `채팅 열기`는 경계 밖이다 — 로딩, 실패 중에도 자리와 링크가 먼저 있다.
 *
 * 경계는 **자기 그룹**(`QueryBoundaryGroup`) 안에 둔다(디자인 결정 50). 뷰 전체 그룹을 같이 쓰면 이 카드의
 * `다시 시도`가 같은 순간 실패해 있던 summary, 큐 경계까지 리셋한다 — 사장이 누른 건 문의 숫자다.
 *
 * 404도 500과 같은 모양이다. 초안 op라 실서버엔 아직 없어 404가 "없다"가 아니라 "못 불렀다"다 —
 * 그래서 경계의 기본 `notFound`(빈 상태 한 줄, 버튼 없음)를 쓰지 않는다.
 */
export function InquiryPanel() {
  return (
    <Panel
      className="shrink-0"
      role="region"
      aria-label={INQUIRY_TEXT.title}
      data-ac="S2-1 S2-6"
    >
      <Panel.Title
        className="mb-4"
        data-ac="S2-6"
        action={
          <Link
            href={TAB_HREF.chats}
            className="text-primary text-sm hover:underline"
            data-ac="S2-6"
          >
            {INQUIRY_TEXT.openChats}
            <span aria-hidden> →</span>
          </Link>
        }
      >
        {INQUIRY_TEXT.title}
      </Panel.Title>
      <QueryBoundaryGroup>
        <QueryBoundary
          fallback={<InquirySkeleton />}
          /* 경계의 404 래퍼(py-12 가운데 정렬)를 지운다 — 오류 블록이 자기 여백을 가진다 */
          className="py-0"
          notFound={<InquiryNotFound />}
          errorFallback={({ described, retry }) => (
            <InquiryErrorView described={described} onRetry={retry} />
          )}
        >
          <InquiryBody />
        </QueryBoundary>
      </QueryBoundaryGroup>
    </Panel>
  );
}

function InquiryBody() {
  const { data } = useInquiryStatsQuery();
  return (
    <div className="grid gap-2 text-sm tabular-nums" data-ac="S2-1">
      {/* flex로 띄우지 않고 글자 사이 공백으로 띄운다 — 낭독과 복사가 "오늘 소매 메시지 12건" 그대로 나온다 */}
      <p data-ac="S2-1 S2-3">
        {INQUIRY_TEXT.totalPrefix}{" "}
        <span className="text-2xl font-semibold">
          {formatNumber(data.retailMessages)}
        </span>
        {INQUIRY_TEXT.totalUnit}
      </p>
      <p data-ac="S2-1">{data.outcomeLine}</p>
      <p data-ac="S2-1 S2-2">
        {INQUIRY_TEXT.ratePrefix}{" "}
        <span className="font-medium">{data.rateLabel}</span> {data.rateDetail}
      </p>
      <p data-ac="S2-1">
        <span className="text-muted-foreground">
          {INQUIRY_TEXT.intentPrefix}{" "}
        </span>
        {data.intentLine}
      </p>
      <p
        className="text-muted-foreground mt-1 text-xs leading-4"
        data-ac="S2-6"
      >
        {data.basisLine}
      </p>
    </div>
  );
}

/** 숫자 자리만 막대 4줄(와이어프레임 `#state-loading`). 첫 줄이 큰 숫자라 높다 — 도착할 때 아래 주의가 덜 튄다 */
function InquirySkeleton() {
  return (
    <div role="status" aria-label="불러오는 중" className="grid gap-2">
      <div className="bg-muted h-7 w-9/20 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-17/20 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-11/20 animate-pulse rounded-control" />
      <div className="bg-muted h-4 w-3/4 animate-pulse rounded-control" />
    </div>
  );
}

/** 문구는 종류와 상관없이 하나(디자인 결정 50). 권한 없음(403)만 다시 시도를 빼는 규칙은 경계 것 그대로 */
function InquiryErrorView({
  described,
  onRetry,
}: {
  described: ErrorDescription;
  onRetry: () => void;
}) {
  return (
    <div data-ac="S2-5">
      <QueryErrorView
        described={{
          ...described,
          title: INQUIRY_TEXT.errorTitle,
          detail: described.retryable ? INQUIRY_TEXT.errorDetail : null,
        }}
        onRetry={onRetry}
        className="py-6"
      />
    </div>
  );
}

/** 404 자리. 경계가 `retry`를 안 넘겨 주는 자리라 그룹의 재시도를 직접 쥔다(위 `QueryBoundaryGroup`) */
function InquiryNotFound() {
  const retry = useQueryBoundaryGroupRetry();
  return (
    <InquiryErrorView
      described={{
        kind: "notFound",
        title: INQUIRY_TEXT.errorTitle,
        detail: null,
        traceId: null,
        retryable: retry !== null,
      }}
      onRetry={() => retry?.()}
    />
  );
}

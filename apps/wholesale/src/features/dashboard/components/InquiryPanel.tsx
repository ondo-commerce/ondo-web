"use client";

import { Button, Panel } from "@ondo/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useInquiryStatsQuery, useInquiryWeekQuery } from "../api/queries";
import { INQUIRY_TEXT, TAB_HREF } from "../constants";
import { toWeekLineState } from "../derive";
import type { InquiryWeekLineState } from "../types";
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
          <Button asChild variant="line" size="sm">
            <Link href={TAB_HREF.chats} data-ac="S2-6">
              {INQUIRY_TEXT.openChats}
            </Link>
          </Button>
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
  const { data, dataUpdatedAt, errorUpdatedAt } = useInquiryStatsQuery();
  /* 오늘 쿼리가 마지막으로 끝난 시각(성공이든 실패든). 7일 쿼리가 이 값이 바뀔 때마다 한 번 다시 부른다(`useInquiryWeekQuery`) */
  const week = useInquiryWeekQuery(
    data.businessDay,
    Math.max(dataUpdatedAt, errorUpdatedAt),
  );
  const weekLine = toWeekLineState({
    businessDay: data.businessDay,
    week: week.data,
    failed: week.isError,
  });
  return (
    <div className="grid gap-3 text-sm tabular-nums" data-ac="S2-1 S2-4">
      <table className="w-full table-fixed text-right tabular-nums">
        <caption className="sr-only">기간별 문의 현황</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-2 text-left font-normal">
              기간
            </th>
            <th scope="col" className="pb-2 font-normal">
              소매 메시지
            </th>
            <th scope="col" className="pb-2 font-normal">
              자동 처리율
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-border border-b">
            <th scope="row" className="pb-3 text-left font-medium">
              오늘
            </th>
            <td className="pb-3" data-ac="S2-1 S2-3 S2-4">
              <span className="text-2xl font-medium">
                {formatNumber(data.retailMessages)}
              </span>
              <span className="text-body text-muted-foreground ml-1">
                {INQUIRY_TEXT.totalUnit}
              </span>
            </td>
            <td className="pb-3" data-ac="S2-1 S2-2 S2-4">
              <span className="text-base font-medium">{data.rateLabel}</span>
              <span className="text-muted-foreground block text-xs">
                {data.rateDetail}
              </span>
            </td>
          </tr>
          <InquiryWeekLine state={weekLine} />
        </tbody>
      </table>
      <details className="group">
        <summary className="text-secondary-foreground hover:text-foreground flex w-fit cursor-pointer list-none items-center gap-1 text-sm [&::-webkit-details-marker]:hidden">
          오늘 문의 상세
          <ChevronDown aria-hidden className="size-4 group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <CountList title={INQUIRY_TEXT.outcomeTitle} rows={data.outcomes} />
          <CountList title="판정된 문의 유형" rows={data.intents} />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">{data.basisLine}</p>
      </details>
    </div>
  );
}

/** 결과 수와 판정된 문의 종류 수는 분모가 달라 따로 읽는다. */
function CountList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; count: number }[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <dl className="grid gap-1">
        {rows.map(({ label, count }) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-2"
          >
            <dt className="text-body text-muted-foreground">{label}</dt>
            <dd>{formatNumber(count)}건</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 주간 조회가 실패하거나 지연돼도 오늘 집계는 그대로 읽을 수 있다. */
function InquiryWeekLine({ state }: { state: InquiryWeekLineState }) {
  if (state.kind === "none") return null;
  return (
    <tr className="text-sm">
      <th scope="row" className="pt-3 text-left font-normal">
        {INQUIRY_TEXT.weekPrefix}
        {state.kind === "line" && (
          <span className="text-muted-foreground block text-xs">
            {state.fromTo}
          </span>
        )}
      </th>
      {state.kind === "line" ? (
        <>
          <td className="pt-3" data-ac="08f:S3-2">
            {state.retailMessages}건
          </td>
          <td className="pt-3">
            {state.rateLabel}
            <span className="text-muted-foreground block text-xs">
              {state.rateDetail}
            </span>
          </td>
        </>
      ) : (
        <td
          colSpan={2}
          className="pt-3 text-body text-muted-foreground"
          data-ac="08f:S3-3"
        >
          {state.kind === "failed" ? (
            INQUIRY_TEXT.weekFailed
          ) : (
            <span
              role="status"
              aria-label={INQUIRY_TEXT.weekLoading}
              className="bg-muted ml-auto block h-4 w-3/4 animate-pulse rounded-control"
            />
          )}
        </td>
      )}
    </tr>
  );
}

/** 첫 응답 전에도 수치 두 칸과 주간 비교, 상세 버튼의 공간을 남긴다. */
function InquirySkeleton() {
  return (
    <div role="status" aria-label="불러오는 중" className="grid gap-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted h-12 animate-pulse rounded-control" />
        <div className="bg-muted h-12 animate-pulse rounded-control" />
      </div>
      <div className="bg-muted h-5 w-3/4 animate-pulse rounded-control" />
      <div className="bg-muted h-5 w-16 animate-pulse rounded-control" />
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

"use client";

import { cn, Panel } from "@ondo/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { useArrival } from "../arrival";

/**
 * 계정 5화면의 흰 카드. 배지 + 제목 한 줄 + 보조 설명 한 줄 + 본문.
 *
 * `Panel`을 그대로 쓰지 않고 감싸는 이유는 둘이다.
 * 1. 안쪽 여백이 28px이다(`Panel` 기본은 16px). 로그인 전 화면은 카드 하나가
 *    화면 전부라 ERP 셸 안의 패널보다 넉넉하다.
 * 2. 제목이 `h2`가 아니라 **`h1`**이다. 이 화면에는 이 카드 말고 제목이 없다.
 *
 * **실행 뒤 도착을 여기서 받는다**(`arrival.ts`). 이 카드가 계정 화면의 제목을
 * 소유한 유일한 자리라, 도착 문구를 낭독하고 포커스를 제목으로 옮기는 일도
 * 여기 한 번만 적으면 화면 5장이 같이 고쳐진다.
 */
export function AuthPanel({
  badge,
  title,
  lead,
  children,
}: {
  /** 제목 위 상태 배지 (승인 대기·거절 화면) */
  badge?: ReactNode;
  title: string;
  /** 제목 아래 회색 한 줄 */
  lead?: ReactNode;
  children: ReactNode;
}) {
  const arrival = useArrival();
  const heading = useRef<HTMLHeadingElement>(null);

  /* 실행으로 **도착했을 때만** 옮긴다. 주소로 직접 연 화면에서 포커스를 제목에
     걸면 Tab 순서가 이유 없이 한 칸 뒤에서 시작한다 */
  useEffect(() => {
    if (arrival) heading.current?.focus();
  }, [arrival]);

  return (
    <Panel className="p-7">
      {/* 빈 채로 먼저 그린다 — 낭독 영역이 글자와 동시에 나타나면 낭독기가
          그 변화를 놓친다. `arrival.ts`가 다음 커밋에서 채운다 */}
      <p className="sr-only" role="status">
        {arrival}
      </p>

      {badge ? <div className="flex">{badge}</div> : null}
      {/* `tabIndex={-1}`: Tab 순서에는 넣지 않고 프로그램으로만 포커스를 준다 */}
      <h1
        ref={heading}
        tabIndex={-1}
        className={cn("text-xl leading-7 font-medium", badge && "mt-3")}
      >
        {title}
      </h1>
      {lead ? (
        <p className="text-muted-foreground text-body mt-1.5">{lead}</p>
      ) : null}
      {children}
    </Panel>
  );
}

/**
 * 카드 밑에 붙는 이동 링크 줄(`비밀번호 찾기 · 회원가입`).
 * 카드 **밖**이라 배경 위에 바로 놓인다 — 회색 글자에 링크만 진하다.
 */
export function AuthLinks({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground text-body mt-4 flex items-center justify-center gap-2.5">
      {children}
    </div>
  );
}

/** 링크 줄 아래 꼬리말 한 줄. 다음에 무슨 일이 일어나는지 미리 말한다 */
export function AuthFoot({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mt-3 text-center text-xs leading-4.5">
      {children}
    </p>
  );
}

/**
 * 카드 안의 논리 묶음(`.sec`). 위 여백은 24px 하나뿐이다.
 *
 * `first:mt-0`을 붙이지 않는다 — 이 카드에서 묶음은 언제나 제목·설명 **뒤에**
 * 오기 때문에 첫 묶음도 위 여백이 있어야 한다. 묶음이 `<form>` 안에 들어가면
 * `first:`가 폼 기준으로 걸려서 제목과 첫 칸이 붙어 버린다.
 *
 * `Panel.Section`의 `title`을 쓰지 않고 제목을 따로 받는다 — 저쪽 제목은
 * 14px 본문색이고 여기 소제목은 13px 회색이다.
 */
export function AuthSection({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mt-6", className)}>
      {title ? (
        <h2 className="text-muted-foreground text-body mb-2.5">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

"use client";

import { Input, Notice } from "@ondo/ui";
import { Info } from "lucide-react";
import {
  AGENT_FIELD,
  AGENT_NAME_HELP,
  AGENT_NAME_ISSUE,
  AGENT_PHONE_HELP,
  AGENT_PHONE_ISSUE,
  CHECKOUT_TEXT,
} from "../constants";
import { isAgentNameAcceptable, isPhoneAcceptable } from "../derive";

const NAME_ID = "checkout-agent-name";
const PHONE_ID = "checkout-agent-phone";
const NAME_HELP_ID = "checkout-agent-name-help";
const NAME_ISSUE_ID = "checkout-agent-name-issue";
const PHONE_HELP_ID = "checkout-agent-phone-help";
const PHONE_ISSUE_ID = "checkout-agent-phone-issue";

/**
 * 필수 표시. **`*` 하나에 기대지 않는다** — 이 빨강(red-500)은 흰 배경에서
 * 3.81:1이라 AA에 못 미쳐서 글자를 red-700(`destructive-strong`)으로 내려
 * 쓰고, 색이 흐리게 보여도 뜻이 남도록 낭독기에 `(필수)`를 읽힌다.
 * `features/account`에 같은 것이 있지만 feature끼리 직접 참조하지 않는다.
 */
function RequiredMark() {
  return (
    <>
      <span className="text-destructive-strong" aria-hidden>
        {" "}
        *
      </span>
      <span className="sr-only">(필수)</span>
    </>
  );
}

/**
 * 사입삼촌 정보 두 칸.
 *
 * **한 도매처라도 `사입삼촌 방문`이면 필수가 된다**(RT-38). 전부 직접 수령이면
 * 필수가 아니다 — 안 쓸 값을 받아 두면 장끼에 엉뚱한 수령인이 적힌다.
 *
 * 필수 표시를 **색깔 `*` 하나에 기대지 않는다.** 이 빨강은 흰 배경에서 AA에
 * 못 미쳐서(그래서 글자는 `destructive-strong`으로 내려 쓴다), 낭독기에는
 * `(필수)`를 읽히고 컨트롤에는 실제 `required` 속성을 건다 — 직전 회차에서
 * `*`만 있고 `required`가 없던 자리가 결함으로 잡혔다.
 *
 * 두 칸 다 **친 글자를 고치지 않는다.** 하이픈을 조용히 지우거나 넘는 글자를
 * 잘라내면 사장이 자기가 무엇을 쳤는지 못 본다. 못 받는 값이면 값은 그대로 두고
 * 아래에 이유만 적는다.
 *
 * 판정이 **글자 종류가 아니라 쓸 수 있는 값인가**를 본다. 종류만 보던 때는 이름과
 * 연락처가 둘 다 `-` 한 글자로 통과해 장끼에 `수령인 - -`가 찍혔다(F6) — 이 값은
 * 사입삼촌이 물건을 받을 때 쓰는 값이라(RT-38) 그러면 물건을 못 받는다.
 */
export function PickupContactSection({
  required,
  name,
  phone,
  onChangeName,
  onChangePhone,
}: {
  required: boolean;
  name: string;
  phone: string;
  onChangeName: (next: string) => void;
  onChangePhone: (next: string) => void;
}) {
  const nameIssue = !isAgentNameAcceptable(name);
  const phoneIssue = !isPhoneAcceptable(phone);

  return (
    <section className="mt-6">
      <h3 className="text-muted-foreground text-body mb-2.5 flex items-center gap-1">
        {CHECKOUT_TEXT.agentSection}
        {required ? <RequiredMark /> : null}
      </h3>

      <Notice>
        <span className="flex items-start gap-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {CHECKOUT_TEXT.agentNotice}
        </span>
      </Notice>

      <div className="mt-3 grid grid-cols-2 gap-4 tablet:grid-cols-1">
        <div>
          <label
            htmlFor={NAME_ID}
            className="text-body mb-1.5 block font-medium"
          >
            {AGENT_FIELD.name.label}
            {required ? <RequiredMark /> : null}
          </label>
          <Input
            id={NAME_ID}
            value={name}
            required={required}
            placeholder={AGENT_FIELD.name.placeholder}
            aria-describedby={nameIssue ? NAME_ISSUE_ID : NAME_HELP_ID}
            aria-invalid={nameIssue || undefined}
            onChange={(event) => onChangeName(event.target.value)}
          />
          {/* 연락처 칸과 **같은 방식**이다 — 값은 그대로 두고 이유만 붙인다.
              부호 한 글자(`-`)가 통과해 장끼 수령인이 `-`가 되던 자리다(F6) */}
          {nameIssue ? (
            <p
              id={NAME_ISSUE_ID}
              className="text-destructive-strong text-body mt-1.5"
            >
              <span className="sr-only">오류: </span>
              {AGENT_NAME_ISSUE}
            </p>
          ) : (
            <p
              id={NAME_HELP_ID}
              className="text-muted-foreground text-body mt-1.5"
            >
              {AGENT_NAME_HELP}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={PHONE_ID}
            className="text-body mb-1.5 block font-medium"
          >
            {AGENT_FIELD.phone.label}
            {required ? <RequiredMark /> : null}
          </label>
          <Input
            id={PHONE_ID}
            value={phone}
            required={required}
            inputMode="tel"
            placeholder={AGENT_FIELD.phone.placeholder}
            aria-describedby={phoneIssue ? PHONE_ISSUE_ID : PHONE_HELP_ID}
            aria-invalid={phoneIssue || undefined}
            onChange={(event) => onChangePhone(event.target.value)}
          />
          {phoneIssue ? (
            <p
              id={PHONE_ISSUE_ID}
              className="text-destructive-strong text-body mt-1.5"
            >
              <span className="sr-only">오류: </span>
              {AGENT_PHONE_ISSUE}
            </p>
          ) : (
            <p
              id={PHONE_HELP_ID}
              className="text-muted-foreground text-body mt-1.5"
            >
              {AGENT_PHONE_HELP}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

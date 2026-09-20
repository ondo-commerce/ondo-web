"use client";

import { Select } from "@ondo/ui";
import { FOLLOW_BULK_LABEL } from "../constants";

export interface MethodOption {
  value: string;
  label: string;
}

/**
 * 수령·결제 드롭다운 한 벌. 일괄 설정 줄과 도매처별 줄이 같은 컴포넌트를 쓴다 —
 * 두 벌이 되면 항목 순서나 라벨이 한쪽만 바뀐다.
 *
 * **첫 항목이 `일괄 설정 따름`인 것은 도매처 줄뿐이다.** 그때는 트리거에
 * `일괄 설정 따름 (직접 수령)`처럼 지금 걸리는 값을 괄호로 같이 보여 준다 —
 * 안 그러면 사장이 이 도매처에 무엇이 걸려 있는지 알려고 위로 올라가 일괄
 * 설정을 다시 읽어야 한다. 일괄 설정을 바꾸면 이 괄호 값이 따라 바뀐다.
 *
 * `Select.Value` 대신 트리거에 직접 그리는 이유: Radix의 `Value`는 고른 항목의
 * 글자를 그대로 옮길 뿐이라 괄호 안을 흐리게 만들 수 없다.
 */
export function MethodSelect({
  value,
  options,
  followLabel,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: readonly MethodOption[];
  /** `일괄 설정 따름`일 때 괄호에 넣을 지금 값. 없으면 일괄 설정 줄이다 */
  followLabel?: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  const following = followLabel !== undefined && value === "BULK";
  const selected = options.find((option) => option.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger
        variant="field"
        aria-label={
          following
            ? `${ariaLabel}, ${FOLLOW_BULK_LABEL} ${followLabel}`
            : ariaLabel
        }
        className="max-w-85"
      >
        {following ? (
          <span className="min-w-0 truncate">
            {FOLLOW_BULK_LABEL}{" "}
            <span className="text-muted-foreground">({followLabel})</span>
          </span>
        ) : (
          <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
        )}
      </Select.Trigger>

      <Select.Content>
        {followLabel === undefined ? null : (
          <Select.Item value="BULK">{FOLLOW_BULK_LABEL}</Select.Item>
        )}
        {options.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
}

/**
 * `.setrow` 한 칸 — 96px 라벨 + 컨트롤. 640px 이하에서 1열로 접힌다.
 *
 * 라벨이 `<label>`이 아니라 `<span>`인 것은 짝이 Radix 드롭다운(버튼)이기
 * 때문이다. 버튼은 `htmlFor`로 묶이지 않으므로 이름은 컨트롤이
 * `aria-label`로 직접 갖는다 — 보이는 글자와 읽히는 이름을 같은 값으로 둔다.
 */
export function SetRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="text-muted-foreground text-body phone:mb-1">
        {label}
      </span>
      <div className="min-w-0 phone:mb-2">{children}</div>
    </>
  );
}

/** `.setrow` 격자. 라벨 96px 고정 + 나머지, 좁아지면 1열 */
export function SetRowGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 phone:grid-cols-[minmax(0,1fr)] phone:gap-y-0">
      {children}
    </div>
  );
}

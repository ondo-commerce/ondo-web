"use client";

import { Button, FormField, Input, Textarea } from "@ondo/ui";
import { useId, useState, type FormEvent } from "react";
import { useExpectedInboundMutation } from "../api/mutations";
import { useSkuBackordersQuery } from "../api/queries";
import { ETA_FIELDS } from "../constants";
import { isEtaFormat, toExpectedInboundRequest } from "../derive";
import type { EtaField } from "../types";
import { describeError } from "@/shared/api/describeError";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";

/**
 * 우측 하단 — 예상 입고일 등록(`PUT /variants/{id}/expected-inbound`, 전체 대체).
 *
 * 이 폼이 있는 이유는 소매처가 "언제 와요?"라고 물을 때 답할 근거를 적어 두는 자리이기
 * 때문이다(glossary §4.8). `변동 사유`가 그 답변의 원본이고, 서버가 최신 사유를 `stats`로
 * 돌려주므로 저장한 사유가 이제 이 칸에 다시 보인다(이력은 없다 — 최신값 하나).
 *
 * `<form>`이다 — Enter로 저장된다(F10). 등록된 값이 있으면 **빈칸으로 저장 = 해제**다
 * (스펙: "`null` = 해제"). 잘못 저장한 날짜를 `-`로 되돌릴 길이 없던 것(F6)이 이걸로 닫힌다.
 *
 * 달력 팝오버는 만들지 않는다. `packages/ui`에 DatePicker가 없고 Figma에도 없다 —
 * 새 primitive를 이 탭에서 만들지 않는다(Rule of Two).
 *
 * `Panel`·제목은 부르는 쪽이 그린다 — 경계가 패널 안에 있어야 기다리는 동안 폭이 유지된다.
 */
export function EtaFormCard({ variantId }: { variantId: number }) {
  const { data } = useSkuBackordersQuery(variantId);
  const { summary } = data;

  const etaId = useId();
  const reasonId = useId();
  const [eta, setEta] = useState(summary.eta ?? "");
  const [reason, setReason] = useState(summary.etaReason ?? "");
  /** 화면이 먼저 잡은 오류(형식). 서버 오류는 뮤테이션 결과에서 그때그때 읽는다 */
  const [localErrors, setLocalErrors] = useState<FormErrors<EtaField>>({});

  const empty = eta.trim() === "";

  /* 해제(빈 날짜)가 받아들여지면 사유도 비운다 — 서버가 사유를 같이 null로 만들었는데
     칸에 옛 글이 남아 있으면 저장된 줄 안다 */
  const save = useExpectedInboundMutation(variantId, {
    onDone: () => {
      if (empty) setReason("");
    },
  });
  /* 등록된 값이 있을 때만 빈칸 저장(해제)이 열린다. 처음부터 빈 SKU에 빈칸을 보낼 이유는 없다 */
  const canSubmit = !empty || summary.eta !== null;

  /* 서버 오류: `VALIDATION_FAILED`는 칸으로, 나머지(404·500…)는 폼 위 한 줄로 */
  const serverErrors: FormErrors<EtaField> | null = save.error
    ? (toFieldErrors(save.error, ETA_FIELDS) ?? {
        _form: describeError(save.error).title,
      })
    : null;
  const errors = { ...localErrors, ...serverErrors };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!empty && !isEtaFormat(eta)) {
      setLocalErrors({
        expectedInboundDate: "YYYY.MM.DD 형식으로 적어 주세요",
      });
      return;
    }
    setLocalErrors({});
    save.mutate(toExpectedInboundRequest(eta, reason));
  };

  /* 고치기 시작하면 직전 결과(오류·저장됨)를 지운다 — 옛 오류가 새 입력 밑에 남지 않게 */
  const edit = () => {
    setLocalErrors({});
    if (save.error || save.isSuccess) save.reset();
  };

  return (
    <form onSubmit={submit} noValidate>
      {errors._form ? (
        <p role="alert" className="text-destructive-strong mb-3 text-sm">
          {errors._form}
        </p>
      ) : null}

      <FormField label="예상 입고일" required htmlFor={etaId}>
        <Input
          id={etaId}
          value={eta}
          placeholder="YYYY.MM.DD"
          aria-invalid={errors.expectedInboundDate ? true : undefined}
          onChange={(e) => {
            setEta(e.target.value);
            edit();
          }}
        />
        {errors.expectedInboundDate ? (
          <p className="text-destructive-strong mt-1.5 text-body">
            {errors.expectedInboundDate}
          </p>
        ) : null}
      </FormField>

      <FormField label="변동 사유" htmlFor={reasonId}>
        <Textarea
          id={reasonId}
          rows={4}
          value={reason}
          placeholder="공장 생산 일정이 3일 밀려요."
          aria-invalid={errors.expectedInboundReason ? true : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            edit();
          }}
        />
        {errors.expectedInboundReason ? (
          <p className="text-destructive-strong mt-1.5 text-body">
            {errors.expectedInboundReason}
          </p>
        ) : null}
      </FormField>

      <div className="flex items-center justify-end gap-3">
        {save.isSuccess ? (
          <p role="status" className="text-muted-foreground text-sm">
            {empty ? "예상 입고일을 지웠어요" : "저장했어요"}
          </p>
        ) : null}
        <Button type="submit" disabled={!canSubmit || save.isPending}>
          {empty && summary.eta !== null ? "해제" : "저장"}
        </Button>
      </div>
    </form>
  );
}

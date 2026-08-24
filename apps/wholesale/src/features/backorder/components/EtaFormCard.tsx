"use client";

import { Button, FormField, Input, Panel, Textarea } from "@ondo/ui";
import { useId, useState } from "react";
import { isEtaFormat } from "../derive";

/**
 * 우측 하단 — 예상 입고일 등록.
 *
 * 이 폼이 있는 이유는 소매처가 "언제 와요?"라고 물을 때 답할 근거를 적어 두는 자리이기
 * 때문이다(glossary §4.8). `변동 사유`가 그 답변의 원본이다.
 *
 * ⚠️ **저장한 변동 사유가 다시 보이는 자리는 화면 어디에도 없다.** 이력 목록이 없기 때문이다
 *    (§4 범위 제외). 그래서 사유는 SKU에 남기지 않고 폼 안에서만 산다 —
 *    보관하는 척하는 state를 만들면 다음 사람이 어딘가 표시되는 줄 안다.
 *
 * 달력 팝오버는 만들지 않는다. `packages/ui`에 DatePicker가 없고 Figma에도 없다 —
 * 새 primitive를 이 탭에서 만들지 않는다(Rule of Two).
 */
export function EtaFormCard({
  initialEta,
  onSave,
}: {
  /** 이미 등록된 값. 없으면 빈칸에서 시작한다 */
  initialEta: string | null;
  onSave: (eta: string) => void;
}) {
  const etaId = useId();
  const reasonId = useId();
  const [eta, setEta] = useState(initialEta ?? "");
  const [reason, setReason] = useState("");
  /** 형식이 틀렸을 때만 뜬다. 빈칸은 버튼이 막으므로 여기까지 오지 않는다 */
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!isEtaFormat(eta)) {
      setError("YYYY.MM.DD 형식으로 적어 주세요");
      return;
    }
    setError(null);
    onSave(eta.trim());
  };

  return (
    <Panel className="shrink-0">
      <Panel.Title>예상 입고일 등록</Panel.Title>

      <FormField label="예상 입고일" required htmlFor={etaId}>
        <Input
          id={etaId}
          value={eta}
          placeholder="2024.07.15"
          onChange={(e) => {
            setEta(e.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p className="text-destructive mt-1.5 text-body">{error}</p>
        ) : null}
      </FormField>

      <FormField label="변동 사유" htmlFor={reasonId}>
        <Textarea
          id={reasonId}
          rows={4}
          value={reason}
          placeholder="공장 생산 일정이 3일 밀려요."
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>

      <div className="flex justify-end">
        <Button disabled={eta.trim() === ""} onClick={save}>
          저장
        </Button>
      </div>
    </Panel>
  );
}

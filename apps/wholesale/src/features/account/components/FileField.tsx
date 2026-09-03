"use client";

import { cn } from "@ondo/ui";
import { Paperclip } from "lucide-react";
import { FILE_ACCEPT, FILE_ACCEPT_LABEL } from "../constants";
import { formatFileSize } from "../derive";
import type { AttachedFile } from "../types";

/**
 * 점선 첨부칸. **UI까지다** — 고른 파일을 어디로도 보내지 않는다(백엔드 없음).
 *
 * 실제 `<input type="file">`을 화면에서 숨기고 라벨을 상자로 그린다. 상자를
 * `<div onClick>`으로 만들면 키보드로 닿지 않고 화면 낭독기가 폼 컨트롤로 읽지도
 * 않는다. 숨긴 입력은 여전히 포커스를 받으므로 `peer-focus`로 상자에 링을 그린다
 * — 제출 후 이 칸으로 포커스를 옮겼을 때 어디로 갔는지 보여야 하기 때문이다.
 *
 * **`<label for>`는 칸 하나에 하나뿐이다.** 점선 상자가 이미 이 입력의 라벨이라
 * 바깥 이름표까지 `<label for>`이면 두 글이 이어 붙어 한 칸의 이름으로 읽힌다
 * (`사업자 등록증 (필수) 파일 첨부 JPG · PNG · PDF`). 바깥 이름표는 `<span id>`로
 * 두고 입력이 `aria-labelledby`로 가리킨다(`retail-account` F5).
 *
 * 고른 파일은 부모가 들고 있다. 검증에 실패하거나 다른 칸을 고쳐도 이름이
 * 사라지지 않아야 한다.
 */
export function FileField({
  id,
  emptyLabel,
  file,
  invalid = false,
  required = false,
  labelledBy,
  describedBy,
  onSelect,
}: {
  id: string;
  /** 아직 안 골랐을 때 상자에 적히는 말 (`파일 첨부` / `파일 다시 첨부`) */
  emptyLabel: string;
  file: AttachedFile | null;
  invalid?: boolean;
  required?: boolean;
  /** 이 칸의 이름표 id. 위 주석의 이유로 `<label for>`가 아니라 이쪽을 쓴다 */
  labelledBy?: string;
  describedBy?: string;
  onSelect: (file: AttachedFile | null) => void;
}) {
  return (
    <>
      <input
        type="file"
        id={id}
        name={id}
        accept={FILE_ACCEPT}
        className="peer sr-only"
        required={required}
        aria-invalid={invalid}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          /* 이름과 용량만 꺼낸다. 파일 자체를 들고 있어도 보낼 곳이 없다 */
          onSelect(picked ? { name: picked.name, size: picked.size } : null);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          "border-input text-muted-foreground text-body flex h-10 cursor-pointer items-center gap-2.5 rounded-control border border-dashed px-3",
          "peer-focus:outline-ring peer-focus:outline-2 peer-focus:outline-offset-2",
          invalid && "border-destructive",
        )}
      >
        <Paperclip aria-hidden className="size-4 shrink-0" />
        {file ? (
          <>
            <span className="text-foreground truncate">{file.name}</span>
            <span className="ml-auto shrink-0">
              {formatFileSize(file.size)}
            </span>
          </>
        ) : (
          <>
            <span>{emptyLabel}</span>
            <span className="ml-auto shrink-0">{FILE_ACCEPT_LABEL}</span>
          </>
        )}
      </label>
    </>
  );
}

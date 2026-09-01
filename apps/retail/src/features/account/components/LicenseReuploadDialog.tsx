"use client";

import { Button, Dialog } from "@ondo/ui";
import { ACCOUNT_STATUS_LABEL, fieldId, FOCUS_RING_CLASS } from "../constants";
import { formatFileSize } from "../derive";
import type { AttachedFile } from "../types";

/**
 * 사업자등록증을 다시 올리기 전 확인 — **취소/확인 두 갈래**다.
 *
 * 왜 확인을 끼우는가: `사업자 정보` 패널에는 `저장` 버튼이 없어서 파일을 고르는
 * 순간이 곧 실행이 된다(확정 와이어프레임 그대로다). 그런데 이 실행은 승인
 * 상태를 `심사 중`으로 되돌린다(RT-68) — 등록증을 확인만 해 보려고 파일을 고른
 * 사장과 정말 다시 올리려는 사장을 구분할 방법이 없어진다.
 * 와이어프레임이 도움말에 그 대가를 미리 적어 둔 것 자체가 "누르기 전에 알아야
 * 한다"는 뜻이라, 되돌릴 수 있는 길(취소)을 같이 둔다(`01-pm.md` 가정 A5).
 *
 * `ComingSoonDialog`를 쓰지 않는 이유: 저건 닫기 하나뿐이라 "안 하기"를 고를 수
 * 없다.
 */
export function LicenseReuploadDialog({
  file,
  onConfirm,
  onCancel,
}: {
  /** 고른 파일. `null`이면 닫혀 있다 — 열림 여부와 대상이 한 값이라 어긋나지 않는다 */
  file: AttachedFile | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={file !== null}
      /* Esc·바깥 클릭도 취소다. 그냥 닫기만 하면 고른 파일이 어중간하게 남는다 */
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Content
        /* 이 다이얼로그는 여는 버튼이 따로 없다(파일 선택이 곧 열림). 닫을 때
           포커스를 놓아 버리면 `<body>`로 떨어지므로 첨부칸으로 되돌린다 */
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(fieldId("license"))?.focus();
        }}
      >
        <Dialog.Title>사업자등록증을 다시 올릴까요?</Dialog.Title>
        <Dialog.Description>
          다시 올리면 승인 상태가 {ACCOUNT_STATUS_LABEL.PENDING}으로 돌아가요.
          심사 동안에도 주문은 계속할 수 있어요.
        </Dialog.Description>

        {/* 무엇을 올리는지 이름과 용량으로 한 번 더 보여 준다 — 파일 선택창에서
            잘못 고른 것을 알아챌 수 있는 마지막 자리다 */}
        {file ? (
          <p className="bg-secondary text-secondary-foreground mt-4 flex items-center gap-2 rounded-control px-3 py-2.5 text-body">
            <span className="min-w-0 truncate">{file.name}</span>
            <span className="ml-auto shrink-0">
              {formatFileSize(file.size)}
            </span>
          </p>
        ) : null}

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="line" className={FOCUS_RING_CLASS}>
              취소
            </Button>
          </Dialog.Close>
          <Button onClick={onConfirm} className={FOCUS_RING_CLASS}>
            다시 올리기
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

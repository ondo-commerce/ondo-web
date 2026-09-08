"use client";

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  FormField,
  IconButton,
  Input,
  Panel,
} from "@ondo/ui";
import { X } from "lucide-react";
import { useId, useState } from "react";
import {
  useCreateBankAccountMutation,
  useDeleteBankAccountMutation,
  useSettlementRefresh,
  useUpdateBankAccountMutation,
} from "../api/mutations";
import { BANK_ACCOUNT_FIELDS, EMPTY_BANK_ACCOUNT_DRAFT } from "../constants";
import {
  bankAccountErrorText,
  canSaveBankAccount,
  toBankAccountCreateRequest,
  toBankAccountDraft,
  toBankAccountUpdateRequest,
} from "../derive";
import { useBankAccountsQuery } from "../api/queries";
import type { BankAccountDraft, BankAccountView } from "../types";
import { isApiError } from "@ondo/api";
import { WHOLESALE_ERROR_CODE } from "@/shared/api/errorCodes";
import { toFieldErrors, type FormErrors } from "@/shared/api/fieldErrors";

type BankAccountField = (typeof BANK_ACCOUNT_FIELDS)[number];

/** 폼 모드. 목록 → `+ 계좌 추가`(create) / 행 클릭(edit) */
type Editor = { kind: "create" } | { kind: "edit"; account: BankAccountView };

/**
 * 우측 패널 — 입금받을 정산 계좌(`GET/POST/PATCH/DELETE /bank-accounts`).
 *
 * fixtures 화면에는 없던 자리다. Figma 정산 섹션의 `계좌 관리`·`계좌 수정` 프레임(settlements 01-pm Q4:
 * 열 `은행명 / 계좌번호 / 예금주 / 등록일 / 상태(주 계좌·일반) / 메모`, 우측 폼 `은행 / 계좌번호 / 예금주 / 메모`
 * + `주 계좌로 설정` + `계좌 삭제`·`계좌 수정`, `+ 계좌 추가`)을 이 패널 하나에 최소로 옮겼다 — 04-wire §5-1.
 * 은행은 **자유 입력**이다. 은행 목록 API·상수가 없고, 스펙도 형식을 검증하지 않는다.
 *
 * 안에서 `useSuspenseQuery`를 부른다 — `Panel`과 경계는 부르는 쪽이 감싼다.
 */
export function BankAccountPanel({ onClose }: { onClose: () => void }) {
  const { data: accounts, isRefetchError } = useBankAccountsQuery();
  const refresh = useSettlementRefresh();
  const [editor, setEditor] = useState<Editor | null>(null);
  /** 저장·삭제는 됐는데 목록 재조회가 실패한 상태. 옛 목록으로 다음 작업을 하지 않게 잠근다(⑦) */
  const [staleText, setStaleText] = useState<string | null>(null);

  const finish = (refreshed: boolean, what: string) => {
    setEditor(null);
    setStaleText(
      refreshed ? null : `${what}은 됐지만 목록을 새로 못 불러왔어요`,
    );
  };

  const retry = () => {
    void refresh().then((ok) => {
      if (ok) setStaleText(null);
    });
  };

  const stale = staleText !== null;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Panel.Title sub="입금받을 계좌. 주계좌는 하나뿐이에요">
          정산 계좌
        </Panel.Title>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="계좌 닫기"
          onClick={onClose}
        >
          <X aria-hidden />
        </IconButton>
      </div>

      <Panel.Body>
        {isRefetchError || stale ? (
          <p
            role="alert"
            className="text-destructive-strong mb-3 flex items-center justify-between gap-3 text-sm"
          >
            {staleText ?? "최신 목록을 못 불러왔어요"}
            <Button type="button" variant="line" size="sm" onClick={retry}>
              다시 불러오기
            </Button>
          </p>
        ) : null}

        {accounts.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            등록된 계좌가 없습니다
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => {
              const selected =
                editor?.kind === "edit" && editor.account.id === account.id;
              return (
                <li key={account.id}>
                  {/* 행을 누르면 아래 폼이 그 계좌로 바뀐다. 눌린 행은 배경으로만 표시한다 */}
                  <button
                    type="button"
                    disabled={stale}
                    aria-pressed={selected}
                    onClick={() => setEditor({ kind: "edit", account })}
                    className={`border-border w-full rounded-control border px-3 py-2 text-left text-sm ${
                      selected ? "bg-secondary" : "bg-card hover:bg-secondary"
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{account.bankName}</span>
                      <span className="tabular-nums">{account.accountNo}</span>
                      {account.isPrimary ? (
                        <Badge tone="active">주계좌</Badge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground mt-1 flex gap-2 text-xs">
                      <span>{account.accountHolder}</span>
                      <span>{account.createdAt}</span>
                      {account.memo !== "" ? <span>{account.memo}</span> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="line"
            size="sm"
            disabled={stale || editor?.kind === "create"}
            onClick={() => setEditor({ kind: "create" })}
          >
            + 계좌 추가
          </Button>
        </div>

        {editor ? (
          <div className="border-border mt-4 border-t pt-4">
            {editor.kind === "create" ? (
              <BankAccountCreateForm
                key="create"
                onCancel={() => setEditor(null)}
                onDone={(refreshed) => finish(refreshed, "등록")}
              />
            ) : (
              <BankAccountEditForm
                key={editor.account.id}
                account={editor.account}
                onCancel={() => setEditor(null)}
                onDone={(refreshed, what) => finish(refreshed, what)}
              />
            )}
          </div>
        ) : null}
      </Panel.Body>
    </>
  );
}

/**
 * 400인데 `VALIDATION_FAILED`가 아닌 정책 오류를 칸에 붙인다 — 중복 계좌는 계좌번호 칸,
 * 주계좌 해제 불가는 체크박스 아래. 나머지는 폼 위 한 줄.
 */
function bankAccountErrors(error: unknown): FormErrors<BankAccountField> {
  const fields = toFieldErrors(error, BANK_ACCOUNT_FIELDS);
  if (fields) return fields;
  if (isApiError(error)) {
    if (error.code === WHOLESALE_ERROR_CODE.DUPLICATE_BANK_ACCOUNT)
      return { accountNo: bankAccountErrorText(error) };
    if (error.code === WHOLESALE_ERROR_CODE.PRIMARY_ACCOUNT_CANNOT_BE_UNSET)
      return { isPrimary: bankAccountErrorText(error) };
  }
  return { _form: bankAccountErrorText(error) };
}

/** 추가·수정이 같이 쓰는 칸 4개 + 주계좌 체크박스 */
function BankAccountFields({
  draft,
  errors,
  disabled,
  primaryLocked,
  onChange,
}: {
  draft: BankAccountDraft;
  errors: FormErrors<BankAccountField>;
  disabled: boolean;
  /** 지금 주계좌인 계좌는 직접 해제할 수 없다(스펙) — 체크박스를 잠근다 */
  primaryLocked: boolean;
  onChange: (patch: Partial<BankAccountDraft>) => void;
}) {
  const bankId = useId();
  const noId = useId();
  const holderId = useId();
  const memoId = useId();
  const primaryId = useId();

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4">
        <FormField
          label="은행"
          htmlFor={bankId}
          required
          hint={errors.bankName}
        >
          <Input
            id={bankId}
            placeholder="신한은행"
            value={draft.bankName}
            aria-invalid={errors.bankName !== undefined}
            onChange={(e) => onChange({ bankName: e.target.value })}
            disabled={disabled}
          />
        </FormField>
        <FormField
          label="계좌번호"
          htmlFor={noId}
          required
          hint={errors.accountNo}
        >
          <Input
            id={noId}
            placeholder="110-482-948102"
            value={draft.accountNo}
            aria-invalid={errors.accountNo !== undefined}
            onChange={(e) => onChange({ accountNo: e.target.value })}
            disabled={disabled}
          />
        </FormField>
        <FormField
          label="예금주"
          htmlFor={holderId}
          required
          hint={errors.accountHolder}
        >
          <Input
            id={holderId}
            value={draft.accountHolder}
            aria-invalid={errors.accountHolder !== undefined}
            onChange={(e) => onChange({ accountHolder: e.target.value })}
            disabled={disabled}
          />
        </FormField>
        <FormField label="메모" htmlFor={memoId} hint={errors.memo}>
          <Input
            id={memoId}
            placeholder="주거래 계좌"
            value={draft.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
            disabled={disabled}
          />
        </FormField>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Checkbox
          id={primaryId}
          checked={draft.isPrimary}
          disabled={disabled || primaryLocked}
          onCheckedChange={(checked) =>
            onChange({ isPrimary: checked === true })
          }
        />
        <label htmlFor={primaryId} className="text-sm">
          주 계좌로 설정
        </label>
        {primaryLocked ? (
          <span className="text-muted-foreground text-xs">
            다른 계좌를 주계좌로 지정하면 내려가요
          </span>
        ) : null}
      </div>
      {errors.isPrimary ? (
        <p role="alert" className="text-destructive-strong mb-3 text-sm">
          {errors.isPrimary}
        </p>
      ) : null}
    </>
  );
}

function BankAccountCreateForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (refreshed: boolean) => void;
}) {
  const [draft, setDraft] = useState<BankAccountDraft>(
    EMPTY_BANK_ACCOUNT_DRAFT,
  );
  const create = useCreateBankAccountMutation({ onDone });
  const errors = create.error ? bankAccountErrors(create.error) : {};

  const change = (patch: Partial<BankAccountDraft>) => {
    if (create.error) create.reset();
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  return (
    <>
      <p className="mb-3 text-sm font-medium">계좌 추가</p>
      <BankAccountFields
        draft={draft}
        errors={errors}
        disabled={create.isPending}
        primaryLocked={false}
        onChange={change}
      />
      {errors._form ? (
        <p role="alert" className="text-destructive-strong mb-3 text-sm">
          {errors._form}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="line" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSaveBankAccount(draft) || create.isPending}
          onClick={() => create.mutate(toBankAccountCreateRequest(draft))}
        >
          {create.isPending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </>
  );
}

function BankAccountEditForm({
  account,
  onCancel,
  onDone,
}: {
  account: BankAccountView;
  onCancel: () => void;
  onDone: (refreshed: boolean, what: string) => void;
}) {
  const [draft, setDraft] = useState<BankAccountDraft>(() =>
    toBankAccountDraft(account),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateBankAccountMutation(account.id, {
    onDone: (refreshed) => onDone(refreshed, "수정"),
  });
  const remove = useDeleteBankAccountMutation(account.id, {
    onDone: (refreshed) => onDone(refreshed, "삭제"),
  });
  const error = update.error ?? remove.error;
  const errors = error ? bankAccountErrors(error) : {};
  const busy = update.isPending || remove.isPending;
  const patch = toBankAccountUpdateRequest(draft, account);

  const change = (next: Partial<BankAccountDraft>) => {
    if (update.error) update.reset();
    if (remove.error) remove.reset();
    setDraft((prev) => ({ ...prev, ...next }));
  };

  return (
    <>
      <p className="mb-3 text-sm font-medium">계좌 수정</p>
      <BankAccountFields
        draft={draft}
        errors={errors}
        disabled={busy}
        primaryLocked={account.isPrimary}
        onChange={change}
      />
      {errors._form ? (
        <p role="alert" className="text-destructive-strong mb-3 text-sm">
          {errors._form}
        </p>
      ) : null}
      <div className="flex justify-between gap-2">
        {/* 삭제 진입은 line, 빨강은 다이얼로그의 마지막 확인 한 곳에만 */}
        <Button
          type="button"
          variant="line"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          계좌 삭제
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="line" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSaveBankAccount(draft) || patch === null || busy}
            onClick={() => {
              if (patch) update.mutate(patch);
            }}
          >
            {update.isPending ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Dialog.Content>
          <Dialog.Title>계좌 삭제</Dialog.Title>
          <Dialog.Description>
            {account.bankName} {account.accountNo} 계좌를 삭제할까요? 되돌릴 수
            없어요.
            {account.isPrimary
              ? " 주계좌를 지우면 가장 먼저 등록한 계좌가 주계좌가 돼요."
              : ""}
          </Dialog.Description>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button type="button" variant="line">
                취소
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
            >
              삭제
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

"use client";

import { Button, cn, FormField, Input, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { FieldError, FieldHelp } from "./FieldError";
import { FileField } from "./FileField";
import { LicenseReuploadDialog } from "./LicenseReuploadDialog";
import { LockedField } from "./LockedField";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import { TermsDialog } from "./TermsDialog";
import { TwoCol } from "./TwoCol";
import {
  ACCOUNT_PANEL_FIELDS,
  ACCOUNT_STATUS_LABEL,
  errorId,
  fieldId,
  FIELD_LABEL_CLASS,
  FOCUS_RING_CLASS,
  INVALID_INPUT_CLASS,
  labelId,
  PASSWORD_MASK,
  STORE_PANEL_FIELDS,
} from "../constants";
import {
  consentRecords,
  firstInvalidField,
  normalizeSeparators,
  normalizeStoreName,
  validateSettings,
  visibleErrors,
  type SettingsValues,
} from "../derive";
import { APPLICATION, SETTINGS_ACCOUNT } from "../fixtures";
import {
  applyLicenseReupload,
  saveProfile,
  useAccountStatus,
  useLicense,
  useSettingsProfile,
} from "../store";
import type { AttachedFile, SettingsField } from "../types";

/**
 * 새로 고치면 되돌아간다는 사실을 **결과 문구마다** 붙인다.
 *
 * 저장이 안 된 것과 저장이 세션에만 남는 것은 다른 얘기인데, 화면이 말해 주지
 * 않으면 구분할 방법이 없다 — 더미 경계를 화면이 직접 말하게 한다.
 */
const DUMMY_NOTE = "서버가 없어 새로 고치면 원래대로 돌아와요.";

/** 여러 설명을 한 입력에 묶는다. 빈 것은 빼야 존재하지 않는 id를 가리키지 않는다 */
function describedBy(
  ...ids: (string | false | undefined)[]
): string | undefined {
  const list = ids.filter((id): id is string => Boolean(id));
  return list.length > 0 ? list.join(" ") : undefined;
}

/** 값을 손봤을 때 그 사실을 알리는 줄. 오류가 아니라 통지라서 회색이다 */
type Notes = Partial<Record<"phone", string>>;

/**
 * 설정 — 가게 정보 · 사업자 정보 · 계정 · 개인정보/약관 패널 4장.
 *
 * `features/settings/`를 새로 파지 않고 `features/account/` 안에 둔다
 * (`01-pm.md` 가정 A1). 이 화면이 읽는 값(계정·상호명·사업자등록번호·약관 전문·
 * 승인 상태)이 전부 여기 있어서, 별도 feature로 파면 feature끼리 직접 import를
 * 못 해 더미를 한 벌 복제하게 된다.
 *
 * **전부 더미다.** 저장·비밀번호 변경·재업로드 어느 것도 네트워크 요청을 만들지
 * 않는다. 저장한 값은 세션 보관소(`store.ts`)에 남아 다른 화면에 갔다 와도
 * 살아 있고, 새로 고치면 출발값으로 돌아간다.
 *
 * 패널마다 `저장`이 따로인 것은 확정 와이어프레임 그대로다 — 검증도 포커스
 * 이동도 그 패널 안에서만 일어난다.
 */
export function SettingsView() {
  const saved = useSettingsProfile();
  const license = useLicense();
  const status = useAccountStatus();

  /* 타이핑 중인 값은 폼이 들고, 저장된 값은 보관소가 든다. 출발값만 받아 온다 —
     저장 뒤에도 이 상태가 그대로라 방금 친 글자가 다시 그려지며 튀지 않는다 */
  const [values, setValues] = useState<SettingsValues>(saved);
  /** 이미 한 번 걸린 칸. 여기 들어간 칸만 오류 문구를 띄운다 */
  const [revealed, setRevealed] = useState<SettingsField[]>([]);
  const [notes, setNotes] = useState<Notes>({});

  /* 결과 줄을 패널마다 따로 든다. 하나로 두면 계정 패널을 저장했는데 가게 정보
     패널의 결과가 사라져서 "아까 그건 저장된 건가"가 남는다 */
  const [storeResult, setStoreResult] = useState<string | null>(null);
  const [accountResult, setAccountResult] = useState<string | null>(null);
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [licenseResult, setLicenseResult] = useState<string | null>(null);

  /** 고르기만 하고 아직 반영하지 않은 등록증. 확인 다이얼로그의 대상이자 열림 여부다 */
  const [pendingLicense, setPendingLicense] = useState<AttachedFile | null>(
    null,
  );

  const found = validateSettings(values);
  const errors = visibleErrors(found, revealed);

  const setField = (field: SettingsField, next: string) => {
    setValues((prev) => ({ ...prev, [field]: next }));
    /* 손본 값을 다시 고치면 통지는 역할이 끝난다 */
    if (field === "phone" && notes.phone) setNotes({});
  };

  /**
   * 칸을 떠날 때 구분자만 하이픈으로 맞춘다.
   *
   * 타이핑 도중에 고치면 커서가 튀고, 아예 안 고치면 `010.1234.5678`이 형식
   * 오류로만 남는다. 바꿨으면 **바뀐 값이 칸에 보이고** 왜 바꿨는지 아래 줄이
   * 말한다 — 조용히 글자를 지우지 않는다(회원가입과 같은 처리).
   */
  const normalizePhoneOnBlur = () => {
    const raw = values.phone;
    const normalized = normalizeSeparators(raw);
    if (normalized === raw) return;

    setValues((prev) => ({ ...prev, phone: normalized }));
    setNotes({
      phone: `입력하신 값을 ${normalized} 로 맞췄어요. 구분자만 바꿨고 지운 글자는 없어요.`,
    });
  };

  /**
   * 패널 하나를 저장한다. 그 패널의 칸만 보고, 첫 오류 칸으로 포커스를 옮긴다.
   *
   * 오류가 있으면 결과 줄을 지운다 — 아까 성공했던 문구가 남아 있으면 방금
   * 실패한 저장까지 된 것으로 읽힌다.
   */
  const submitPanel = (
    fields: readonly SettingsField[],
    onSaved: (values: SettingsValues) => void,
    setResult: (message: string | null) => void,
  ) => {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const invalid = fields.filter((field) => found[field] !== undefined);
      /* 한 번 드러난 칸은 계속 드러난 채로 둔다 — 고쳤다가 다시 비우면 그 자리에서 말한다 */
      setRevealed((prev) => [...new Set([...prev, ...invalid])]);

      const first = firstInvalidField(found, fields);
      if (first) {
        setResult(null);
        document.getElementById(fieldId(first))?.focus();
        return;
      }

      onSaved(values);
    };
  };

  const submitStore = submitPanel(
    STORE_PANEL_FIELDS,
    (next) => {
      saveProfile({ storeName: next.storeName });
      const shown = normalizeStoreName(next.storeName) ?? next.storeName;
      setStoreResult(
        `상호명을 ${shown} 로 저장했어요. 헤더의 계정 이름도 같이 바뀌었어요. ${DUMMY_NOTE}`,
      );
    },
    setStoreResult,
  );

  const submitAccount = submitPanel(
    ACCOUNT_PANEL_FIELDS,
    (next) => {
      saveProfile({ ownerName: next.ownerName, phone: next.phone });
      setAccountResult(`대표자명과 연락처를 저장했어요. ${DUMMY_NOTE}`);
    },
    setAccountResult,
  );

  /**
   * 고른 파일을 붙였던 자리를 비운다.
   *
   * `<input type="file">`은 같은 파일을 다시 고르면 `change`가 안 뜬다 — 값이
   * 안 바뀌었기 때문이다. 취소한 뒤 같은 파일을 다시 고르는 것이 막히면
   * 되돌릴 길을 준 의미가 없어진다.
   */
  const clearFileInput = () => {
    const input = document.getElementById(fieldId("license"));
    if (input instanceof HTMLInputElement) input.value = "";
  };

  /** 글자를 받는 칸 한 벌. 세 칸이 같은 모양이라 여기서 한 번만 그린다 */
  const textField = (
    field: SettingsField,
    label: ReactNode,
    options: {
      type?: "text" | "tel";
      autoComplete: string;
      placeholder: string;
      className?: string;
      onBlur?: () => void;
    },
  ) => {
    const error = errors[field];
    const note = field === "phone" ? notes.phone : undefined;
    const noteId = note ? `${fieldId(field)}-note` : undefined;

    return (
      <FormField
        className={cn("mb-0", FIELD_LABEL_CLASS, options.className)}
        label={label}
        htmlFor={fieldId(field)}
      >
        <Input
          id={fieldId(field)}
          className={cn(INVALID_INPUT_CLASS, FOCUS_RING_CLASS)}
          name={field}
          type={options.type ?? "text"}
          required
          autoComplete={options.autoComplete}
          placeholder={options.placeholder}
          value={values[field]}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(error && errorId(field), noteId)}
          onChange={(e) => setField(field, e.target.value)}
          onBlur={options.onBlur}
        />
        {error ? <FieldError id={errorId(field)}>{error}</FieldError> : null}
        {note ? <FieldHelp id={noteId}>{note}</FieldHelp> : null}
      </FormField>
    );
  };

  /** 패널 아래 오른쪽 `저장` 줄 (`.actions`). 결과 한 줄이 버튼 옆에 남는다 */
  const actions = (result: string | null) => (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
      {/* 토스트가 아니라 **남는 표시**다. 사라지면 다시 눌러야 하는지 알 수 없다 */}
      {result ? (
        <p
          role="status"
          className="text-secondary-foreground min-w-0 flex-1 text-body"
        >
          {result}
        </p>
      ) : null}
      <Button type="submit" variant="line" className={FOCUS_RING_CLASS}>
        저장
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-wrap">
      {/* 확정 와이어프레임에 페이지 제목이 없다 — 패널 h2 4개가 전부다. 그래도
          h1은 있어야 첫 헤딩이 패널 제목으로 시작하지 않는다(`HomeView` 선례) */}
      <h1 className="sr-only">설정</h1>

      {/* 패널 사이 8px — 확정 와이어프레임 `_base.css` 실측값 */}
      <div className="space-y-2">
        {/* ① 가게 정보 ------------------------------------------------- */}
        <Panel>
          <form onSubmit={submitStore} noValidate>
            {/* 부제는 13px다 — `Panel.Title` 기본값(14px)이면 제목과 무게가 붙는다 */}
            <Panel.Title
              className="[&_p]:text-body"
              sub="상호명은 주문서와 장끼에서 도매처에게 보여요."
            >
              가게 정보
            </Panel.Title>

            {textField("storeName", "상호명", {
              autoComplete: "organization",
              placeholder: "예: 우리옷가게",
              /* 확정 와이어프레임의 인라인 `max-width:420px`. 짧은 값에 폭
                 1180px짜리 칸을 주면 어디까지 치라는 것인지가 안 읽힌다 */
              className: "max-w-105",
            })}

            {actions(storeResult)}
          </form>
        </Panel>

        {/* ② 사업자 정보 ----------------------------------------------- */}
        <Panel>
          <Panel.Title>사업자 정보</Panel.Title>

          <TwoCol>
            <LockedField
              className="mb-0"
              id={labelId("bizNo")}
              label="사업자등록번호"
              value={APPLICATION.bizNo}
              help="바꾸려면 고객센터로 문의해 주세요."
            />

            {/* `htmlFor`를 주지 않는다 — 점선 상자가 이미 이 입력의 `<label for>`라서
                여기까지 라벨이면 칸 이름이 두 글의 이어붙임이 된다(`retail-account`
                F5). 이름은 이 `<span>` 하나로 고정하고 입력이 `aria-labelledby`로
                가리킨다 */}
            <FormField
              className={cn("mb-0", FIELD_LABEL_CLASS)}
              label={<span id={labelId("license")}>사업자등록증</span>}
            >
              <FileField
                id={fieldId("license")}
                emptyLabel="다시 올리기"
                file={license}
                labelledBy={labelId("license")}
                describedBy={`${fieldId("license")}-help`}
                /* 고르는 것만으로 반영하지 않는다. 확인 다이얼로그를 거친다 */
                onSelect={(picked) => setPendingLicense(picked)}
              />
              <FieldHelp id={`${fieldId("license")}-help`}>
                다시 올리면 승인 상태가 {ACCOUNT_STATUS_LABEL.PENDING}으로
                돌아가요. 심사 동안에도 주문은 계속할 수 있어요.
              </FieldHelp>
            </FormField>
          </TwoCol>

          {/* 확정 와이어프레임에는 상태 표시가 없다. 그런데 재업로드가 승인 상태를
              되돌리는데 결과가 화면 어디에도 안 보이면 눌렀는지 알 수 없다
              (`01-pm.md` 가정 A4). 상태 어휘는 새로 만들지 않고 그대로 쓴다 */}
          {status === "PENDING" ? (
            <p
              role="status"
              className="bg-secondary text-secondary-foreground mt-4 rounded-control px-3.5 py-2.5 text-body"
            >
              승인 상태: {ACCOUNT_STATUS_LABEL[status]} —{" "}
              {licenseResult ?? "다시 올린 등록증을 확인하는 중이에요."}{" "}
              {DUMMY_NOTE}
            </p>
          ) : null}
        </Panel>

        {/* ③ 계정 ------------------------------------------------------- */}
        <Panel>
          <form onSubmit={submitAccount} noValidate>
            <Panel.Title>계정</Panel.Title>

            <TwoCol>
              <LockedField
                className="mb-0"
                id={labelId("email")}
                label="이메일"
                value={SETTINGS_ACCOUNT.email}
                help="로그인 ID라 바꿀 수 없어요."
              />

              <div>
                <LockedField
                  className="mb-0"
                  id={labelId("password")}
                  label="비밀번호"
                  value={PASSWORD_MASK}
                  action={
                    <PasswordChangeDialog
                      onChanged={() =>
                        setPasswordResult(
                          "새 비밀번호를 확인했어요. 아직 서버가 없어 실제로 바뀌지는 않아요.",
                        )
                      }
                    />
                  }
                />
                {passwordResult ? (
                  <p
                    role="status"
                    className="text-secondary-foreground mt-1.5 text-xs leading-4.5"
                  >
                    {passwordResult}
                  </p>
                ) : null}
              </div>

              {textField("ownerName", "대표자명", {
                autoComplete: "name",
                placeholder: "예: 김봄",
              })}

              {textField("phone", "연락처", {
                type: "tel",
                autoComplete: "tel",
                placeholder: "010-0000-0000",
                onBlur: normalizePhoneOnBlur,
              })}
            </TwoCol>

            {actions(accountResult)}
          </form>
        </Panel>

        {/* ④ 개인정보 · 약관 -------------------------------------------- */}
        <Panel>
          <Panel.Title>개인정보 · 약관</Panel.Title>

          <Notice>
            <span className="flex items-start gap-2">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                대표자명 · 연락처 · 사업자등록번호는 암호화해 따로 보관해요.
                도매처에게는 상호명과 주문 정보만 전달돼요.
              </span>
            </span>
          </Notice>

          {/* 동의 철회·탈퇴 컨트롤을 만들지 않는다 — 확정 와이어프레임에 없고,
              되돌릴 수 없는 조작을 화면 근거 없이 지어내지 않는다 */}
          <div className="mt-3">
            {consentRecords().map(({ kind, label, agreedAt }) => (
              <div
                key={kind}
                className="border-border flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{label}</p>
                  {/* 날짜 문자열을 화면에 적지 않는다 — 신청 레코드에서 온다 */}
                  <p className="text-muted-foreground text-body">
                    {agreedAt} 동의
                  </p>
                </div>
                <TermsDialog
                  kind={kind}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("text-body", FOCUS_RING_CLASS)}
                      aria-label={`${label} 내용 보기`}
                    >
                      내용 보기
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <LicenseReuploadDialog
        file={pendingLicense}
        onCancel={() => {
          setPendingLicense(null);
          clearFileInput();
        }}
        onConfirm={() => {
          if (pendingLicense) {
            applyLicenseReupload(pendingLicense);
            setLicenseResult(`${pendingLicense.name} 을(를) 다시 올렸어요.`);
          }
          setPendingLicense(null);
          clearFileInput();
        }}
      />
    </div>
  );
}

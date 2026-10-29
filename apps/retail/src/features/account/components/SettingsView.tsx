import { Button, cn, Notice, Panel } from "@ondo/ui";
import { Info } from "lucide-react";
import { LockedField } from "./LockedField";
import { TermsDialog } from "./TermsDialog";
import { TwoCol } from "./TwoCol";
import { CONTACT_LINE, FOCUS_RING_CLASS, labelId } from "../constants";
import { consentRecords, storeNameLabel } from "../derive";

/**
 * 안내 배너를 확정 와이어프레임 `_base.css` 238~239행 `.notice`에 맞춘다.
 *
 * `packages/ui` `Notice`의 기본값(`bg-accent`·`text-accent-foreground`·14px/20·
 * 패딩 12/16)은 강조 파랑 배너다. 원본의 `.notice`는 회색 면 위 gray-600
 * 13px/19이고, 기본값 그대로 두면 대비가 8.3:1에서 **4.63:1**로 내려앉아 AA
 * 문턱에 붙는다(retail-settings F5). 그 패키지는 읽기 전용이라 호출부에서 덮는다.
 */
const NOTICE_CLASS =
  "bg-secondary text-secondary-foreground items-start px-3.5 py-2.75 text-body leading-4.75";

/**
 * 설정 — 가게 정보 · 계정 · 개인정보/약관 패널 3장. **읽기 전용이다.**
 *
 * 값은 전부 `/me`(`RetailerResponse`)에서 온다. 서버 컴포넌트
 * (`app/(shop)/settings/page.tsx`)가 읽어 넘긴다.
 *
 * 예전 화면은 칸 전부가 세션 흉내였다 — 상호명·대표자명·연락처 저장, 비밀번호
 * 변경, 등록증 재업로드가 어느 것도 서버에 가지 않으면서 "저장했어요"를 띄웠고,
 * 사업자·대표자·연락처 칸은 어느 계정으로 들어와도 같은 더미 값이었다
 * (`side-02` #4). 고치는 API가 스냅샷에 없어(BE 요청 B9) 칸째 뺐다. `/me`가 일부러
 * 안 주는 대표자·연락처·사업자번호는 그릴 값이 없다.
 */
export function SettingsView({
  shopName,
  email,
  appliedAt,
}: {
  /** `/me.shopName`. 비었으면 `storeNameLabel`이 자리 문구로 바꾼다 */
  shopName: string | null | undefined;
  /** `/me.email` — 로그인 ID */
  email: string;
  /** `/me.appliedAt`(ISO). 약관 동의 일시가 이 값이다 */
  appliedAt: string;
}) {
  return (
    <div className="mx-auto max-w-wrap">
      {/* 확정 와이어프레임에 페이지 제목이 없다 — 패널 h2가 전부다. 그래도
          h1은 있어야 첫 헤딩이 패널 제목으로 시작하지 않는다(`HomeView` 선례) */}
      <h1 className="sr-only">설정</h1>

      {/* 패널 사이 8px — 확정 와이어프레임 `_base.css` 실측값 */}
      <div className="space-y-2">
        <Panel>
          {/* 부제는 13px다 — `Panel.Title` 기본값(14px)이면 제목과 무게가 붙는다 */}
          <Panel.Title
            className="[&_p]:text-body"
            sub="상호명은 주문서와 장끼에서 도매처에게 보여요."
          >
            가게 정보
          </Panel.Title>

          <LockedField
            /* 확정 와이어프레임의 인라인 `max-width:420px` */
            className="mb-0 max-w-105"
            id={labelId("storeName")}
            label="상호명"
            value={storeNameLabel(shopName)}
            help={`바꾸려면 ${CONTACT_LINE}.`}
          />
        </Panel>

        <Panel>
          <Panel.Title>계정</Panel.Title>

          <TwoCol>
            <LockedField
              className="mb-0"
              id={labelId("email")}
              label="이메일"
              value={email}
              help="로그인 ID라 바꿀 수 없어요."
            />
          </TwoCol>
        </Panel>

        <Panel>
          <Panel.Title>개인정보 · 약관</Panel.Title>

          <Notice className={NOTICE_CLASS}>
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
            {consentRecords(appliedAt).map(({ kind, label, agreedAt }) => (
              <div
                key={kind}
                /* 구분선은 gray-200이 아니라 gray-100이다 — 확정 와이어프레임
                   `.row`가 쓰는 `--border-soft`(retail-settings F6) */
                className="border-border-soft flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{label}</p>
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
    </div>
  );
}

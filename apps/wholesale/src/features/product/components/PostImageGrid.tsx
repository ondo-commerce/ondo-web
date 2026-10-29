"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { isApiError, TRANSPORT_ERROR_CODE } from "@ondo/api";
import {
  AddSlot,
  Button,
  Chip,
  cn,
  IconButton,
  ImageSlot,
  SlotGrid,
} from "@ondo/ui";
import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ListingImage } from "./ListingImage";
import { useUploadListingImageMutation } from "../api/mutations";
import {
  FOCUS_RING_CLASS,
  IMAGE_ACCEPT,
  IMAGE_REJECT_MESSAGE,
  IMAGE_UPLOAD_CONCURRENCY,
  MAX_IMAGE_COUNT,
} from "../constants";
import {
  cancelUploads,
  orderCompleted,
  rejectImageFile,
  remainingImageSlots,
  requeueForRetry,
  uploadFailure,
} from "../derive";
import type { UploadSlot, UploadState } from "../types";

/** 격자 아래 거절 목록 한 줄. `name`이 없으면 "N장은 칸이 없어 빠졌어요" 같은 묶음 문구다 */
interface RejectedLine {
  key: string;
  name: string | null;
  message: string;
}

/**
 * 게시글 이미지 9칸. 첫 번째가 대표다.
 *
 * 대표를 큰 슬롯으로 따로 띄우지 않고 **같은 크기로 나열한 뒤 배지로만 구분한다** —
 * 상세 화면(ProductDetailPanel)이 이미 이 그림이라, 등록과 조회가 같은 배치로 보인다.
 * 순서가 곧 대표 지정이라는 규칙도 한 줄에 늘어놔야 눈에 들어온다.
 *
 * 순서 변경은 dnd-kit이 맡는다. 직접 만들지 않은 이유는 **키보드**다 —
 * 마우스만이면 draggable 속성으로 끝나지만, 88px 슬롯 안에 대표 배지 말고
 * 이동 버튼까지 얹을 자리가 없어서 키보드 경로를 따로 낼 수가 없었다.
 * dnd-kit의 KeyboardSensor는 같은 조작을 Space(집기) → 화살표 → Space(놓기)로
 * 그대로 복제해준다. 스크린리더 안내 문구도 기본으로 붙는다.
 *
 * **업로드(#250)는 이 격자가 통째로 맡는다.** 등록 슬롯(`images[]`, 폼 값) 뒤에
 * 대기·진행·보류·실패 슬롯(`slots`, 격자만 아는 상태)이 선택 순서로 붙는다. 서버가 준
 * URL은 `orderCompleted`로 **앞쪽 연속 구간만** `onAdd`로 올라가고 그 칸은 사라진다 —
 * B가 A보다 먼저 끝나도 `대표`는 A다(S2-12). 등록 전 슬롯은 드래그 대상이 아니다.
 *
 * 세 신호(진행·성공·실패)가 전부 칸 안에 있어야 한다 — 눌러도 아무 일이 없는 슬롯은
 * "고장"으로 읽혔다(wire-product F3). 실패 칸의 복구 행동은 종류별로 다르다(DD2): 서버·망
 * 문제면 `다시 시도`, 파일 문제면 `×`뿐이다.
 *
 * 수명주기(#252). 격자가 사라지면(`함께 게시` 해제, 화면 이탈) 진행 중 요청을 abort하고
 * 남은 칸의 미리보기를 전부 놓는다(`cancelUploads`). 의도한 취소는 실패 칸을 만들지 않는다 —
 * `apiFetch`가 abort도 `NETWORK`로 바꿔 던지므로 에러 종류가 아니라 `cancelledRef`와
 * "그 칸이 아직 있나"로 가른다. 응답 헤더 뒤 본문 읽기 중 abort는 다른 에러로 올 수 있어서다.
 * 서버 쪽 업로드는 취소되지 않는다 — 프록시가 upstream에 signal을 넘기지 않아 고아 파일이
 * 남을 수 있다(이슈 #252 제외 범위).
 */
export function PostImageGrid({
  id,
  describedBy,
  images,
  onReorder,
  onAdd,
  onRemove,
  onUploadStateChange,
  onAuthFailure,
  addDisabled = false,
  disabled = false,
}: {
  /**
   * 격자의 DOM id. 필수 오류의 첫 오류 포커스(`revealInvalidField`)가 이걸로 찾아
   * 안의 `+`(aria-invalid)로 가고, `+`가 없으면(실패 칸으로 9칸이 찼을 때, F3) 격자 자신이
   * 받는다 — 그래서 격자에 `tabIndex={-1}`이 있다(S3-7)
   */
  id?: string;
  /** `+` 슬롯이 가리킬 오류 문구의 id. 오류가 있을 때만 — 없을 땐 `aria-describedby`도 없다(S2-1) */
  describedBy?: string;
  /** 이미지 URL. 인덱스가 곧 순서 */
  images: string[];
  /**
   * from 번째를 to 번째 자리로 옮겨달라는 요청. 배열을 직접 고치지 않고
   * 위(PostFormPanel)로 올린다 — 순서는 폼 값이지 이 컴포넌트의 상태가 아니다.
   * 이 경계를 지켜두면 나중에 dnd-kit을 걷어내도 위층은 그대로 간다.
   */
  onReorder: (from: number, to: number) => void;
  /**
   * 업로드가 끝난 URL을 **선택 순서대로** 끝에 붙여 달라는 요청. 같은 이유로 위층이 배열을 만든다.
   *
   * 응답 콜백에서 불린다 — 위층은 **갱신 함수**로 적용해야 한다(`setPost(prev => …)`).
   * 호출 시점의 `images`를 닫은 값으로 만들면 응답 둘이 React가 다시 그리기 전에 연달아 올 때
   * 둘째가 첫째를 덮어쓴다(5장 올리면 2장만 남았다, #250). 전엔 `flushSync`로 막았다.
   */
  onAdd: (urls: string[]) => void;
  /** index 번째 등록 슬롯을 빼 달라는 요청(S3-1). 되묻지 않는다 — 저장 전엔 서버에 안 실린다 */
  onRemove: (index: number) => void;
  /**
   * 대기·진행 칸이 있는지, 실패 칸이 몇인지. 저장 버튼 잠금과 그 옆 문구는 화면(View)이
   * 그리므로 올려 보낸다. 언마운트 때는 "없음"으로 한 번 더 — 격자가 사라졌는데 잠금이
   * 남으면 저장할 길이 없다.
   */
  onUploadStateChange?: (state: UploadState) => void;
  /**
   * 업로드가 401/403을 받았다(S4-3). 격자는 큐를 멈추고 칸을 정리한 **뒤에** 부른다.
   * 문구와 저장 잠금은 화면(View)이 정한다 — 401과 403의 처리가 다르다.
   */
  onAuthFailure?: (error: unknown) => void;
  /**
   * `+`만 잠근다(S4-7, 세션이 끊긴 뒤). 올려도 401이라서다. 등록 칸 순서 바꾸기·빼기는
   * 그대로 — 저장 전엔 서버에 안 실리는 일이다. `disabled`(시즌 종료)는 격자 전체를 잠근다.
   */
  addDisabled?: boolean;
  disabled?: boolean;
}) {
  const shown = images.slice(0, MAX_IMAGE_COUNT);
  /*
   * 슬롯의 원본은 `slotsRef`, `slots`는 그리기용 거울이다. 큐가 바뀌는 지점이 셋(파일 선택·
   * 응답 도착·재시도/빼기)인데 전부 이벤트 핸들러나 응답 콜백이라, effect 없이 그 자리에서
   * `process()`를 돌린다 — effect 안에서 setState 로 큐를 굴리면 렌더가 꼬리를 문다
   * (react-hooks/set-state-in-effect). 단일 스레드라 ref 를 읽고 쓰는 사이에 끼어드는 건 없다.
   */
  const slotsRef = useRef<UploadSlot[]>([]);
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [rejected, setRejected] = useState<RejectedLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadListingImageMutation();

  /* 언마운트 뒤 도착한 응답이 사라진 격자의 상태를 치지 않게. 진행 중 요청은 cleanup이 abort한다 */
  const cancelledRef = useRef(false);
  /*
   * 401/403으로 큐가 멈췄다(§4-3-3). 멈춘 동안엔 어떤 길로도 새 요청을 띄우지 않는다 —
   * 같은 세션으로 보내면 같은 답이다. 로직은 ref를, `다시 시도` 잠금은 거울 state를 본다.
   * 새로 고른 파일(403일 때만 `+`가 열려 있다)은 사장이 다시 해 보겠다는 뜻이라 정지를 푼다.
   */
  const authStoppedRef = useRef(false);
  const [authStopped, setAuthStopped] = useState(false);
  /* 진행 칸마다 하나. 끝나면 지운다 — 남아 있는 것이 곧 "지금 나가 있는 요청"이다 */
  const controllersRef = useRef(new Map<string, AbortController>());
  /*
   * 부모 콜백은 응답 콜백에서도 **최신 것**을 불러야 한다 — 요청을 띄운 렌더의 `onAdd`는
   * 그때의 `images`를 닫고 있어서 그걸 부르면 그 사이 올라간 장이 사라진다.
   */
  const onAddRef = useRef(onAdd);
  const onUploadStateChangeRef = useRef(onUploadStateChange);
  const onAuthFailureRef = useRef(onAuthFailure);
  useEffect(() => {
    onAddRef.current = onAdd;
    onUploadStateChangeRef.current = onUploadStateChange;
    onAuthFailureRef.current = onAuthFailure;
  });
  /* 같은 요약을 두 번 올리지 않는다 — 부모가 렌더마다 setState 를 받을 이유가 없다 */
  const reportedRef = useRef<UploadState>({ uploading: false, failedCount: 0 });

  useEffect(() => {
    cancelledRef.current = false;
    const controllers = controllersRef.current;
    return () => {
      cancelledRef.current = true;
      // 플래그를 먼저 세운다 — abort가 부르는 catch가 이걸 보고 아무것도 안 한다
      const plan = cancelUploads(slotsRef.current);
      for (const slotId of plan.abort) controllers.get(slotId)?.abort();
      controllers.clear();
      for (const url of plan.revoke) URL.revokeObjectURL(url);
      slotsRef.current = [];
      // 격자가 사라졌는데 잠금이 남으면 저장할 길이 없다(등록 화면의 `함께 게시` 해제)
      onUploadStateChangeRef.current?.({ uploading: false, failedCount: 0 });
    };
  }, []);

  const pending = slots.filter((s) => s.status !== "failed").length;
  const remaining = remainingImageSlots({
    registered: shown.length,
    pending,
    failed: slots.length - pending,
  });

  /** 원본을 바꾸고 거울과 부모 요약을 맞춘다. 큐가 바뀌는 모든 길이 여기를 지난다 */
  function commit(next: UploadSlot[]) {
    slotsRef.current = next;
    setSlots(next);
    const state: UploadState = {
      uploading: next.some(
        (s) => s.status === "queued" || s.status === "uploading",
      ),
      failedCount: next.filter((s) => s.status === "failed").length,
    };
    const last = reportedRef.current;
    if (
      state.uploading === last.uploading &&
      state.failedCount === last.failedCount
    )
      return;
    reportedRef.current = state;
    onUploadStateChangeRef.current?.(state);
  }

  /**
   * 큐 한 바퀴. 두 단계다.
   * 1) 앞쪽부터 끝난 칸을 `images[]`로 넘긴다(선택 순서, 실패는 건너뜀 — `orderCompleted`).
   * 2) 진행 중이 동시 수보다 적으면 대기 칸을 앞에서부터 띄운다.
   */
  function process() {
    let current = slotsRef.current;

    const ready = orderCompleted(current);
    if (ready.length > 0) {
      // 위층이 갱신 함수로 받으므로(`onAdd` 주석) 연달아 와도 앞 장을 덮지 않는다
      const urls = ready.flatMap((s) => (s.url === null ? [] : [s.url]));
      onAddRef.current(urls);
      // 등록 칸은 서버 URL을 그리므로 격자가 만든 미리보기는 여기서 놓는다
      for (const s of ready) URL.revokeObjectURL(s.previewUrl);
      current = current.filter(
        (s) => !ready.some((r) => r.slotId === s.slotId),
      );
    }

    const running = current.filter((s) => s.status === "uploading").length;
    const next = current
      .filter((s) => s.status === "queued" && !authStoppedRef.current)
      .slice(0, Math.max(0, IMAGE_UPLOAD_CONCURRENCY - running));
    commit(
      current.map((s) =>
        next.some((n) => n.slotId === s.slotId)
          ? { ...s, status: "uploading" }
          : s,
      ),
    );
    for (const s of next) void startUpload(s);
  }

  /** 요청 하나. 끝나면 그 칸만 바꾼다 — 다른 칸은 그 사이 몇 번이고 바뀌었을 수 있다 */
  async function startUpload(slot: UploadSlot) {
    const controller = new AbortController();
    controllersRef.current.set(slot.slotId, controller);
    let settled: Pick<UploadSlot, "status" | "url" | "failure">;
    let authError: unknown = null;
    try {
      const { url } = await upload.mutateAsync({
        file: slot.file,
        idempotencyKey: slot.idempotencyKey,
        signal: controller.signal,
      });
      settled = { status: "done", url, failure: null };
    } catch (error) {
      const failure = uploadFailure(
        isApiError(error) ? error.code : TRANSPORT_ERROR_CODE.NETWORK,
      );
      // 파일 탓이 아니라 실패 칸을 만들지 않는다. 아래 늦은 응답 검사를 지난 뒤 큐를 멈춘다
      settled = { status: "failed", url: null, failure };
      authError = failure.kind === "auth" ? error : null;
    } finally {
      controllersRef.current.delete(slot.slotId);
    }
    // 늦은 응답: 격자가 사라졌거나 그 칸을 이미 거뒀다. 실패 칸도, 등록 칸도 만들지 않는다
    if (
      cancelledRef.current ||
      !slotsRef.current.some((s) => s.slotId === slot.slotId)
    )
      return;
    if (authError !== null) {
      stopForAuth(authError);
      return;
    }
    slotsRef.current = slotsRef.current.map((s) =>
      s.slotId === slot.slotId ? { ...s, ...settled } : s,
    );
    process();
  }

  /**
   * 401/403(S4-3). 같은 세션으로 보내는 나머지도 같은 답을 받으니 큐를 멈춘다 —
   * 대기·진행 칸은 조용히 거두고(진행은 abort) 미리보기를 놓는다. 실패 칸은 아니다.
   *
   * 끝났지만 앞 칸을 기다리던 보류 칸은 **등록 칸으로 올려 남긴다**(§4-3-4). 서버엔 이미
   * 올라간 사진이고, 앞의 진행 칸을 거두면 `process()`의 `orderCompleted`가 자연히 넘긴다.
   * 이미 있던 실패 칸도 그대로 둔다 — 사장이 본 칸을 말없이 지우지 않는다. 다만 그 칸의
   * `다시 시도`는 멈춘 동안 잠긴다(빼기는 된다). 재시도가 큐를 다시 돌리면 정지가 아니다.
   * 그다음 화면(View)에 알린다. 401이면 화면이 저장과 `+`를 잠근다.
   */
  function stopForAuth(error: unknown) {
    authStoppedRef.current = true;
    setAuthStopped(true);
    const removed = slotsRef.current.filter(
      (s) => s.status === "queued" || s.status === "uploading",
    );
    const plan = cancelUploads(removed);
    // 칸을 먼저 뺀다 — abort가 부르는 catch는 칸이 없으니 아무것도 안 한다
    slotsRef.current = slotsRef.current.filter((s) => !removed.includes(s));
    for (const slotId of plan.abort)
      controllersRef.current.get(slotId)?.abort();
    for (const url of plan.revoke) URL.revokeObjectURL(url);
    process();
    onAuthFailureRef.current?.(error);
  }

  /**
   * 파일 선택 뒤. 순서가 중요하다(§4-2): ① 거절 판정 ② 통과분만 남은 칸과 비교 ③ 받은
   * 파일은 그 자리에서 칸 예약. 거절은 칸을 만들지 않고 아래 목록에 — 칸을 만들면 "왜 안
   * 올라가지"가 되고, 목록이면 "이 파일은 이래서 안 됐다"가 된다. 같은 파일 재선택은 막지
   * 않는다(§9-6) — 새 업로드다.
   */
  function handleFiles(list: FileList | null) {
    const files = list === null ? [] : Array.from(list);
    if (files.length === 0) return;

    const lines: RejectedLine[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const reason = rejectImageFile(file);
      if (reason === null) accepted.push(file);
      else
        lines.push({
          key: crypto.randomUUID(),
          name: file.name,
          message: IMAGE_REJECT_MESSAGE[reason],
        });
    }

    const taken = accepted.slice(0, remaining);
    if (taken.length < accepted.length)
      lines.push({
        key: crypto.randomUUID(),
        name: null,
        message: `${accepted.length - taken.length}장은 칸이 없어 빠졌어요`,
      });
    setRejected(lines);

    if (taken.length === 0) return;
    authStoppedRef.current = false;
    setAuthStopped(false);
    slotsRef.current = [
      ...slotsRef.current,
      ...taken.map((file): UploadSlot => ({
        slotId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        idempotencyKey: crypto.randomUUID(),
        url: null,
        failure: null,
      })),
    ];
    process();
  }

  /**
   * 같은 파일, 같은 멱등키. 대기로 돌려놓으면 큐가 동시 수 안에서 다시 띄운다.
   * 칸은 **큐 끝으로 옮긴다**(`requeueForRetry`, §4-4) — 원래 자리에 두면 실패로
   * 건너뛰었던 뒤쪽 완료분이 다시 보류된다(F1). 그래서 재시도 뒤 칸 번호가 바뀐다.
   */
  function retry(slotId: string) {
    if (authStoppedRef.current) return;
    slotsRef.current = requeueForRetry(slotsRef.current, slotId);
    process();
  }

  /** 실패 칸 빼기. 되묻지 않는다 — 서버엔 아무것도 없다 */
  function remove(slotId: string) {
    const target = slotsRef.current.find((s) => s.slotId === slotId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    slotsRef.current = slotsRef.current.filter((s) => s.slotId !== slotId);
    process();
  }

  const sensors = useSensors(
    // 8px은 끌기와 클릭을 가르는 문턱이다. 없으면 삭제 버튼을 누르려던 손떨림이
    // 드래그로 잡혀서 클릭이 먹지 않는다.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // 슬롯 밖에 놓았거나 제자리에 놓았으면 아무 일도 없다
    if (!over || active.id === over.id) return;

    // id 는 UniqueIdentifier(string | number)로 넘어온다. 여기 담긴 값은
    // 이미지 문자열이지만 타입은 number 도 허용하므로 String 으로 맞춘다.
    const from = shown.indexOf(String(active.id));
    const to = shown.indexOf(String(over.id));

    // 드래그 도중 목록이 바뀌어 id 가 사라진 경우. 실제로 잘 나지 않지만,
    // -1 을 그대로 넘기면 배열 끝에 조용히 끼워넣어져서 원인 찾기가 어렵다.
    if (from === -1 || to === -1) return;

    onReorder(from, to);
  }

  return (
    <div className="space-y-1.5">
      <DndContext
        /*
         * id 를 고정하지 않으면 하이드레이션이 깨진다. dnd-kit 은 스크린리더
         * 안내문의 aria-describedby 를 useUniqueId 로 만드는데, 그게 React 의
         * useId 가 아니라 **모듈 전역 카운터**다. 서버 프로세스는 요청을 처리할수록
         * 번호가 계속 올라가 있고 클라이언트는 0부터 새로 세기 때문에,
         * 서버가 그린 DndDescribedBy-5 와 클라이언트의 -2 가 어긋난다.
         * 값을 넘기면 카운터를 건너뛰고 그대로 쓴다.
         */
        id="post-image-grid"
        sensors={sensors}
        // 슬롯이 격자로 감싸여 있어서 "가장 가까운 중심"이 가장 자연스럽다.
        // 기본값인 rectIntersection 은 겹친 넓이를 보기 때문에, 크기가 같은
        // 칸들이 촘촘히 붙어 있으면 어디에 놓일지 예측이 잘 안 된다.
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {/* 정렬 대상은 등록 슬롯(`shown`)뿐이다. 뒤에 붙는 업로드 슬롯은 items 에 없다 */}
        <SortableContext items={shown} strategy={rectSortingStrategy}>
          <SlotGrid
            id={id}
            /*
             * p-1 = 포커스 링이 칸 밖으로 나가는 4px(offset 2 + 두께 2). 이게 없으면 첫 열 링의
             * 왼쪽 변이 Panel.Body 스크롤 박스(overflow-y-auto 라 x 도 잘린다)에 잘린다(side-01 F2)
             */
            className="p-1"
            /* 프로그램 포커스만 받는다(F3). Tab 순서엔 안 들어간다 — 칸들이 각자 받는다 */
            tabIndex={-1}
            role="group"
            aria-label="게시글 이미지"
            aria-describedby={describedBy}
            data-ac="S2-8"
            aria-disabled={disabled || undefined}
          >
            {shown.map((img, i) => (
              <SortableImageSlot
                key={img}
                id={img}
                index={i + 1}
                isCover={i === 0}
                disabled={disabled}
                onRemove={() => onRemove(i)}
              >
                <ListingImage src={img} alt={`이미지 ${i + 1}`} />
              </SortableImageSlot>
            ))}
            {slots.map((slot, i) => (
              <UploadSlotCell
                key={slot.slotId}
                slot={slot}
                index={shown.length + i + 1}
                disabled={disabled}
                retryDisabled={authStopped}
                onRetry={() => retry(slot.slotId)}
                onRemove={() => remove(slot.slotId)}
              />
            ))}
            {remaining > 0 ? (
              <AddSlot
                disabled={disabled || addDisabled}
                aria-label={`이미지 추가, ${remaining}장 더 올릴 수 있어요`}
                aria-describedby={describedBy}
                aria-invalid={describedBy !== undefined || undefined}
                data-ac={
                  disabled
                    ? "S2-1 S2-8 S2-10"
                    : addDisabled
                      ? "S2-1 S2-8 S4-7"
                      : "S2-1 S2-8"
                }
                onClick={() => inputRef.current?.click()}
                /* `+`는 muted-foreground(4.9:1) — AddSlot 기본 border-strong 은 2.5:1 로 AA 미달(DD9) */
                className={cn(
                  "text-muted-foreground content-center text-xl leading-6 disabled:opacity-50",
                  FOCUS_RING_CLASS,
                )}
              >
                +<span className="text-xs leading-4">{remaining}장 더</span>
              </AddSlot>
            ) : null}
          </SlotGrid>
        </SortableContext>
      </DndContext>

      {/*
       * 진짜 파일 입력은 숨긴다 — 보이는 건 `+` 슬롯이다. 처리 뒤 `value`를 비워
       * 같은 파일을 다시 골라도 change 가 난다(S2-13). 라벨은 `+`가 맡으므로 낭독기에서 뺀다.
       */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        disabled={disabled || addDisabled}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {rejected.length > 0 ? (
        <ul
          role="alert"
          data-ac="S2-7 S2-8"
          className="text-destructive-strong grid gap-0.5 text-body"
        >
          {rejected.map((line) => (
            <li key={line.key} className="flex items-start gap-1">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {line.name !== null ? (
                  <>
                    <b className="font-medium wrap-anywhere">{line.name}</b>
                    :{" "}
                  </>
                ) : null}
                {line.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 정렬 가능한 슬롯 한 칸.
 *
 * 바깥 div 는 자리(ref·transform)만 받고, 안에 **형제 둘**을 둔다 — 집기 손잡이와 `×`.
 * 예전엔 바깥이 dnd-kit `attributes`(`role=button`)를 받고 `×`를 품었는데, `role=button`의
 * 자식은 낭독기에서 표시용으로 눌려 `×`가 따로 안 읽혔다(#254 F5). `×`가 손잡이 밖이면
 * 키보드 Enter·Space 도 KeyboardSensor 에 안 닿는다(F4 가 구조로 막힌다).
 * 드래그 중엔 바깥이 움직이므로 `×`도 같이 따라간다.
 *
 * 바깥엔 역할도 이름도 없다. 이름("이미지 N, 대표")과 잠김(aria-disabled)은 손잡이만 갖는다 —
 * 바깥에도 같은 이름을 달면 낭독기가 칸마다 두 번 읽는다(side-01 F1).
 *
 * ImageSlot 을 감싸는 이유는 그대로다 — @ondo/ui 의 표시용 프리미티브라 ref 를 받지 않는다.
 */
function SortableImageSlot({
  id,
  index,
  isCover,
  disabled,
  onRemove,
  children,
}: {
  id: string;
  /** 1부터. 낭독기 이름 "이미지 N" */
  index: number;
  isCover: boolean;
  disabled: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const name = isCover ? `이미지 ${index}, 대표` : `이미지 ${index}`;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // isDragging 동안 반투명 + 위로 띄우기 — 밀려나는 칸들과 구분된다
      className={cn("relative", isDragging && "z-10 opacity-50")}
      data-state="registered"
      data-ac={disabled ? "S2-4 S2-10 S3-3" : "S2-4"}
    >
      <div
        /*
         * 손잡이를 activatorNode 로 등록한다. dnd-kit 6.3.1의 KeyboardSensor 는 등록이 없으면
         * event.target 을 안 보고 안에서 올라온 키까지 집는다(F4). 지금은 `×`가 밖이라
         * 안 닿지만, 손잡이 안에 눌리는 것이 다시 들어와도 막히게 둔다.
         */
        ref={setActivatorNodeRef}
        // touch-none: 터치에서 드래그가 페이지 스크롤에 먹히지 않게 한다
        className={cn("rounded-control touch-none", FOCUS_RING_CLASS)}
        aria-label={name}
        {...attributes}
        {...listeners}
      >
        <ImageSlot
          overlay={
            isCover ? (
              <Chip
                tone="accent"
                data-ac="S2-4"
                className="absolute top-2 right-0.5 h-5 px-2 text-xs"
              >
                대표
              </Chip>
            ) : null
          }
        >
          {children}
        </ImageSlot>
      </div>
      {/*
       * DOM 에서 손잡이 뒤라 위에 그려진다(둘 다 positioned, z 없음). 8px 문턱(`PointerSensor`)이
       * 아니어도 이제 `×` 위 pointerdown 은 손잡이 리스너에 안 간다.
       */}
      <IconButton
        variant="line"
        size="sm"
        aria-label={`이미지 ${index} 빼기`}
        data-ac="S3-1"
        className={cn("absolute top-1 left-1 size-6", FOCUS_RING_CLASS)}
        onClick={onRemove}
        disabled={disabled}
      >
        <X />
      </IconButton>
    </div>
  );
}

/**
 * 등록 전 슬롯 한 칸 — 대기 · 진행 · 보류(`held`) · 실패.
 *
 * 문구는 사진 위가 아니라 **하단 띠**에 둔다(DD5) — 사진 위에 글자를 겹치면 밝은 사진에서
 * 읽히지 않는다. 진행·대기 칸은 카드색 베일 60%(DD10)로 가라앉히고 보류 칸은 선명하게 —
 * 끝난 사진이라는 걸 사장이 봐야 "왜 대표가 안 바뀌지"가 안 생긴다.
 * 대기 칸엔 `aria-busy`를 안 단다(DD4) — 바쁜 건 진행 칸이고, e2e 가 "진행 최대 3"을 이걸로 센다.
 */
function UploadSlotCell({
  slot,
  index,
  disabled,
  retryDisabled,
  onRetry,
  onRemove,
}: {
  slot: UploadSlot;
  index: number;
  disabled: boolean;
  /** 401/403으로 큐가 멈춘 동안. `다시 시도`만 잠그고 `×`는 둔다 */
  retryDisabled: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const label = `이미지 ${index}`;

  if (
    slot.status === "failed" &&
    slot.failure &&
    slot.failure.kind !== "auth"
  ) {
    const failure = slot.failure;
    return (
      <ImageSlot
        tabIndex={0}
        data-state="failed"
        data-kind={failure.kind}
        data-ac={failure.kind === "retry" ? "S2-5 S2-14 S2-11" : "S2-14 S2-11"}
        aria-label={`${label}, ${failure.message}`}
        /* destructive 1px 선은 outline 으로 — border 면 88px 상자가 1px 커진다 */
        className={cn(
          "bg-card outline-destructive overflow-hidden outline -outline-offset-1",
          FOCUS_RING_CLASS,
        )}
        overlay={
          <>
            <div
              role="alert"
              /* 다시 고르기형은 보이는 글자가 짧은 꼴이라 전체 문장을 낭독기에 따로 준다(DD3) */
              aria-label={
                failure.kind === "repick" ? failure.message : undefined
              }
              className="text-destructive-strong absolute inset-0 grid content-start justify-items-center gap-0.5 px-1 pt-7 text-center text-xs leading-4"
            >
              <span className="font-medium">{failure.short}</span>
              {failure.kind === "retry" ? (
                <Button
                  variant="link"
                  size="sm"
                  className="text-destructive-strong text-xs underline"
                  aria-label={`${label} 다시 시도`}
                  onClick={onRetry}
                  disabled={disabled || retryDisabled}
                >
                  다시 시도
                </Button>
              ) : (
                <span>다시 골라 주세요</span>
              )}
            </div>
            <IconButton
              variant="line"
              size="sm"
              aria-label={`${label} 빼기`}
              data-ac="S3-1"
              className={cn("absolute top-1 left-1 size-6", FOCUS_RING_CLASS)}
              onClick={onRemove}
              disabled={disabled}
            >
              <X />
            </IconButton>
          </>
        }
      >
        <div aria-hidden className="absolute inset-0 opacity-10">
          <ListingImage src={slot.previewUrl} alt="" />
        </div>
      </ImageSlot>
    );
  }

  // `done`인데 아직 여기 있다 = 앞 칸을 기다리는 보류(S2-12)
  const state = slot.status === "done" ? "held" : slot.status;
  const ariaLabel =
    state === "uploading"
      ? `${label}, 올리는 중`
      : state === "queued"
        ? `${label}, 대기 중`
        : `${label}, 앞 사진을 기다리는 중`;
  const dataAc =
    state === "uploading"
      ? "S2-3 S2-9 S2-11"
      : state === "queued"
        ? "S2-9 S2-11"
        : "S2-12";

  return (
    <ImageSlot
      tabIndex={0}
      data-state={state}
      aria-busy={state === "uploading" || undefined}
      aria-label={ariaLabel}
      data-ac={dataAc}
      className={cn("overflow-hidden", FOCUS_RING_CLASS)}
      overlay={
        <>
          {state !== "held" ? (
            <div aria-hidden className="bg-card/60 absolute inset-0" />
          ) : null}
          <div
            className={cn(
              "bg-card/90 absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-1 py-0.5 text-xs leading-4",
              state === "uploading"
                ? "text-secondary-foreground"
                : "text-muted-foreground",
            )}
          >
            {state === "uploading" ? (
              <>
                <LoaderCircle
                  aria-hidden
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
                올리는 중
              </>
            ) : state === "queued" ? (
              "대기"
            ) : (
              "순서 대기"
            )}
          </div>
        </>
      }
    >
      <ListingImage src={slot.previewUrl} alt={label} />
    </ImageSlot>
  );
}

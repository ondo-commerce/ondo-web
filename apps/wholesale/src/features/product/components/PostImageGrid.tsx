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
import { AddSlot, Chip, ImageSlot, SlotGrid } from "@ondo/ui";

const MAX_IMAGE_COUNT = 9;

/**
 * 게시글 이미지 9칸. 첫 번째가 대표다.
 *
 * 대표를 큰 슬롯으로 따로 띄우지 않고 **같은 크기로 나열한 뒤 배지로만 구분한다** —
 * 상세 화면(ProductDetailPanel)이 이미 이 그림이라, 등록과 조회가 같은 배치로 보인다.
 * 순서가 곧 대표 지정이라는 규칙도 한 줄에 늘어놔야 눈에 들어온다.
 *
 * 순서 변경은 dnd-kit이 맡는다. 직접 만들지 않은 이유는 **키보드**다 —
 * 마우스만이면 draggable 속성으로 끝나지만, 74px 슬롯 안에 대표 배지 말고
 * 이동 버튼까지 얹을 자리가 없어서 키보드 경로를 따로 낼 수가 없었다.
 * dnd-kit의 KeyboardSensor는 같은 조작을 Space(집기) → 화살표 → Space(놓기)로
 * 그대로 복제해준다. 스크린리더 안내 문구도 기본으로 붙는다.
 */
export function PostImageGrid({
  images,
  onReorder,
  disabled = false,
}: {
  images: string[];
  /**
   * from 번째를 to 번째 자리로 옮겨달라는 요청. 배열을 직접 고치지 않고
   * 위(PostFormPanel)로 올린다 — 순서는 폼 값이지 이 컴포넌트의 상태가 아니다.
   * 이 경계를 지켜두면 나중에 dnd-kit을 걷어내도 위층은 그대로 간다.
   */
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
}) {
  const shown = images.slice(0, MAX_IMAGE_COUNT);

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
    <div className="space-y-2">
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
        <SortableContext items={shown} strategy={rectSortingStrategy}>
          <SlotGrid>
            {shown.map((img, i) => (
              <SortableImageSlot
                key={img}
                id={img}
                isCover={i === 0}
                disabled={disabled}
              >
                {img}
              </SortableImageSlot>
            ))}
            {shown.length < MAX_IMAGE_COUNT ? (
              <AddSlot disabled={disabled} />
            ) : null}
          </SlotGrid>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/**
 * 정렬 가능한 슬롯 한 칸.
 *
 * ImageSlot 을 감싸는 div 를 따로 두는 이유: dnd-kit 은 ref·transform·리스너를
 * 한 엘리먼트에 몰아 걸어야 하는데, ImageSlot 은 @ondo/ui 의 표시용 프리미티브라
 * ref 를 받지 않는다. 드래그 배선을 바깥 껍데기가 받고 ImageSlot 은 지금 모습
 * 그대로 두면, 상세 화면과 등록 화면이 계속 같은 컴포넌트를 쓴다.
 */
function SortableImageSlot({
  id,
  isCover,
  disabled,
  children,
}: {
  id: string;
  isCover: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // touch-none: 터치에서 드래그가 페이지 스크롤에 먹히지 않게 한다
      // isDragging 동안 반투명 + 위로 띄우기 — 밀려나는 칸들과 구분된다
      className={`touch-none ${isDragging ? "z-10 opacity-50" : ""}`}
      {...attributes}
      {...listeners}
    >
      <ImageSlot
        overlay={
          isCover ? (
            <Chip
              tone="accent"
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
  );
}

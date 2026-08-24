/**
 * 수령 방식 2종. **택배는 없다** — 배송은 사입삼촌 영역이라 도매처가 관리하는
 * 단계가 아니다(glossary §4.3 G7 · §4.4). 값이 늘어날 자리가 아니라서 유니온으로 둔다.
 */
export type PickupMethod = "SELF_PICKUP" | "AGENT_VISIT";

/**
 * 출고 탭의 3단계. **라우트가 아니라 한 화면의 상태다** — 좌측 셸(제목·검색줄·칩 줄·
 * 소매처 아코디언)이 세 단계에서 픽셀 단위로 같고, 표의 열과 우측 패널만 바뀐다.
 * 그래서 `/shipments/packed` 같은 하위 라우트를 만들지 않는다.
 */
export type ShipmentStage = "ready" | "packed" | "shipped";

/**
 * 포장 묶음의 상태. `settlement_data_model.md` §2.7 그대로 2종뿐이다 —
 * 포장 취소·출고 취소가 없어서 되돌아가는 전이가 존재하지 않는다.
 */
export type PackageStatus = "PACKED" | "SHIPPED";

/** 소매처(거래처). 관리 화면이 아직 없어서 이 탭에서는 읽기만 한다(screen_spec §9.5) */
export interface Retailer {
  id: string;
  /** 소매처명. 아코디언 접힘 행의 진한 글자 */
  name: string;
  /** 소매처코드 `RT-007`. 아코디언 행의 회색 글자이자 장끼 `거래처` 값의 괄호 안 */
  code: string;
  /** 장끼 `배송지`. 주소 관리 화면이 없어 더미에 박아 둔다 */
  address: string;
}

/**
 * 포장 대기 한 줄 = `packing_item`(§2.7). 주문 확정·배분 확정이 만들어 낸 이행 단위다.
 *
 * 상품명·색상·사이즈를 SKU 테이블에서 join하지 않고 그대로 들고 있는다 —
 * 서버가 목록 API에서 이 모양으로 내려준다고 보고 화면을 짠다.
 */
export interface PackingItem {
  id: string;
  retailerId: string;
  /** `SKU-001` */
  skuCode: string;
  productName: string;
  /** SKU = 색상 × 사이즈(glossary §3). 장끼 `옵션` 열이 이 둘을 합쳐 쓴다 */
  color: string;
  size: string;
  pickupMethod: PickupMethod;
  /**
   * 주문 일시 `YYYY-MM-DDTHH:mm`. **Date로 들고 있지 않는다** —
   * 목록 정렬은 이 문자열의 사전순이면 충분하고, Date로 만들면 서버(UTC)와
   * 브라우저(KST)의 렌더 결과가 갈려 하이드레이션이 깨진다.
   */
  orderedAt: string;
  /** `ORD-1001`. 표에서 주문 탭으로 나가는 링크의 글자 */
  orderCode: string;
  qty: number;
}

/**
 * 포장 묶음 = `package`(§2.7). 묶는 단위는 주문이 아니라 **소매처 × 선택 품목**이다.
 * 한 주문이 여러 포장으로 쪼개지고, 여러 주문이 한 포장으로 합쳐진다.
 */
export interface Package {
  /** `PKG-001`. 포장 시각 순서대로 발번한다 — 목록의 유일한 식별자라 id를 따로 두지 않는다 */
  packageNo: string;
  retailerId: string;
  /**
   * 이 묶음의 수령 방식. **단일 값이라 수령 방식이 섞인 품목을 한 묶음에 담을 수 없다**(판정 D7).
   * 화면에서 섞인 선택을 막는 근거가 이 필드다.
   */
  pickupMethod: PickupMethod;
  status: PackageStatus;
  /** 포장 일시 `YYYY-MM-DDTHH:mm` */
  packedAt: string;
  /** 출고 일시. `PACKED` 동안은 null이다 */
  shippedAt: string | null;
  /** 담긴 품목. 포장 시점의 스냅샷이라 대기 목록에서 빠진 뒤에도 여기 남는다 */
  lines: PackingItem[];
}

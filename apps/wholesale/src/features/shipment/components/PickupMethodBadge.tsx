import { Badge } from "@ondo/ui";
import { PICKUP_METHOD_LABEL } from "../constants";
import type { PickupMethod } from "../types";

/**
 * 수령 방식 배지. **파랑·회색 2색 안에서 끝낸다**(§8.0) —
 * 직접 수령은 도매처가 직접 넘기는 진행 중인 일이라 파랑, 사입삼촌은 위탁이라 회색이다.
 * 값이 2종뿐이라 이 둘로 충분하고, 늘어나도 색을 늘리지 않는다.
 */
export function PickupMethodBadge({ method }: { method: PickupMethod }) {
  return (
    <Badge tone={method === "SELF_PICKUP" ? "active" : "done"}>
      {PICKUP_METHOD_LABEL[method]}
    </Badge>
  );
}

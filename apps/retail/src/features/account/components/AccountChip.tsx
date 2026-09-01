"use client";

import { AccountMenu } from "@/shared/components/AccountMenu";
import { storeInitial } from "../derive";
import { useStoreName } from "../store";

/**
 * 헤더 오른쪽 계정 칩 — 상호명을 **설정 화면과 같은 보관소에서** 읽는다.
 *
 * 셸(`shared/`)이 상호를 더미로 따로 들고 있던 자리다. 그러면 설정에서 이름을
 * 고쳐 저장한 순간 헤더는 옛 이름, 본문은 새 이름이 되어 **같은 세션에서 두
 * 이름이 보인다**(`retail-market` F5와 같은 결함).
 *
 * `shared/components/`가 아니라 이 feature 안에 있다. 상호명이 무엇인지 아는 것은
 * 계정 도메인이고 셸은 그것을 모른 채 자리만 비워 둔다 —
 * `app/(shop)/layout.tsx`가 이 컴포넌트를 헤더에 끼워 넣는다(`CartButton`과 같은
 * 방식). 그래야 import가 `app → features → shared` 한 방향으로 남는다.
 *
 * 이니셜을 여기서 한 번에 뽑아 같이 넘긴다 — 메뉴가 따로 계산하면 이름과
 * 이니셜이 서로 다른 값을 보게 된다.
 */
export function AccountChip() {
  const storeName = useStoreName();

  return (
    <AccountMenu storeName={storeName} initial={storeInitial(storeName)} />
  );
}

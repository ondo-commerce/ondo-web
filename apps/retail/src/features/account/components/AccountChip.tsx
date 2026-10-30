"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { clearHeaderSession } from "@/shared/api/headerCounts";
import { AccountMenu } from "@/shared/components/AccountMenu";
import { useLogoutMutation } from "../api/session";
import { ACCOUNT_PATH } from "../constants";
import { storeInitial } from "../derive";

/**
 * 헤더 오른쪽 계정 칩. 상호명은 **서버가 `/me`로 읽어 내려준 값**이다 —
 * `app/(shop)/layout.tsx`가 세션을 확인하면서 같이 받아 여기로 넘긴다. 그래서
 * 첫 HTML부터 상호가 있고, 클라이언트 보관소를 기다리지 않는다.
 *
 * `shared/components/`가 아니라 이 feature 안에 있다. 로그아웃이 무엇인지 아는
 * 것은 계정 도메인이고 셸은 그것을 모른 채 자리만 비워 둔다 —
 * `app/(shop)/layout.tsx`가 이 컴포넌트를 헤더에 끼워 넣는다(`CartButton`과 같은
 * 방식). 그래야 import가 `app → features → shared` 한 방향으로 남는다.
 *
 * 설정 화면과 주문 상세 수령 상호도 같은 `/me.shopName`을 `storeNameLabel`로
 * 세운다 — 세 자리가 같은 이름을 말한다.
 *
 * 이니셜을 여기서 한 번에 뽑아 같이 넘긴다 — 메뉴가 따로 계산하면 이름과
 * 이니셜이 서로 다른 값을 보게 된다.
 */
export function AccountChip({ storeName }: { storeName: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logoutMutation = useLogoutMutation();

  const logout = () => {
    /* 헤더 count와 알림 캐시를 먼저 버린다(06b §4-1 3 ①). 클라이언트 이동이라 QueryClient가 살아서, 안 지우면
       다음에 로그인한 계정이 앞 계정의 배지와 알림 행을 잠깐 본다 */
    void clearHeaderSession(queryClient);
    /* 서버 세션을 먼저 끊고 나서 옮긴다. 실패해도 옮긴다 — 쿠키가 남아도 이
       브라우저에서 할 수 있는 일이 없고, 로그아웃을 누른 사람을 네트워크 사정
       때문에 붙잡아 두면 안 된다. `refresh`로 서버 컴포넌트가 끊긴 세션을 다시
       보게 한다 — 안 하면 뒤로 가기가 라우터 캐시의 로그인 화면을 되돌려 준다 */
    void logoutMutation
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => {
        router.replace(ACCOUNT_PATH.login);
        router.refresh();
      });
  };

  return (
    <AccountMenu
      storeName={storeName}
      initial={storeInitial(storeName)}
      onLogout={logout}
    />
  );
}

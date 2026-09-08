"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ondo/api";
import { settlementKeys } from "./keys";
import { SETTLEMENT_PATH } from "./queries";
import { isStaleRejection } from "../derive";
import type {
  BankAccount,
  BankAccountCreateRequest,
  BankAccountUpdateRequest,
  PaymentCreated,
  PaymentCreateRequest,
} from "../types";

/**
 * 쓰기는 전부 여기. 성공하면 `keys.ts`의 팩토리로 무효화한다 — 거래처 행의 미수·정산 상태 표·
 * 배분 표·원장이 같은 돈을 보고 있어서, 한쪽만 갱신하면 행은 0원인데 표는 미결제가 된다.
 *
 * **409·404로 거절됐을 때도 같은 무효화를 한다.** 화면이 든 값이 서버와 어긋난 것이라
 * 다시 불러오지 않으면 같은 버튼을 눌러 같은 거절을 본다(wire-order F3 · wire-backorder F1).
 *
 * `onSuccess`는 **재조회가 끝난 뒤** `onDone`을 부른다. 재조회가 실패해도 여기서 던지지 않는다 —
 * 던지면 입금이 거절된 것처럼 보여 사장이 한 번 더 누른다(입금은 되돌릴 수 없다). 대신 `refreshed=false`를
 * 넘겨 화면이 "됐지만 숫자가 옛것"이라고 말하고 다음 입금을 잠근다(wire-inventory F2).
 */

type QueryClient = ReturnType<typeof useQueryClient>;

/**
 * 무효화 + 재조회 결과. `throwOnError`로 재조회 실패를 받아 boolean으로 바꾼다 —
 * 기본값이면 실패가 조용히 삼켜져 화면이 옛 숫자를 새 숫자인 줄 안다.
 */
function refetch(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<boolean> {
  return Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }, { throwOnError: true }),
    ),
  ).then(
    () => true,
    () => false,
  );
}

/** 입금 뒤 낡는 것 — 소매처 미수(행), 그 소매처의 주문 미수·정산 상태(표·배분 표), 원장 */
function refetchAfterPayment(queryClient: QueryClient, retailerId: number) {
  return refetch(queryClient, [
    settlementKeys.retailers(),
    settlementKeys.orders(retailerId),
    settlementKeys.ledgers(retailerId),
  ]);
}

/**
 * `onDone`은 **훅 옵션**으로 받는다. `mutate(vars, { onSuccess })`로 넘기면 안 된다 —
 * 무효화로 폼이 다시 그려질 때 TanStack v5는 언마운트된 컴포넌트의 호출별 콜백을 건너뛴다.
 */
export interface PaymentDone {
  onDone?: (created: PaymentCreated, refreshed: boolean) => void;
}

export interface PaymentVariables {
  body: PaymentCreateRequest;
  /** 폼이 든 키. 같은 입력의 재전송은 같은 키, 입력을 고치면 새 키(`DepositDraft.idempotencyKey`) */
  idempotencyKey: string;
}

/** 입금 등록(배분 겸함). `입금만 진행`·`입금 및 정산`이 같은 엔드포인트다(스펙) */
export function useCreatePaymentMutation({ onDone }: PaymentDone = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: PaymentVariables) =>
      apiFetch<PaymentCreated>(SETTLEMENT_PATH.payments, {
        method: "POST",
        body,
        idempotencyKey,
      }),
    // 반환한 promise를 TanStack이 기다린다 — `isPending`은 재조회가 **끝난 뒤**에 풀린다
    onSuccess: async (created, { body }) => {
      const refreshed = await refetchAfterPayment(queryClient, body.retailerId);
      onDone?.(created, refreshed);
    },
    onError: (error, { body }) =>
      isStaleRejection(error)
        ? refetchAfterPayment(queryClient, body.retailerId)
        : undefined,
  });
}

/**
 * 재조회가 실패했을 때 `다시 불러오기`가 부른다 — 이 탭 키 전부. 활성 관찰자만 다시 부른다.
 */
export function useSettlementRefresh() {
  const queryClient = useQueryClient();
  return () => refetch(queryClient, [settlementKeys.all]);
}

/* ------------------------------------------------------------------------
 * 계좌 — 셋 다 목록을 통째로 다시 받는다. 스펙: 주계좌 승격·강등이 "응답에는 새 계좌만 담기므로
 * 목록을 재조회한다", 삭제도 "가장 먼저 등록된 계좌가 조용히 승격되므로 목록을 재조회한다".
 * ------------------------------------------------------------------------ */

export interface BankAccountDone {
  onDone?: (refreshed: boolean) => void;
}

function refetchBankAccounts(queryClient: QueryClient) {
  return refetch(queryClient, [settlementKeys.bankAccounts()]);
}

export function useCreateBankAccountMutation({ onDone }: BankAccountDone = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BankAccountCreateRequest) =>
      apiFetch<BankAccount>(SETTLEMENT_PATH.bankAccounts, {
        method: "POST",
        body,
      }),
    onSuccess: async () => onDone?.(await refetchBankAccounts(queryClient)),
  });
}

export function useUpdateBankAccountMutation(
  bankAccountId: number,
  { onDone }: BankAccountDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BankAccountUpdateRequest) =>
      apiFetch<BankAccount>(SETTLEMENT_PATH.bankAccount(bankAccountId), {
        method: "PATCH",
        body,
      }),
    onSuccess: async () => onDone?.(await refetchBankAccounts(queryClient)),
    // 404(이미 삭제)면 목록이 낡은 것 — 다시 받아 폼이 사라지게 한다
    onError: (error) =>
      isStaleRejection(error) ? refetchBankAccounts(queryClient) : undefined,
  });
}

export function useDeleteBankAccountMutation(
  bankAccountId: number,
  { onDone }: BankAccountDone = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<undefined>(SETTLEMENT_PATH.bankAccount(bankAccountId), {
        method: "DELETE",
      }),
    onSuccess: async () => onDone?.(await refetchBankAccounts(queryClient)),
    onError: (error) =>
      isStaleRejection(error) ? refetchBankAccounts(queryClient) : undefined,
  });
}

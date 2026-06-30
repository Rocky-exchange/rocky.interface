import { useCallback, useMemo } from "react";

import type { SourceChainId } from "config/chains";
import type { MultichainFundingHistoryItem } from "@/modules/lighter/domain/multichain/types";

import type {
  ApprovalStatuses,
  MultichainEventsState,
  PendingMultichainFunding,
  SubmittedMultichainDeposit,
  SubmittedMultichainWithdrawal,
} from "./types";

const EMPTY_APPROVAL_STATUSES: ApprovalStatuses = {};
const EMPTY_PENDING_FUNDING: PendingMultichainFunding = [];
const EMPTY_PENDING_IDS: Record<string, string> = {};

export type { MultichainEventsState } from "./types";

export function useMultichainEvents(): MultichainEventsState {
  const handleSourceChainApprovalsListener = useCallback((_chainId: SourceChainId, _name: string) => undefined, []);
  const handleSubmittedDeposit = useCallback((_submittedDeposit: SubmittedMultichainDeposit) => undefined, []);
  const handleSubmittedWithdrawal = useCallback((_submittedWithdrawal: SubmittedMultichainWithdrawal) => undefined, []);
  const handleWithdrawalSentTxnHash = useCallback((_mockId: string, _txnHash: string) => undefined, []);
  const handleWithdrawalSentError = useCallback((_mockId: string) => undefined, []);
  const handlePendingMultichainFundingUpdate = useCallback((_items: MultichainFundingHistoryItem[]) => undefined, []);
  const handleRemovePendingIds = useCallback((_id: string | string[]) => undefined, []);

  return useMemo(
    () => ({
      multichainSourceChainApprovalStatuses: EMPTY_APPROVAL_STATUSES,
      setMultichainSourceChainApprovalsActiveListener: handleSourceChainApprovalsListener,
      removeMultichainSourceChainApprovalsActiveListener: handleSourceChainApprovalsListener,
      pendingMultichainFunding: EMPTY_PENDING_FUNDING,
      setMultichainSubmittedDeposit: handleSubmittedDeposit,
      setMultichainSubmittedWithdrawal: handleSubmittedWithdrawal,
      setMultichainWithdrawalSentTxnHash: handleWithdrawalSentTxnHash,
      setMultichainWithdrawalSentError: handleWithdrawalSentError,
      updatePendingMultichainFunding: handlePendingMultichainFundingUpdate,
      multichainFundingPendingIds: EMPTY_PENDING_IDS,
      removeMultichainFundingPendingIds: handleRemovePendingIds,
    }),
    [
      handlePendingMultichainFundingUpdate,
      handleRemovePendingIds,
      handleSourceChainApprovalsListener,
      handleSubmittedDeposit,
      handleSubmittedWithdrawal,
      handleWithdrawalSentError,
      handleWithdrawalSentTxnHash,
    ]
  );
}

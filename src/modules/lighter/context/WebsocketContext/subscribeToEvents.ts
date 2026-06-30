import type { ContractsChainId } from "sdk/configs/chains";

export const OFT_SENT_ABI = [] as const;
export const OFT_RECEIVED_ABI = [] as const;
export const COMPOSE_DELIVERED_ABI = [] as const;

export type OftSentInfo = {
  sender: string;
  txnHash: string;
};

type Unsubscribe = () => void;

export function subscribeToApprovalEvents(): Unsubscribe {
  return () => undefined;
}

export function subscribeToOftSentEvents(): Unsubscribe {
  return () => undefined;
}

export function subscribeToOftReceivedEvents(): Unsubscribe | undefined {
  return undefined;
}

export function subscribeToComposeDeliveredEvents(): Unsubscribe | undefined {
  return undefined;
}

export function subscribeToMultichainApprovalEvents(): Unsubscribe {
  return () => undefined;
}

export function getTotalSubscribersEventsCount(
  _chainId: ContractsChainId,
  _provider: unknown,
  _opts: { v2: boolean }
) {
  return 0;
}

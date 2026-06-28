import { UseWalletClientReturnType, useAccount, useConnectorClient, useWalletClient } from "wagmi";

import { useEthersSigner } from "./useEthersSigner";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

export type WalletClient = UseWalletClientReturnType["data"];

export default function useWallet() {
  const { address, isConnected, connector, chainId } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { data: walletClient } = useWalletClient();
  const signer = useEthersSigner();
  const canton = useCantonSession();

  if (canton.connected) {
    return {
      account: canton.party,
      active: true,
      connector: connector!,
      chainId: chainId ?? 42161,
      signer: undefined,
      connectorClient: undefined,
      walletClient: undefined,
    };
  }

  return {
    account: address,
    active: isConnected,
    connector: connector!,
    chainId: chainId,
    signer: signer,
    connectorClient,
    walletClient,
  };
}

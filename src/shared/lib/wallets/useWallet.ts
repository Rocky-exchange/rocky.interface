import { UseWalletClientReturnType, useAccount, useConnectorClient, useWalletClient } from "wagmi";

import { useEthersSigner } from "./useEthersSigner";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

export type WalletClient = UseWalletClientReturnType["data"];

// The CEX trade path runs many ethers v6 `getAddress(account)` checksum calls.
// A Canton party (e.g. "consolewallet-x::1220abcd…") is not a valid EVM address,
// so we expose a deterministic pseudo-EVM address derived from the party's hex
// fingerprint. Real identity/auth flows via the exchange session bearer token
// (the backend ignores this address), this value only satisfies format checks
// and client-side gating/display.
function partyToPseudoAddress(party: string): string {
  const hexPart = (party.split("::")[1] || party).replace(/[^0-9a-fA-F]/g, "");
  const body = (hexPart + "0".repeat(40)).slice(0, 40).toLowerCase();
  return `0x${body}`;
}

export default function useWallet() {
  const { address, isConnected, connector, chainId } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { data: walletClient } = useWalletClient();
  const signer = useEthersSigner();
  const canton = useCantonSession();

  if (canton.connected) {
    return {
      account: partyToPseudoAddress(canton.party),
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

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

export type WalletClient = undefined;

export default function useWallet() {
  const session = useCantonSession();
  const account = session.connected ? session.party || session.username || undefined : undefined;

  return {
    account,
    active: session.connected,
    connector: undefined,
    chainId: undefined,
    signer: undefined,
    connectorClient: undefined,
    walletClient: undefined,
  };
}

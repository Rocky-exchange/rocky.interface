export type WalletNames = {
  current: string | undefined | null;
  authorized: string[];
  error: boolean;
};

export async function getWalletNames(): Promise<WalletNames> {
  return { current: null, authorized: [], error: false };
}

(window as any).getWalletNames = getWalletNames;

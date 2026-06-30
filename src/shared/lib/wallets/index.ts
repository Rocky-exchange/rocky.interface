import { SELECTED_NETWORK_LOCAL_STORAGE_KEY } from "config/localStorage";

export type NetworkMetadata = {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export type WalletSigner = any;

export async function switchNetwork(chainId: number, active: boolean): Promise<void> {
  void active;
  localStorage.setItem(SELECTED_NETWORK_LOCAL_STORAGE_KEY, String(chainId));
  document.dispatchEvent(new CustomEvent("networkChange", { detail: { chainId } }));
}

export function shortenAddressOrEns(address: string, length: number) {
  if (!length) {
    return "";
  }
  if (!address) {
    return address;
  }
  if (address.length < 10 || address.length < length) {
    return address;
  }
  const left = address.includes(".") ? address.split(".")[1].length : Math.floor((length - 3) / 2) + 1;
  return address.substring(0, left) + "..." + address.substring(address.length - (length - (left + 3)), address.length);
}

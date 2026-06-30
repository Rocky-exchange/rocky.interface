type OrderGateParams = {
  symbol: string;
  side: "buy" | "sell";
  isOpening: boolean;
  marginMode: string;
};

export function useOrderGate(_params: OrderGateParams) {
  return {
    checking: false,
    rejection: null as string | null,
    clearRejection: () => undefined,
    runGated: async <T>(submit: () => T | Promise<T>): Promise<T> => submit(),
  };
}
